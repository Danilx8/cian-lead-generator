import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import FastStartIcon from '@img/fast-start.svg?react';
import { useAppStore } from '../store/appStore';
import { templateService, workerService } from '../api';
import type { GetTemplatesResponse, Template } from '../api/types';
import { useApiErrorHandler } from '../utils/apiErrorHandler';
import { useBodyBackground } from '../hooks/useBodyBackground';
import { useSlotsSummary } from '../hooks/useSlotsSummary';
import QuickCards from "../components/QuickCards";
import ExtendedChart from '../components/charts/ExtendedChart';
import StatsChart from '../components/charts/StatsChart';
import Skeleton from '../components/Skeleton';

const SPRING_TAP = { type: "spring" as const, stiffness: 500, damping: 25 };
/** Смена состояния кнопки «Старт ⇄ Стоп»: цвет и подпись едут одной пружиной. */
const SPRING_MODE = { type: "spring" as const, stiffness: 350, damping: 28, mass: 0.8 };

// Подпись всегда тёмная — состояние кнопки читается по фону и иконке.
const TOGGLE_FG = '#0B2430';
const TOGGLE_FG_BUSY = 'rgba(11, 36, 48, 0.4)';

const TOGGLE_STYLE = {
  start: { bg: 'rgba(0, 174, 239, 0.10)', bgBusy: 'rgba(0, 174, 239, 0.05)' },
  stop: { bg: 'rgba(255, 69, 58, 0.12)', bgBusy: 'rgba(255, 69, 58, 0.06)' },
} as const;

/** Стоп — пара к FastStartIcon (play в кружке). Тот внутри растровый PNG, поэтому
 *  геометрия снята с него замером альфа-канала и viewBox взят такой же (26), чтобы
 *  значения совпадали 1:1: кружок r=10.84 при обводке 1.68, глиф по высоте 7.52–18.43. */
const StopIcon: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className, style }) => (
  <svg className={className} viewBox="0 0 26 26" fill="none" aria-hidden="true" style={style}>
    <circle cx="13" cy="13" r="10.84" stroke="#0B2430" strokeWidth="1.68" />
    <rect x="10" y="7.52" width="1.68" height="10.91" rx="0.84" fill="#0B2430" />
    <rect x="14.32" y="7.52" width="1.68" height="10.91" rx="0.84" fill="#0B2430" />
  </svg>
);

