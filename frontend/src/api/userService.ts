import { api, clearCache } from './client';
import type { User } from './types';

export const userService = {
  getMe: async (): Promise<User> => {
    const data = await api.get<unknown>(`/api/auth/me`);

    const rawUser: User | null =
      data && typeof data === 'object' && 'user' in (data as Record<string, unknown>)
        ? ((data as { user: User }).user)
        : (data as User);

    if (!rawUser || typeof rawUser !== 'object' || typeof rawUser.id !== 'number') {
      throw new Error('Invalid user payload from /api/auth/me');
    }

    return rawUser;
  },

  patchUser: async (
    id: number,
    partial: Partial<
      Pick<
        User,
        | 'username'
        | 'sendWithAngebot'
        | 'itemsChunkSize'
        | 'itemsInterval'
        | 'chunksInterval'
        | 'newMessagesInterval'
        | 'repliesInterval'
        | 'avatarPath'
      >
    > & Record<string, unknown>
  ): Promise<User> => {
    if (typeof id !== 'number') {
      throw new Error('User id is undefined');
    }

    const res = await api.patch<unknown>(`/api/user/${id}`, { userId: id, id, ...partial });

    clearCache('/api/auth/me');

    let updated: unknown = res;
    if (updated && typeof updated === 'object' && 'user' in (updated as Record<string, unknown>)) {
      updated = (updated as Record<string, unknown>)['user'];
    }

    if (updated && typeof updated === 'object' && typeof (updated as User).id === 'number') {
      return updated as User;
    }

    return userService.getMe();
  },

  buildAvatarUrl: (avatarPath?: string) => {
    if (!avatarPath) return undefined;
    if (/^https?:/i.test(avatarPath)) return avatarPath;
    return avatarPath.startsWith('/') ? avatarPath : `/${avatarPath}`;
  },
};

export default userService;
