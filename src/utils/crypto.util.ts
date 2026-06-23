// crypto.util.ts
// Шифрование чувствительных данных в хранилище по AES-256-GCM (ВКР §3.3).
// Ключ задаётся переменной окружения ENCRYPTION_KEY и не хранится в репозитории.
//
// Формат шифротекста (base64): salt(16) | iv(12) | authTag(16) | ciphertext.
// Ключ выводится из ENCRYPTION_KEY через scrypt с пер-записной солью.
//
// decryptSafe() терпим к легаси-данным: если значение не является корректным
// шифротекстом (например, исторический открытый текст), возвращает его как есть —
// это позволяет включать шифрование поэтапно, без единовременной миграции БД.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { ENV } from "../config";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function deriveKey(salt: Buffer): Buffer {
  const secret = ENV.ENCRYPTION_KEY;
  if (!secret) throw new Error("ENCRYPTION_KEY is not configured");
  return scryptSync(secret, salt, KEY_LENGTH);
}

/** Настроено ли шифрование (присутствует ли ENCRYPTION_KEY). */
export function isEncryptionConfigured(): boolean {
  return !!ENV.ENCRYPTION_KEY;
}

/** Шифрует строку AES-256-GCM. */
export function encrypt(plaintext: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = deriveKey(salt);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, tag, enc]).toString("base64");
}

/** Расшифровывает строку, зашифрованную encrypt(). Бросает при повреждении/подделке. */
export function decrypt(payload: string): string {
  const data = Buffer.from(payload, "base64");
  if (data.length <= SALT_LENGTH + IV_LENGTH + TAG_LENGTH) {
    throw new Error("Ciphertext too short");
  }
  const salt = data.subarray(0, SALT_LENGTH);
  const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag = data.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const enc = data.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const key = deriveKey(salt);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/**
 * Шифрует значение, только если шифрование настроено; иначе возвращает открытый текст.
 * Используется на границе записи в БД.
 */
export function encryptIfConfigured(plaintext?: string | null): string | undefined | null {
  if (plaintext == null || plaintext === "") return plaintext ?? undefined;
  if (!isEncryptionConfigured()) return plaintext;
  return encrypt(plaintext);
}

/**
 * Расшифровывает значение из БД, терпимо относясь к легаси-открытому-тексту:
 * при неуспехе расшифровки возвращает исходное значение.
 * Используется на границе чтения из БД.
 */
export function decryptSafe(value?: string | null): string | undefined {
  if (value == null || value === "") return value ?? undefined;
  if (!isEncryptionConfigured()) return value;
  try {
    return decrypt(value);
  } catch {
    return value; // легаси-открытый-текст или не наш формат
  }
}