const HomePage: React.FC = () => {
  const {
    user,
    templates, setTemplates,
    addNotification,
  } = useAppStore();

  const { handleError } = useApiErrorHandler();

  const [templatesLoading, setTemplatesLoading] = useState(() => templates.length === 0);
  const [startingAll, setStartingAll] = useState(false);
  const [stoppingAll, setStoppingAll] = useState(false);

  // Сводка «активно X/Y» для карточки слотов: REST на старте + сокет статусов.
  const slots = useSlotsSummary(!!user);

  useEffect(() => {
    if (!user) return;
    if (templates.length > 0) {
      setTemplatesLoading(false);
      return;
    }
    let cancelled = false;
    const loadTemplates = async () => {
      try {
        setTemplatesLoading(true);
        const templatesData = await templateService.getUserTemplates();
        if (cancelled) return;
        let list: Template[] = [];
        if (Array.isArray((templatesData as GetTemplatesResponse).templates)) {
          list = (templatesData as GetTemplatesResponse).templates;
        } else if (Array.isArray(templatesData as unknown as Template[])) {
          list = templatesData as unknown as Template[];
        }
        setTemplates(list || []);
      } catch (error) {
        if (!cancelled) {
          handleError(error, 'Ошибка загрузки шаблонов. Попробуйте обновить страницу.');
        }
      } finally {
        if (!cancelled) setTemplatesLoading(false);
      }
    };
    loadTemplates();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleStart = async () => {
    if (startingAll) return;
    setStartingAll(true);
    try {
      const res = await workerService.startAll();
      const queued = res.queued?.length || 0;
      const already = (res.skipped?.length || 0) + (res.duplicatePending?.length || 0);
      const message = already ? `Запущено: ${queued}, уже в работе: ${already}` : `Запущено: ${queued}`;
      addNotification?.({ id: `start-all-${Date.now()}`, message, type: 'success', timestamp: Date.now() });
      // Старт асинхронный (202): в БД статус ещё SHUTDOWN, реальный придёт по сокету.
      // Помечаем поставленные в очередь сразу, чтобы счётчик отреагировал на нажатие.
      slots.markStatuses(res.queued ?? [], 'QUEUED');
    } catch (e) {
      console.error('Start all workers failed', e);
      addNotification?.({ id: `start-all-err-${Date.now()}`, message: 'Ошибка запуска всех слотов', type: 'error', timestamp: Date.now() });
    } finally {
      setStartingAll(false);
    }
  };

  const handleStop = async () => {
    if (stoppingAll) return;
    setStoppingAll(true);
    try {
      const res = await workerService.stopAll();
      const stopped = res.stopped?.length || 0;
      const skipped = res.skipped?.length || 0;
      const failed = res.failed?.length || 0;
      const parts = [`Остановлено: ${stopped}`];
      if (skipped) parts.push(`уже не в работе: ${skipped}`);
      if (failed) parts.push(`с ошибкой: ${failed}`);
      addNotification?.({ id: `stop-all-${Date.now()}`, message: parts.join(', '), type: failed ? 'error' : 'success', timestamp: Date.now() });
      // stopAll отвечает уже ПОСЛЕ фактической остановки — список можно перечитать.
      void slots.refresh();
    } catch (e) {
      console.error('Stop all workers failed', e);
      addNotification?.({ id: `stop-all-err-${Date.now()}`, message: 'Ошибка остановки всех слотов', type: 'error', timestamp: Date.now() });
    } finally {
      setStoppingAll(false);
    }
  };

  useBodyBackground('bg-gradient-noise');

  // Одна кнопка на два действия. Не запущен — только статус SHUTDOWN, всё остальное
  // считается запущенным (отсюда started, а не active: упавший слот тоже надо остановить).
  // Счётчик во время запроса не меняется — markStatuses / refresh вызываются уже после
  // ответа, так что кнопка держит нажатое состояние до конца операции и только потом
  // переключается, без промежуточного моргания.
  const busy = startingAll || stoppingAll;
  const toggleMode: 'start' | 'stop' = slots.started > 0 ? 'stop' : 'start';
  const toggleStyle = TOGGLE_STYLE[toggleMode];
  const toggleLabel = startingAll
    ? 'Запуск...'
    : stoppingAll
      ? 'Остановка...'
      : toggleMode === 'stop'
        ? 'Стоп'
        : 'Старт';

  return (
    <div className="min-h-screen pt-safe">
      {/* Ambient floating light orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
        <div className="ambient-orb ambient-orb--accent" />
        <div className="ambient-orb ambient-orb--blue" />
        <div className="ambient-orb ambient-orb--accent-low" />
      </div>

      <div className="relative z-[1] p-4 pb-32 pt-4">
        <QuickCards
          templates={templates}
          isLoading={templatesLoading}
          slots={{ active: slots.active, running: slots.running, total: slots.total, loading: slots.loading }}
        />

        {templatesLoading ? (
          <div className="mb-5">
            <Skeleton className="w-full h-[52px] rounded-[20px]" variant="rectangular" />
          </div>
        ) : (
          <div className="mb-5">
            <motion.button
              onClick={toggleMode === 'stop' ? handleStop : handleStart}
              disabled={busy}
              aria-label={toggleMode === 'stop' ? 'Остановить все слоты' : 'Запустить все слоты'}
              whileTap={{ scale: 0.96 }}
              // Без initial={false} цвет на маунте поехал бы от прозрачного.
              initial={false}
              animate={{
                backgroundColor: busy ? toggleStyle.bgBusy : toggleStyle.bg,
                color: busy ? TOGGLE_FG_BUSY : TOGGLE_FG,
              }}
              transition={{ ...SPRING_MODE, scale: SPRING_TAP }}
              className="w-full h-[52px] rounded-[20px] flex items-center justify-center gap-2 font-inter text-base font-semibold glass-border-light overflow-hidden"
              style={{
                backdropFilter: 'blur(24px) saturate(1.3)',
                WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
              }}
            >
              {/* Иконка и подпись меняются вместе — крутим их как одно целое, иначе
                  на смене состояния play успевает уехать раньше текста. */}
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={toggleMode}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={SPRING_MODE}
                  className="flex items-center justify-center gap-2 min-w-0"
                >
                  {toggleMode === 'stop' ? (
                    <StopIcon className="w-6 h-6 shrink-0" style={{ opacity: busy ? 0.4 : 0.9 }} />
                  ) : (
                    <FastStartIcon className="w-6 h-6 shrink-0" style={{ filter: 'brightness(0)', opacity: busy ? 0.4 : 0.9 }} />
                  )}
                  <span className="truncate">{toggleLabel}</span>
                </motion.span>
              </AnimatePresence>
            </motion.button>
          </div>
        )}

        <div className="mb-5">
          <StatsChart changePercent="7,5%" isPositive={true} isLoading={templatesLoading} />
        </div>

        <div className="mt-5">
          <ExtendedChart changePercent="2,4%" isPositive={false} isLoading={templatesLoading} />
        </div>

      </div>
    </div>
  );
};

export default HomePage;