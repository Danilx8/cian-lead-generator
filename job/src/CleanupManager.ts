import { EventEmitter } from "events";
import { BrowserManager } from "./BrowserManager";
import { logAdminError, logAdminEvent, logger, logUserEvent } from "./logger";
import { CommunicationManager } from "./CommunicationManager";
import { ItemsManager } from "./ItemsManager";
import { MessageHandler } from "./MessageHandler";
import { StateManager } from "./StateManager";
import { HeartbeatService } from "./HearbeatService";

/**
 * Manages the cleanup process for a worker
 */
export class CleanupManager {
  private readonly workerId: number;
  private readonly browserManager: BrowserManager;
  private readonly heartbeatService: HeartbeatService;
  private readonly eventEmitter: EventEmitter;
  private readonly communicationManager: CommunicationManager;
  private readonly itemsManager: ItemsManager;
  private readonly messageHandler: MessageHandler;
  private readonly stateManager: StateManager;
  private isCleaningUp: boolean = false;

  constructor(
    workerId: number,
    browserManager: BrowserManager,
    heartbeatService: HeartbeatService,
    eventEmitter: EventEmitter,
    communicationManager: CommunicationManager,
    itemsManager: ItemsManager,
    messageHandler: MessageHandler,
    stateManager: StateManager
  ) {
    this.workerId = workerId;
    this.browserManager = browserManager;
    this.heartbeatService = heartbeatService;
    this.eventEmitter = eventEmitter;
    this.communicationManager = communicationManager;
    this.itemsManager = itemsManager;
    this.messageHandler = messageHandler;
    this.stateManager = stateManager;
  }

  /**
   * Perform cleanup
   */
  public async cleanup(): Promise<void> {
    if (this.isCleaningUp) {
      logger.info(`Cleanup already in progress for worker ${this.workerId}`);
      return;
    }

    this.isCleaningUp = true;
    logUserEvent(`Выключаю воркера...`);
    logger.info(`Starting cleanup for worker ${this.workerId}`);

    try {
      // Stop heartbeat service
      await this.stopHeartbeatService();

      // Close browser
      await this.closeBrowser();

      // Clean up any other resources
      await this.cleanupAdditionalResources();

      // Close items manager
      await this.closeItemsManager();

      // Close message handler
      await this.closeMessageHandler();

      logger.info(`Cleanup completed for worker ${this.workerId}`);
    } catch (error) {
      logger.error(`Error during cleanup for worker ${this.workerId}:`, error);
      throw error;
    } finally {
      this.isCleaningUp = false;
    }
  }

  /**
   * Stop the heartbeat service
   */
  private async stopHeartbeatService(): Promise<void> {
    try {
      logger.info(`Stopping heartbeat service for worker ${this.workerId}`);
      // await this.heartbeatService.close();
      logger.info(`Heartbeat service stopped for worker ${this.workerId}`);
    } catch (error) {
      logger.error(`Error stopping heartbeat service for worker ${this.workerId}:`, error);
    }
  }

  /**
   * Close the browser
   */
  private async closeBrowser(): Promise<void> {
    try {
      logger.info(`Closing browser for worker ${this.workerId}`);
      await this.browserManager.close();
      logger.info(`Browser closed for worker ${this.workerId}`);
    } catch (error) {
      logger.error(`Error closing browser for worker ${this.workerId}:`, error);
    }
  }

  private async closeConnections(): Promise<void> {
    try {
      logAdminEvent("Closing connections");
      await this.communicationManager.close();
    } catch (error) {
      logAdminError(`Error closing connections: ${error}`);
    }
  }

  private async closeItemsManager(): Promise<void> {
    try {
      logAdminEvent("Closing items manager");
      await this.itemsManager.close();
    } catch (error) {
      logAdminError(`Error closing items manager: ${error}`);
    }
  }

  private async closeMessageHandler(): Promise<void> {
    try {
      logAdminEvent("Closing message handler");
      await this.messageHandler.close();
    } catch (error) {
      logAdminError(`Error closing message handler: ${error}`);
    }
  }

  /**
   * Clean up any additional resources
   */
  private async cleanupAdditionalResources(): Promise<void> {
    try {
      // Remove any temporary files
      // Close any open connections
      // Release any other resources

      logger.info(`Additional resources cleaned up for worker ${this.workerId}`);
    } catch (error) {
      logger.error(`Error cleaning up additional resources for worker ${this.workerId}:`, error);
    }
  }
}