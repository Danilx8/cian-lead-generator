import { RedisClientType } from "redis";

export interface WorkerConfig {
  workerId: number;
  userId: number;
  heartbeatInterval?: number;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  redisClient: RedisClientType;
  redisSubClient: RedisClientType;
  browserURL: string;
  proxy?: ProxyParameters;
  angebot: AngebotOption;
  messageInterval: number;
  puppeteerTimeout: number;
  isHeadless: boolean;
  mainFolderPath: string;
  login: string;
  password: string;
}

export interface ProxyParameters {
  proxyType: string;
  proxyAddress: string;
  proxyPort: number;
  proxyLogin?: string;
  proxyPassword?: string;
}

export enum AngebotOption {
  NONE = 1,
  NO_CANCEL_YES_WRITE = 2,
  YES_CANCEL_YES_WRITE = 3,
  NO_CANCEL_NO_WRITE = 4,
  YES_CANCEL_NO_WRITE = 5,
}
