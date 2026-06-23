import Item from "../../database/item.model";
import Worker, { WorkerState } from "../../database/worker.model";
import { redisClient } from "../../redis/redis";
import { MessageService } from "./message.service";
import { logger } from "../../config";
import WorkerService from "./worker.service";
import Message from "../../database/message.model";
import { DialogService } from "./dialog.service";
import { getSocket } from "../../socket-holder";
import UserService from "./user.service";
import Merchant from "../../database/merchant.model";
import { ItemsService } from "./items.service";
import { AngebotOption } from "../../database/user.model";
import { TemplateService } from "./template.service";
import { prepareMessage } from "../utils/prepare.message";
import { UniqueConstraintError } from "sequelize";

export interface MerchantMessageData {
  workerId: number;
  userId: number;
  itemId: string;
  payload: {
    text?: string;
    attachment?: string;
  };
}

export interface UserMessageData {
  text?: string;
  attachment?: string;
}

export interface StatusChangeData {
  workerId: number;
  payload: {
    state: WorkerState;
    previousState?: WorkerState;
  };
}

export interface WorkerVerificationRedisPayload {
  workerId: number;
  userId: number;
  success: boolean;
  phoneNumber?: string;
}

export interface WorkerCodeRedisPayload {
  workerId: number;
  userId: number;
  success: boolean;
}

export type WorkerCommandPayload =
  | { command: "shutdown" }
  | { command: "pause" }
  | { command: "credentials" }
  | { command: "reverify"; countryCode: string; phoneNumber: string }
  | { command: "verify"; countryCode: string; phoneNumber: string }
  | { command: "code"; code: string };

export interface NewDialogMessage {
  workerId: number;
  userId: number;
  itemName: string;
}

export interface CredentialsMessage {
  email?: string;
  username?: string;
  workerId: number;
}

export class RedisService {
  private static templatesCache = new Map<number, { data: any; ts: number }>();
  private static userCache = new Map<number, { data: any; ts: number }>();
  private static readonly CACHE_TTL_MS = 30_000;

  private static async getCachedTemplates(userId: number) {
    const cached = this.templatesCache.get(userId);
    if (cached && Date.now() - cached.ts < this.CACHE_TTL_MS) return cached.data;
    const data = await TemplateService.getGreetingTemplates(userId);
    this.templatesCache.set(userId, { data, ts: Date.now() });
    return data;
  }

  private static async getCachedUser(userId: number) {
    const cached = this.userCache.get(userId);
    if (cached && Date.now() - cached.ts < this.CACHE_TTL_MS) return cached.data;
    const data = await UserService.getUserById(userId);
    this.userCache.set(userId, { data, ts: Date.now() });
    return data;
  }

  public static async SendItemsToWorker(items: Item[], merchants: Merchant[], worker: Worker): Promise<void> {
    try {
      const templates = await this.getCachedTemplates(worker.userId);

      const data = JSON.stringify(await Promise.all(items.map(async item => {
        let firstMessage = "";
        let templateIndex = 0;
        if (templates) {
          templateIndex = Math.floor(Math.random() * templates[0].texts.length);
          const merchant = merchants.find(m => m.id === item.merchantId);
          if (!merchant) throw new Error(`Couldn't find merchant for item ${item.id}`);
          firstMessage = await prepareMessage(templates[0].texts[templateIndex],
            merchant, item, worker.userId);
        }
        await this.saveTemplateIndexForItem(item.id, templateIndex);

        return {
          id: item.id,
          cianId: item.cianId,
          name: item.name,
          merchantName: merchants.find(merchant => merchant.id == item.merchantId)?.name,
          price: item.price,
          firstMessage: firstMessage
        };
      })));
      await redisClient.publish("main-items-to-worker:" + worker.id, data);
    } catch (error: any) {
      logger.error(`Error sending item to worker ${worker.id}: ${error.message}`);
    }
  }

  public static async SendMessageToWorker(workerId: number, itemName: string, message: Message): Promise<void> {
    const data = JSON.stringify({
      text: message.text,
      attachment: message.attachment,
      itemName: itemName
    });
    await redisClient.publish("main-message-to-worker:" + workerId, data);
  }

