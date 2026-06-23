import { NextFunction, Request, Response } from "express";
import { ApiError } from "../errors/api.error";
import { getPodLogs } from "../services/k8s.service";
import UserService from "../services/user.service";
import WorkerService from "../services/worker.service";
import { redisClient } from "../../redis/redis";
import { RedisService } from "../services/redis.service";
import { BrowserOptions, ProfileOptions, BrowserCoreTypes, BrowserPlatform } from "../services/browsers/types";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ENV } from "../../config";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { FilterService } from "../services/filters/filter.service";
import { WorkerState } from "../../database/worker.model";
import { seedMockDialogsForUser } from "../services/mock-dialogs.seed";

function parseInternationalPhone(phone: string): { countryCode: string; nationalNumber: string } {
  const t = phone.trim();
  if (!t.startsWith("+")) {
    throw new ApiError(400, "Номер должен быть с кодом страны через +");
  }
  const digits = t.slice(1).replace(/[\s()-]/g, "");
  if (!/^\d+$/.test(digits) || digits.length < 8) {
    throw new ApiError(400, "Некорректный номер");
  }
  const m = digits.match(/^(\d{1,3})(\d{4,14})$/);
  if (!m) {
    throw new ApiError(400, "Не удалось разобрать код страны и номер");
  }
  return { countryCode: m[1], nationalNumber: m[2] };
}

export interface WorkerMetadata {
  platform: string;
  browser: string;
  browserCore: string;
  filter: string;
  createdAt: string;
  updatedAt: string;
}

export const createWorker = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  const { profileOptions, amount: amountRaw } = req.body;
  const userId = req.userId;
  const missingFields: string[] = [];

  if (!userId) missingFields.push("userId");
  if (profileOptions === undefined) missingFields.push("profileOptions");

  if (missingFields.length > 0) {
    return next(new ApiError(400, `Missing fields: ${missingFields.join(", ")}`));
  }

  const amount = amountRaw === undefined || amountRaw === null ? 1 : Number(amountRaw);
  if (!Number.isFinite(amount) || amount < 1 || !Number.isInteger(amount)) {
    return next(new ApiError(400, "amount must be a positive integer"));
  }

  const user = await UserService.getUserById(userId!);
  if (!user) return next(new ApiError(401, `Couldn't find the user`));

  const workers = await UserService.getWorkers(userId!);
  if (workers.length + amount > ENV.BROWSERS_AMOUNT) {
    return next(new ApiError(412, "Maximum workers amount reached"));
  }

  const profileDto = plainToInstance(ProfileOptions, profileOptions);
  const errors = await validate(profileDto);
  if (errors.length > 0) {
    return next(new ApiError(400, errors.toString()));
  }

  if (profileDto.filterOptions?.id && !(await FilterService.getFilter(profileDto.filterOptions?.id))) {
    throw new ApiError(400, `Filter ${profileDto.filterOptions?.id} does not exist`);
  }

  try {
    const created: Awaited<ReturnType<typeof WorkerService.createWorker>>[] = [];
    for (let i = 0; i < amount; i++) {
      const worker = await WorkerService.createWorker(
        userId!,
        profileDto.browserOption,
        profileDto.browserCore || BrowserCoreTypes.Chrome,
        profileDto.operatorSystemId || BrowserPlatform.windows,
        profileDto.userAgent,
        profileDto.filterOptions?.id,
        profileDto.usesBrowser ?? true
      );

      worker.browserType = profileDto.browserOption;

      await worker.save();
      created.push(worker);
    }

    if (amount === 1) {
      res.status(200).send(created[0]);
    } else {
      res.status(200).send({ workers: created });
    }
  } catch (error) {
    return next(new ApiError(500, String(error)));
  }
};

export const runWorkers = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.userId!;
    await seedMockDialogsForUser(userId);
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

    res.status(202).send({ status: "queued", queued, skipped, duplicatePending });
  } catch (err) {
    next(err);
  }
};

export const runWorker = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { workerId } = req.params;
    const id = Number(workerId);
    if (!Number.isFinite(id)) {
      return next(new ApiError(400, "Invalid worker id"));
    }

    const claimed = await WorkerService.claimWorkersForStart(req.userId!, [id]);
    if (claimed.length === 0) {
      const worker = await WorkerService.getWorker(id);
      if (!worker || worker.userId !== req.userId) {
        return next(new ApiError(404, `Worker ${workerId} not found`));
      }
      res.status(202).send({ status: "accepted", workerId: id, alreadyRunning: true });
      return;
    }

    const r = await WorkerService.enqueueClaimedOrRevert(claimed[0], req.userId!);
    if (r === "duplicate_pending") {
      res.status(202).send({ status: "accepted", workerId: id, alreadyQueued: true });
      return;
    }
    res.status(202).send({ status: "queued", workerId: id });
  } catch (err) {
    next(err);
  }
};

export const applyWorkerPhone = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = Number(req.params.workerId);
    if (!Number.isFinite(id)) {
      return next(new ApiError(400, "Invalid worker id"));
    }
    const { phone } = req.body;
    if (typeof phone !== "string" || !phone.trim()) {
      return next(new ApiError(400, "phone is required"));
    }
    const { countryCode, nationalNumber } = parseInternationalPhone(phone);
    const worker = await WorkerService.getWorker(id);
    if (!worker || worker.userId !== req.userId) {
      return next(new ApiError(404, "Worker not found"));
    }
    const needsReverify = worker.status === WorkerState.EXPECTING_CODE;
    if (needsReverify) {
      await RedisService.sendWorkerCommand(id, {
        command: "reverify",
        countryCode,
        phoneNumber: nationalNumber
      });
    }
    await RedisService.sendWorkerCommand(id, {
      command: "verify",
      countryCode,
      phoneNumber: nationalNumber
    });
    res.status(202).send({ status: "queued", countryCode, phoneNumber: nationalNumber });
  } catch (e) {
    if (e instanceof ApiError) return next(e);
    next(e);
  }
};

