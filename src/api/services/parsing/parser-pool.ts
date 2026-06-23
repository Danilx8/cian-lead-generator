import { fork, ChildProcess } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { logger } from "../../../config";
import type { ItemDto, MerchantDto, AngebotOption } from "./parsing.types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ChildEntry {
  proc: ChildProcess;
  pending: number;
  alive: boolean;
}

interface PendingTask {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  childIndex: number;
}

export interface VerifyTaskInput {
  items: ItemDto[];
  filter: any;
  dbPath: string;
  sendWithAngebot: AngebotOption;
  proxy?: string;
}

const POOL_SIZE = Number(process.env.PARSER_POOL_SIZE) || 4;
const RESPAWN_DELAY_MS = 1000;

export class ParserPool {
  private static instance: ParserPool | null = null;

  private children: ChildEntry[] = [];
  private callbacks = new Map<number, PendingTask>();
  private nextId = 0;
  private shuttingDown = false;

  private constructor(private readonly poolSize: number) {
    const cleanup = () => this.shutdown();
    process.on("exit", cleanup);
    process.on("SIGTERM", cleanup);
    process.on("SIGINT", cleanup);
  }

  public static getInstance(): ParserPool {
    if (!ParserPool.instance) {
      ParserPool.instance = new ParserPool(POOL_SIZE);
      ParserPool.instance.boot();
    }
    return ParserPool.instance;
  }

  private getChildPath(): string {
    const ext = __filename.endsWith(".ts") ? ".ts" : ".js";
    return join(__dirname, `parser-child${ext}`);
  }

  private boot(): void {
    for (let i = 0; i < this.poolSize; i++) {
      this.spawnChild(i);
    }
    logger.info(`[ParserPool] Booted ${this.poolSize} child processes`);
  }

  private spawnChild(index: number): void {
    if (this.shuttingDown) return;

    const childPath = this.getChildPath();
    const child = fork(childPath, [], {
      execArgv: process.execArgv,
      serialization: "advanced",
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    });

    const entry: ChildEntry = { proc: child, pending: 0, alive: true };
    this.children[index] = entry;

    child.on("message", (msg: { id: number; result?: any; error?: string }) => {
      entry.pending = Math.max(0, entry.pending - 1);
      const cb = this.callbacks.get(msg.id);
      if (!cb) return;
      this.callbacks.delete(msg.id);
      if (msg.error) {
        cb.reject(new Error(msg.error));
      } else {
        cb.resolve(msg.result);
      }
    });

    child.on("exit", (code) => {
      entry.alive = false;
      const orphaned: number[] = [];
      for (const [id, cb] of this.callbacks) {
        if (cb.childIndex === index) {
          cb.reject(new Error(`Child process #${index} exited unexpectedly (code=${code})`));
          orphaned.push(id);
        }
      }
      for (const id of orphaned) this.callbacks.delete(id);
      logger.warn(`[ParserPool] Child #${index} exited (code=${code}), rejected ${orphaned.length} pending tasks`);
      entry.pending = 0;

      if (!this.shuttingDown) {
        setTimeout(() => this.spawnChild(index), RESPAWN_DELAY_MS);
      }
    });

    child.on("error", (err) => {
      logger.error(`[ParserPool] Child #${index} error:`, err);
    });
  }

  private pickChildIndex(): number {
    let bestIdx = -1;
    let bestPending = Infinity;
    for (let i = 0; i < this.children.length; i++) {
      const c = this.children[i];
      if (!c.alive) continue;
      if (c.pending < bestPending) {
        bestPending = c.pending;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) throw new Error("[ParserPool] No alive child processes");
    return bestIdx;
  }

  private send<T>(type: "scrape" | "verify", payload: any): Promise<T> {
    const childIndex = this.pickChildIndex();
    const child = this.children[childIndex];
    child.pending++;
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject, childIndex });
      child.proc.send({ id, type, payload });
    });
  }

  public async scrape(url: string, proxy?: string, regionId?: number): Promise<ItemDto[]> {
    return this.send<ItemDto[]>("scrape", { url, proxy, regionId });
  }

  public async verify(task: VerifyTaskInput): Promise<Array<{ item: ItemDto; merchant: MerchantDto }>> {
    return this.send<Array<{ item: ItemDto; merchant: MerchantDto }>>("verify", task);
  }

  public shutdown(): void {
    this.shuttingDown = true;
    for (const entry of this.children) {
      if (entry.alive) {
        entry.proc.kill("SIGTERM");
      }
    }
    for (const cb of this.callbacks.values()) {
      cb.reject(new Error("Pool shutting down"));
    }
    this.callbacks.clear();
    ParserPool.instance = null;
    logger.info("[ParserPool] Shutdown complete");
  }

  public get stats() {
    return {
      poolSize: this.poolSize,
      alive: this.children.filter(c => c.alive).length,
      totalPending: this.children.reduce((s, c) => s + c.pending, 0),
    };
  }
}
