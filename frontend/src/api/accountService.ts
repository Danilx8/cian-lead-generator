import { api } from './client';
import type { Account, CreateAccountRequest } from './types';

export type { Account, CreateAccountRequest } from './types';

function unwrapAccounts(raw: unknown): Account[] {
  if (Array.isArray(raw)) return raw as Account[];
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    for (const k of ['accounts', 'items', 'data', 'rows']) {
      if (Array.isArray(o[k])) return o[k] as Account[];
    }
  }
  return [];
}

export const accountService = {
  getAccounts: async (): Promise<Account[]> => {
    const raw = await api.get<unknown>('/api/account/');
    return unwrapAccounts(raw);
  },

  createAccount: (data: CreateAccountRequest) =>
    api.post<Account>('/api/account/', data),

  deleteAccount: (id: number) =>
    api.delete<{ message?: string }>(`/api/account/${id}`),
};