  public static async ReceiveMessageFromMerchantInWorker(rawMessage: string): Promise<void> {
    try {
      const parsed: MerchantMessageData = JSON.parse(rawMessage);
      const message = await MessageService.registerMessageFromRedis(parsed);

      const item = await ItemsService.getByCianId(parsed.itemId);
      if (!item) throw new Error(`Item with cianId: ${parsed.itemId} not found`);

      const merchant = await Merchant.findByPk(item.merchantId);
      if (!merchant) throw new Error(`Merchant not found for item ${item.id}`);

      try {
        getSocket().broadcastMessageBoxToUser(parsed.userId.toString(), {
          attachment: message.attachment,
          dialogId: message.dialogId,
          id: message.id,
          itemImage: merchant.profilePicture,
          price: item.price ?? 0,
          itemName: item.name,
          merchantName: merchant.name,
          sentAt: message.createdAt,
          text: message.text,
          isSentByUser: false
        });
      } catch (error: any) {
        logger.error("Couldn't send message via socket", error);
      }
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        logger.warn("Duplicate message received from worker. Skipping.");
      } else {
        logger.error("Failed to parse message:", error);
      }
    }
  }

  public static async UpdateStatusFromRedisMessage(message: string) {
    try {
      const parsed: StatusChangeData = JSON.parse(message);
      const { worker, oldStatus } = await WorkerService.getOldUpdateWorkerStatus(parsed);
      const userId = await UserService.getUserIdByWorkerId(parsed.workerId);
      if (!userId) {
        logger.error(`Couldn't find user for worker: ${parsed.workerId}`);
        return;
      }

      if (parsed.payload.state === oldStatus) return;

      const badStatuses = [WorkerState.BANNED, WorkerState.SHUTDOWN, WorkerState.ERROR,
        WorkerState.CONNECTION_LOST] as WorkerState[];
      if (badStatuses.includes(parsed.payload.state) && worker.status && !badStatuses.includes(oldStatus)) {
        await WorkerService.shutdownWorker(worker, parsed.payload.state);
        await new Promise(resolve => setTimeout(resolve, 60000));
        WorkerService.enqueueRunWorker(parsed.workerId, userId);
      }
      getSocket().broadcastStatusToUser(userId.toString(), {
        ...parsed,
        payload: { ...parsed.payload, previousState: oldStatus }
      });
      logger.info(`${worker.id} changed status to ${parsed.payload.state}`);
    } catch (error) {
      logger.error("Failed to parse status:", error);
    }
  }

  public static async sendWorkerCommand(workerId: number, command: WorkerCommandPayload): Promise<void> {
    await redisClient.publish("main-command-to-worker:" + workerId, JSON.stringify(command));
  }

  public static async HandleWorkerVerificationMessage(message: string): Promise<void> {
    try {
      const parsed: WorkerVerificationRedisPayload = JSON.parse(message);
      const worker = await WorkerService.getWorker(parsed.workerId);
      if (!worker || worker.userId !== parsed.userId) {
        logger.warn(`worker-verification: worker ${parsed.workerId} missing or user mismatch`);
        return;
      }
      const oldStatus = worker.status ?? WorkerState.SHUTDOWN;
      if (parsed.success) {
        if (parsed.phoneNumber) worker.phoneNumber = parsed.phoneNumber;
        worker.status = WorkerState.EXPECTING_CODE;
        await worker.save();
        return;
      }
      worker.status = WorkerState.PHONE_VERIFICATION;
      await worker.save();
      getSocket().broadcastStatusToUser(worker.userId.toString(), {
        workerId: parsed.workerId,
        payload: { state: WorkerState.PHONE_VERIFICATION, previousState: oldStatus }
      });
    } catch (error) {
      logger.error("Failed worker-verification message:", error);
    }
  }

  public static async HandleWorkerCodeMessage(message: string): Promise<void> {
    try {
      const parsed: WorkerCodeRedisPayload = JSON.parse(message);
      const worker = await WorkerService.getWorker(parsed.workerId);
      if (!worker || worker.userId !== parsed.userId) {
        logger.warn(`worker-code: worker ${parsed.workerId} missing or user mismatch`);
        return;
      }
      const oldStatus = worker.status ?? WorkerState.SHUTDOWN;
      if (parsed.success) {
        worker.status = WorkerState.CONNECTING;
        await worker.save();
        getSocket().broadcastStatusToUser(worker.userId.toString(), {
          workerId: parsed.workerId,
          payload: { state: WorkerState.CONNECTING, previousState: oldStatus }
        });
        return;
      }
      worker.phoneNumber = null;
      worker.status = WorkerState.PHONE_VERIFICATION;
      await worker.save();
      getSocket().broadcastStatusToUser(worker.userId.toString(), {
        workerId: parsed.workerId,
        payload: { state: WorkerState.PHONE_VERIFICATION, previousState: oldStatus }
      });
    } catch (error) {
      logger.error("Failed worker-code message:", error);
    }
  }

  public static async RegisterFirstMessageOnItem(message: string) {
    const parsed: NewDialogMessage = JSON.parse(message);
    const item = await ItemsService.getByName(parsed.itemName);
    if (!item) throw new Error(`Couldn't find item by name: ${parsed.itemName}`);
    await DialogService.createDialogOnUserMessage(parsed.workerId, parsed.userId, item);
  }

  public static async acquireLock(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const result = await redisClient.set(key, value, { NX: true, EX: ttlSeconds });
    return result === "OK";
  }

  public static async releaseLock(key: string, value: string): Promise<void> {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await redisClient.eval(script, { keys: [key], arguments: [value] });
  }

  public static async rememberParserRunning(filterId: number, parserId: string) {
    const lockKey = `parser:running:${filterId}:${parserId}`;
    const acquired = await redisClient.set(lockKey, parserId, { NX: true, EX: 86400 });
    if (!acquired) {
      logger.info(`[Parser] Already running: filter ${filterId}, parser ${parserId}`);
      return;
    }
    return lockKey;
  }

  public static async refreshParserLock(lockKey: string, parserId: string): Promise<boolean> {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("expire", KEYS[1], 86400)
      else
        return 0
      end
    `;
    const result = await redisClient.eval(script, { keys: [lockKey], arguments: [parserId] });
    return result === 1;
  }

  public static async getActiveParserCount(filterId: number): Promise<number> {
    const pattern = `parser:running:${filterId}:*`;
    let count = 0;
    let cursor = "0";
    do {
      const result = await redisClient.scan(cursor, { MATCH: pattern, COUNT: 100 });
      cursor = String(result.cursor);
      count += result.keys.length;
    } while (cursor !== "0");
    return count;
  }

  public static async saveTemplateIndexForItem(itemId: number, index: number): Promise<void> {
    await redisClient.set(`first-message-id:${itemId}`, index.toString(), { NX: true, EX: 600 });
  }

  public static async getTemplateIndexForItem(itemId: number): Promise<number> {
    return parseInt(await redisClient.get(`first-message-id:${itemId}`) ?? "0");
  }
}
