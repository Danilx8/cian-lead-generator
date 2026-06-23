import { ItemsService } from "../items.service";
import Item from "../../../database/item.model";
import { logger } from "../../../config";
import Filter from "../../../database/filter.model";
import WorkerService from "../worker.service";
import { RedisService } from "../redis.service";
import Merchant, { MerchantType } from "../../../database/merchant.model";
import { BatchManagerService } from "./batch.service";
import User from "../../../database/user.model";
import { CategoryService } from "../category.service";
import { ParserPool } from "./parser-pool";
import { classifySeller } from "./seller-classification";
import type { ItemDto, MerchantDto } from "./parsing.types";
export type { ItemDto, MerchantDto };

class AsyncSemaphore {
  private queue: Array<() => void> = [];
  private running = 0;
  private timers = new Map<symbol, NodeJS.Timeout>();

  constructor(
    private readonly max: number,
    private readonly ttlMs: number = 3_600_000
  ) {}

  async acquire(): Promise<symbol> {
    if (this.running < this.max) {
      this.running++;
      return this.startTtl();
    }
    return new Promise<symbol>(resolve => {
      this.queue.push(() => { this.running++; resolve(this.startTtl()); });
    });
  }

  release(token: symbol): void {
    const timer = this.timers.get(token);
    if (timer) { clearTimeout(timer); this.timers.delete(token); }
    this.running = Math.max(0, this.running - 1);
    const next = this.queue.shift();
    if (next) next();
  }

  private startTtl(): symbol {
    const token = Symbol();
    const timer = setTimeout(() => {
      logger.warn(`[Semaphore] TTL expired (${this.ttlMs}ms), force-releasing slot`);
      this.release(token);
    }, this.ttlMs);
    timer.unref();
    this.timers.set(token, timer);
    return token;
  }

  get active(): number { return this.running; }
  get pending(): number { return this.queue.length; }
}

export class FilterParser {
  private static readonly globalSemaphore = new AsyncSemaphore(
    Number(process.env.MAX_CONCURRENT_PARSERS) || 2
  );

  private isRunning = true;
  private instanceId: string;
  private lifetimeLockKey?: string;

  constructor(
    private filter: Filter,
    private user: User,
    private proxy: string,
    /** Уникальный суффикс для нескольких парсеров одного фильтра (админский режим). */
    instanceKey?: string
  ) {
    this.instanceId = instanceKey
      ? `parser:${filter.id}:${instanceKey}`
      : `parser:${filter.id}`;
  }

  public async start(): Promise<void> {
    const acquired = await RedisService.rememberParserRunning(this.filter.id, this.instanceId);
    if (!acquired) {
      logger.info(`[${this.instanceId}] Parser already running for filter ${this.filter.id}`);
      return;
    }
    this.lifetimeLockKey = acquired;

    logger.info(`[${this.instanceId}] Parser started for filter ${this.filter.id}`);

    try {
      while (this.isRunning) {
        if (this.lifetimeLockKey) {
          const alive = await RedisService.refreshParserLock(this.lifetimeLockKey, this.instanceId);
          if (!alive) {
            logger.warn(`[${this.instanceId}] Lost parser lock — self-terminating`);
            this.isRunning = false;
            break;
          }
        }

        const iterStart = Date.now();
        try {
          await this.runIteration();
        } catch (err) {
          logger.error(`[${this.instanceId}] Iteration error:`, err);
        }
        const remaining = 60_000 - (Date.now() - iterStart);
        if (remaining > 0) await new Promise(r => setTimeout(r, remaining));
      }
    } finally {
      await RedisService.releaseLock(this.lifetimeLockKey, this.instanceId);
      logger.info(`[${this.instanceId}] Parser stopped and will be GC'd`);
    }
  }

  private async runIteration(): Promise<void> {
    const sem = FilterParser.globalSemaphore;
    logger.debug(
      `[${this.instanceId}] Waiting for global semaphore (active=${sem.active}, pending=${sem.pending})`
    );
    const token = await sem.acquire();
    try {
      const workers = await this.getAvailableWorkers();
      if (workers.length === 0) {
        const hasAnyWorkers = await this.hasAnyWorkers();
        if (!hasAnyWorkers) {
          logger.info(`[${this.instanceId}] No workers for filter ${this.filter.id} — stopping`);
          this.isRunning = false;
          return;
        }
        logger.debug(`[${this.instanceId}] No ready workers — skipping iteration`);
        return;
      }
      await this.processWithWorkers(workers);
    } finally {
      sem.release(token);
    }
  }

  public stop(): void {
    this.isRunning = false;
  }

  private async getAvailableWorkers(): Promise<any[]> {
    if (this.filter.isActive) {
      // Запрашиваем больше чем одного воркера, чтобы несколько парсеров не конкурировали за единственного
      return (await WorkerService.getReadyToAcceptWorkersByUser(this.filter.userId, 1)) ?? [];
    }
    return (await WorkerService.getWorkersByFilter(this.filter.id)) ?? [];
  }

