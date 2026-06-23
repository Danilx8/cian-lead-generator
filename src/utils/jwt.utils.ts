import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { ENV, logger } from "../config";

const JWT_SECRET = ENV.JWT_SECRET || "your-secret-key-change-in-production";

// Время жизни токенов (ВКР §3.3: access — 60 минут, refresh — 7 дней).
export const ACCESS_TOKEN_EXPIRES_IN = "60m";
export const REFRESH_TOKEN_EXPIRES_IN = "7d";
export const ACCESS_TOKEN_MAX_AGE_MS = 60 * 60 * 1000;
export const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type TokenType = "access" | "refresh";

export interface TokenPayload {
  userId: number;
  type: TokenType;
  /** Уникальный идентификатор токена — используется для blacklist refresh-токенов при logout. */
  jti?: string;
  iat?: number;
  exp?: number;
}

export const generateAccessToken = (userId: number): string =>
  jwt.sign({ userId, type: "access" }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES_IN });

export const generateRefreshToken = (userId: number): string =>
  jwt.sign({ userId, type: "refresh", jti: randomUUID() }, JWT_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
  });

/** @deprecated Используйте generateAccessToken. Оставлено для обратной совместимости. */
export const generateToken = generateAccessToken;

export const verifyToken = (token: string): TokenPayload | null => {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch (error) {
    logger.error(`Token verification failed: ${error}`);
    return null;
  }
};
