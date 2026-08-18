import { api as apiClient } from './client';
import type {
  Dialog,
  DialogsRequest,
  Message,
  SendMessageRequest,
  SendMessageResponse,
} from './types';

export const dialogService = {
  getDialogs: async ({ page = 1, limit = 200 }: DialogsRequest = {}): Promise<Dialog[]> => {
    const queryParams = new URLSearchParams();
    queryParams.set('page', page.toString());
    queryParams.set('limit', limit.toString());

    const url = `/api/dialogs/?${queryParams.toString()}`;
    const response = await apiClient.get<Dialog[]>(url, { silent: true });

    return Array.isArray(response) ? response : [];
  },

  searchDialogs: async ({
    q,
    page = 1,
    limit = 200,
  }: {
    q: string;
    page?: number;
    limit?: number;
  }): Promise<Dialog[]> => {
    const queryParams = new URLSearchParams();
    queryParams.set('q', q);
    queryParams.set('page', page.toString());
    queryParams.set('limit', limit.toString());

    const url = `/api/dialogs/search?${queryParams.toString()}`;
    const response = await apiClient.get<Dialog[]>(url, { silent: true });

    return Array.isArray(response) ? response : [];
  },

  getMessages: (dialogId: number) =>
    apiClient.get<Message[]>(`/api/dialogs/${dialogId}`),

  sendMessage: (dialogId: number, data: SendMessageRequest) =>
    apiClient.post<SendMessageResponse>(`/api/dialogs/send/${dialogId}`, data),

  toggleAutomatic: (dialogId: number, currentIsAutomatic: boolean) =>
    apiClient.post<{ isAutomatic: boolean }>(`/api/dialogs/${dialogId}`, {
      isAutomatic: !currentIsAutomatic,
    }),

  deleteDialogs: (ids: number[]) =>
    apiClient.delete('/api/dialogs', {
      body: JSON.stringify({ dialogIds: ids }),
    }),
};
