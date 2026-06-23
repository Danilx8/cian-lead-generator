import { config } from "dotenv";
import { EventEmitter } from "node:events";
import { BrowserManager } from "./BrowserManager";
import { StateManager } from "./StateManager";
import { MessageHandler } from "./MessageHandler";
import { CleanupManager } from "./CleanupManager";
import { CommunicationManager } from "./CommunicationManager";
import { WorkerState } from "./types/WorkerState";
import { AngebotOption, WorkerConfig } from "./types/WorkerConfig";
import { logAdminError, logAdminEvent, logger, logUserError, logUserEvent } from "./logger";
import { createClient, RedisClientType } from "redis";
import process from "node:process";
import { ItemsManager } from "./ItemsManager";
import { Mutex } from "async-mutex";
import { HeartbeatService } from "./HearbeatService";


// Load environment variables
config();

class WorkerProcess {
  private readonly workerId: number;
  private readonly userId: number;
  private readonly eventEmitter: EventEmitter;
  private readonly stateManager: StateManager;
  private readonly browserManager: BrowserManager;
  private readonly heartbeatService: HeartbeatService;
  private readonly messageHandler: MessageHandler;
  private readonly cleanupManager: CleanupManager;
  private readonly communicationManager: CommunicationManager;
  private readonly itemsManager: ItemsManager;
  private readonly config: WorkerConfig;
  private readonly redisSubClient: RedisClientType;
  private readonly redisClient: RedisClientType;
  private readonly mutex: Mutex;

  constructor(config: WorkerConfig) {
    this.workerId = config.workerId;
    this.userId = config.userId;
    this.config = config;
    this.redisClient = config.redisClient;
    this.redisSubClient = config.redisSubClient;
    this.eventEmitter = new EventEmitter();
    this.mutex = new Mutex();

    // Initialize services
    this.stateManager = new StateManager(this.workerId, this.eventEmitter);
    this.browserManager = new BrowserManager(this.workerId, this.config, this.eventEmitter);
    this.messageHandler = new MessageHandler(this.config, this.eventEmitter, this.browserManager, this.mutex);
    this.itemsManager = new ItemsManager(
      this.browserManager,
      this.messageHandler,
      this.config,
      this.stateManager
    );
    this.communicationManager = new CommunicationManager(
      this.workerId,
      this.userId,
      this.redisClient,
      this.redisSubClient,
      this.itemsManager,
      this.messageHandler
    );
    this.messageHandler.setCommunicationManager(this.communicationManager);
    this.itemsManager.setCommunicationManager(this.communicationManager);
    this.heartbeatService = new HeartbeatService(this.workerId, this.redisClient, this.browserManager, this.eventEmitter, this.config.heartbeatInterval || 30000);
    this.cleanupManager = new CleanupManager(
      this.workerId,
      this.browserManager,
      this.heartbeatService,
      this.eventEmitter,
      this.communicationManager,
      this.itemsManager,
      this.messageHandler,
      this.stateManager
    );
    this.communicationManager.setCleanupManager(this.cleanupManager);

    // Setup event listeners
    this.setupEventListeners();

    // Setup signal handlers
    this.setupSignalHandlers();
  }

  private setupEventListeners(): void {
    // Listen for state changes and publish them
    this.eventEmitter.on("stateChange", async (newState: WorkerState, metadata?: any) => {
      await this.communicationManager.publishStatus(newState);
      logAdminEvent(`Worker ${this.workerId} state changed to ${newState}: { metadata }`);
    });

    // Listen for errors
    this.eventEmitter.on("error", async (error: Error) => {
      await this.browserManager.makeScreenshots();
      this.stateManager.setState(WorkerState.ERROR);
      logAdminError(`Worker ${this.workerId} encountered an error: ${error}`);
      await this.cleanupManager.cleanup();
    });

    // Listen for logouts
    this.eventEmitter.on("logout", async () => {
      await this.browserManager.makeScreenshots();
      this.stateManager.setState(WorkerState.BANNED);
      logAdminError(`Worker ${this.workerId} was banned`);
      await this.cleanupManager.cleanup();
    });

    this.eventEmitter.on("connection_lost", async () => {
      this.stateManager.setState(WorkerState.CONNECTION_LOST);
      logAdminError(`Worker ${this.workerId} proxy died`);
      await this.cleanupManager.cleanup();
    });
  }

  private setupSignalHandlers(): void {
    // Handle graceful shutdown
    process.on("SIGTERM", async () => {
      logger.info(`Worker ${this.workerId} received SIGTERM, initiating graceful shutdown`);
      await this.shutdown();
    });

    process.on("SIGINT", async () => {
      logger.info(`Worker ${this.workerId} received SIGINT, initiating graceful shutdown`);
      await this.shutdown();
    });

    // Handle uncaught exceptions
    process.on("uncaughtException", async (error: Error) => {
      logger.error(`Worker ${this.workerId} uncaught exception:`, error);
      this.stateManager.setState(WorkerState.ERROR, { error: error.message });
      await this.shutdown(1);
    });

    // Handle unhandled promise rejections
    process.on("unhandledRejection", async (reason: any) => {
      logger.error(`Worker ${this.workerId} unhandled rejection:`, reason);
      this.stateManager.setState(WorkerState.ERROR, { error: reason?.message || String(reason) });
      await this.shutdown(1);
    });
  }

