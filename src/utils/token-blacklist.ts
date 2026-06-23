// token-blacklist.ts
// Чёрный список отозванных refresh-токенов в Redis (ВКР §3.3): при выходе пользователя
// jti refresh-токена добавляется в blacklist с TTL, равным остатку времени жизни токена.
import { redisClient } from "../redis/redis";
import { logger } from "../config";

const PREFIX = "jwt:blacklist:";

/** Помещает jti в чёрный список на ttlSeconds (остаток жизни токена). */
export async function blacklistToken(jti: string, ttlSeconds: number): Promise<void> {
  if (!jti || ttlSeconds <= 0) return;
  try {
    await redisClient.set(`${PREFIX}${jti}`, "1", { EX: Math.ceil(ttlSeconds) });
  } catch (e) {
    logger.error(`[token-blacklist] failed to blacklist ${jti}: ${(e as Error).message}`);
  }
}

/** Проверяет, отозван ли токен. При сбое Redis возвращает false (fail-open). */
export async function isTokenBlacklisted(jti?: string): Promise<boolean> {
  if (!jti) return false;
  try {
    return (await redisClient.get(`${PREFIX}${jti}`)) !== null;
  } catch (e) {
    logger.error(`[token-blacklist] check failed for ${jti}: ${(e as Error).message}`);
    return false;
  }
}
