import { createClient } from "redis";
import { ENV, logger } from "../config";

const redisUsername = ENV.REDIS_USERNAME;
const redisPassword = ENV.REDIS_PASSWORD;
const redisHost = ENV.REDIS_HOST;
const redisPort = ENV.REDIS_PORT;

export const redisClient = createClient({
  url: `redis://${redisUsername === "root" ? "" : redisUsername + ":"}${redisPassword}@${redisHost}:${redisPort}`
}).on("error", (error: Error) => logger.error("Redis client error: ", error))
  .on("connect", () => logger.info("Redis connected"))
  .on("reconnecting", () => logger.info("Redis reconnecting"))
  .on("ready", () => logger.info("Redis ready!"));
await redisClient.connect();

export const subRedisClient = createClient({
  url: `redis://${redisUsername === "root" ? "" : redisUsername + ":"}${redisPassword}@${redisHost}:${redisPort}`
}).on("error", (error: Error) => logger.error("subRedis client error: ", error))
  .on("connect", () => logger.info("subRedis connected"))
  .on("reconnecting", () => logger.info("subRedis reconnecting"))
  .on("ready", () => logger.info("subRedis ready!"));
await subRedisClient.connect();

export async function initRedisSubscriptions(): Promise<void> {
  const { RedisService } = await import("../api/services/redis.service");
  await subRedisClient.subscribe("workers-messages-to-main", (message) => RedisService.ReceiveMessageFromMerchantInWorker(message));
  await subRedisClient.subscribe("workers-statuses-to-main", (message) => RedisService.UpdateStatusFromRedisMessage(message));
  await subRedisClient.subscribe("workers-first-message-to-main", (message) => RedisService.RegisterFirstMessageOnItem(message));
  await subRedisClient.subscribe("worker-verification", (message) => RedisService.HandleWorkerVerificationMessage(message));
  await subRedisClient.subscribe("worker-code", (message) => RedisService.HandleWorkerCodeMessage(message));
  logger.info("Redis subscriptions initialized");
}