  private async connectToRedis(channelId: number) {
    this.redisSubClient.on("error", (error: Error) => {
      logger.error(`Redis subscription client error: ${error}`);
      process.exit(1);
    });
    this.redisSubClient.on("connect", () => logger.info("Redis subscription connected"));
    this.redisSubClient.on("reconnecting", () => logger.info("Redis subscription reconnecting"));
    this.redisSubClient.on("ready", () => {
      logger.info("Redis subscription ready!");
    });

    await this.redisSubClient.connect();

    this.redisClient.on("error", (error: Error) => {
      logger.error(`Redis publisher client error: ${error}`);
      process.exit(1);
    });
    this.redisClient.on("connect", () => logger.info("Redis publisher connected"));
    this.redisClient.on("reconnecting", () => logger.info("Redis publisher reconnecting"));
    this.redisClient.on("ready", () => {
      logger.info("Redis publisher ready!");
    });

    await this.redisClient.connect();
  }

  private async getAccountName() {

  }

  public async start(): Promise<void> {
    try {
      logUserEvent(`Запускаю воркера`);

      // Connect to redis server
      await this.connectToRedis(this.config.workerId);

      this.stateManager.setState(WorkerState.CONNECTING);

      // Подписка до браузера: иначе товары с парсера теряются, пока поднимается браузер (pub/sub без очереди).
      await this.communicationManager.subscribe();

      // Connect browser
      await this.browserManager.initialize();

      // Receive new items and message on them
      await this.itemsManager.initialize();

      // Start message handling
      this.stateManager.setState(WorkerState.ACTIVE);
      logUserEvent(`Воркер ${this.workerId} успешно запущен и готов работать`);

      // Start heartbeat service
      await this.heartbeatService.start();
    } catch (error) {
      logAdminError(`Failed to start worker ${this.workerId}: ${error}`);
      logUserError("При запуске воркера произошла ошибка");
      this.stateManager.setState(WorkerState.ERROR, { error: (error as Error).message });
      await this.shutdown(1);
    }
  }

  public async shutdown(exitCode: number = 0): Promise<void> {
    try {
      this.stateManager.setState(WorkerState.SHUTDOWN);
      logUserEvent(`Выключаю воркера...`);

      // Stop all services
      await this.cleanupManager.cleanup();

      logUserEvent(`Воркер успешно завершён`);
      process.exit(exitCode);
    } catch (error) {
      logUserError(`Ошибка при завершении воркера`);
      logAdminError(`Worker shutdown error: ${error}`);
      process.exit(1);
    }
  }
}

// Run as main script
const redisUsername = process.env.REDIS_USERNAME!;
const redisPassword = process.env.REDIS_PASSWORD!;
const redisHost = process.env.REDIS_HOST || "localhost";
const redisPort = parseInt(process.env.REDIS_PORT || "6379");
const redisClient = createClient({
  url: `redis://${redisUsername === "root" ? "" : redisUsername + ":"}${redisPassword}@${redisHost}:${redisPort}`
}) as RedisClientType;
const workerConfig: WorkerConfig = {
  workerId: Number(process.env.WORKER_ID!),
  userId: Number(process.env.USER_ID!),
  heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL || "30000"),
  reconnectAttempts: parseInt(process.env.RECONNECT_ATTEMPTS!),
  reconnectDelay: parseInt(process.env.RECONNECT_DELAY!),
  redisClient: redisClient,
  redisSubClient: redisClient.duplicate(),
  browserURL: process.env.BROWSER_URL!,
  proxy: {
    proxyType: process.env.PROXY_TYPE!,
    proxyAddress: process.env.PROXY_ADDRESS!,
    proxyPort: Number(process.env.PROXY_PORT),
    proxyLogin: process.env.PROXY_LOGIN!,
    proxyPassword: process.env.PROXY_PASSWORD!
  },
  angebot: Number(process.env.ANGEBOT!) as AngebotOption,
  messageInterval: parseInt(process.env.MESSAGE_INTERVAL || "30000"),
  puppeteerTimeout: Number(process.env.PUPPETEER_TIMEOUT!),
  isHeadless: process.env.HEADLESS === "1",
  mainFolderPath: process.env.FOLDER_PATH!,
  login: process.env.WORKER_LOGIN ?? "",
  password: process.env.WORKER_PASSWORD ?? ""
};

if (!workerConfig.userId) {
  logger.error("USER_ID environment variable is required");
  process.exit(1);
}

const worker = new WorkerProcess(workerConfig);
worker.start().catch(error => {
  logger.error(`Failed to start worker process: ${error}`);
  process.exit(1);
});

// Export for programmatic usage
export { WorkerProcess };