export const verifyWorkerPhoneCode = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = Number(req.params.workerId);
    if (!Number.isFinite(id)) {
      return next(new ApiError(400, "Invalid worker id"));
    }
    const { code } = req.body;
    if (typeof code !== "string" || !code.trim()) {
      return next(new ApiError(400, "code is required"));
    }
    const worker = await WorkerService.getWorker(id);
    if (!worker || worker.userId !== req.userId) {
      return next(new ApiError(404, "Worker not found"));
    }
    await RedisService.sendWorkerCommand(id, { command: "code", code: code.trim() });
    res.status(202);
  } catch (e) {
    if (e instanceof ApiError) return next(e);
    next(e);
  }
};

export const sendMessageToWorker = async (req: Request, res: Response, next: NextFunction) => {
  const { workerId } = req.params;
  const { message } = req.body;
  const missingFields: string[] = [];

  if (!message || message.length === 0) missingFields.push("message");

  if (missingFields.length > 0) {
    return next(new ApiError(400, `Missing fields: ${missingFields.join(", ")}`));
  }

  const worker = await WorkerService.getWorker(Number(workerId));
  if (!worker) {
    return next(new ApiError(400, `Couldn't find worker: ${workerId}`));
  }

  try {
    await redisClient.publish("main-to-worker:" + workerId, message);
    res.status(200).send(worker);
  } catch (error) {
    next(error);
  }
};

export const seeLogs = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  const { workerId } = req.params;
  const userId = req.userId;
  const missingFields: string[] = [];

  if (!workerId) missingFields.push("workerId");

  if (missingFields.length > 0) {
    return next(new ApiError(400, `Missing fields: ${missingFields.join(", ")}`));
  }

  res.status(200).send(await getPodLogs(workerId, userId?.toString()!));
};

export const getAllWorkers = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  res.status(200).send(await WorkerService.getWorkersByUserId(req.userId!));
};

export const getWorkerMetadata = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const { workerId } = req.params;
  const worker = await WorkerService.getWorker(Number(workerId));
  if (!worker) throw new ApiError(400, "Couldn't find worker");

  const filter = worker.filterId ? (await FilterService.getFilter(worker.filterId))?.name :
    (await FilterService.getActiveFilter(worker.userId))?.name;

  if (!filter) throw new ApiError(400, "Couldn't find filter");

  const metadata: WorkerMetadata = {
    browser: BrowserOptions[worker.browserType ?? 1],
    browserCore: BrowserCoreTypes[worker.browserCore ?? 1],
    platform: BrowserPlatform[worker.operationSystem ?? 1],
    filter,
    createdAt: worker.createdAt.toLocaleString("ru-RU"),
    updatedAt: worker.updatedAt.toLocaleString("ru-RU"),
  };
  res.status(200).send(metadata);
};

export const shutdownWorker = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const { workerId } = req.params;
  const worker = await WorkerService.getWorker(Number(workerId));
  if (!worker) throw new ApiError(400, "Couldn't find worker");

  res.status(200).send(await WorkerService.shutdownWorker(worker));
};

export const pauseWorker = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const { workerId } = req.params;
  const worker = await WorkerService.getWorker(Number(workerId));
  if (!worker) throw new ApiError(400, "Couldn't find worker");

  res.status(200).send(await WorkerService.pauseWorker(worker));
};

export const continueWorker = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const { workerId } = req.params;
  const worker = await WorkerService.getWorker(Number(workerId));
  if (!worker) throw new ApiError(400, "Couldn't find worker");

  res.status(200).send(await WorkerService.continueWorker(worker));
};

export const deleteWorker = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const { workerId } = req.params;
  await WorkerService.deleteWorker(Number(workerId));
  res.status(200).send({ status: "success!" });
};

export const attachFilter = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const { workerId } = req.params;
  const { filterId } = req.body;
  res.status(200).send(await WorkerService.attachFilter(Number(workerId), Number(filterId)));
};

export const updateWorker = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const { workerId } = req.params;
  const { isActive, browserType, browserCore, operationSystem, userAgent, filterId } = req.body;

  const worker = await WorkerService.getWorker(Number(workerId));
  if (!worker) {
    return next(new ApiError(404, `Worker with id ${workerId} not found`));
  }

  // Validate browserType if provided
  if (browserType !== undefined && !Object.values(BrowserOptions).includes(browserType)) {
    return next(new ApiError(400, "Invalid browserType"));
  }

  // Validate browserCore if provided
  if (browserCore !== undefined && !Object.values(BrowserCoreTypes).includes(browserCore)) {
    return next(new ApiError(400, "Invalid browserCore"));
  }

  // Validate operationSystem if provided
  if (operationSystem !== undefined && !Object.values(BrowserPlatform).includes(operationSystem)) {
    return next(new ApiError(400, "Invalid operationSystem"));
  }

  // Validate filterId if provided
  if (filterId !== undefined && filterId !== null) {
    const filter = await FilterService.getFilter(filterId);
    if (!filter) {
      return next(new ApiError(400, `Filter ${filterId} does not exist`));
    }
  }

  try {
    const updatedWorker = await WorkerService.updateWorker(worker, {
      isActive,
      browserType,
      browserCore,
      operationSystem,
      userAgent,
      filterId
    });

    res.status(200).send(updatedWorker);
  } catch (error) {
    return next(new ApiError(500, String(error)));
  }
};