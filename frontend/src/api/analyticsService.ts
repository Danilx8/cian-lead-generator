import { api } from './client';
import type { AnalyticsSummary } from './types';

export type { AnalyticsSummary } from './types';

export interface AnalyticsSummaryParams {
  /** Только для админа: сводка по всем пользователям. */
  global?: boolean;
  /** Только для админа: сводка по конкретному пользователю. */
  userId?: number;
}

function buildQuery(params?: AnalyticsSummaryParams): string {
  const qs = new URLSearchParams();
  if (params?.global) qs.set('global', '1');
  if (params?.userId !== undefined) qs.set('userId', String(params.userId));
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export const analyticsService = {
  getSummary: (params?: AnalyticsSummaryParams) =>
    api.get<AnalyticsSummary>(`/api/analytics/summary${buildQuery(params)}`),

  /** URL для скачивания CSV-отчёта (GET /api/analytics/report.csv). */
  getReportCsvUrl: (params?: AnalyticsSummaryParams) =>
    `/api/analytics/report.csv${buildQuery(params)}`,
};
