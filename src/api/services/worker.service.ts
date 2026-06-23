import Worker, { IWorkerAttributes, WorkerState } from "../../database/worker.model";
import { RedisService, StatusChangeData } from "./redis.service";
import { deletePod, launchPod } from "./k8s.service";
import { BrowserCoreTypes, BrowserOptions, BrowserPlatform } from "./browsers/types";
import IBrowserService from "./browsers/IBrowserService";
import { ApiError } from "../errors/api.error";
import { ProxyService } from "./proxy.service";
import { AccountService } from "./account.service";
import User from "../../database/user.model";
import { ENV, logger } from "../../config";
import { DialogService } from "./dialog.service";
import { BatchManagerService } from "./parsing/batch.service";
import { Op, QueryTypes, Transaction } from "sequelize";
import UserService from "./user.service";
import AdsPowersService from "./browsers/AdsPowersService";
import VisionService from "./browsers/VisionService";
import MoreLoginService from "./browsers/MoreLoginService";
import DolphinService from "./browsers/DolphinService";
import GoLoginService from "./browsers/GoLoginService";
import { FilterService } from "./filters/filter.service";
import { ParserManager } from "./parsing/parser-manager";
import { normalizeProxyUrl } from "./proxyUrl";
import OctoBrowserService from "./browsers/OctoBrowserService";
import Proxy, { ProxyProtocol } from "../../database/proxy.model";
import HideMyAccService from "./browsers/HideMyAccService";
import LinkenSphereService from "./browsers/LinkenSphereService";
import IndigoService from "./browsers/IndigoService";
import IdentoryService from "./browsers/IdentoryService";
import UndetectableService from "./browsers/UndetectableService";
import { sequelize } from "../../database/database";

/** false — при завершении слота вызывается deletePod; true — отключить (только для отладки). */
const TEMP_SKIP_WORKER_POD_DELETE = false;

async function deleteWorkerPodIfEnabled(workerIdStr: string, userIdStr: string): Promise<void> {
  if (!TEMP_SKIP_WORKER_POD_DELETE) {
    await deletePod(workerIdStr, userIdStr);
  }
}

export interface WorkerBatchUpdate {
  id: number;
  currentBatchSize?: number;
  batchStartTime?: Date | null;
  isBatchActive?: boolean;
  lastResetTime?: Date | null;
}

export interface WorkerUpdate {
  id: number;
  isActive?: boolean;
  browserType?: BrowserOptions;
  browserCore?: BrowserCoreTypes;
  operationSystem?: BrowserPlatform;
  userAgent?: string;
  filterId?: number;
}

interface WorkerWithExtras extends IWorkerAttributes {
  name: string | null;
  login: string | null;
  proxy: string | null;
}

const RUNNING_OR_STARTING_STATES: WorkerState[] = [
  WorkerState.ACTIVE,
  WorkerState.INITIALIZING,
  WorkerState.CONNECTING,
  WorkerState.AUTHENTICATING,
  WorkerState.RECONNECTING,
  WorkerState.CONNECTION_LOST,
  WorkerState.PHONE_VERIFICATION,
  WorkerState.EXPECTING_CODE
];

export interface ClaimedWorkerSlot {
  id: number;
  previousStatus: WorkerState;
  previousIsActive: boolean;
}

class WorkerService {
  private static runWorkerQueueTail: Promise<void> = Promise.resolve();
  private static pendingRunWorkerIds = new Set<number>();

  /** Слот уже запущен или в процессе подключения — повторный постановки в очередь не нужен. */
  static isWorkerRunningOrStarting(w: Pick<IWorkerAttributes, "isActive" | "status">): boolean {
    return Boolean(w.isActive) || (w.status ? RUNNING_OR_STARTING_STATES.includes(w.status) : false);
  }

