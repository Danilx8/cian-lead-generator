import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { clearCache } from "../api/client";
import { subscribeWorkerStatus } from "../api/workerStatusSocket";
import Skeleton from "../components/Skeleton";
import { useSessionListScroll } from "../hooks/useSessionListScroll";
import { persistListScroll } from "../utils/listScrollPersistence";
import { registerSlotsListFlush } from "../utils/listScrollRegistry";
import { workerService } from "../api";
import { useApiErrorHandler } from "../utils/apiErrorHandler";
import type { Worker } from "../api/types";
import SlotCard from "../components/SlotCard";
import { isSlotRunning, canShutdownSlot, mergeWorkerServerIntoLocal } from "../utils/workerState";
import { useBodyBackground } from "../hooks/useBodyBackground";
import { useAppStore } from "../store/appStore";

const SPRING_TAP = { type: "spring" as const, stiffness: 500, damping: 25 };

let slotsListSessionCache: Worker[] | null = null;

// Старт слота асинхронный: бэк ставит воркер в очередь, а в БД статус остаётся SHUTDOWN,
// пока под не поднимется. Без этого свежий GET при возврате на страницу затирал бы
// оптимистичный «В очереди» обратно на «Остановлен». Держим id запущенных слотов с
// grace-окном; запись снимается, как только придёт реальный статус (через сокет или GET).
const pendingStartIds = new Map<number, number>(); // id -> expiry timestamp (ms)
const PENDING_START_GRACE_MS = 120_000;

const pluralSlots = (n: number): string => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "слот";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "слота";
  return "слотов";
};

const normalizeWorkers = (items: Worker[]): Worker[] =>
  (items || []).map((w: Worker) => {
    const op =
      (w as any).operatorSystemId ??
      (w as any)?.operationSystem ??
      (w as any)?.operationSystemId ??
      (w as any)?.profileOptions?.operatorSystemId ??
      (w as any)?.profile?.operatorSystemId ??
      undefined;
    const platform = (w as any)?.platform ?? (w as any)?.platformName ?? undefined;
    return { ...w, operatorSystemId: op, platform } as Worker;
  });

// Пока слот в очереди на старт (бэк ещё отдаёт SHUTDOWN) — показываем «В очереди»,
// чтобы свежий GET не вернул карточку в «Остановлен» до реального старта воркера.
const applyPendingStart = (normalized: Worker[]): Worker[] => {
  const now = Date.now();
  return normalized.map((w) => {
    const id = (w as any).id as number;
    const exp = pendingStartIds.get(id);
    if (!exp) return w;
    if (exp <= now) {
      pendingStartIds.delete(id);
      return w;
    }
    const st = String((w as any).status ?? "").toUpperCase();
    if (st === "SHUTDOWN" || st === "") {
      return { ...w, status: "QUEUED" } as Worker;
    }
    // Сервер уже отдаёт реальный статус — оптимистичная пометка больше не нужна.
    pendingStartIds.delete(id);
    return w;
  });
};

