/**
 * Централизованная нормализация прокси из `PROXY_URL` и произвольных строк.
 *
 * Канонический формат (рекомендуется):
 *   `protocol://login:password@host:port`
 * Примеры:
 *   `http://user:secret@45.128.99.35:26948`
 *   `socks5://user:secret@proxy.example.com:1080`
 *
 * Логин/пароль со спецсимволами — в percent-encoding (`encodeURIComponent` в URL).
 *
 * Обратная совместимость: `host:port:login:password` (в т.ч. IPv4), `host:port` без auth.
 *
 * Для HTTP CONNECT-прокси `https://` к самому прокси-серверу приводится к `http://`
 * (undici ProxyAgent, HttpsProxyAgent / axios CONNECT).
 */

/** `host:port:username:password` — разбор справа (IPv4 в host даёт много «:»). */
function parseColonSeparatedProxy(s: string): { host: string; port: string; username: string; password: string } | null {
  const i = s.lastIndexOf(":");
  if (i <= 0) return null;
  const password = s.slice(i + 1);
  const a = s.slice(0, i);
  const j = a.lastIndexOf(":");
  if (j <= 0) return null;
  const username = a.slice(j + 1);
  const b = a.slice(0, j);
  const k = b.lastIndexOf(":");
  if (k <= 0) return null;
  const port = b.slice(k + 1);
  const host = b.slice(0, k);
  if (!host || !/^\d+$/.test(port)) return null;
  return { host, port, username, password };
}

const SOCKS_PROTOCOLS = new Set(["socks5", "socks4", "socks5h", "socks4a"]);

/**
 * Приводит строку прокси к виду, пригодному для `new URL()`, HttpsProxyAgent, SocksProxyAgent, undici.ProxyAgent.
 */
export function normalizeProxyUrl(raw?: string | null): string | undefined {
  if (raw == null) return undefined;
  const trimmed = String(raw).trim();
  if (!trimmed) return undefined;

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    let u: URL;
    try {
      u = new URL(trimmed);
    } catch {
      return undefined;
    }

    const proto = u.protocol.replace(":", "").toLowerCase();
    if (!u.hostname) return undefined;

    if (SOCKS_PROTOCOLS.has(proto)) {
      return u.toString();
    }

    if (proto === "http" || proto === "https") {
      if (proto === "https") {
        u = new URL(u.toString().replace(/^https:/i, "http:"));
      }
      return u.toString();
    }

    return u.toString();
  }

  const parsed = parseColonSeparatedProxy(trimmed);
  if (parsed) {
    const { host, port, username, password } = parsed;
    return `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`;
  }

  if (/^[a-z0-9.-]+:\d+$/i.test(trimmed)) {
    return `http://${trimmed}`;
  }

  return `http://${trimmed}`;
}

/** Нормализованный `process.env.PROXY_URL` (без импорта `config`, чтобы не было циклов). */
export function getNormalizedEnvProxyUrl(): string | undefined {
  return normalizeProxyUrl(process.env.PROXY_URL);
}