  private async hasAnyWorkers(): Promise<boolean> {
    if (this.filter.isActive) {
      const all = await WorkerService.getActiveWorkersByUser(this.filter.userId);
      return all.length > 0;
    }
    const all = await WorkerService.getActiveWorkersByFilter(this.filter.id);
    if (!all) return false;
    return all.length > 0;
  }

  private async processWithWorkers(workers: any[]): Promise<void> {
    const chunkSize = this.user.itemsChunkSize * workers.length;
    await this.scrapeAndProcess(chunkSize, workers);
  }

  private async scrapeAndProcess(chunkSize: number, workers: any[]): Promise<void> {
    const baseLinks = (this.filter.searchLink || "")
      .split(";")
      .map(s => s.trim())
      .filter(Boolean);

    if (baseLinks.length === 0) return;

    // --- 1. Pre-distribute workers across links (round-robin, exclusive) ---
    const workersByLink: any[][] = baseLinks.map(() => []);
    for (let i = 0; i < workers.length; i++) {
      workersByLink[i % baseLinks.length].push(workers[i]);
    }

    const activeLinks = baseLinks
      .map((link, idx) => ({ link, workers: workersByLink[idx] }))
      .filter(entry => entry.workers.length > 0);

    if (activeLinks.length === 0) return;

    // --- 2. In-memory batch tracking (zero per-item DB queries for capacity) ---
    const batchState = new Map<number, number>();
    for (const w of workers) batchState.set(w.id, w.currentBatchSize || 0);

    const maxPerWorker = this.user.itemsChunkSize;

    const pickWorker = (assigned: any[]): any | null => {
      for (const w of assigned) {
        if ((batchState.get(w.id) ?? 0) < maxPerWorker) return w;
      }
      return null;
    };

    // --- 3. Audit ---
    type Reason =
      | "WORKERS_FULL"
      | "CLASSIFIED_NON_OWNER"
      | "MERCHANT_CONVERSION_ERROR"
      | "ITEM_CONVERSION_ERROR"
      | "LOCK_BUSY"
      | "SEND_ERROR"
      | "SENT";

    const audit = new Map<string, Reason[]>();
    const addReason = (id: string, reason: Reason) => {
      const arr = audit.get(id) ?? [];
      arr.push(reason);
      audit.set(id, arr);
    };

    let totalSent = 0;

    const ITEM_CONCURRENCY = Math.min(
      Number(process.env.VERIFY_CONCURRENCY_PER_LINK) || 3,
      maxPerWorker
    );

    logger.info(
      `[${this.instanceId}] Starting scrape: chunkSize=${chunkSize}, links=${activeLinks.length}, ` +
      `itemConcurrency=${ITEM_CONCURRENCY}, workers=${workers.length}`
    );

    const pool = ParserPool.getInstance();

    // --- 4. Pre-fetch reusable data (eliminate N+1) ---
    const categoryCache = new Map<number, number | null>();
    const getCachedCategoryId = async (cianId: number): Promise<number | null> => {
      if (categoryCache.has(cianId)) return categoryCache.get(cianId)!;
      const cat = await CategoryService.GetCategoryByCianId(cianId);
      const id = cat ? cat.id : null;
      categoryCache.set(cianId, id);
      return id;
    };

    // --- 5. Process single item: verify → convert → send ---
    const processItem = async (
      item: ItemDto,
      plainFilter: any,
      assignedWorkers: any[]
    ): Promise<void> => {
      if (totalSent >= chunkSize) return;

      let pairs: Array<{ item: ItemDto; merchant: MerchantDto }>;
      try {
        pairs = await pool.verify({
          items: [item],
          filter: plainFilter,
          dbPath: "./src/api/blacklist/database.db",
          sendWithAngebot: this.user.sendWithAngebot,
          proxy: this.proxy
        });
      } catch (err) {
        logger.error(`[${this.instanceId}] verifyTask failed for item ${item.item_id}:`, err);
        return;
      }

      if (pairs.length === 0) return;
      const pair = pairs[0];

      // --- ИИ-классификация типа продавца (ВКР §1.2): owner → распределитель, agent → отсев ---
      // Классификатор вызывается до резервирования слота воркера, чтобы не занимать слот
      // объявлением, которое всё равно будет отброшено.
      let merchantType: MerchantType;
      const classification = await classifySeller(pair.item, pair.merchant);
      if (classification) {
        if (classification.seller_type !== "owner") {
          addReason(item.item_id, "CLASSIFIED_NON_OWNER");
          logger.info(
            `[${this.instanceId}] Item ${item.item_id} classified as ${classification.seller_type} ` +
            `(conf=${classification.confidence.toFixed(2)}) — skipping. ${classification.reasoning}`
          );
          return;
        }
        merchantType = MerchantType.PRIVATE;
      } else {
        // Fallback: классификатор выключен/недоступен — тип берётся из флага ЦИАН.
        merchantType = pair.item.ad_seller_type === "COMMERCIAL"
          ? MerchantType.COMMERCIAL
          : MerchantType.PRIVATE;
      }

      const worker = pickWorker(assignedWorkers);
      if (!worker) {
        addReason(item.item_id, "WORKERS_FULL");
        return;
      }

      let convertedMerchant: Merchant;
      try {
        const [m] = await Merchant.findOrCreate({
          where: { cianId: pair.merchant.sellerId },
          defaults: {
            name: pair.merchant.contactName || "Unknown",
            cianId: pair.merchant.sellerId,
            type: merchantType,
            activeSince: pair.merchant.activeSince,
            profilePicture: pair.merchant.adImageUrl
          }
        });
        convertedMerchant = m;
      } catch (e) {
        addReason(item.item_id, "MERCHANT_CONVERSION_ERROR");
        logger.error(`[${this.instanceId}] Merchant conversion failed for ${item.item_id}:`, e);
        return;
      }

      let convertedItem: Item;
      try {
        const cianCatId = Number(pair.item.item_category2 ?? pair.item.item_category);
        const categoryId = await getCachedCategoryId(cianCatId);
        convertedItem = await ItemsService.convertToModel(
          pair.item,
          categoryId ?? this.filter.categoryId ?? 2,
          convertedMerchant.id
        );
      } catch (e) {
        addReason(item.item_id, "ITEM_CONVERSION_ERROR");
        logger.error(`[${this.instanceId}] Item conversion failed for ${item.item_id}:`, e);
        return;
      }

      const cooldownKey = `worker:cooldown:${worker.id}`;
      const cooldownAcquired = await RedisService.acquireLock(cooldownKey, this.instanceId, 5);
      if (!cooldownAcquired) {
        addReason(item.item_id, "LOCK_BUSY");
        return;
      }

      try {
        await RedisService.SendItemsToWorker([convertedItem], [convertedMerchant], worker);
        batchState.set(worker.id, (batchState.get(worker.id) ?? 0) + 1);
        totalSent++;
        addReason(item.item_id, "SENT");
        logger.info(`[${this.instanceId}] Sent item ${item.item_id} to worker ${worker.id}`);

        BatchManagerService.updateBatchState(worker, this.user, 1).catch(err => {
          logger.error(`[${this.instanceId}] Failed to persist batch state for worker ${worker.id}:`, err);
        });
      } catch (err: any) {
        await RedisService.releaseLock(cooldownKey, this.instanceId);
        addReason(item.item_id, "SEND_ERROR");
        logger.error(`[${this.instanceId}] Send failed for worker ${worker.id} (item ${item.item_id}):`, err);
      }
    };

    // --- 5. Per-link processor: scrape → parallel verify+send with item concurrency ---
    const processLink = async (linkEntry: { link: string; workers: any[] }, linkIdx: number): Promise<void> => {
      const { link: baseLink, workers: assignedWorkers } = linkEntry;

      let pageItems: ItemDto[];
      try {
        pageItems = await pool.scrape(
          baseLink,
          this.proxy,
          this.filter.locationId ?? undefined,
        );
      } catch (err) {
        logger.error(`[${this.instanceId}] scrapeTask link ${linkIdx + 1} failed:`, err);
        return;
      }

      const filtered = pageItems.filter(item => {
        if (!this.filter.blackList || this.filter.blackList.length === 0) return true;
        for (const word of this.filter.blackList) {
          if (item.item_name.toLowerCase().includes(word.toLowerCase())) return false;
        }
        return true;
      });

      if (filtered.length === 0) return;

      const plainFilter = this.filter.get({ plain: true });

      const itemExec = new Set<Promise<void>>();
      for (const item of filtered) {
        if (totalSent >= chunkSize) break;
        if (!pickWorker(assignedWorkers)) break;

        const p = processItem(item, plainFilter, assignedWorkers)
          .then(() => { itemExec.delete(p); });
        itemExec.add(p);

        if (itemExec.size >= ITEM_CONCURRENCY) {
          await Promise.race(itemExec);
        }
      }
      await Promise.all(itemExec);
    };

    // --- 5. Run all links concurrently ---
    await Promise.all(activeLinks.map((entry, i) => processLink(entry, i)));

    // --- 6. Audit summary ---
    const allReasons: Reason[] = [
      "WORKERS_FULL", "CLASSIFIED_NON_OWNER", "MERCHANT_CONVERSION_ERROR", "ITEM_CONVERSION_ERROR",
      "LOCK_BUSY", "SEND_ERROR", "SENT"
    ];
    const counts: Record<string, number> = {};
    for (const r of allReasons) counts[r] = 0;
    for (const arr of audit.values()) for (const r of arr) counts[r]++;

    const sample = (reason: Reason, limit = 10) =>
      Array.from(audit.entries())
        .filter(([, rs]) => rs.includes(reason))
        .slice(0, limit)
        .map(([id]) => id);

    logger.info(
      `[${this.instanceId}] Iteration audit for filter ${this.filter.id}: items~=${audit.size}, sent=${counts.SENT}; ` +
      allReasons.map(r => `${r}=${counts[r]} ${JSON.stringify(sample(r))}`).join(", ")
    );
  }
}

export default FilterParser;