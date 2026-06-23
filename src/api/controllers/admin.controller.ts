import { randomUUID } from "crypto";
import { NextFunction, Response } from "express";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { ApiError } from "../errors/api.error";
import { FilterService } from "../services/filters/filter.service";
import UserService from "../services/user.service";
import { ParserManager } from "../services/parsing/parser-manager";
import { ENV, logger } from "../../config";
import { normalizeProxyUrl } from "../services/proxyUrl";
import WorkerService from "../services/worker.service";
import { WorkerState } from "../../database/worker.model";
import { AccountService } from "../services/account.service";
import { UserStatus } from "../../database/user.model";
import NotificationService from "../services/notification.service";

export const runFilterById = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) return next(new ApiError(400, "Invalid filter id"));

    const filter = await FilterService.getFilter(id);
    if (!filter) return next(new ApiError(404, `Filter ${id} not found`));

    const user = await UserService.getUserById(filter.userId);
    if (!user) return next(new ApiError(404, `User ${filter.userId} not found for filter ${id}`));

    const { proxy: proxyFromBody } = req.body ?? {};

    const proxy = normalizeProxyUrl(proxyFromBody || ENV.PARSER_DEFAULT_PROXY) ?? "";

    ParserManager.getInstance().startParser(id, user.id, proxy);

    res.status(202).json({ status: "accepted", filterId: id });
  } catch (err) {
    next(err);
  }
};

/** За один запрос; верхняя планка 10000; поднять лимит: ADMIN_PARSER_PARALLEL_MAX_PER_REQUEST. */
function maxParallelParsersPerRequest(): number {
  const raw = Number(process.env.ADMIN_PARSER_PARALLEL_MAX_PER_REQUEST);
  const n = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 500;
  return Math.min(10_000, n);
}

/**
 * Запуск нескольких экземпляров парсера для одного фильтра (без правила «только один на filterId»).
 */
export const runFilterParallelById = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) return next(new ApiError(400, "Invalid filter id"));

    const filter = await FilterService.getFilter(id);
    if (!filter) return next(new ApiError(404, `Filter ${id} not found`));

    const user = await UserService.getUserById(filter.userId);
    if (!user) return next(new ApiError(404, `User ${filter.userId} not found for filter ${id}`));

    const { proxy: proxyFromBody, count: countRaw } = req.body ?? {};
    const proxy = normalizeProxyUrl(proxyFromBody || ENV.PARSER_DEFAULT_PROXY) ?? "";

    let n = Number(countRaw);
    if (!Number.isFinite(n) || n < 1) n = 1;
    n = Math.min(Math.floor(n), maxParallelParsersPerRequest());

    const pm = ParserManager.getInstance();
    const instanceKeys: string[] = [];
    for (let i = 0; i < n; i++) {
      const key = randomUUID();
      instanceKeys.push(key);
      pm.startParserParallel(id, user.id, proxy, key);
    }

    res.status(202).json({
      status: "accepted",
      filterId: id,
      count: n,
      instanceKeys
    });
  } catch (err) {
    next(err);
  }
};

const parseStatuses = (raw: unknown): WorkerState[] | null => {
  if (!raw) return null;
  let values: string[] = [];
  if (Array.isArray(raw)) values = raw.flatMap(v => String(v).split(","));
  else values = String(raw).split(",");
  const normalized = values.map(v => String(v).trim().toUpperCase()).filter(Boolean);
  const allowed = new Set(Object.values(WorkerState));
  const result: WorkerState[] = [] as WorkerState[];
  for (const s of normalized) {
    if (!allowed.has(s as WorkerState)) {
      throw new ApiError(400, `Unknown status '${s}'. Allowed: ${Array.from(allowed).join(", ")}`);
    }
    result.push(s as WorkerState);
  }
  return result.length ? result : null;
};

export const startSlotById = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const workerId = Number(req.params.workerId);
    if (!workerId || Number.isNaN(workerId)) return next(new ApiError(400, "Invalid worker id"));
    const worker = await WorkerService.getWorker(workerId);
    if (!worker) {
      next(new ApiError(404, `Worker ${workerId} not found`));
      return;
    }
    const claimed = await WorkerService.claimWorkersForStart(worker.userId, [workerId]);
    if (claimed.length === 0) {
      res.status(202).json({ status: "accepted", workerId, alreadyRunning: true });
      return;
    }

    const r = await WorkerService.enqueueClaimedOrRevert(claimed[0], worker.userId);
    if (r === "duplicate_pending") {
      res.status(202).json({ status: "accepted", workerId, alreadyQueued: true });
      return;
    }
    res.status(202).json({ status: "queued", workerId });
  } catch (err) {
    next(err);
  }
};

