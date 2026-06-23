import { logger } from "../../../config";
import UserService from "../user.service";
import Worker from "../../../database/worker.model";
import User from "../../../database/user.model";

async function getWorkerService() {
  const mod = await import("../worker.service");
  return mod.default;
}

export interface BatchStatus {
  canSend: boolean;
  currentBatchSize: number;
  maxBatchSize: number;
  remainingSlots: number;
  timeRemainingMs: number;
  isActive: boolean;
}

export class BatchManagerService {
  private static resetInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize the batch manager and start the reset task
   */
  public static initialize(): void {
    // Reset expired batches every minute
    BatchManagerService.resetInterval = setInterval(async () => {
      await BatchManagerService.resetExpiredBatches();
    }, 60000);

    logger.info("BatchManagerService initialized");
  }

  /**
   * Stop the batch manager
   */
  public static stop(): void {
    if (BatchManagerService.resetInterval) {
      clearInterval(BatchManagerService.resetInterval);
      BatchManagerService.resetInterval = null;
    }
    logger.info("BatchManagerService stopped");
  }

  /**
   * Check if items can be sent to a worker
   */
  public static async canSendToWorker(worker: Worker, user: User, itemsCount: number): Promise<boolean> {
    try {
      const currentBatchSize = worker.currentBatchSize || 0;

      // Check if adding these items would exceed batch limit
      if (currentBatchSize + itemsCount > user.itemsChunkSize!) {
        return false;
      }

      // If no active batch, we can send
      if (!worker.isBatchActive || !worker.batchStartTime) {
        return true;
      }

      // Check if batch time has expired
      const now = new Date();
      const batchStart = new Date(worker.batchStartTime);
      const elapsedMs = now.getTime() - batchStart.getTime();
      const maxIntervalMs = user.chunksInterval ?? 300000;

      // If time has expired, reset the batch and allow sending
      if (elapsedMs >= maxIntervalMs) {
        await BatchManagerService.resetWorkerBatch(worker.id);
        return true;
      }

      return true; // Within time limit and batch size limit
    } catch (error) {
      logger.error(`Error checking if can send to worker ${worker.id}:`, error);
      return false;
    }
  }

  /**
   * Update batch state after sending items
   */
  public static async updateBatchState(worker: Worker, user: User, sentItemsCount: number): Promise<void> {
    try {
      const [, meta] = await Worker.sequelize!.query(
        `UPDATE workers
         SET "currentBatchSize" = COALESCE("currentBatchSize", 0) + :increment,
             "isBatchActive" = true,
             "batchStartTime" = CASE
               WHEN "isBatchActive" = false OR "batchStartTime" IS NULL THEN NOW()
               ELSE "batchStartTime"
             END
         WHERE id = :workerId
         RETURNING "currentBatchSize"`,
        { replacements: { increment: sentItemsCount, workerId: worker.id } }
      );

      const rows = (meta as any)?.[0] ?? meta;
      const newSize = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any).currentBatchSize : '?';
      logger.debug(`Updated batch state for worker ${worker.id}: ${newSize} items (atomic +${sentItemsCount})`);
    } catch (error) {
      logger.error(`Error updating batch state for worker ${worker.id}:`, error);
    }
  }

  /**
   * Get current batch status for a worker
   */
  public static async getBatchStatus(worker: Worker, user: User): Promise<BatchStatus | null> {
    try {
      const currentBatchSize = worker.currentBatchSize || 0;
      const remainingSlots = Math.max(0, user.itemsChunkSize - currentBatchSize);

      let timeRemainingMs = 0;
      if (worker.isBatchActive && worker.batchStartTime) {
        const now = new Date();
        const batchStart = new Date(worker.batchStartTime);
        const elapsedMs = now.getTime() - batchStart.getTime();
        const maxIntervalMs = user.chunksInterval ?? 300000;
        timeRemainingMs = Math.max(0, maxIntervalMs - elapsedMs);
      }

      const canSend = remainingSlots > 0 && (timeRemainingMs > 0 || !worker.isBatchActive);

      return {
        canSend,
        currentBatchSize,
        maxBatchSize: user.itemsChunkSize,
        remainingSlots,
        timeRemainingMs,
        isActive: worker.isBatchActive || false
      };
    } catch (error) {
      logger.error(`Error getting batch status for worker ${worker.id}:`, error);
      return null;
    }
  }

  /**
   * Reset expired batches for all workers
   */
  public static async resetExpiredBatches(): Promise<void> {
    try {
      const WorkerSvc = await getWorkerService();
      const activeWorkers = await WorkerSvc.getActiveWorkers();
      const now = new Date();
      let resetCount = 0;

      for (const worker of activeWorkers) {
        if (!worker.isBatchActive || !worker.batchStartTime) {
          continue;
        }

        const user = await UserService.getUserById(worker.userId);
        if (!user) {
          continue;
        }

        const batchStart = new Date(worker.batchStartTime);
        const elapsedMs = now.getTime() - batchStart.getTime();
        const maxIntervalMs = user.chunksInterval ?? 300000;

        if (elapsedMs >= maxIntervalMs) {
          await BatchManagerService.resetWorkerBatch(worker.id);
          resetCount++;
          logger.debug(`Reset expired batch for worker ${worker.id} (elapsed: ${Math.round(elapsedMs / 1000)}s)`);
        }
      }

      if (resetCount > 0) {
        logger.info(`Reset ${resetCount} expired worker batches`);
      }
    } catch (error) {
      logger.error("Error resetting expired batches:", error);
    }
  }

  /**
   * Reset batch state for a specific worker
   */
  private static async resetWorkerBatch(workerId: number): Promise<void> {
    try {
      const WorkerSvc = await getWorkerService();
      await WorkerSvc.updateWorkerBatch({
        id: workerId,
        currentBatchSize: 0,
        batchStartTime: null,
        isBatchActive: false,
        lastResetTime: new Date()
      });

      logger.debug(`Reset batch for worker ${workerId}`);
    } catch (error) {
      logger.error(`Error resetting batch for worker ${workerId}:`, error);
    }
  }

  /**
   * Force reset batch for a worker (manual operation)
   */
  public static async forceResetWorkerBatch(workerId: number): Promise<boolean> {
    try {
      await BatchManagerService.resetWorkerBatch(workerId);
      logger.info(`Manually reset batch for worker ${workerId}`);
      return true;
    } catch (error) {
      logger.error(`Error force resetting batch for worker ${workerId}:`, error);
      return false;
    }
  }
}