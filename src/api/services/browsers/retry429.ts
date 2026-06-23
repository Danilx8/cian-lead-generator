export function parseRetryAfter(header?: string | number | null): number | null {
  if (header == null) return null;
  if (typeof header === "number") return Math.max(0, header) * 1000; // seconds -> ms
  const asNum = Number(header);
  if (!Number.isNaN(asNum)) return Math.max(0, asNum) * 1000; // seconds -> ms
  const ms = new Date(header).getTime() - Date.now();
  return ms > 0 ? ms : null;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface Retry429Options {
  maxRetries?: number; // total retry attempts on 429
  defaultDelayMs?: number; // default delay when no Retry-After
  alsoRetry5xx?: boolean; // optionally retry 5xx like 502/503/504
}

/**
 * Runs the async function and retries when HTTP 429 is returned.
 * Uses `Retry-After` header if present, else waits defaultDelayMs (default 5000 ms).
 */
export async function with429Retry<T>(fn: () => Promise<T>, opts: Retry429Options = {}): Promise<T> {
  const {
    maxRetries = 6,
    defaultDelayMs = 5000,
    alsoRetry5xx = false
  } = opts;

  let lastErr: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const status = e?.response?.status;
      const headers = e?.response?.headers || {};

      if (status === 429 || (alsoRetry5xx && status >= 500 && status < 600)) {
        const retryAfterHeader = headers["retry-after"] ?? headers["Retry-After"];
        const waitMs = parseRetryAfter(retryAfterHeader) ?? defaultDelayMs;
        await sleep(waitMs);
        continue;
      }
      throw e;
    }
  }

  throw lastErr;
}
