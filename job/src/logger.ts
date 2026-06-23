import winston from "winston";
import { config } from "dotenv";

config();

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

const colors = {
  error: "red",
  warn: "yellow",
  info: "green",
  http: "magenta",
  debug: "blue"
};

winston.addColors(colors);

const level = process.env.LOG_LEVEL || "debug";

// Format for all logs
const baseFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss:ms" }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// Format for console with colors
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  baseFormat
);

// Transports
const transports = [
  // User events (info) to stdout (public, accessible via Kubernetes logs)
  new winston.transports.Stream({
    stream: process.stdout,
    level: "info",
    format: winston.format.combine(
      winston.format((info) => (info.level === "info" && info.isUser) ? info : false)(),
      baseFormat
    )
  }),

  // User errors to stdout (public)
  new winston.transports.Stream({
    stream: process.stdout,
    level: "error",
    format: winston.format.combine(
      winston.format((info) => (info.level === "error" && info.isUser) ? info : false)(),
      baseFormat
    )
  }),

  // Admin events (info) to file (private)
  new winston.transports.File({
    filename: "/logs/admin-events.log",
    level: "info",
    maxsize: 5242880, // 5MB
    maxFiles: 5,
    format: winston.format.combine(
      winston.format((info) => (info.level === "info" && !info.isUser) ? info : false)(),
      baseFormat
    )
  }),

  // Admin errors to file (private)
  new winston.transports.File({
    filename: "/logs/admin-errors.log",
    level: "error",
    maxsize: 5242880, // 5MB
    maxFiles: 5,
    format: winston.format.combine(
      winston.format((info) => (info.level === "error" && !info.isUser) ? info : false)(),
      baseFormat
    )
  }),

  // Combined logs for all levels (optional, for debugging)
  new winston.transports.File({
    filename: "/logs/combined.log",
    maxsize: 5242880, // 5MB
    maxFiles: 5,
    format: baseFormat
  })
];

export const logger = winston.createLogger({
  level,
  levels,
  transports,
  exitOnError: false
});

// Morgan stream for HTTP logs
export const stream = {
  write: (message: string) => {
    logger.http(message.trim());
  }
};

// Helper functions for logging
export const logUserEvent = (message: string) => logger.info(message, { isUser: true });
export const logUserError = (message: string) => logger.error(message, { isUser: true });
export const logAdminEvent = (message: string) => logger.info(message, { isUser: false });
export const logAdminError = (message: string) => logger.error(message, { isUser: false });