import type { User } from './types';

export const ADMIN_KEY_HEADER = 'X-Admin-Key';

export function getAdminKey(): string | undefined {
  const k = import.meta.env.VITE_ADMIN_KEY;
  return typeof k === 'string' && k.trim().length > 0 ? k.trim() : undefined;
}

export function isAdminConfigured(): boolean {
  return !!getAdminKey();
}

export function isAdminUser(user: User | null | undefined): boolean {
  return user?.role === 'admin';
}

/** @deprecated легаси-алиас времён goat-sender: «бог» = админ. */
export const isGodUser = isAdminUser;
