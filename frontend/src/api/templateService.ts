import { api } from './client';
import type {
  Template,
  CreateTemplateRequest,
  UpdateTemplateRequest,
  ReorderTemplateRequest,
  GetTemplatesResponse
} from './types';

export const templateService = {
  getUserTemplates: () =>
    api.get<GetTemplatesResponse>('/api/templates/'),

  getTemplate: (index: number) =>
    api.get<Template>(`/api/templates/${index}`),

  createTemplate: (data: CreateTemplateRequest) =>
    api.post<Template>('/api/templates/', data),

  updateTemplate: (index: number, data: UpdateTemplateRequest) =>
    api.put<Template>(`/api/templates/${index}`, data),

  deleteTemplate: (index: number) =>
    api.delete<{ message: string }>(`/api/templates/${index}`),

  reorderTemplates: (data: ReorderTemplateRequest) =>
    api.post<GetTemplatesResponse>('/api/templates/reorder', data),
};
