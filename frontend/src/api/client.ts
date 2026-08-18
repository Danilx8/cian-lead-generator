import { API_BASE_URL } from './config';
import { initData } from '@telegram-apps/sdk';

export class ApiError extends Error {
  public status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

/** silent: не показывать глобальный тост (фоновые/списочные запросы — ошибку обрабатывает вызывающий код). */
export type ApiRequestInit = RequestInit & { silent?: boolean };

const JWT_STORAGE_KEY = 'jwt_token';
let jwtToken: string | null = null;

export const initJwtToken = () => {
  try {
    const stored = localStorage.getItem(JWT_STORAGE_KEY);
    if (stored) {
      jwtToken = stored;
      console.log('✅ JWT токен загружен из localStorage');
    } else {
      console.log('🔍 JWT токен не найден в localStorage');
    }
  } catch (e) {
    console.warn('Failed to load JWT token from localStorage:', e);
  }
};

const saveJwtToken = (token: string) => {
  jwtToken = token;
  try {
    localStorage.setItem(JWT_STORAGE_KEY, token);
    console.log('✅ JWT токен сохранен в localStorage');
  } catch (e) {
    console.warn('Failed to save JWT token to localStorage:', e);
  }
};

const clearJwtToken = () => {
  jwtToken = null;
  try {
    localStorage.removeItem(JWT_STORAGE_KEY);
    console.log('🗑️ JWT токен удален из localStorage');
  } catch (e) {
    console.warn('Failed to remove JWT token from localStorage:', e);
  }
};

initJwtToken();

export const getJwtToken = () => jwtToken;
export { clearJwtToken };

const inFlight = new Map<string, Promise<unknown>>();
interface CacheEntry { exp: number; data: unknown; }
const getCache = new Map<string, CacheEntry>();
const GET_TTL = 30_000;

export function clearCache(endpoint?: string) {
  if (endpoint) {
    for (const [key] of getCache.entries()) {
      if (key.includes(endpoint)) {
        getCache.delete(key);
      }
    }
  } else {
    getCache.clear();
  }
}

function cacheKey(method: string, url: string): string {
  return `${method}::${url}`;
}

function isCacheableGet(endpoint: string): boolean {
  // Individual dialog/message endpoints — always fresh
  if (/\/dialogs\/\d/.test(endpoint)) return false;
  // Dialog list is cacheable (short TTL still helps on tab switch)

  if (/\/api\/providers\//.test(endpoint)) return false;
  if (/\/api\/user\/all/.test(endpoint)) return false;
  if (/\/api\/user\/id\//.test(endpoint)) return false;
  if (/\/api\/admin\//.test(endpoint)) return false;
  return true;
}

/** Раньше initData клали в LS — из‑за этого после перезапуска WebView уходили просроченные строки. Оставляем ключ только для одноразовой зачистки. */
const LEGACY_INIT_DATA_STORAGE_KEY = 'tg_init_data_raw_v1';

/** Верхняя граница «свежести» auth_date на клиенте (секунды). Синхронизуйте с TTL валидации на сервере при необходимости. */
const MAX_INIT_DATA_AGE_SEC = 86400;

interface TelegramWebAppLike { initData?: string; initDataRaw?: string; close?: () => void; }
type TelegramWindowLike = Window & { Telegram?: { WebApp?: TelegramWebAppLike & Record<string, unknown> }; __TG_INIT_WARNED__?: boolean; };

function clearLegacyInitDataStorage(): void {
  try {
    localStorage.removeItem(LEGACY_INIT_DATA_STORAGE_KEY);
    sessionStorage.removeItem(LEGACY_INIT_DATA_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

clearLegacyInitDataStorage();

function isLikelyValidInitData(str: string | null | undefined): str is string {
  if (!str) return false;
  if (str.length < 50) return false;
  // hash + user обязательны; query_id есть не у всех запусков (например меню бота / прямая ссылка на Web App).
  if (!str.includes('hash=')) return false;
  if (!(str.includes('user=') || str.includes('%22user%22'))) return false;
  return true;
}

function pickFirstValidRaw(candidates: Array<string | undefined | null>): string {
  for (const c of candidates) {
    if (isLikelyValidInitData(c)) return c;
  }
  return '';
}

function extractFromHash(): string {
  try {
    const hash = window.location.hash || '';
    const marker = '#tgWebAppData=';
    const idx = hash.indexOf(marker);
    if (idx === -1) return '';
    const raw = hash.substring(idx + marker.length);
    return raw || '';
  } catch { return ''; }
}

/** Для каждого логина: только «живые» источники (WebApp → SDK → hash). Без localStorage/sessionStorage. */
function getFreshInitDataRawForLogin(): string {
  const tg = (window as TelegramWindowLike).Telegram?.WebApp;
  const fromWeb = pickFirstValidRaw([tg?.initDataRaw, tg?.initData]);

  if (fromWeb) return fromWeb;

  try {
    initData.restore();
  } catch {
    /* ignore */
  }
  let sdkRaw = '';
  try {
    sdkRaw = initData.raw() || '';
  } catch {
    /* ignore */
  }
  if (isLikelyValidInitData(sdkRaw)) return sdkRaw;

  const fromHash = extractFromHash();
  if (isLikelyValidInitData(fromHash)) return fromHash;

  return '';
}

function parseAuthDateUnixFromInitDataRaw(raw: string): number | null {
  if (!raw) return null;
  try {
    const params = new URLSearchParams(raw);
    const v = params.get('auth_date');
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function isClientInitDataAuthDateStale(raw: string): boolean {
  const authUnix = parseAuthDateUnixFromInitDataRaw(raw);
  if (authUnix == null) return false;
  const now = Math.floor(Date.now() / 1000);
  return now - authUnix > MAX_INIT_DATA_AGE_SEC;
}

export const CLIENT_STALE_INIT_DATA_MESSAGE =
  'Данные запуска Telegram устарели (auth_date). Закройте мини-приложение полностью и откройте его снова из чата с ботом.';

function isInitDataExpiredServerMessage(message: string): boolean {
  return /init\s*data\s*expired/i.test(message);
}

function bodyTextIndicatesInitDataExpired(bodyText: string): boolean {
  if (isInitDataExpiredServerMessage(bodyText)) return true;
  try {
    const j = JSON.parse(bodyText) as Record<string, unknown>;
    const cand = [j.message, j.error, j.detail].find((x) => typeof x === 'string') as string | undefined;
    return cand ? isInitDataExpiredServerMessage(cand) : false;
  } catch {
    return false;
  }
}

/** Сброс JWT и закрытие мини-аппа, чтобы пользователь открыл новый запуск с новым initData. */
export function forceMiniAppRelaunchAfterStaleInitData(): void {
  clearJwtToken();
  clearLegacyInitDataStorage();
  try {
    (window as TelegramWindowLike).Telegram?.WebApp?.close?.();
  } catch {
    /* ignore */
  }
}

/** Совместимость: то же сырьё, что и для логина (без долгого кэша). */
function getInitData(): string {
  const raw = getFreshInitDataRawForLogin();
  const w = window as TelegramWindowLike;
  if (!raw && !w.__TG_INIT_WARNED__) {
    w.__TG_INIT_WARNED__ = true;
    console.warn('[tg-init] Не удалось получить валидный initData. Итоговая строка укорочена или отсутствует.');
  }
  return raw || '';
}

export function getTelegramInitDataDiagnostics(): {
  isValid: boolean;
  length: number;
  authDateStale: boolean;
} {
  const raw = getInitData();
  const valid = isLikelyValidInitData(raw);
  return {
    isValid: valid,
    length: raw.length,
    authDateStale: valid && isClientInitDataAuthDateStale(raw),
  };
}

async function readLoginErrorMessage(response: Response): Promise<string> {
  const status = response.status;
  const statusText = response.statusText || '';
  let text = '';
  try {
    text = await response.text();
  } catch {
    return `Login failed (${status}): ${statusText}`.trim();
  }
  if (!text.trim()) {
    return `Login failed (${status}): ${statusText}`.trim();
  }
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    const fromField = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    const msg = fromField(j.message) ?? fromField(j.error) ?? fromField(j.detail);
    if (msg) return `Login failed (${status}): ${msg}`;
    const compact = JSON.stringify(j);
    return `Login failed (${status}): ${compact.length > 500 ? compact.slice(0, 500) + '…' : compact}`;
  } catch {
    return `Login failed (${status}): ${text.length > 500 ? text.slice(0, 500) + '…' : text}`;
  }
}

let loginPromise: Promise<string> | null = null;

async function login(): Promise<string> {
  if (loginPromise) {
    return loginPromise;
  }

  loginPromise = (async () => {
    try {
      const initDataRaw = getFreshInitDataRawForLogin();
      if (!isLikelyValidInitData(initDataRaw)) {
        throw new ApiError(
          401,
          'Нет данных Telegram для входа. Откройте мини-приложение из чата с ботом.'
        );
      }
      if (isClientInitDataAuthDateStale(initDataRaw)) {
        throw new ApiError(401, CLIENT_STALE_INIT_DATA_MESSAGE);
      }

      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `tma ${initDataRaw}`,
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const errMsg = await readLoginErrorMessage(response);
        if (response.status === 401 && isInitDataExpiredServerMessage(errMsg)) {
          forceMiniAppRelaunchAfterStaleInitData();
        }
        throw new ApiError(response.status, errMsg);
      }

      const data = await response.json();

      const token = data.jwt || data.token || data.accessToken || data.access_token || data;

      if (!token || typeof token !== 'string') {
        console.error('⚠️ JWT токен не найден в ответе сервера:', data);
        throw new ApiError(500, 'JWT token not found in response');
      }

      saveJwtToken(token);

      return token;
    } finally {
      loginPromise = null;
    }
  })();

  return loginPromise;
}

async function request<T>(endpoint: string, options?: ApiRequestInit): Promise<T> {
  if (!API_BASE_URL) {
    console.error('❌ API_BASE_URL пустой или undefined!');
    throw new ApiError(0, 'API_BASE_URL not configured');
  }

  const url = `${API_BASE_URL}${endpoint}`;

  try {
    new URL(url);
  } catch (urlError) {
    console.error('❌ Невалидный URL:', url, urlError);
    throw new ApiError(0, `Invalid URL: ${url}`);
  }

  const mergedOpts = { ...(options ?? {}) } as ApiRequestInit & Record<string, unknown>;
  const silent = !!mergedOpts.silent;
  delete mergedOpts.silent;

  const { headers: optHeaders, ...restOptions } = mergedOpts;

  const isFormDataBody = typeof FormData !== 'undefined' && restOptions.body instanceof FormData;

  const mergedHeaders: Record<string, string> = {
    // Для multipart/form-data Content-Type выставляет браузер (с boundary) — не задаём вручную.
    ...(isFormDataBody ? {} : { 'Content-Type': 'application/json' }),
    'ngrok-skip-browser-warning': 'true',
    ...(jwtToken ? { 'Authorization': jwtToken } : {}),
  };

  if (optHeaders) {
    if (optHeaders instanceof Headers) {
      optHeaders.forEach((value, key) => {
        mergedHeaders[key] = value;
      });
    } else if (Array.isArray(optHeaders)) {
      for (const [key, value] of optHeaders) {
        mergedHeaders[key] = value;
      }
    } else {
      Object.assign(mergedHeaders, optHeaders as Record<string, string>);
    }
  }

  const config: RequestInit = {
    headers: mergedHeaders,
    credentials: 'include',
    ...restOptions,
  };

  try {
    const now = Date.now();
    const method = (options?.method || 'GET').toUpperCase();
    const key = cacheKey(method, url);
    if (method === 'GET' && isCacheableGet(endpoint)) {
      const cached = getCache.get(key);
      if (cached && cached.exp > now) {
        return cached.data as T;
      }
      if (inFlight.has(key)) {
        return inFlight.get(key) as Promise<T>;
      }
    }

    let enhancedConfig: RequestInit = { ...config, mode: 'cors' as RequestMode };
    let retryCount = 0;
    const maxRetries = 1;

    const throwIf401InitDataExpired = async (res: Response): Promise<void> => {
      if (res.status !== 401) return;
      const bodyPeek = await res.clone().text();
      if (!bodyTextIndicatesInitDataExpired(bodyPeek)) return;
      clearJwtToken();
      forceMiniAppRelaunchAfterStaleInitData();
      throw new ApiError(401, 'Init data expired');
    };

    const doFetch = async (): Promise<T> => {
      let response = await fetch(url, enhancedConfig);
      await throwIf401InitDataExpired(response);

      if (response.status === 401 && retryCount < maxRetries) {
        retryCount++;
        try {
          console.log('Got 401, attempting to login... (attempt', retryCount, ')');
          clearJwtToken();

          await login();
          const newHeaders: HeadersInit = {
            ...(config.headers as Record<string, string>),
            'Authorization': jwtToken || ''
          };
          enhancedConfig = { ...enhancedConfig, headers: newHeaders };

          response = await fetch(url, enhancedConfig);
          await throwIf401InitDataExpired(response);
          console.log(`Retry response from ${url}:`, { status: response.status, statusText: response.statusText });
        } catch (loginError) {
          console.error('Failed to refresh JWT token:', loginError);
          clearJwtToken();
          if (
            loginError instanceof ApiError &&
            loginError.status === 401 &&
            isInitDataExpiredServerMessage(loginError.message)
          ) {
            forceMiniAppRelaunchAfterStaleInitData();
          }
          if (loginError instanceof ApiError) throw loginError;
          throw new ApiError(401, 'Authentication failed');
        }
      } else if (response.status === 401 && retryCount >= maxRetries) {
        console.error('Max login retries reached, clearing token');
        clearJwtToken();
        throw new ApiError(401, 'Authentication failed after retry');
      }
      if (!response.ok) {
        let rawBody = '';
        try { rawBody = await response.text(); } catch { }

        const extractServerMessage = (body: string): string => {
          if (!body) return '';

          try {
            const parsed = JSON.parse(body);
            if (parsed) {
              const cand = parsed.message || parsed.error || parsed.detail || (typeof parsed === 'string' ? parsed : '');
              if (typeof cand === 'string') return cand;
            }
          } catch { }

          return body.length < 400 ? body : body.slice(0, 400);
        };

        const serverMsg = extractServerMessage(rawBody).trim();

        const ERROR_MAP: Array<[RegExp, string]> = [
          [/couldn't find filter options/i, 'У вас нет ни одного фильтра для парсинга'],
          [/proxy not found/i, 'У вас нет ни одного сохранённого прокси'],
          [/couldn't find cookie/i, 'У вас нет ни одного сохранённого аккаунта'],
          [/jwt token not found/i, 'Не удалось получить токен. Повторите позже'],
        ];

        const statusFallback = (status: number): string => {
          switch (status) {
            case 400: return 'Некорректный запрос';
            case 401: return 'Нужна авторизация';
            case 403: return 'Доступ запрещён';
            case 404: return 'Не найдено';
            case 409: return 'Конфликт данных';
            case 417: return 'Не хватает данных';
            case 422: return 'Неверные данные';
            case 500: return 'Ошибка сервера';
            case 502: return 'Проблема шлюза';
            case 503: return 'Сервис временно недоступен';
            default: return 'Не удалось выполнить запрос';
          }
        };

        const applyMap = (msg: string): string => {
          for (const [re, nice] of ERROR_MAP) if (re.test(msg)) return nice;
          return msg;
        };

        let finalMessage = applyMap(serverMsg || response.statusText || '') || statusFallback(response.status);

        if (!finalMessage) finalMessage = statusFallback(response.status);

        if (!serverMsg && !response.statusText) {
          finalMessage = applyMap(finalMessage);
        }

        throw new ApiError(response.status, finalMessage);
      }
      if (response.status === 204) return undefined as unknown as T;
      const contentType = response.headers.get('content-type');
      const text = await response.text();
      if (!text.trim()) return undefined as unknown as T;
      if (!contentType || !contentType.includes('application/json')) {
        return text as unknown as T;
      }
      try {
        return JSON.parse(text) as T;
      } catch {
        return text as unknown as T;
      }
    };

    let promise: Promise<T>;
    if (method === 'GET' && isCacheableGet(endpoint)) {
      promise = doFetch();
      inFlight.set(key, promise);
      try {
        const data = await promise;

        getCache.set(key, { data, exp: Date.now() + GET_TTL });
        return data;
      } finally {
        inFlight.delete(key);
      }
    } else if (method === 'GET') {
      if (inFlight.has(key)) {
        return inFlight.get(key) as Promise<T>;
      }
      const p = doFetch();
      inFlight.set(key, p);
      try {
        return await p;
      } finally {
        inFlight.delete(key);
      }
    } else {

      if (method !== 'GET') {
        getCache.clear();
      }
      return await doFetch();
    }
  } catch (error) {
    console.error('💥💥💥 ДЕТАЛЬНАЯ ИНФОРМАЦИЯ ОБ ОШИБКЕ 💥💥💥');
    console.error('Error object:', error);
    console.error('Error message:', (error as Error)?.message);
    console.error('Error code:', (error as Error & { code?: string })?.code);
    console.error('Error stack:', (error as Error)?.stack);
    console.error('URL:', url);
    console.error('Method:', options?.method || 'GET');

    console.error(`💥 API error for ${url}:`, {
      error: error,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      errorName: error instanceof Error ? error.name : 'Unknown',
      errorStack: error instanceof Error ? error.stack : undefined,
      url: url,
      method: options?.method || 'GET',
      requestConfig: config,
      timestamp: new Date().toISOString()
    });

    // fetch() отклоняется с TypeError только на сетевом/CORS-уровне (сервер не ответил).
    // Строки разнятся по движкам: Chromium — "Failed to fetch"; WebKit/iOS (Telegram WebView) —
    // "Load failed" / "The network connection was lost" / "cancelled"; Firefox — "NetworkError...".
    // Раньше ловили только `.includes('fetch')`, из-за чего на iOS сырой "Load failed" утекал в UI.
    if (error instanceof TypeError) {
      console.error('🌐 Network connection error - проверьте доступность сервера');
      let msg =
        'Не удалось связаться с API (нет ответа от сервера). Проверьте интернет и что goatklein.cloud доступен.';
      try {
        if (typeof window !== 'undefined' && API_BASE_URL) {
          const apiOrigin = new URL(API_BASE_URL).origin;
          if (apiOrigin !== window.location.origin) {
            msg +=
              ' Фронт открыт с другого домена (например ngrok) — на сервере должен быть разрешён CORS для этого origin и метод POST для /api/worker/phone/verify.';
          }
        }
      } catch {
        /* ignore URL parse */
      }
      throw new ApiError(0, msg);
    }

    const RAW_TO_USER: Array<[RegExp, string]> = [
      [/couldn't find filter options/i, 'У вас нет ни одного фильтра для парсинга'],
      [/proxy not found/i, 'Недостаточно доступных прокси'],
      [/network error/i, 'Сетевая ошибка подключения'],
      [/failed to fetch/i, 'Нет соединения с сервером'],
      [/load failed/i, 'Нет соединения с сервером'],
      [/network connection was lost/i, 'Соединение с сервером потеряно'],
      [/internal\s+server\s+error/i, 'Ошибка сервера. Попробуйте позже.'],
    ];

    const normalize = (msg: string): string => {
      const t = msg.trim();
      for (const [re, nice] of RAW_TO_USER) if (re.test(t)) return nice;
      return msg;
    };

    let baseMsg = error instanceof Error ? (error.message || 'Ошибка') : 'Ошибка';
    baseMsg = normalize(baseMsg);
    if (!silent) {
      try {
        const { useAppStore } = await import('../store/appStore');
        const { addNotification } = useAppStore.getState();
        addNotification({ id: `api-${Date.now()}`, message: baseMsg, type: 'error', timestamp: Date.now() });
      } catch {
        /* ignore */
      }
    }

    if (error instanceof ApiError) throw new ApiError(error.status, baseMsg);
    throw new ApiError(0, baseMsg);
  }
}

/** FormData передаём как есть; прочее сериализуем в JSON. */
const toBody = (data: unknown): BodyInit | undefined => {
  if (data === undefined || data === null) return undefined;
  if (typeof FormData !== 'undefined' && data instanceof FormData) return data;
  return JSON.stringify(data);
};

export const api = {
  login: () => login(),
  get: <T = unknown>(endpoint: string, options?: ApiRequestInit) =>
    request<T>(endpoint, { ...options, method: 'GET' }),
  post: <T = unknown>(endpoint: string, data?: unknown, options?: ApiRequestInit) =>
    request<T>(endpoint, { ...options, method: 'POST', body: toBody(data) }),
  put: <T = unknown>(endpoint: string, data?: unknown, options?: ApiRequestInit) =>
    request<T>(endpoint, { ...options, method: 'PUT', body: toBody(data) }),
  patch: <T = unknown>(endpoint: string, data?: unknown, options?: ApiRequestInit) =>
    request<T>(endpoint, { ...options, method: 'PATCH', body: toBody(data) }),
  delete: <T = unknown>(endpoint: string, options?: ApiRequestInit) =>
    request<T>(endpoint, { ...options, method: 'DELETE' }),
};

export const apiClient = api;
