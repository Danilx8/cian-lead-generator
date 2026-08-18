import { api } from './client';
import type { Config, UpdateConfigRequest } from './types';

export const configService = {
  getConfig: () =>
    api.get<{ config: Config }>(`/api/config`),

  updateConfig: (data: UpdateConfigRequest) =>
    api.put<{ message: string; config: Config }>(`/api/config`, data),
};