  /**
   * Атомарно переводит подходящих воркеров в INITIALIZING (транзакция + блокировка строк).
   * Совпадает с логикой isWorkerRunningOrStarting: занятые строки не трогаем.
   */
  static async claimWorkersForStart(userId: number, workerIds?: number[]): Promise<ClaimedWorkerSlot[]> {
    return sequelize.transaction(async (transaction) => {
      const baseWhere: Record<string, unknown> = {
        userId,
        [Op.not]: {
          [Op.or]: [
            { isActive: true },
            { status: { [Op.in]: RUNNING_OR_STARTING_STATES } }
          ]
        }
      };
      if (workerIds !== undefined) {
        if (workerIds.length === 0) return [];
        baseWhere.id = { [Op.in]: workerIds };
      }

      const rows = await Worker.findAll({
        where: baseWhere as any,
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      const result: ClaimedWorkerSlot[] = [];
      for (const w of rows) {
        const previousStatus = w.status ?? WorkerState.SHUTDOWN;
        const previousIsActive = Boolean(w.isActive);
        w.status = WorkerState.INITIALIZING;
        w.isActive = false;
        await w.save({ transaction });
        result.push({ id: w.id, previousStatus, previousIsActive });
      }
      return result;
    });
  }

  /**
   * Откат после неудачной постановки в очередь: только если всё ещё INITIALIZING (иначе не затираем прогресс).
   */
  static async revertWorkerAfterFailedEnqueue(
    workerId: number,
    previousStatus: WorkerState,
    previousIsActive: boolean
  ): Promise<void> {
    const [affected] = await Worker.update(
      { status: previousStatus, isActive: previousIsActive },
      { where: { id: workerId, status: WorkerState.INITIALIZING } }
    );
    if (affected === 0) {
      logger.warn(
        `[revertWorkerAfterFailedEnqueue] worker ${workerId} not in INITIALIZING, revert skipped`
      );
    }
  }

  /**
   * Постановка запуска воркера в общую FIFO-очередь (один активный запуск за раз).
   * HTTP-ответ можно отдавать сразу; фактический runWorker выполняется асинхронно.
   */
  static enqueueRunWorker(workerId: number, userId: number): "queued" | "duplicate_pending" {
    if (WorkerService.pendingRunWorkerIds.has(workerId)) {
      return "duplicate_pending";
    }
    WorkerService.pendingRunWorkerIds.add(workerId);
    WorkerService.runWorkerQueueTail = WorkerService.runWorkerQueueTail.then(async () => {
      try {
        await WorkerService.executeRunWorkerTransactional(workerId, userId);
      } catch (err) {
        logger.error(`[runWorker queue] job failed workerId=${workerId}:`, err);
      } finally {
        WorkerService.pendingRunWorkerIds.delete(workerId);
      }
    });
    return "queued";
  }

  /**
   * Постановка в очередь после claim; при duplicate_pending откатывает INITIALIZING → прежний статус.
   */
  static async enqueueClaimedOrRevert(claimed: ClaimedWorkerSlot, userId: number): Promise<"queued" | "duplicate_pending"> {
    const r = WorkerService.enqueueRunWorker(claimed.id, userId);
    if (r === "duplicate_pending") {
      await WorkerService.revertWorkerAfterFailedEnqueue(
        claimed.id,
        claimed.previousStatus,
        claimed.previousIsActive
      );
    }
    return r;
  }

  private static async executeRunWorkerTransactional(workerId: number, userId: number): Promise<void> {
    const transaction = await sequelize.transaction();
    try {
      const worker = await WorkerService.runWorker(workerId, userId, transaction);
      await transaction.commit();
      if (worker.filterId) await WorkerService.ensureParserRunningForFilter(worker.filterId, worker.userId);
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  }

  static async createWorker(userId: number, browserType?: number, browserCore?: number, operationSystem?: number,
                            userAgent?: string, filterId?: number, usesBrowser: boolean = true): Promise<Worker> {
    const attrs: any = { userId, browserCore, operationSystem, userAgent, filterId, usesBrowser };
    if (browserType !== undefined) attrs.browserType = browserType;
    return await Worker.create(attrs);
  }

  static async getWorker(workerId: number) {
    return await Worker.findByPk(workerId);
  }

  static async getWorkersByUserId(userId: number): Promise<WorkerWithExtras[]> {
    const query = `
        SELECT w.*,
               a.name,
               a.login,
               CONCAT(p.protocol, '://', p.host, ':', p.port) AS proxy,
               COALESCE(d."dialogsCount", 0) AS "dialogsCount",
               COALESCE(d."mailedDialogsCount", 0) AS "mailedDialogsCount"
        FROM workers AS w
                 LEFT JOIN accounts AS a ON w."accountId" = a.id
                 LEFT JOIN proxies AS p ON w."proxyId" = p.id
                 LEFT JOIN (
                     SELECT "workerId",
                            COUNT(id) AS "dialogsCount",
                            COUNT(CASE WHEN "emailSent" = true THEN 1 END) AS "mailedDialogsCount"
                     FROM dialogs
                     GROUP BY "workerId"
                 ) AS d ON d."workerId" = w.id
        WHERE w."userId" = :userId
        AND w."deletedAt" is null
        ORDER BY w."isActive" DESC NULLS LAST, w.id DESC
    `;

    return await Worker.sequelize!.query<WorkerWithExtras>(query, {
      replacements: { userId },
      type: QueryTypes.SELECT,
      mapToModel: false // не нужно, т.к. мы возвращаем не модель, а plain object
    });
  }

  static async getAllWorkers() {
    return await Worker.findAll();
  }

  static async getActiveWorkers() {
    return await Worker.findAll({
      where: {
        isActive: true,
        status: WorkerState.ACTIVE
      }
    });
  }

  static async getActiveWorkersByUser(userId: number) {
    return await Worker.findAll({
      where: {
        isActive: true,
        userId
      }
    });
  }

  static async getActiveWorkersByFilter(filterId: number) {
    if ((await FilterService.getFilter(filterId))?.isActive) {
      return await Worker.findAll({
        where: {
          filterId: {
            [Op.is]: undefined
          }
        }
      });
    }

    return await Worker.findAll({
      where: {
        status: {
          [Op.in]: [
            WorkerState.ACTIVE,
            WorkerState.AUTHENTICATING,
            WorkerState.CONNECTING,
            WorkerState.RECONNECTING,
            WorkerState.CONNECTION_LOST
          ]
        },
        filterId
      }
    });
  }


  static async getReadyToAcceptWorkers() {
    const query = `
        SELECT w.*
        FROM workers w
                 LEFT JOIN users u ON w."userId" = u.id
        WHERE w."isActive" = true
          AND w.status = 'ACTIVE'
          AND w."deletedAt" IS NULL
          AND (
            w."isBatchActive" = false
                OR w."batchStartTime" IS NULL
                OR (w."isBatchActive" = true
                AND (COALESCE(w."currentBatchSize", 0) <= u."itemsChunkSize")
                AND (EXTRACT(EPOCH FROM (NOW() - w."batchStartTime")) * 1000 < COALESCE(u."chunksInterval", 300000))
                )
            )
    `;

    return await Worker.sequelize?.query(query, {
      type: QueryTypes.SELECT,
      model: Worker,
      mapToModel: true
    });
  }

  static async getReadyToAcceptWorkersByUser(userId: number, itemsCount: number) {
    const query = `
        SELECT w.*
        FROM workers w
                 LEFT JOIN users u ON w."userId" = u.id
        WHERE w."isActive" = true
          AND w.status = 'ACTIVE'
          AND w."deletedAt" IS NULL
          AND w."userId" = :userId
          AND (
            w."isBatchActive" = false
                OR w."batchStartTime" IS NULL
                OR (w."isBatchActive" = true
                AND (COALESCE(w."currentBatchSize", 0) + :itemsCount <= u."itemsChunkSize")
                AND (EXTRACT(EPOCH FROM (NOW() - w."batchStartTime")) * 1000 < COALESCE(u."chunksInterval", 300000))
                )
            )
    `;

    return await Worker.sequelize?.query(query, {
      replacements: { userId, itemsCount },
      type: QueryTypes.SELECT,
      model: Worker,
      mapToModel: true
    });
  }

  static async getWorkersByFilter(filterId: number) {
    const query = `
        SELECT w.*
        FROM workers w
                 LEFT JOIN users u ON w."userId" = u.id
        WHERE w."isActive" = true
          AND w.status = 'ACTIVE'
          AND w."deletedAt" IS NULL
          AND w."filterId" = :filterId
          AND (
            w."isBatchActive" = false
                OR w."batchStartTime" IS NULL
                OR (w."isBatchActive" = true
                AND (COALESCE(w."currentBatchSize", 0) <= u."itemsChunkSize")
                AND (EXTRACT(EPOCH FROM (NOW() - w."batchStartTime")) * 1000 < COALESCE(u."chunksInterval", 300000))
                )
            )
    `;

    return await Worker.sequelize?.query(query, {
      replacements: { filterId },
      type: QueryTypes.SELECT,
      model: Worker,
      mapToModel: true
    });
  }

  static async getOldUpdateWorkerStatus(message: StatusChangeData) {
    const worker = await Worker.findByPk(message.workerId);
    if (!worker) throw new Error(`Failed to update worker status for worker: ${message.workerId}`);
    const oldStatus = worker.status ?? WorkerState.INITIALIZING;
    worker.status = message.payload.state;

    if (message.payload.state == WorkerState.SHUTDOWN && worker.proxyId) {
      const proxy = await ProxyService.getProxyById(worker.proxyId);
      if (proxy?.isRotating) {
        proxy.isInUse = false;
        await proxy.save();
      }
    }

    return { worker: await worker.save(), oldStatus };
  }

  static async deleteWorker(id: number): Promise<void> {
    await Worker.destroy({
      where: {
        id
      }
    });
  }

  static async runWorker(workerId: number, userId: number, transaction: Transaction): Promise<Worker> {
    const worker = await Worker.findByPk(Number(workerId), { transaction });
    if (!worker) throw new ApiError(403, `Couldn't find worker ${workerId}`);

    const user = await UserService.getUserById(userId);
    if (!user) throw new ApiError(417, "Couldn't find current user");

    let workerLogin = "";
    let workerPassword = "";

    try {
      let browserService: IBrowserService | null = null;

      switch (Number(worker.browserType)) {
        case BrowserOptions.MoreLogin.valueOf():
          browserService = MoreLoginService;
          break;
        case BrowserOptions.Vision.valueOf():
          browserService = VisionService;
          if (!user.visionFolderId) {
            user.visionFolderId = await VisionService.createFolder(user.username);
            await user.save();
          }
          break;
        case BrowserOptions.HideMyAccService.valueOf():
          browserService = HideMyAccService;
        {
          const profileId = await HideMyAccService.getLastAvailableProfileId(user.visionFolderId);
          if (profileId) worker.profileId = profileId;
        }
          break;
        case BrowserOptions.Dolphin.valueOf():
          browserService = DolphinService;
          break;
        case BrowserOptions.AdsPower.valueOf():
          browserService = AdsPowersService;
          break;
        case BrowserOptions.GoLogin.valueOf():
          browserService = GoLoginService;
          break;
        case BrowserOptions.OctoBrowser.valueOf():
          browserService = OctoBrowserService;
          break;
        case BrowserOptions.LinkenSphere.valueOf():
          browserService = LinkenSphereService;
          break;
        case BrowserOptions.Indigo.valueOf():
          browserService = IndigoService;
          break;
        case BrowserOptions.Identory.valueOf():
          browserService = IdentoryService;
          break;
        case BrowserOptions.Undetectable.valueOf():
          browserService = UndetectableService;
          break;
        default:
          throw new Error("Incorrect browser option");
      }

      if (!browserService) {
        throw new Error("Browser service is not initialized");
      }

      const browserTypeNum = Number(worker.browserType);
      const isVisionBrowser = browserTypeNum === BrowserOptions.Vision.valueOf();
      const isIdentoryBrowser = browserTypeNum === BrowserOptions.Identory.valueOf();
      const isUndetectableBrowser = browserTypeNum === BrowserOptions.Undetectable.valueOf();

      if (worker.profileId && isVisionBrowser) {
        // Vision: уже есть profileId — без резерва куки/прокси
      } else if (worker.profileId && isIdentoryBrowser) {
        // Identory: уже есть id профиля в лаунчере — только старт, без создания и без куки/прокси
      } else if (worker.profileId && isUndetectableBrowser) {
        // Undetectable: уже есть id профиля в лаунчере — только старт, без list/create
      } else if (isUndetectableBrowser) {
        // Имя профиля в Undetectable = id слота (worker.id)
        worker.profileId = await UndetectableService.findOrCreateByUndetectableProfileName(
          String(worker.id),
          {
            browserCore: worker.browserCore,
            browserOption: worker.browserType,
            operatorSystemId: worker.operationSystem,
            userAgent: worker.userAgent,
            workerId: worker.id
          }
        );
      } else if (worker.profileId) {
        // Слот уже привязан к профилю в лаунчере — только старт (без резерва куки и без createBrowser)
      } else {
        const account = await AccountService.peekAccount(userId, transaction);
        const proxy = account.proxyId
          ? await ProxyService.getProxyById(account.proxyId) ?? await ProxyService.peekProxy(userId, transaction)
          : await ProxyService.peekProxy(userId, transaction);

        const proxyId = await browserService.addProxy(proxy, user.visionFolderId);
        worker.proxyId = proxy.id;
        worker.accountId = account.id;
        worker.profileId = await browserService.createBrowser({
          browserCore: worker.browserCore,
          browserOption: worker.browserType,
          operatorSystemId: worker.operationSystem,
          userAgent: worker.userAgent,
          workerId: worker.id
        }, user, proxyId);
        workerLogin = account.login;
        workerPassword = account.password;
      }

      let result: any;
      if (worker.browserType === BrowserOptions.Vision) {
        // VisionService has special proxy retry logic with userId and transaction
        result = await VisionService.startBrowser(worker.profileId!, user.visionFolderId, userId, transaction);
      } else {
        result = await browserService.startBrowser(worker.profileId!, user.visionFolderId);
      }

      if (typeof result === "number") worker.port = result;
      else worker.port = result.port;
      worker.isActive = true;
      await launchPod(user, worker.id, worker.port!, new Proxy({
        host: "localhost",
        protocol: ProxyProtocol.SOCKS5,
        port: 0,
        userId: 0
      }), worker.browserCore ?? BrowserCoreTypes.Firefox, result?.webdriver, workerLogin, workerPassword);

      const filter = worker.filterId ? await FilterService.getFilter(worker.filterId)
        : await FilterService.getActiveFilter(userId);
      if (!filter) throw new ApiError(400, `Couldn't find any filters for worker ${worker.id}`);

      if (!worker.filterId) worker.filterId = filter.id;
      await worker.save({ transaction });

      logger.info(`Обновил воркера ${workerId}`);
    } catch (error: any) {
      logger.error(error);
      const profileId = worker.profileId;
      const proxyId = worker.proxyId;

      if (profileId) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        await this.deleteWorkerBrowser(worker, user);
      }
      await deleteWorkerPodIfEnabled(workerId.toString(), userId.toString());

      if (!(error instanceof ApiError) && error.message.includes("Proxy") && !error.message.includes("not found")) {
        if (!proxyId) throw new Error("Proxy was supposed to be attached to worker but it wasn't");
        await ProxyService.deleteProxy(proxyId);
        // try {
        //   return await this.runWorker(workerId, userId, transaction); // Возвращаем результат рекурсии
        // } catch (error) {
        //   logger.error(`Ошибка при восстановлении воркера ${workerId}: ${error}`);
        // }
      }

      logger.warn(`Отменил запуск воркера ${workerId}`);
      await Worker.update({ status: WorkerState.SHUTDOWN, isActive: false }, { where: { id: workerId } });
      throw error;
    }
    return worker;
  }

  /**
   * Starts a parser for the filter if not already running.
   */
  static async ensureParserRunningForFilter(filterId: number, userId: number): Promise<void> {
    const proxy = normalizeProxyUrl(ENV.PARSER_DEFAULT_PROXY) ?? "";
    ParserManager.getInstance().startParser(filterId, userId, proxy);
  }

  static async deleteWorkerBrowser(worker: Worker, user: User) {
    if (!worker.profileId) throw new Error(`No browser is running for worker ${worker.id}`);
    let result = null;

    try {
      switch (Number(worker.browserType)) {
        case BrowserOptions.MoreLogin.valueOf():
          await MoreLoginService.stopBrowser(worker.profileId);
          result = await MoreLoginService.deleteProfile(worker.profileId);
          break;
        case BrowserOptions.Vision.valueOf():
          await VisionService.stopBrowser(worker.profileId, user.visionFolderId);
          result = await VisionService.deleteProfile(worker.profileId, user.visionFolderId);
          break;
        case BrowserOptions.Dolphin.valueOf():
        case BrowserOptions.AdsPower.valueOf():
          await AdsPowersService.stopBrowser(worker.profileId);
          result = await AdsPowersService.deleteProfile(worker.profileId);
          break;
        case BrowserOptions.GoLogin.valueOf():
          await GoLoginService.stopBrowser(worker.profileId);
          result = await GoLoginService.deleteProfile(worker.profileId);
          break;
        case BrowserOptions.OctoBrowser.valueOf():
          await OctoBrowserService.stopBrowser(worker.profileId);
          result = await OctoBrowserService.deleteProfile(worker.profileId);
          break;
        case BrowserOptions.HideMyAccService.valueOf():
          await HideMyAccService.stopBrowser(worker.profileId);
          result = await HideMyAccService.deleteProfile(worker.profileId);
          break;
        case BrowserOptions.LinkenSphere.valueOf():
          await LinkenSphereService.stopBrowser(worker.profileId);
          result = await LinkenSphereService.deleteProfile(worker.profileId);
          break;
        case BrowserOptions.Indigo.valueOf():
          await IndigoService.stopBrowser(worker.profileId);
          result = await IndigoService.deleteProfile(worker.profileId);
          break;
        case BrowserOptions.Identory.valueOf():
          await IdentoryService.stopBrowser(worker.profileId);
          result = await IdentoryService.deleteProfile(worker.profileId);
          break;
        case BrowserOptions.Undetectable.valueOf():
          await UndetectableService.stopBrowser(worker.profileId);
          result = await UndetectableService.deleteProfile(worker.profileId);
          break;
        default:
          throw new Error("Incorrect browser option");
      }
    } catch (error: any) {
      logger.error(`Error deleting worker browser for ${worker.id}: ${error.message}`);
    }

    return result;
  }

  static async shutdownWorker(worker: Worker, state?: WorkerState): Promise<Worker> {
    const user = await UserService.getUserById(worker.userId);
    if (!user) {
      throw new Error(`Couldn't shutdown worker for user ${worker.userId}`);
    }

    await this.handleWorkerState(worker, state, user);
    await deleteWorkerPodIfEnabled(worker.id.toString(), worker.userId.toString());
    await this.cleanupAfterShutdown(worker, state, user);

    await RedisService.sendWorkerCommand(worker.id, { command: "shutdown" });

    return await this.finalizeWorkerShutdown(worker, state);
  }

  private static async handleWorkerState(
    worker: Worker,
    state: WorkerState | undefined,
    user: any
  ): Promise<void> {
    const isConnectionLost = state === WorkerState.CONNECTION_LOST;
    const isBanned = state === WorkerState.BANNED;

    if (worker.usesBrowser === false) {
      if (isConnectionLost && worker.accountId) await AccountService.restoreAccount(worker.accountId);
      if (isBanned) await this.handleBannedWorker(worker);
      return;
    }

    const isVisionBrowser = worker.browserType === BrowserOptions.Vision.valueOf();
    const isHideMyAccBrowser = worker.browserType === BrowserOptions.HideMyAccService.valueOf();

    if (isConnectionLost && worker.accountId) {
      await AccountService.restoreAccount(worker.accountId);
      // Всегда закрывать браузеры Vision/HideMyAcc/Indigo, иначе они остаются висеть на стороне лаунчера
      if (isVisionBrowser && worker.profileId && user.visionFolderId) {
        await VisionService.stopBrowser(worker.profileId, user.visionFolderId);
      }
      if (isHideMyAccBrowser && worker.profileId) {
        await HideMyAccService.stopBrowser(worker.profileId);
      }
      if (worker.browserType === BrowserOptions.Indigo.valueOf() && worker.profileId) {
        try {
          await IndigoService.stopBrowser(worker.profileId);
        } catch (e: any) {
          logger.error(`Error stopping Indigo browser on connection lost (worker ${worker.id}): ${e?.message}`);
        }
      }
      if (worker.browserType === BrowserOptions.Identory.valueOf() && worker.profileId) {
        try {
          await IdentoryService.stopBrowser(worker.profileId);
        } catch (e: any) {
          logger.error(`Error stopping Identory browser on connection lost (worker ${worker.id}): ${e?.message}`);
        }
      }
      if (worker.browserType === BrowserOptions.Undetectable.valueOf() && worker.profileId) {
        try {
          await UndetectableService.stopBrowser(worker.profileId);
        } catch (e: any) {
          logger.error(`Error stopping Undetectable browser on connection lost (worker ${worker.id}): ${e?.message}`);
        }
      }
      return;
    }

    if (isBanned) {
      await this.handleBannedWorker(worker);
      return;
    }

    if (isVisionBrowser) {
      await this.handleVisionBrowser(worker, isConnectionLost, user);
      if (worker.profileId && user.visionFolderId) await VisionService.stopBrowser(worker.profileId, user.visionFolderId);
      return;
    }

    if (isHideMyAccBrowser) {
      await this.handleHideMyAccBrowser(worker, isConnectionLost, user);
      if (worker.profileId) await HideMyAccService.stopBrowser(worker.profileId);
      return;
    }

    await this.handleStandardBrowser(worker);
  }

  private static async handleBannedWorker(worker: Worker): Promise<void> {
    if (worker.proxyId) {
      const proxy = await ProxyService.getProxyById(worker.proxyId);
      if (proxy && !proxy.isRotating) {
        await proxy.destroy();
      }
    }

    if (worker.accountId) {
      const account = await AccountService.getAccount(worker.accountId);
      if (account) {
        await AccountService.deleteAccount(account);
      }
    }

    await DialogService.shutdownDialogsForWorker(worker.id);
  }

  private static async handleVisionBrowser(
    worker: Worker,
    isConnectionLost: boolean,
    user: any
  ): Promise<void> {
    await VisionService.restoreProfile(worker.profileId!, user?.visionFolderId!);

    if (isConnectionLost) {
      const proxy = await ProxyService.peekProxy(worker.userId);
      if (proxy) {
        await VisionService.changeProxy(worker.profileId!, user?.visionFolderId!, proxy);
      }
    }
  }

  private static async handleHideMyAccBrowser(
    worker: Worker,
    isConnectionLost: boolean,
    user: any
  ): Promise<void> {
    // Restore HMA profile by clearing notes (acts like "restoreProfile")
    await HideMyAccService.restoreProfile(worker.profileId!);

    if (isConnectionLost) {
      // Potential place for future HideMyAcc-specific proxy change logic.
    }
  }

  private static async handleStandardBrowser(worker: Worker): Promise<void> {
    if (worker.accountId) {
      await AccountService.restoreAccount(worker.accountId);
    }
    if (worker.proxyId) {
      await ProxyService.restoreProxy(worker.proxyId);
    }
  }

  private static async cleanupAfterShutdown(
    worker: Worker,
    state: WorkerState | undefined,
    user: any
  ): Promise<void> {
    if (worker.usesBrowser !== false) {
      const isVisionBrowser = worker.browserType === BrowserOptions.Vision.valueOf();
      const isHideMyAccBrowser = worker.browserType === BrowserOptions.HideMyAccService.valueOf();
      const isIdentoryBrowser = worker.browserType === BrowserOptions.Identory.valueOf();
      const isUndetectableBrowser = worker.browserType === BrowserOptions.Undetectable.valueOf();
      const isConnectionLost = state === WorkerState.CONNECTION_LOST;
      const shouldDeleteBrowser =
        !isVisionBrowser &&
        !isHideMyAccBrowser &&
        !isIdentoryBrowser &&
        !isUndetectableBrowser &&
        !isConnectionLost;
      if (shouldDeleteBrowser) {
        await this.deleteWorkerBrowser(worker, user);
      }
    }
    // Для HTTP-воркеров ConfigMap удаляется автоматически в deletePod()

    await BatchManagerService.forceResetWorkerBatch(worker.id);
  }

  private static finalizeWorkerShutdown(
    worker: Worker,
    state?: WorkerState
  ): Promise<Worker> {
    delete worker.proxyId;
    delete worker.port;
    delete worker.profileId;
    delete worker.accountId;

    worker.status = state ?? WorkerState.SHUTDOWN;
    worker.isActive = false;

    return worker.save();
  }

  static async pauseWorker(worker: Worker) {
    worker.isActive = false;
    await RedisService.sendWorkerCommand(worker.id, { command: "pause" });
    return await worker.save();
  }

  static async continueWorker(worker: Worker) {
    worker.isActive = true;
    return await worker.save();
  }

  /**
   * Update worker batch state
   */
  public static async updateWorkerBatch(update: WorkerBatchUpdate): Promise<void> {
    try {
      const updateData: any = {};

      if (update.currentBatchSize !== undefined) {
        updateData.currentBatchSize = update.currentBatchSize;
      }

      if (update.batchStartTime !== undefined) {
        updateData.batchStartTime = update.batchStartTime;
      }

      if (update.isBatchActive !== undefined) {
        updateData.isBatchActive = update.isBatchActive;
      }

      if (update.lastResetTime !== undefined) {
        updateData.lastResetTime = update.lastResetTime;
      }

      await Worker.update(updateData, {
        where: { id: update.id },
        silent: true
      });
    } catch (error) {
      logger.error(`Error updating worker batch ${update.id}:`, error);
      throw error;
    }
  }

  public static async attachFilter(workerId: number, filterId: number) {
    const worker = await this.getWorker(workerId);
    if (!worker) throw new ApiError(400, `No worker with id: ${workerId}`);
    worker.filterId = filterId;
    return await worker.save();
  }

  public static async updateWorker(worker: Worker, updateData: Omit<WorkerUpdate, "id">): Promise<Worker> {
    const fieldsToUpdate: Partial<IWorkerAttributes> = {};

    if (updateData.isActive !== undefined) {
      fieldsToUpdate.isActive = updateData.isActive;
    }

    if (updateData.browserType !== undefined) {
      fieldsToUpdate.browserType = updateData.browserType;
    }

    if (updateData.browserCore !== undefined) {
      fieldsToUpdate.browserCore = updateData.browserCore;
    }

    if (updateData.operationSystem !== undefined) {
      fieldsToUpdate.operationSystem = updateData.operationSystem;
    }

    if (updateData.userAgent !== undefined) {
      fieldsToUpdate.userAgent = updateData.userAgent;
    }

    if (updateData.filterId !== undefined) {
      fieldsToUpdate.filterId = updateData.filterId;
    }

    await worker.update(fieldsToUpdate);

    logger.info(`Updated worker ${worker.id}`);

    return worker;
  }
}

export default WorkerService;