export const stopSlotById = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const workerId = Number(req.params.workerId);
    if (!workerId || Number.isNaN(workerId)) return next(new ApiError(400, "Invalid worker id"));
    const worker = await WorkerService.getWorker(workerId);
    if (!worker) return next(new ApiError(404, `Worker ${workerId} not found`));

    if (worker.status === WorkerState.SHUTDOWN) {
      res.status(200).json({ status: "ok", workerId, alreadyStopped: true });
      return;
    }

    await WorkerService.shutdownWorker(worker);
    res.status(200).json({ status: "ok", workerId });
  } catch (err) {
    next(err);
  }
};

export const startSlotsByUserId = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = Number(req.params.userId);
    if (!userId || Number.isNaN(userId)) return next(new ApiError(400, "Invalid user id"));
    const user = await UserService.getUserById(userId);
    if (!user) return next(new ApiError(404, `User ${userId} not found`));

    const workers = await WorkerService.getWorkersByUserId(userId);
    const claimed = await WorkerService.claimWorkersForStart(userId);
    const claimedIds = new Set(claimed.map((c) => c.id));
    const skipped = workers.filter((w) => !claimedIds.has(w.id)).map((w) => w.id);

    const queued: number[] = [];
    const duplicatePending: number[] = [];
    for (const c of claimed) {
      const r = await WorkerService.enqueueClaimedOrRevert(c, userId);
      if (r === "queued") queued.push(c.id);
      else duplicatePending.push(c.id);
    }

    res.status(202).json({ status: "queued", userId, queued, skipped, duplicatePending });
  } catch (err) {
    next(err);
  }
};

export const stopSlotsByUserId = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = Number(req.params.userId);
    if (!userId || Number.isNaN(userId)) return next(new ApiError(400, "Invalid user id"));
    const user = await UserService.getUserById(userId);
    if (!user) return next(new ApiError(404, `User ${userId} not found`));

    const workers = await WorkerService.getWorkersByUserId(userId);
    const stopped: number[] = [];
    const skipped: number[] = [];
    const failed: Array<{ id: number; reason: string }> = [];

    for (const w of workers) {
      try {
        if (w.status === WorkerState.SHUTDOWN) {
          skipped.push(w.id);
          continue;
        }
        // await WorkerService.shutdownWorker(w);
        stopped.push(w.id);
      } catch (e: any) {
        failed.push({ id: w.id, reason: String(e?.message ?? e) });
      }
    }

    res.status(200).json({ status: "ok", userId, stopped, skipped, failed });
  } catch (err) {
    next(err);
  }
};

export const startAllSlots = async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const workers = await WorkerService.getAllWorkers();
    const queued: number[] = [];
    const skipped: number[] = workers
      .filter((w) => WorkerService.isWorkerRunningOrStarting(w))
      .map((w) => w.id);
    const duplicatePending: number[] = [];
    const pending = workers.filter((w) => !WorkerService.isWorkerRunningOrStarting(w));

    const byUser = new Map<number, number[]>();
    for (const w of pending) {
      if (!byUser.has(w.userId)) byUser.set(w.userId, []);
      byUser.get(w.userId)!.push(w.id);
    }

    for (const [uid, ids] of byUser) {
      const claimed = await WorkerService.claimWorkersForStart(uid, ids);
      const claimedSet = new Set(claimed.map((c) => c.id));
      for (const id of ids) {
        if (!claimedSet.has(id)) skipped.push(id);
      }
      for (const c of claimed) {
        const r = await WorkerService.enqueueClaimedOrRevert(c, uid);
        if (r === "queued") queued.push(c.id);
        else duplicatePending.push(c.id);
      }
    }

    res.status(202).json({ status: "queued", queued, skipped, duplicatePending });
  } catch (err) {
    next(err);
  }
};

export const topAllSlots = async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const workers = await WorkerService.getAllWorkers();
    const stopped: number[] = [];
    const skipped: number[] = [];
    const failed: Array<{ id: number; reason: string }> = [];

    for (const w of workers) {
      try {
        if (w.status === WorkerState.SHUTDOWN) {
          skipped.push(w.id);
          continue;
        }
        await WorkerService.shutdownWorker(w);
        stopped.push(w.id);
      } catch (e: any) {
        failed.push({ id: w.id, reason: String(e?.message ?? e) });
      }
    }

    res.status(200).json({ status: "ok", stopped, skipped, failed });
  } catch (err) {
    next(err);
  }
};

