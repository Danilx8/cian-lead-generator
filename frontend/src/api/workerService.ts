import { api } from './client';
import type { CreateWorkerRequest, CreateWorkerResponse, UpdateWorkerRequest, Worker } from './types';

/** Ответ POST /api/worker/phone/apply/:workerId (202). */
export type ApplyWorkerPhoneResponse = {
  status: string;
  countryCode: string;
  phoneNumber: string;
};

export const workerService = {
  getWorkers: () => api.get<Worker[]>("/api/worker/"),
  createWorker: (data: CreateWorkerRequest) => api.post<CreateWorkerResponse>("/api/worker/", data),
  updateWorker: (workerId: number, data: UpdateWorkerRequest) =>
    api.patch<Worker>(`/api/worker/${workerId}`, data),
  deleteWorker: (id: number) => api.delete<unknown>(`/api/worker/${id}`),

  /**
   * Удалить ВСЕ слоты пользователя одним запросом (WorkerService.deleteWorkersByUserId).
   * Как и stopAll, отвечает 200 только после фактического завершения: бэк сначала гасит
   * живые слоты, потом удаляет каждый по очереди — на большом списке запрос долгий.
   * failed / shutdown.failed — слоты, которые не удалось удалить/погасить.
   */
  deleteAll: () => api.delete<{
    status?: string;
    deleted?: number[];
    failed?: { id: number; reason: string }[];
    shutdown?: {
      stopped?: number[];
      skipped?: number[];
      failed?: { id: number; reason: string }[];
    };
  }>(`/api/worker/`),
  sendMessage: (workerId: number, message: string) => api.post<Worker>(`/api/worker/message/${workerId}`, { message }),
  getLogs: async (workerId: number) => {
    const raw = await api.get<string>(`/api/worker/logs/${workerId}`);
    return { logs: typeof raw === "string" ? raw : "" } as { logs: string };
  },
  startWorker: (workerId: number) => api.post<Worker>(`/api/worker/start/${workerId}`),
  shutdownWorker: (workerId: number) => api.post<Worker>(`/api/worker/shutdown/${workerId}`),

  pauseWorker: (workerId: number) => api.post<Worker>(`/api/worker/pause/${workerId}`),
  continueWorker: (workerId: number) => api.post<Worker>(`/api/worker/continue/${workerId}`),

  attachFilter: (workerId: number, filterId: number) =>
    api.post<Worker>(`/api/worker/attachFilter/${workerId}`, { filterId }),

  /** POST { phone } → 202, тело { status, countryCode, phoneNumber } — как в worker.controller applyWorkerPhone. */
  applyWorkerPhone: (workerId: number, phone: string) =>
    api.post<ApplyWorkerPhoneResponse>(`/api/worker/phone/apply/${workerId}`, { phone }),

  /** POST { code } → 202, тело может быть пустым — после вызова лучше перечитать список воркеров. */
  verifyWorkerPhoneCode: (workerId: number, code: string) =>
    api.post<void>(`/api/worker/phone/verify/${workerId}`, { code }),

  /**
   * Остановить все слоты. В отличие от startAll отвечает 200 только ПОСЛЕ фактического
   * teardown'а всех слотов (shutdownWorkersByUserId гасит их последовательно), а не 202.
   * skipped — уже погашенные / ни разу не запущенные слоты.
   */
  stopAll: () => api.post<{
    status?: string;
    stopped?: number[];
    skipped?: number[];
    failed?: { id: number; reason: string }[];
  }>(`/api/worker/shutdown`),
  startAll: () => api.post<{ status?: string; queued?: number[]; skipped?: number[]; duplicatePending?: number[] }>(`/api/worker/start`),
};
