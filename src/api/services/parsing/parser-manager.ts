import { fork, ChildProcess } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { logger } from "../../../config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class ParserManager {
  private static instance: ParserManager | null = null;
  private child: ChildProcess | null = null;
  private shuttingDown = false;

  private constructor() {}

  public static getInstance(): ParserManager {
    if (!ParserManager.instance) {
      ParserManager.instance = new ParserManager();
      ParserManager.instance.boot();
    }
    return ParserManager.instance;
  }

  private getOrchestratorPath(): string {
    const ext = __filename.endsWith(".ts") ? ".ts" : ".js";
    return join(__dirname, `parser-orchestrator${ext}`);
  }

  private boot(): void {
    this.spawnOrchestrator();
  }

  private spawnOrchestrator(): void {
    if (this.shuttingDown) return;

    const childPath = this.getOrchestratorPath();
    this.child = fork(childPath, [], {
      execArgv: process.execArgv,
      serialization: "advanced",
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    });

    this.child.on("exit", (code) => {
      logger.warn(`[ParserManager] Orchestrator exited (code=${code})`);
      this.child = null;
      if (!this.shuttingDown) {
        logger.info("[ParserManager] Respawning orchestrator in 2s...");
        setTimeout(() => this.spawnOrchestrator(), 2000);
      }
    });

    this.child.on("error", (err) => {
      logger.error("[ParserManager] Orchestrator error:", err);
    });

    logger.info("[ParserManager] Orchestrator process spawned");
  }

  public startParser(filterId: number, userId: number, proxy: string): void {
    if (!this.child) {
      logger.warn("[ParserManager] Orchestrator not running, cannot start parser");
      return;
    }
    this.child.send({ action: "start", filterId, userId, proxy });
  }

  /**
   * Несколько парсеров на один и тот же filterId (отдельные Redis-lock и слот в оркестраторе).
   */
  public startParserParallel(filterId: number, userId: number, proxy: string, instanceKey: string): void {
    if (!this.child) {
      logger.warn("[ParserManager] Orchestrator not running, cannot start parser");
      return;
    }
    this.child.send({ action: "start", filterId, userId, proxy, instanceKey });
  }

  public stopParser(filterId: number): void {
    if (!this.child) return;
    this.child.send({ action: "stop", filterId });
  }

  public shutdown(): void {
    this.shuttingDown = true;
    if (this.child) {
      this.child.kill("SIGTERM");
      this.child = null;
    }
    ParserManager.instance = null;
    logger.info("[ParserManager] Shutdown complete");
  }
}
