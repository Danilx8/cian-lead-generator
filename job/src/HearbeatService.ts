import { logAdminError, logAdminEvent } from "./logger";
import { RedisClientType } from "redis";
import { BrowserManager } from "./BrowserManager";
import { EventEmitter } from "node:events";

/**
 * Sends periodic heartbeats to indicate worker health
 */
export class HeartbeatService {
  private readonly workerId: number;
  private readonly heartbeatInterval: number;
  private readonly redisClient: RedisClientType;
  private readonly browserManager: BrowserManager;
  private readonly eventEmitter: EventEmitter;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly heartbeatKey: string;

  constructor(workerId: number, redisClient: RedisClientType, browserManager: BrowserManager,
              eventEmitter: EventEmitter, heartbeatInterval: number = 30000) {
    this.workerId = workerId;
    this.heartbeatInterval = heartbeatInterval;
    this.heartbeatKey = `worker:${workerId}:heartbeat`;
    this.browserManager = browserManager;
    this.redisClient = redisClient;
    this.eventEmitter = eventEmitter;
  }

  /**
   * Start sending heartbeats
   */
  public async start(): Promise<void> {
    if (this.intervalId) {
      return;
    }

    logAdminEvent(`Starting heartbeat service for worker ${this.workerId} with interval ${this.heartbeatInterval}ms`);

    try {
      await this.sendHeartbeat();
    } catch (error) {
      logAdminError(`Failed to send initial heartbeat for worker ${this.workerId}: ${error}`);
      throw error;
    }

    this.intervalId = setInterval(async () => {
      const { messagePage, itemsPage } = this.browserManager.getPages();
      try {
        if (await this.browserManager.isPageStateValid(messagePage, "messagesPage", "https://www.cian.ru/profile/messenger")
          && await this.browserManager.isPageStateValid(itemsPage, "itemsPage", "https://www.cian.ru")) {
          await this.sendHeartbeat();
        }
      } catch (error) {
        logAdminError(`Error checking heartbeat: ${error}`);
      }
    }, this.heartbeatInterval) as NodeJS.Timeout;

    // Ensure interval doesn't prevent Node.js from exiting
    if (this.intervalId.unref) {
      this.intervalId.unref();
    }
  }

  /**
   * Send a single heartbeat
   */
  private async sendHeartbeat(): Promise<void> {
    try {
      const timestamp = Date.now();

      // Store heartbeat in redisClient with expiry
      await this.redisClient.set(this.heartbeatKey, timestamp.toString());
      await this.redisClient.expire(this.heartbeatKey, Math.ceil(this.heartbeatInterval * 10 / 1000));

      logAdminEvent(`Sent heartbeat for worker ${this.workerId} at ${new Date(timestamp).toISOString()}`);
    } catch (error) {
      logAdminError(`Failed to send heartbeat for worker ${this.workerId}: ${error}`);
    }
  }

  /**
   * Stop sending heartbeats
   */
  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logAdminEvent(`Stopped heartbeat service for worker ${this.workerId}`);
    }
  }

  /**
   * Close redisClient connection
   */
  public async close(): Promise<void> {
    this.stop();
  }
}