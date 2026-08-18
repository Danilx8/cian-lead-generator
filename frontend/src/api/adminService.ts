import { api } from './client';
import { ADMIN_KEY_HEADER, getAdminKey } from './adminClient';
import type { Filter, Template, User, Worker, Account } from './types';

function optionalAdminHeaders(): RequestInit | undefined {
  const k = getAdminKey();
  if (!k) return undefined;
  return { headers: { [ADMIN_KEY_HEADER]: k } };
}

function unwrapArray<T>(data: unknown, keys: string[]): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    for (const k of keys) {
      const v = o[k];
      if (Array.isArray(v)) return v as T[];
    }
  }
  return [];
}

function unwrapOne<T>(data: unknown, keys: string[]): T | null {
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    for (const k of keys) {
      if (k in o && o[k] && typeof o[k] === 'object') return o[k] as T;
    }
    return data as T;
  }
  return null;
}

export type AdminUserListItem = Pick<User, 'id' | 'username' | 'email' | 'status' | 'role'> & {
  avatarPath?: string;
};

export type StartAllWorkersResult = {
  successfulRuns?: number[];
  failedRuns?: { id: number; reason: string }[];
  status?: string;
};

/** Заявка на регистрацию, ожидающая модерации. */
export type PendingRegistration = Pick<User, 'id' | 'email' | 'username' | 'status' | 'createdAt'>;

export const adminService = {
  // ─── Пользователи ───

  listUsers: async (): Promise<AdminUserListItem[]> => {
    const raw = await api.get<unknown>('/api/user/all', optionalAdminHeaders());
    const list = unwrapArray<AdminUserListItem>(raw, ['users', 'items', 'data', 'rows']);
    return list.filter((u) => typeof u?.id === 'number');
  },

  getUser: async (userId: number): Promise<User> => {
    const raw = await api.get<unknown>(`/api/user/id/${userId}`, optionalAdminHeaders());
    const u = unwrapOne<User>(raw, ['user', 'data']) ?? (raw as User);
    if (!u || typeof u.id !== 'number') {
      throw new Error('Некорректный ответ профиля пользователя');
    }
    return u;
  },

  patchUser: async (userId: number, partial: Record<string, unknown>): Promise<User> => {
    const raw = await api.patch<unknown>(
      `/api/user/${userId}`,
      { userId, id: userId, ...partial },
      optionalAdminHeaders()
    );
    const u = unwrapOne<User>(raw, ['user', 'data', 'result']);
    if (u && typeof (u as User).id === 'number') return u as User;
    return adminService.getUser(userId);
  },

  // ─── Модерация регистраций ───

  getRegistrations: async (): Promise<PendingRegistration[]> => {
    const raw = await api.get<unknown>('/api/admin/registrations', optionalAdminHeaders());
    return unwrapArray<PendingRegistration>(raw, ['registrations', 'users', 'items', 'data', 'rows']);
  },

  approveRegistration: (userId: number) =>
    api.post<{ message?: string; user?: User }>(
      `/api/admin/registrations/${userId}/approve`,
      undefined,
      optionalAdminHeaders()
    ),

  rejectRegistration: (userId: number) =>
    api.post<{ message?: string }>(
      `/api/admin/registrations/${userId}/reject`,
      undefined,
      optionalAdminHeaders()
    ),

  // ─── Слоты ───

  getSlots: async (userId?: number): Promise<Worker[]> => {
    const q = userId !== undefined ? `?userId=${encodeURIComponent(String(userId))}` : '';
    const raw = await api.get<unknown>(`/api/admin/slots${q}`, optionalAdminHeaders());
    return unwrapArray<Worker>(raw, ['workers', 'slots', 'items', 'data', 'rows'])
      .filter((w) => typeof w?.id === 'number');
  },

  getSlot: (workerId: number) =>
    api.get<Worker>(`/api/admin/slots/${workerId}`, optionalAdminHeaders()),

  getWorkersForUser: async (userId: number): Promise<Worker[]> => {
    try {
      const raw = await api.get<unknown>(`/api/admin/users/${userId}/slots`, optionalAdminHeaders());
      return unwrapArray<Worker>(raw, ['workers', 'slots', 'items', 'data', 'rows'])
        .filter((w) => typeof w?.id === 'number');
    } catch {
      return adminService.getSlots(userId);
    }
  },

  startWorker: (workerId: number) =>
    api.post<Worker>(`/api/admin/slots/${workerId}/start`, undefined, optionalAdminHeaders()),

  shutdownWorker: (workerId: number) =>
    api.post<Worker>(`/api/admin/slots/${workerId}/stop`, undefined, optionalAdminHeaders()),

  startAllSlots: () =>
    api.post<StartAllWorkersResult>('/api/admin/slots/start-all', undefined, optionalAdminHeaders()),

  startAllWorkersForUser: (userId: number) =>
    api.post<StartAllWorkersResult>(
      `/api/admin/users/${userId}/slots/start`,
      undefined,
      optionalAdminHeaders()
    ),

  stopAllWorkersForUser: (userId: number) =>
    api.post<StartAllWorkersResult>(
      `/api/admin/users/${userId}/slots/stop`,
      undefined,
      optionalAdminHeaders()
    ),

  /** Аккаунт cian.ru, привязанный к воркеру (бывший /workers/:id/cookies). */
  getWorkerAccount: (workerId: number) =>
    api.get<Account>(`/api/admin/workers/${workerId}/account`, optionalAdminHeaders()),

  getWorkerLogs: async (workerId: number) => {
    const raw = await api.get<string>(`/api/worker/logs/${workerId}`, optionalAdminHeaders());
    return { logs: typeof raw === 'string' ? raw : '' };
  },

  // ─── Фильтры ───

  runFilter: (filterId: number) =>
    api.post<{ status?: string }>(`/api/admin/filter/${filterId}/run`, undefined, optionalAdminHeaders()),

  runFilterParallel: (filterId: number) =>
    api.post<{ status?: string }>(
      `/api/admin/filter/${filterId}/run-parallel`,
      undefined,
      optionalAdminHeaders()
    ),

  getFiltersForUser: async (userId: number): Promise<Filter[]> => {
    try {
      const raw = await api.get<unknown>(
        `/api/filter/?userId=${encodeURIComponent(String(userId))}`,
        optionalAdminHeaders()
      );
      return unwrapArray<Filter>(raw, ['filters', 'items', 'data'])
        .filter((f) => typeof f?.id === 'number');
    } catch {
      return [];
    }
  },

  patchUserFilter: (userId: number, filterId: number, updateData: Partial<Filter>) =>
    api.patch<Filter>(
      `/api/filter/${filterId}?userId=${encodeURIComponent(String(userId))}`,
      { updateData },
      optionalAdminHeaders()
    ),

  // ─── Шаблоны ───

  getTemplatesForUser: async (userId: number): Promise<Template[]> => {
    try {
      const raw = await api.get<unknown>(
        `/api/templates/?userId=${encodeURIComponent(String(userId))}`,
        optionalAdminHeaders()
      );
      return unwrapArray<Template>(raw, ['templates', 'items', 'data', 'results'])
        .filter((t) => t && typeof t.title === 'string' && Array.isArray(t.texts));
    } catch {
      return [];
    }
  },
};
