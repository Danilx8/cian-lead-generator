import { RedisClientType } from "redis";
import WorkerService from "../worker.service";
import { ENV, logger } from "../../../config";
import { WorkerState } from "../../../database/worker.model";

interface WorkerHeartbeat {
  workerId: number;
  missedCount: number;
}

export class HeartbeatMonitor {
  private readonly redisClient: RedisClientType;
  private readonly checkInterval: number;
  private readonly heartbeatTimeout: number;
  private intervalId: NodeJS.Timeout | null = null;
  private workers: Map<number, WorkerHeartbeat> = new Map();

  constructor(
    redisClient: RedisClientType
  ) {
    this.redisClient = redisClient;
    this.checkInterval = ENV.HEARTBEAT_INTERVAL;
    this.heartbeatTimeout = this.checkInterval * 5;
  }

  public async start(): Promise<void> {
    if (this.intervalId) return;

    logger.info("Starting heartbeat monitor");
    this.intervalId = setInterval(() => this.checkWorkers(), this.checkInterval);
  }

  private async checkWorkers(): Promise<void> {
    try {
      const keys = await this.redisClient.keys("worker:*:heartbeat");
      const currentTime = Date.now();
      const activeWorkers = new Set<number>();

      // Check each active worker
      for (const key of keys) {
        const workerId = this.extractWorkerId(key);
        if (!workerId) continue;

        activeWorkers.add(workerId);
        const lastHeartbeat = await this.redisClient.get(key);
        const timestamp = lastHeartbeat ? parseInt(lastHeartbeat.toString()) : 0;

        if (currentTime - timestamp > this.heartbeatTimeout) {
          await this.handleMissedHeartbeat(workerId);
        } else {
          // Reset missed count for healthy worker
          if (this.workers.has(workerId)) {
            this.workers.set(workerId, { workerId, missedCount: 0 });
          }
        }
      }

      // Clean up workers that are no longer active
      for (const workerId of this.workers.keys()) {
        if (!activeWorkers.has(workerId)) {
          this.workers.delete(workerId);
        }
      }

    } catch (error) {
      logger.error(`Error getting heartbeat: ${error}`);
    }
  }

  private async handleMissedHeartbeat(workerId: number): Promise<void> {
    const worker = this.workers.get(workerId) || { workerId, missedCount: 0 };
    worker.missedCount++;
    this.workers.set(workerId, worker);

    logger.warn(`Worker ${workerId} missed heartbeat (${worker.missedCount}/3)`);

    if (worker.missedCount >= 3) {
      logger.info(`Worker ${workerId} failed - shutting down`);
      try {
        const workerModel = await WorkerService.getWorker(workerId);
        if (!workerModel) {
          logger.warn(`Worker ${workerId} not found`);
        } else if (workerModel.status && ([WorkerState.CONNECTION_LOST, WorkerState.SHUTDOWN, WorkerState.ERROR,
          WorkerState.BANNED] as WorkerState[]).includes(workerModel.status)) {
          this.workers.delete(workerId);
        } else {
          logger.info(`Worker ${workerId} is supposed to die now`);
          // await WorkerService.shutdownWorker(workerModel);
        }
      } catch (error) {
        logger.error(`Failed to shutdown worker ${workerId}: ${error}`);
      }
    }
  }

  private extractWorkerId(key: string): number | null {
    const match = key.match(/worker:(\d+):heartbeat/);
    return match ? parseInt(match[1]) : null;
  }

  public removeWorkerFromMonitoring(workerId: number): void {
    this.workers.delete(workerId);
    logger.info(`Removed worker ${workerId} from heartbeat monitoring`);
  }

  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info("Stopped heartbeat monitor");
    }
  }
}