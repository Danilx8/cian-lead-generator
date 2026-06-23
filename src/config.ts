import { Dialect } from "sequelize";
import winston from "winston";
import dotenv from "dotenv";
import { setDefaultResultOrder } from "dns";

setDefaultResultOrder("ipv4first");
dotenv.config();

const nodeEnv = process.env.NODE_ENV || "development";

function shouldSeedMockDialogs(): boolean {
  const raw = (process.env.SEED_MOCK_DIALOGS || "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return nodeEnv !== "production";
}

function shouldModerateRegistration(): boolean {
  const raw = (process.env.REGISTRATION_MODERATION || "").trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return true; // по умолчанию включено (ВКР: заявка на регистрацию с одобрением администратором)
}

export const ENV = {
  NODE_ENV: nodeEnv as string,
  SEED_MOCK_DIALOGS: shouldSeedMockDialogs(),
  REGISTRATION_MODERATION: shouldModerateRegistration(),
  HOST: process.env.HOST as string,
  PORT: Number(process.env.PORT) || 3000,
  DB_HOST: process.env.DB_HOST as string,
  DB_PORT: Number(process.env.DB_PORT) || 5432,
  DB_NAME: process.env.DB_NAME as string,
  DB_USER: process.env.DB_USER as string,
  DB_PASSWORD: process.env.DB_PASSWORD as string,
  DB_DIALECT: (process.env.DB_DIALECT as Dialect) ?? "postgres",
  REDIS_HOST: (process.env.REDIS_HOST as string) || "127.0.0.1",
  REDIS_PORT: Number(process.env.REDIS_PORT) || 6379,
  REDIS_USERNAME: String(process.env.REDIS_USERNAME as string),
  REDIS_PASSWORD: String(process.env.REDIS_PASSWORD as string),
  HEADLESS: Number(process.env.HEADLESS) === 1,
  BROWSER_X_TOKEN: process.env.BROWSER_X_TOKEN as string,
  BROWSERS_AMOUNT: Number(process.env.BROWSERS_AMOUNT),
  CAPTCHA_SOLVER_TOKEN: Number(process.env.CAPTCHA_SOLVER_TOKEN),
  PARSED_ITEMS_PER_CATEGORY_NUMBER: Number(process.env.PARSED_ITEMS_PER_CATEGORY_NUMBER),
  HEARTBEAT_INTERVAL: Number(process.env.HEARTBEAT_INTERVAL),
  MORE_LOGIN_PORT: Number(process.env.MORE_LOGIN_PORT),
  MORE_LOGIN_ID: process.env.MORE_LOGIN_ID,
  MORE_LOGIN_KEY: process.env.MORE_LOGIN_KEY,
  VISION_TOKEN: process.env.VISION_TOKEN,
  DOLPHIN_PORT: Number(process.env.DOLPHIN_PORT),
  DOLPHIN_TOKEN: process.env.DOLPHIN_TOKEN,
  ADSPOWER_PATH: process.env.ADSPOWER_PATH,
  ADSPOWER_TOKEN: process.env.ADSPOWER_TOKEN,
  GOLOGIN_TOKEN: process.env.GOLOGIN_TOKEN,
  OCTO_TOKEN: process.env.OCTO_TOKEN,
  LINKEN_SPHERE_PORT: Number(process.env.LINKEN_SPHERE_PORT) || 35555,
  JWT_SECRET: process.env.JWT_SECRET,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  ADMIN_API_KEY: process.env.ADMIN_API_KEY,
  // SMTP-шлюз для email-уведомлений (ВКР §1.6/§1.7). Без SMTP_HOST уведомления только логируются.
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: Number(process.env.SMTP_PORT) || 587,
  SMTP_SECURE: ["1", "true", "yes", "on"].includes((process.env.SMTP_SECURE || "").toLowerCase()),
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASSWORD: process.env.SMTP_PASSWORD,
  SMTP_FROM: process.env.SMTP_FROM || "no-reply@cian-lead-generator.local",
  DOCKER_IP: process.env.DOCKER_IP!,
  FOLDER_PATH: process.env.FOLDER_PATH ?? "/",
  PARSER_PROXY: process.env.PARSER_PROXY,
  PROXY_URL: process.env.PROXY_URL,
  PARSER_DEFAULT_PROXY: process.env.PARSER_PROXY || process.env.PROXY_URL || "",
  HTTP_WORKER_IMAGE: process.env.HTTP_WORKER_IMAGE || "ghcr.io/cian-lead/worker:latest",
  DOCKER_HOST_IP: process.env.DOCKER_HOST_IP ?? "host.docker.internal",
  INDIGO_API_URL: process.env.INDIGO_API_URL ?? "https://api.indigobrowser.com",
  INDIGO_TOKEN: process.env.INDIGO_TOKEN,
  INDIGO_EMAIL: process.env.INDIGO_EMAIL,
  INDIGO_PASSWORD: process.env.INDIGO_PASSWORD,
  INDIGO_PASSWORD_MD5: process.env.INDIGO_PASSWORD_MD5,
  INDIGO_FOLDER_ID: process.env.INDIGO_FOLDER_ID ?? "default",
  IDENTORY_API_URL: (process.env.IDENTORY_API_URL ?? "").replace(/\/$/, ""),
  IDENTORY_TOKEN: process.env.IDENTORY_TOKEN,
  UNDETECTABLE_API_URL: (process.env.UNDETECTABLE_API_URL ?? "").replace(/\/$/, ""),
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  SELLER_CLASSIFIER_MODEL: process.env.SELLER_CLASSIFIER_MODEL,
  THERMOPTIC_PORT: process.env.THERMOPTIC_PORT ? Number(process.env.THERMOPTIC_PORT) : undefined,
  THERMOPTIC_PROXY_USER: process.env.THERMOPTIC_PROXY_USER,
  THERMOPTIC_PROXY_PASSWORD: process.env.THERMOPTIC_PROXY_PASSWORD,
  RECONNECT_ATTEMPTS: Number(process.env.RECONNECT_ATTEMPTS) || 3,
  RECONNECT_DELAY: Number(process.env.RECONNECT_DELAY) || 5000,
};

const { combine, timestamp, printf, errors, colorize } = winston.format;

const logFormat = printf((info: winston.Logform.TransformableInfo) => {
  const { level, message, timestamp, stack } = info;
  return `${timestamp} ${level}: ${stack || message}`;
});

export const logger = winston.createLogger({
  level: "info",
  format: combine(timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), errors({ stack: true }), logFormat),
  transports: []
});

if (nodeEnv === "production") {
  logger.add(new winston.transports.File({ filename: "logs/error.log", level: "error" }));
  logger.add(new winston.transports.File({ filename: "logs/combined.log" }));

  logger.exceptions.handle(new winston.transports.File({ filename: "logs/exceptions.log" }));
} else {
  logger.add(
    new winston.transports.Console({
      format: combine(
        colorize({ all: true }),
        timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        errors({ stack: true }),
        logFormat
      )
    })
  );
}