export const getSlotById = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const workerId = Number(req.params.workerId);
    if (!workerId || Number.isNaN(workerId)) return next(new ApiError(400, "Invalid worker id"));
    const worker = await WorkerService.getWorker(workerId);
    if (!worker) return next(new ApiError(404, `Worker ${workerId} not found`));
    res.status(200).json(worker);
  } catch (err) {
    next(err);
  }
};

export const getUserSlots = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = Number(req.params.userId);
    if (!userId || Number.isNaN(userId)) return next(new ApiError(400, "Invalid user id"));

    const statuses = parseStatuses((req.query.status ?? req.query.statuses) as any);
    const workers = await WorkerService.getWorkersByUserId(userId);
    const filtered = statuses ? workers.filter(w => w.status && statuses.includes(w.status)) : workers;
    res.status(200).json(filtered);
  } catch (err) {
    next(err);
  }
};

export const getAllSlots = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const maybeUserId = req.query.userId ? Number(req.query.userId) : undefined;
    if (maybeUserId !== undefined && Number.isNaN(maybeUserId)) return next(new ApiError(400, "Invalid userId in query"));

    const statuses = parseStatuses((req.query.status ?? req.query.statuses) as any);
    const workers = maybeUserId !== undefined
      ? await WorkerService.getWorkersByUserId(maybeUserId)
      : await WorkerService.getAllWorkers();
    const filtered = statuses ? workers.filter(w => w.status && statuses.includes(w.status)) : workers;
    res.status(200).json(filtered);
  } catch (err) {
    next(err);
  }
};

export const getWorkerAccount = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const workerId = Number(req.params.workerId);
    if (!workerId || Number.isNaN(workerId)) return next(new ApiError(400, "Invalid worker id"));

    const worker = await WorkerService.getWorker(workerId);
    if (!worker) return next(new ApiError(404, `Worker ${workerId} not found`));

    if (!worker.accountId) return next(new ApiError(404, `Worker ${workerId} has no account assigned`));

    const account = await AccountService.getAccountById(worker.accountId);
    if (!account) return next(new ApiError(404, `Account ${worker.accountId} not found`));

    res.json({ login: account.login, name: account.name });
  } catch (err) {
    next(err);
  }
};

// ── Модерация заявок на регистрацию (ВКР §1.7: одобрение/отклонение) ──────────────

function toSafeUser(user: any) {
  const data = user.get ? user.get({ plain: true }) : user;
  const { passwordHash, ...safe } = data;
  return safe;
}

/** Список заявок на регистрацию, ожидающих одобрения. */
export const getPendingRegistrations = async (
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const users = await UserService.getUsersByStatus(UserStatus.pending);
    res.status(200).json(users.map(toSafeUser));
  } catch (err) {
    next(err);
  }
};

/** Одобрить заявку: перевести пользователя в статус active. */
export const approveRegistration = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = Number(req.params.userId);
    if (!userId || Number.isNaN(userId)) return next(new ApiError(400, "Invalid user id"));

    const user = await UserService.getUserById(userId);
    if (!user) return next(new ApiError(404, `User ${userId} not found`));
    if (user.status !== UserStatus.pending) {
      return next(new ApiError(409, `User ${userId} is not pending (status=${user.status})`));
    }

    const updated = await UserService.setUserStatus(userId, UserStatus.active);
    logger.info(`[admin] registration approved for user ${userId}`);
    NotificationService.notifyRegistrationApproved(user.email, user.username).catch(() => {});
    res.status(200).json({ status: "approved", user: toSafeUser(updated) });
  } catch (err) {
    next(err);
  }
};

/** Отклонить заявку: перевести пользователя в статус blocked. */
export const rejectRegistration = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = Number(req.params.userId);
    if (!userId || Number.isNaN(userId)) return next(new ApiError(400, "Invalid user id"));

    const user = await UserService.getUserById(userId);
    if (!user) return next(new ApiError(404, `User ${userId} not found`));

    const wasPending = user.status === UserStatus.pending;
    const updated = await UserService.setUserStatus(userId, UserStatus.blocked);
    logger.info(`[admin] registration rejected for user ${userId}`);
    if (wasPending) {
      NotificationService.notifyRegistrationRejected(user.email, user.username).catch(() => {});
    }
    res.status(200).json({ status: "rejected", user: toSafeUser(updated) });
  } catch (err) {
    next(err);
  }
};
