import { WorkerState } from "./types/WorkerState";
import { logAdminError, logger, logUserEvent } from "./logger";
import { RedisClientType } from "redis";
import {
  CianMessage,
  ItemMessageData,
  NewDialogMessage,
  UserMessage,
  WorkerCodePublishPayload,
  WorkerCommandPayload,
  WorkerStatusMessage,
  WorkerVerificationPublishPayload
} from "./types/messages";
import { ItemsManager } from "./ItemsManager";
import { MessageHandler } from "./MessageHandler";
import { CleanupManager } from "./CleanupManager";
import { Mutex } from "async-mutex";

/**
 * Publishes worker status updates to external systems
 */
export class CommunicationManager {
  private readonly workerId: number;
  private readonly userId: number;
  private readonly redisClient: RedisClientType;
  private readonly redisSubClient: RedisClientType;
  private readonly statusChannel: string;
  private readonly itemsManager: ItemsManager;
  private readonly messageHandler: MessageHandler;
  private cleanupManager?: CleanupManager;
  private readonly commandMutex = new Mutex();

  constructor(workerId: number, userId: number, redisClient: RedisClientType,
              redisSubClient: RedisClientType, itemsManager: ItemsManager, messageHandler: MessageHandler) {
    this.workerId = workerId;
    this.userId = userId;
    this.statusChannel = "workers-statuses-to-main";
    this.redisClient = redisClient;
    this.redisSubClient = redisSubClient;
    this.itemsManager = itemsManager;
    this.messageHandler = messageHandler;
  }

  public setCleanupManager(cleanupManager: CleanupManager) {
    this.cleanupManager = cleanupManager;
  }

  public async subscribe() {
    await this.redisSubClient.subscribe(`main-message-to-worker:${this.workerId}`, async (message) => {
      const parsed: UserMessage = JSON.parse(message);
      // if (parsed.text) parsed.text = decodeString(parsed.text);
      await this.receiveMessage(parsed);
    });

    await this.redisSubClient.subscribe(`main-items-to-worker:${this.workerId}`, async (message) => {
      const parsed: ItemMessageData[] = JSON.parse(message);
      await this.receiveItems(parsed);
    });

    await this.redisSubClient.subscribe(`main-command-to-worker:${this.workerId}`, async (message) => {
      await this.commandMutex.runExclusive(async () => {
        const cmd = this.parseWorkerCommandEnvelope(message);
        if (!cmd) return;
        await this.dispatchWorkerCommand(cmd);
      });
    });
  }

  private parseWorkerCommandEnvelope(message: string): WorkerCommandPayload | null {
    let raw: unknown;
    try {
      raw = JSON.parse(message);
    } catch {
      logAdminError(`Invalid JSON on main-command-to-worker:${this.workerId}`);
      return null;
    }
    if (raw === "shutdown" || raw === "pause" || raw === "credentials") {
      return { command: raw };
    }
    if (typeof raw === "object" && raw !== null && typeof (raw as { command?: unknown }).command === "string") {
      return raw as WorkerCommandPayload;
    }
    logAdminError(`Unknown command payload on main-command-to-worker:${this.workerId}: ${message}`);
    return null;
  }

  private async dispatchWorkerCommand(cmd: WorkerCommandPayload): Promise<void> {
    switch (cmd.command) {
      case "shutdown":
        await this.cleanupManager?.cleanup();
        logUserEvent(`Выключаю воркера...`);
        break;
      case "pause":
        await this.itemsManager.pause();
        logUserEvent("Останавливаю отписки");
        break;
      case "credentials":
        break;
      case "reverify":
        await this.itemsManager.handleReverifyCommand(cmd.countryCode, cmd.phoneNumber);
        break;
      case "verify":
        await this.itemsManager.handleVerifyCommand(cmd.countryCode, cmd.phoneNumber);
        break;
      case "code":
        await this.itemsManager.handleCodeCommand(cmd.code);
        break;
    }
  }

  public async publishWorkerVerification(payload: Omit<WorkerVerificationPublishPayload, "workerId" | "userId">): Promise<void> {
    const full: WorkerVerificationPublishPayload = {
      workerId: this.workerId,
      userId: this.userId,
      ...payload
    };
    await this.redisClient.publish("worker-verification", JSON.stringify(full));
  }

  public async publishWorkerCode(payload: Omit<WorkerCodePublishPayload, "workerId" | "userId">): Promise<void> {
    const full: WorkerCodePublishPayload = {
      workerId: this.workerId,
      userId: this.userId,
      ...payload
    };
    await this.redisClient.publish("worker-code", JSON.stringify(full));
  }

  /**
   * Publish worker status update
   * @param state - The current state of the worker
   */
  public async publishStatus(state: WorkerState): Promise<void> {
    try {
      // Create status object
      const status = {
        workerId: this.workerId,
        payload: {
          state
        }
      };

      // Publish to Redis channel
      await this.redisClient.publish(this.statusChannel, JSON.stringify(status));
    } catch (error) {
      logAdminError(`Failed to publish status for worker ${this.workerId}: ${error}`);
      // Don't emit error to avoid potential loops
    }
  }

  public async publishMessage(message: CianMessage) {
    await this.redisClient.publish("workers-messages-to-main", JSON.stringify(message));
  }

  public async publishSuccessfulUserMessage(itemName: string) {
    const message: NewDialogMessage = {
      workerId: this.workerId,
      userId: this.userId,
      itemName
    };
    await this.redisClient.publish("workers-first-message-to-main", JSON.stringify(message));
  }

  private async receiveMessage(message: UserMessage) {
    await this.messageHandler.sendUserMessage(message);
  }

  private async receiveItems(items: ItemMessageData[]) {
    this.itemsManager.addItems(items);
  }

  /**
   * Close Redis connections
   */
  public async close(): Promise<void> {
    try {
      // Publish final status before disconnecting
      const finalStatus: WorkerStatusMessage = {
        workerId: this.workerId,
        payload: {
          newStatus: WorkerState.SHUTDOWN
        }
      };

      await this.redisClient.publish(this.statusChannel, JSON.stringify(finalStatus));

      // Disconnect Redis client
      await this.redisClient.quit();
      await this.redisSubClient.quit();
      logger.info(`Redis connection closed for worker ${this.workerId}`);
    } catch (error) {
      logger.error(`Error closing Redis connection for worker ${this.workerId}:`, error);
    }
  }
}