const SlotsListPage: React.FC = () => {
  const navigate = useNavigate();
  const { handleError } = useApiErrorHandler();
  const notify = useAppStore((s) => s.notify);

  useBodyBackground('bg-gradient-noise');

  const [workers, setWorkers] = useState<Worker[]>(() => slotsListSessionCache ?? []);
  const [loading, setLoading] = useState(() => !(slotsListSessionCache && slotsListSessionCache.length > 0));
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [startingIds, setStartingIds] = useState<Set<number>>(new Set());
  const [stoppingIds, setStoppingIds] = useState<Set<number>>(new Set());
  const [pausingIds, setPausingIds] = useState<Set<number>>(new Set());
  const [continuingIds, setContinuingIds] = useState<Set<number>>(new Set());
  const loadingRef = useRef(false);
  // Поколение списка: бампается при массовом удалении, чтобы отбросить ответы поллинга,
  // улетевшие до него (см. refreshWorkersSilently).
  const listGenRef = useRef(0);
  // Подключён ли статус-сокет: если да (прод, тот же origin) — поллинг не нужен.
  const statusSocketConnectedRef = useRef(false);
  // Ссылка на тихое обновление списка — эффект сокета висит на [] и объявлен выше колбэка.
  const refreshSilentlyRef = useRef<(() => Promise<void>) | null>(null);

  const listScrollRef = useSessionListScroll("slots:list", !loading, workers.length);

  useEffect(() => {
    const flush = () => persistListScroll("slots:list", listScrollRef.current);
    return registerSlotsListFlush(flush);
  }, []);

  useEffect(() => {
    if (workers.length) slotsListSessionCache = workers;
  }, [workers]);

  useEffect(() => {
    let cancelled = false;

    const loadSlots = async () => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      const warm = !!(slotsListSessionCache && slotsListSessionCache.length > 0);
      if (!warm) setLoading(true);

      try {
        const items = await workerService.getWorkers();
        if (cancelled) return;

        const merged = applyPendingStart(normalizeWorkers(items || []));

        setWorkers(merged);
        slotsListSessionCache = merged;

      } catch (error) {
        if (!cancelled) {
          console.error("Ошибка при загрузке слотов:", error);
          handleError(error, "Ошибка загрузки слотов. Попробуйте обновить страницу.");
        }
      } finally {
        loadingRef.current = false;
        if (!cancelled) setLoading(false);
      }
    };

    loadSlots();
    return () => {
      cancelled = true;
    };
  }, []);

  // Сокет статусов: при открытии экрана подписываемся, при смене статуса слота —
  // обновляем карточки визуально, при закрытии — отписываемся. Само соединение и
  // разбор события живут в workerStatusSocket (тот же сокет использует счётчик на главной).
  useEffect(() => {
    return subscribeWorkerStatus({
      onStatus: ({ workerId: id, state }) => {
        // Пришёл реальный статус — оптимистичная пометка «в очереди» больше не нужна.
        pendingStartIds.delete(id);

        setWorkers((prev) => {
          let changed = false;
          const next = prev.map((p) => {
            if ((p as any).id !== id || (p as any).status === state) return p;
            changed = true;
            return { ...p, status: state };
          });
          if (changed) slotsListSessionCache = next;
          return changed ? next : prev;
        });
      },
      onConnectionChange: (connected) => {
        statusSocketConnectedRef.current = connected;
        // Снапшот при join сервер не шлёт, а события без подписчика в комнате выбрасывает.
        // Значит всё, что случилось за время простоя соединения, мы пропустили — перечитываем.
        if (connected) void refreshSilentlyRef.current?.();
      },
    });
  }, []);

  // Тихое фоновое обновление списка (без индикатора загрузки). Чистим кэш GET,
  // иначе 30-сек TTL отдавал бы устаревший статус.
  const refreshWorkersSilently = useCallback(async () => {
    // Поллинг может стартовать до массового удаления, а ответить — уже после него,
    // вернув в список только что удалённые слоты. Поколение бампается на bulk-операциях:
    // если оно сменилось, пока летел GET, результат устарел и мы его выбрасываем.
    const gen = listGenRef.current;
    try {
      clearCache("/api/worker");
      const items = await workerService.getWorkers();
      if (listGenRef.current !== gen) return;
      const merged = applyPendingStart(normalizeWorkers(items || []));
      setWorkers(merged);
      slotsListSessionCache = merged;
    } catch {
      /* фоновый поллинг — ошибки глотаем */
    }
  }, []);

  refreshSilentlyRef.current = refreshWorkersSilently;

  // Поллинг-фолбэк: пока есть хоть один НЕ остановленный слот (или только что запущенный),
  // тихо обновляем список — статус едет живьём даже без сокета (ngrok/WebView).
  // Любой работающий слот может в любой момент сменить статус (ACTIVE → CONNECTION_LOST,
  // → SHUTDOWN и т.п.), поэтому поллим, пока есть незавершённые слоты. Когда все SHUTDOWN —
  // поллинг останавливается. Если статус-сокет реально подключён (прод) — поллинг пропускаем.
  useEffect(() => {
    const needsPolling =
      pendingStartIds.size > 0 ||
      workers.some((w) => isSlotRunning((w as any).status));

    if (!needsPolling) return;

    const interval = window.setInterval(() => {
      if (document.hidden || statusSocketConnectedRef.current) return;
      refreshWorkersSilently();
    }, 3000);

    return () => window.clearInterval(interval);
  }, [workers, refreshWorkersSilently]);

  const handleOpen = (w: Worker) => {
    persistListScroll("slots:list", listScrollRef.current, (w as any).id as number);
    navigate(`/slots/${(w as any).id}/logs`);
  };

  const handleEdit = (w: Worker) => {
    persistListScroll("slots:list", listScrollRef.current, (w as any).id as number);
    const id = (w as any).id as number;
    navigate(`/slots/${id}/edit`, { state: { worker: w } });
  };

  const requestDelete = (w: Worker) => setConfirmId(String((w as any).id));
  const cancelDelete = () => setConfirmId(null);

  const confirmDelete = async () => {
    if (!confirmId) return;

    setDeletingId(confirmId);
    try {
      await workerService.deleteWorker(Number(confirmId));
      setWorkers((prev) => {
        const next = prev.filter((w) => String((w as any).id) !== confirmId);
        slotsListSessionCache = next;
        return next;
      });
    } catch (error) {
      console.error("Ошибка удаления слота", error);
      handleError(error, "Не удалось удалить слот");
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  };

  // DELETE /api/worker/ — бэк сначала гасит живые слоты, потом удаляет каждый,
  // и только затем отвечает 200. Ответ частичный: часть слотов может попасть в failed,
  // поэтому список не чистим вслепую, а перечитываем с сервера.
  const confirmDeleteAllSlots = async () => {
    if (deletingAll) return;

    setDeletingAll(true);
    try {
      const res = await workerService.deleteAll();
      const deleted = res.deleted?.length ?? 0;
      const failed = res.failed?.length ?? 0;

      // Слоты удалены — оптимистичные пометки старта больше не про кого.
      pendingStartIds.clear();
      listGenRef.current += 1;
      setWorkers([]);
      slotsListSessionCache = null;

      const parts = [`Удалено: ${deleted}`];
      if (failed) parts.push(`с ошибкой: ${failed}`);
      notify(parts.join(", "), failed ? "error" : "success");

      // Список кэшируется в client.ts на 30 сек — без сброса следующий GET отдал бы удалённые.
      clearCache("/api/worker");
      if (failed) await refreshWorkersSilently();
    } catch (error) {
      console.error("Ошибка удаления всех слотов", error);
      handleError(error, "Не удалось удалить слоты");
      await refreshWorkersSilently();
    } finally {
      setDeletingAll(false);
      setConfirmDeleteAll(false);
    }
  };

  const handleStartWorker = async (w: Worker) => {
    const id = (w as any).id as number;
    const status = (w as any).status as string | undefined;

    if (startingIds.has(id) || isSlotRunning(status)) return;

    // Старт асинхронный — держим оптимистичную пометку, чтобы переход между
    // страницами не вернул слот в «Остановлен», пока воркер ещё в очереди.
    pendingStartIds.set(id, Date.now() + PENDING_START_GRACE_MS);

    setStartingIds((prev) => new Set(prev).add(id));
    try {
      const updated = await workerService.startWorker(id);

      setWorkers((prev) =>
        prev.map((p) =>
          (p as any).id === id
            ? {
              ...p,
              status: (updated as any).status || "INITIALIZING",
              isActive: (updated as any).isActive ?? true,
              operatorSystemId:
                (updated as any).operatorSystemId ??
                (updated as any)?.operationSystem ??
                (updated as any)?.operationSystemId ??
                (updated as any)?.profileOptions?.operatorSystemId ??
                (p as any).operatorSystemId,
            }
            : p
        )
      );
    } catch (error) {
      // Старт не прошёл — убираем оптимистичную пометку.
      pendingStartIds.delete(id);
      console.error("Ошибка запуска слота", error);
      handleError(error, `Не удалось запустить слот #${id}`);
    } finally {
      setStartingIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    }
  };

  const handleShutdownWorker = async (w: Worker) => {
    const id = (w as any).id as number;
    const status = (w as any).status as string | undefined;

    if (stoppingIds.has(id) || !canShutdownSlot(status)) return;

    // Пользователь явно остановил слот — снимаем оптимистичную пометку старта.
    pendingStartIds.delete(id);

    setStoppingIds((prev) => new Set(prev).add(id));
    try {
      const updated = await workerService.shutdownWorker(id);

      setWorkers((prev) =>
        prev.map((p) =>
          (p as any).id === id
            ? {
              ...p,
              status: (updated as any).status || "SHUTDOWN",
              isActive: (updated as any).isActive ?? false,
              operatorSystemId:
                (updated as any).operatorSystemId ??
                (updated as any)?.operationSystem ??
                (updated as any)?.operationSystemId ??
                (updated as any)?.profileOptions?.operatorSystemId ??
                (p as any).operatorSystemId,
            }
            : p
        )
      );
    } catch (error) {
      console.error("Ошибка остановки слота", error);
      handleError(error, `Не удалось остановить слот #${id}`);
    } finally {
      setStoppingIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    }
  };

  const mergeWorkerFromServer = (updated: Worker) => {
    setWorkers((prev) =>
      prev.map((p) =>
        (p as any).id === (updated as any).id ? mergeWorkerServerIntoLocal(p, updated) : p
      )
    );
  };

  const handlePauseWorker = async (w: Worker) => {
    const id = (w as any).id as number;
    const status = (w as any).status as string | undefined;
    const isActive = Boolean((w as any).isActive);

    if ((status || "").trim().toUpperCase() !== "ACTIVE" || pausingIds.has(id) || !isActive) return;

    setPausingIds((prev) => new Set(prev).add(id));
    try {
      const updated = await workerService.pauseWorker(id);

      setWorkers((prev) =>
        prev.map((p) =>
          (p as any).id === id
            ? {
              ...p,
              isActive: (updated as any).isActive ?? false,
            }
            : p
        )
      );
    } catch (error) {
      console.error("Ошибка паузы воркера", error);
      handleError(error, `Не удалось поставить на паузу отписки у слота #${id}`);
    } finally {
      setPausingIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    }
  };

  const handleContinueWorker = async (w: Worker) => {
    const id = (w as any).id as number;
    const status = (w as any).status as string | undefined;
    const isActive = Boolean((w as any).isActive);

    if ((status || "").trim().toUpperCase() !== "ACTIVE" || continuingIds.has(id) || isActive) return;

    setContinuingIds((prev) => new Set(prev).add(id));
    try {
      const updated = await workerService.continueWorker(id);

      setWorkers((prev) =>
        prev.map((p) =>
          (p as any).id === id
            ? {
              ...p,
              isActive: (updated as any).isActive ?? true,
            }
            : p
        )
      );
    } catch (error) {
      console.error("Ошибка продолжения воркера", error);
      handleError(error, `Не удалось продолжить отписки у слота #${id}`);
    } finally {
      setContinuingIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    }
  };

  return (
    <div className="min-h-screen pt-safe">
      <div
        ref={listScrollRef}
        className="px-4 pt-4 pb-44"
      >
        {/* Header — settings-style */}
        <div className="flex items-start gap-3 mb-5">
          <div className="w-9 h-9 shrink-0">
            <motion.button
              type="button"
              onClick={() => navigate('/')}
              whileTap={{ scale: 0.9 }}
              transition={SPRING_TAP}
              className="w-9 h-9 rounded-full flex items-center justify-center text-white glass-border-light"
              style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(20px) saturate(1.2)', WebkitBackdropFilter: 'blur(20px) saturate(1.2)' }}
              aria-label="Назад"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </motion.button>
          </div>
          <div className="min-w-0">
            <h1 className="text-white text-[28px] font-bold leading-[34px]">Слоты</h1>
            {!loading && workers.length > 0 && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[12px] font-medium text-white/30">
                  {workers.length} {pluralSlots(workers.length)}
                </span>
                <span className="text-[12px] text-white/20">·</span>
                <motion.button
                  type="button"
                  onClick={() => setConfirmDeleteAll(true)}
                  disabled={deletingAll}
                  whileTap={{ scale: 0.92 }}
                  transition={SPRING_TAP}
                  className="text-[12px] font-medium text-white hover:text-red-400 disabled:opacity-40 transition-colors"
                >
                  {deletingAll ? "Удаление…" : "Удалить все"}
                </motion.button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {loading && workers.length === 0 ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="glass glass-border-light rounded-[24px] p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <Skeleton width={80} height={22} className="rounded-full" />
                    <Skeleton width="35%" height={18} className="rounded-md" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton width="65%" height={14} className="rounded-md" />
                    <Skeleton width="45%" height={14} className="rounded-md" />
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Skeleton width={80} height={36} className="rounded-xl" />
                    <Skeleton width={80} height={36} className="rounded-xl" />
                    <Skeleton width={80} height={36} className="rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            workers.map((w) => (
              <div key={(w as any).id} data-scroll-anchor={(w as any).id}>
                <SlotCard
                  worker={w}
                  onOpen={() => handleOpen(w)}
                  onEdit={() => handleEdit(w)}
                  onDelete={() => requestDelete(w)}
                  onStart={() => handleStartWorker(w)}
                  onShutdown={() => handleShutdownWorker(w)}
                  onPause={() => handlePauseWorker(w)}
                  onContinue={() => handleContinueWorker(w)}
                  starting={startingIds.has((w as any).id)}
                  stopping={stoppingIds.has((w as any).id)}
                  pausing={pausingIds.has((w as any).id)}
                  continuing={continuingIds.has((w as any).id)}
                  deleting={deletingId === String((w as any).id)}
                  onWorkerUpdated={mergeWorkerFromServer}
                />
              </div>
            ))
          )}
          {!loading && workers.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 glass glass-border-light rounded-[24px] flex items-center justify-center mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" stroke="rgba(11,36,48,0.25)" strokeWidth="1.5"/><path d="M8 12h8M12 8v8" stroke="rgba(11,36,48,0.25)" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </div>
              <p className="text-white/45 text-[15px] font-medium mb-1">Нет слотов</p>
              <p className="text-white/25 text-sm mb-4">Создайте первый слот для начала работы</p>
              <Link
                to="/slots/new"
                className="h-9 px-5 rounded-[24px] glass-border-light inline-flex items-center text-sm font-semibold"
                style={{
                  background: 'rgba(0,174,239,0.10)',
                  backdropFilter: 'blur(24px) saturate(1.3)',
                  WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
                  color: '#00AEEF',
                }}
              >
                + Добавить
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Fixed bottom button — only when slots exist */}
      {!loading && workers.length > 0 && (
        <div className="fixed left-0 right-0 bottom-0 z-40 pointer-events-none">
          <div
            style={{
              background: 'linear-gradient(to top, rgba(245,250,253,1) 0%, rgba(245,250,253,0.85) 40%, rgba(245,250,253,0.4) 75%, transparent 100%)',
              paddingTop: '48px',
              paddingBottom: 'calc(var(--safe-area-inset-bottom, 0px) + 16px)',
            }}
            className="px-4"
          >
            <div className="pointer-events-auto">
              <Link to="/slots/new" className="block">
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  transition={SPRING_TAP}
                  className="w-full h-[52px] rounded-[24px] text-accent text-[15px] font-semibold glass-border-light"
                  style={{
                    background: 'rgba(0,174,239,0.10)',
                    backdropFilter: 'blur(24px) saturate(1.3)',
                    WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
                  }}
                >
                  + Добавить слот
                </motion.button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div
            className="w-full max-w-sm glass-border-light rounded-[24px] p-5"
            style={{
              background: 'rgba(255,255,255,0.6)',
              backdropFilter: 'blur(24px) saturate(1.3)',
              WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
            }}
          >
            <h2 className="text-white text-lg font-semibold mb-2">Удалить слот?</h2>
            <p className="text-white/70 text-sm mb-5">Слот #{confirmId} будет остановлен и удалён без возможности восстановления.</p>
            <div className="flex gap-3">
              <motion.button
                onClick={cancelDelete}
                disabled={deletingId !== null}
                whileTap={{ scale: 0.96 }}
                transition={SPRING_TAP}
                className="flex-1 py-3 rounded-[20px] glass glass-border-light text-white font-medium disabled:opacity-40"
              >
                Отмена
              </motion.button>
              <motion.button
                onClick={confirmDelete}
                disabled={deletingId !== null}
                whileTap={{ scale: 0.96 }}
                transition={SPRING_TAP}
                className="flex-1 py-3 rounded-[20px] bg-red-500/80 text-white font-semibold disabled:opacity-50"
              >
                {deletingId ? "Удаление..." : "Удалить"}
              </motion.button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteAll && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div
            className="w-full max-w-sm glass-border-light rounded-[24px] p-5"
            style={{
              background: 'rgba(255,255,255,0.6)',
              backdropFilter: 'blur(24px) saturate(1.3)',
              WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
            }}
          >
            <h2 className="text-white text-lg font-semibold mb-2">Удалить все слоты?</h2>
            <p className="text-white/70 text-sm mb-5">
              Будет остановлено и удалено {workers.length} шт. без возможности восстановления.
            </p>
            <div className="flex gap-3">
              <motion.button
                onClick={() => setConfirmDeleteAll(false)}
                disabled={deletingAll}
                whileTap={{ scale: 0.96 }}
                transition={SPRING_TAP}
                className="flex-1 py-3 rounded-[20px] glass glass-border-light text-white font-medium disabled:opacity-40"
              >
                Отмена
              </motion.button>
              <motion.button
                onClick={confirmDeleteAllSlots}
                disabled={deletingAll}
                whileTap={{ scale: 0.96 }}
                transition={SPRING_TAP}
                className="flex-1 py-3 rounded-[20px] bg-red-500/80 text-white font-semibold disabled:opacity-50"
              >
                {deletingAll ? "Удаление..." : "Удалить все"}
              </motion.button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SlotsListPage;
