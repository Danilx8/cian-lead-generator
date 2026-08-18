import { useCallback, useEffect, useRef, useState } from 'react';
import { workerService } from '../api';
import { clearCache } from '../api/client';
import { subscribeWorkerStatus } from '../api/workerStatusSocket';
import { isSlotActiveStatus, isSlotRunning } from '../utils/workerState';
import type { Worker } from '../api/types';

export interface SlotsSummary {
  /** Слоты в работе (см. isSlotActiveStatus) — включая те, что ещё поднимаются. */
  active: number;
  /** Из них полностью вышедшие в ACTIVE — по ним отличаем «запущены» от «запускаются». */
  running: number;
  /**
   * Запущенные слоты: всё, кроме SHUTDOWN (см. isSlotRunning). Шире, чем active —
   * упавший слот (ERROR / BANNED / CONNECTION_LOST) сюда попадает, ведь его ещё надо остановить.
   */
  started: number;
  /** Всего слотов у пользователя. */
  total: number;
  loading: boolean;
  /** Перечитать список с бэка (кэш GET сбрасывается). minIntervalMs — не чаще, чем раз в N мс. */
  refresh: (minIntervalMs?: number) => Promise<void>;
  /** Оптимистично проставить статус — для мгновенной реакции на старт/стоп. */
  markStatuses: (workerIds: number[], status: string) => void;
}

const countSlots = (statuses: Map<number, string>) => {
  let active = 0;
  let running = 0;
  let started = 0;
  statuses.forEach((status) => {
    if (isSlotRunning(status)) started += 1;
    if (!isSlotActiveStatus(status)) return;
    active += 1;
    if (String(status).trim().toUpperCase() === 'ACTIVE') running += 1;
  });
  return { active, running, started, total: statuses.size };
};

/**
 * Сводка «активно X из Y» по слотам пользователя.
 *
 * Первичный список приходит по REST, дальше состояние живёт на сокете статусов
 * (см. workerStatusSocket): упал слот — счётчик уменьшился, поднялся — увеличился.
 *
 * Сокет — не единственный источник, потому что бэкенд рассылает НЕ всё:
 *  - нет события при создании/удалении слота → знаменатель Y меняется незаметно;
 *  - нет broadcast'а при ручной остановке, stopAll и при переходе в INITIALIZING —
 *    это закрывается оптимистичными пометками (markStatuses) и refresh'ем;
 *  - нет снапшота при join и нет replay пропущенного, а события, пришедшие когда
 *    в комнате нет подписчика, сервер просто отбрасывает → на каждый (ре)коннект
 *    список надо перечитывать;
 *  - смерть пода мимо API (OOM/eviction) не детектится вообще — слот остаётся ACTIVE
 *    и в БД, и в счётчике; фронт тут бессилен, поллинг не помогает.
 * Отсюда три подстраховки ниже: refresh на коннекте, редкая сверка и фолбэк-поллинг.
 */
export function useSlotsSummary(enabled: boolean = true): SlotsSummary {
  const statusesRef = useRef<Map<number, string>>(new Map());
  const [{ active, running, started, total }, setCounts] = useState({ active: 0, running: 0, started: 0, total: 0 });
  // Держим loading, пока не отработал первый запрос: иначе при ещё не загруженном
  // пользователе карточка успела бы мигнуть «нет слотов».
  const [loading, setLoading] = useState(true);
  const [socketConnected, setSocketConnected] = useState(false);
  const loadingRef = useRef(false);
  const lastLoadedAtRef = useRef(0);

  const syncCounts = useCallback(() => {
    setCounts((prev) => {
      const next = countSlots(statusesRef.current);
      return prev.active === next.active &&
        prev.running === next.running &&
        prev.started === next.started &&
        prev.total === next.total
        ? prev
        : next;
    });
  }, []);

  const refresh = useCallback(async (minIntervalMs: number = 0) => {
    if (loadingRef.current) return;
    // minIntervalMs — для триггеров, которые могут совпасть с только что прошедшей
    // загрузкой (коннект сокета сразу после монтирования), чтобы не делать двойной GET.
    if (minIntervalMs > 0 && performance.now() - lastLoadedAtRef.current < minIntervalMs) return;
    loadingRef.current = true;
    try {
      // Без сброса кэша GET (TTL 5с) сразу после старта/стопа вернулся бы прежний список.
      clearCache('/api/worker');
      const items = await workerService.getWorkers();
      const next = new Map<number, string>();
      (items || []).forEach((w: Worker) => {
        if (Number.isFinite(w?.id)) next.set(w.id, String(w.status ?? ''));
      });
      statusesRef.current = next;
      syncCounts();
    } catch (e) {
      // Счётчик — вспомогательная информация: молча оставляем прошлые значения,
      // ошибку загрузки покажет экран слотов.
      console.warn('Не удалось обновить сводку по слотам:', e);
    } finally {
      loadingRef.current = false;
      lastLoadedAtRef.current = performance.now();
      setLoading(false);
    }
  }, [syncCounts]);

  const markStatuses = useCallback(
    (workerIds: number[], status: string) => {
      if (!workerIds?.length) return;
      workerIds.forEach((id) => {
        const numeric = Number(id);
        if (!Number.isFinite(numeric)) return;
        // Помечаем только известные слоты: неизвестный id означает устаревший
        // список, его подтянет refresh(), а не догадка счётчика.
        if (statusesRef.current.has(numeric)) statusesRef.current.set(numeric, status);
      });
      syncCounts();
    },
    [syncCounts]
  );

  useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) return;
    return subscribeWorkerStatus({
      onStatus: ({ workerId, state }) => {
        // Статус пришёл по слоту, которого нет в списке (создан на другом устройстве) —
        // считаем список устаревшим и перечитываем его целиком.
        if (!statusesRef.current.has(workerId)) {
          void refresh();
          return;
        }
        if (statusesRef.current.get(workerId) === state) return;
        statusesRef.current.set(workerId, state);
        syncCounts();
      },
      onConnectionChange: (isConnected) => {
        setSocketConnected(isConnected);
        // Снапшота при join сервер не шлёт, а всё, что произошло без подписчика в комнате,
        // он выбрасывает — значит после каждого (ре)коннекта состояние надо перечитать.
        // Секундное окно гасит дубль GET'а, когда коннект приходит сразу за монтированием.
        if (isConnected) void refresh(1000);
      },
    });
  }, [enabled, refresh, syncCounts]);

  // Фолбэк на случай, когда сокет недоступен (ngrok / WebView без апгрейда) — как на
  // экране слотов: тихо перечитываем список.
  useEffect(() => {
    if (!enabled || socketConnected) return;
    const interval = window.setInterval(() => {
      if (document.hidden) return;
      void refresh();
    }, 15000);
    return () => window.clearInterval(interval);
  }, [enabled, socketConnected, refresh]);

  // Редкая сверка даже при живом сокете: создание и удаление слота бэкенд не рассылает,
  // так что знаменатель Y иначе разъедется (второй таб, бот, админка).
  useEffect(() => {
    if (!enabled || !socketConnected) return;
    const interval = window.setInterval(() => {
      if (document.hidden) return;
      void refresh();
    }, 60000);
    return () => window.clearInterval(interval);
  }, [enabled, socketConnected, refresh]);

  // Мини-апп надолго уходит в фон вместе с сокетом — на возврате пересобираем сводку.
  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [enabled, refresh]);

  return { active, running, started, total, loading, refresh, markStatuses };
}
