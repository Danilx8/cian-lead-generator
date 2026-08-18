import { API_BASE_URL } from './config';
import { ApiError, initJwtToken, clearJwtToken } from './client';

// client.ts отправляет содержимое localStorage-ключа `jwt_token` как заголовок
// Authorization «как есть», поэтому храним токен сразу с префиксом Bearer.
const JWT_STORAGE_KEY = 'jwt_token';
const REFRESH_STORAGE_KEY = 'refresh_token';

export interface AuthUser {
  id: number;
  email: string;
  username?: string;
  status: 'active' | 'pending' | 'blocked';
  role: 'user' | 'admin';
  sendWithAngebot?: boolean;
  avatarPath?: string;
  itemsChunkSize?: number;
  itemsInterval?: number;
  chunksInterval?: number;
  newMessagesInterval?: number;
  repliesInterval?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface LoginResponse {
  message: string;
  userId: number;
  token: string;
  refreshToken: string;
  expiresIn?: number;
}

export interface RegisterResponse {
  message?: string;
  userId?: number;
  status?: string;
  /** true, когда включена модерация (HTTP 202) — токены не выдаются */
  pending?: boolean;
}

function storeTokens(token: string, refreshToken?: string) {
  try {
    localStorage.setItem(JWT_STORAGE_KEY, `Bearer ${token}`);
    if (refreshToken) localStorage.setItem(REFRESH_STORAGE_KEY, refreshToken);
  } catch {
    /* ignore */
  }
  // Обновляем токен в памяти client.ts
  initJwtToken();
}

export function clearAuthTokens() {
  clearJwtToken();
  try {
    localStorage.removeItem(REFRESH_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function getStoredRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_STORAGE_KEY);
  } catch {
    return null;
  }
}

function getStoredJwt(): string | null {
  try {
    return localStorage.getItem(JWT_STORAGE_KEY);
  } catch {
    return null;
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  let text = '';
  try {
    text = await response.text();
  } catch {
    return response.statusText || `Ошибка ${response.status}`;
  }
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    const msg = [j.message, j.error, j.detail].find(
      (v): v is string => typeof v === 'string' && !!v.trim()
    );
    if (msg) return msg;
  } catch {
    /* not json */
  }
  return text.trim() || response.statusText || `Ошибка ${response.status}`;
}

// Сырые fetch-запросы (не через api.request), чтобы не задевать
// внутренний 401-retry клиента и корректно читать статусы 202/403.
async function rawAuthFetch(
  path: string,
  options: RequestInit & { auth?: boolean } = {}
): Promise<Response> {
  const { auth, ...rest } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(rest.headers as Record<string, string> | undefined),
  };
  if (auth) {
    const jwt = getStoredJwt();
    if (jwt) headers['Authorization'] = jwt;
  }
  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      credentials: 'include',
      ...rest,
      headers,
    });
  } catch {
    throw new ApiError(0, 'Нет соединения с сервером');
  }
}

export const authService = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const res = await rawAuthFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      throw new ApiError(res.status, await readErrorMessage(res));
    }
    const data = (await res.json()) as LoginResponse;
    if (!data.token) throw new ApiError(500, 'Сервер не вернул токен');
    storeTokens(data.token, data.refreshToken);
    return data;
  },

  async register(email: string, password: string, username?: string): Promise<RegisterResponse> {
    const res = await rawAuthFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, ...(username ? { username } : {}) }),
    });
    if (!res.ok) {
      throw new ApiError(res.status, await readErrorMessage(res));
    }
    let data: RegisterResponse = {};
    try {
      data = (await res.json()) as RegisterResponse;
    } catch {
      /* empty body */
    }
    return { ...data, pending: res.status === 202 || data.status === 'pending' };
  },

  async refresh(): Promise<boolean> {
    const refreshToken = getStoredRefreshToken();
    const res = await rawAuthFetch('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify(refreshToken ? { refreshToken } : {}),
    });
    if (!res.ok) return false;
    try {
      const data = (await res.json()) as Partial<LoginResponse>;
      if (data.token) {
        storeTokens(data.token, data.refreshToken);
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  },

  async me(): Promise<AuthUser> {
    const res = await rawAuthFetch('/api/auth/me', { method: 'GET', auth: true });
    if (!res.ok) {
      throw new ApiError(res.status, await readErrorMessage(res));
    }
    const data = (await res.json()) as AuthUser | { user: AuthUser };
    return 'user' in data && data.user ? data.user : (data as AuthUser);
  },

  async logout(): Promise<void> {
    try {
      await rawAuthFetch('/api/auth/logout', { method: 'POST', auth: true });
    } catch {
      /* ignore network errors on logout */
    }
    clearAuthTokens();
  },

  hasStoredToken(): boolean {
    return !!getStoredJwt();
  },
};
