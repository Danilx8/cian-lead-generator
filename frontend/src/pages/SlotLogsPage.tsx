import React, { useCallback, useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react';
import { motion } from 'framer-motion';
import { io, Socket } from 'socket.io-client';
import { Link, useLocation, useParams } from 'react-router-dom';
import { workerService } from '../api';
import { clearCache } from '../api/client';
import { useBodyBackground } from '../hooks/useBodyBackground';

interface LogEvent {
  id: string;
  ts: string;
  text: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  direction: 'system';
}

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

const levelConfig: Record<LogLevel, { tint: string; textClass: string }> = {
  info: { tint: 'rgba(255,255,255,0.06)', textClass: 'text-white' },
  warn: { tint: 'rgba(234,179,8,0.08)', textClass: 'text-yellow-300' },
  error: { tint: 'rgba(239,68,68,0.08)', textClass: 'text-red-300' },
  debug: { tint: 'rgba(255,255,255,0.03)', textClass: 'text-white/50' },
};

const LogBubble: React.FC<{ ev: LogEvent }> = React.memo(({ ev }) => {
  const { tint, textClass } = levelConfig[ev.level];
  return (
    <div className="flex justify-start">
      <div
        className="max-w-[80%] whitespace-pre-line relative glass-border-light rounded-[16px]"
        style={{
          paddingLeft: 12, paddingRight: 12, paddingTop: 10, paddingBottom: 10,
          background: tint,
          backdropFilter: 'blur(24px) saturate(180%) brightness(1.08)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%) brightness(1.08)',
        }}
      >
        <div className={`text-[14px] leading-snug whitespace-pre-wrap break-words select-text ${textClass}`}>{ev.text}</div>
      </div>
    </div>
  );
});
LogBubble.displayName = 'LogBubble';

const SPRING_TAP = { type: 'spring' as const, stiffness: 500, damping: 25 };

const glassStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  backdropFilter: 'blur(24px) saturate(180%) brightness(1.08)',
  WebkitBackdropFilter: 'blur(24px) saturate(180%) brightness(1.08)',
};

const glassInputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  backdropFilter: 'blur(20px) saturate(1.2)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
};

const SlotLogsPage: React.FC = () => {
  const { id } = useParams();
  const location = useLocation();
  const slotId = id as string;
  const backTo =
    (location.state as { adminBackTo?: string } | null | undefined)?.adminBackTo ?? '/slots';

  useBodyBackground('bg-gradient-noise');

  const [items, setItems] = useState<LogEvent[]>([]);
  const [unread, setUnread] = useState(0);
  const [query, setQuery] = useState('');

  // Сырые строки логов, уже показанные на экране — для append-only диффа при поллинге.
  const rawLinesRef = useRef<string[]>([]);
  // Подключён ли лог-сокет: если да — поллинг пропускаем, чтобы не дублировать строки.
  const socketConnectedRef = useRef(false);

  const formatLogMessage = useCallback((text: string): string => {
    const stateChangeMatch = text.match(/Воркер (\d+) сменил состояние: (\w+) -> (\w+)/);
    if (stateChangeMatch) {
      const [, workerId, fromState, toState] = stateChangeMatch;
      return `🔄 Воркер ${workerId}: ${fromState} → ${toState}`;
    }

    if (text.includes('успешно запущен') || text.includes('готов работать')) {
      return `✅ ${text}`;
    }

    if (text.includes('Ошибка') || text.includes('error') || text.includes('Error')) {
      return `❌ ${text}`;
    }

    if (text.includes('предупреждение') || text.includes('warning') || text.includes('Warning')) {
      return `⚠️ ${text}`;
    }

    if (text.includes('Не получилось найти диалога')) {
      return `🔍 ${text}`;
    }

    if (text.includes('написании сообщения')) {
      return `✏️ ${text}`;
    }

    return text;
  }, []);

  const parseLine = useCallback((line: string, idx?: number): LogEvent => {
    const timeMatch = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}):(\d{2,3})/);
    const levelMatch = line.match(/\b(info|error|warn|debug)\b:?\s*/i);

    let parsedTime = new Date().toISOString();
    let cleanText = line.trim();

    if (timeMatch) {
      const utcTimeStr = timeMatch[1];
      const utcDate = new Date(utcTimeStr + 'Z');
      parsedTime = utcDate.toISOString();

      cleanText = line.replace(timeMatch[0], '').trim();
    }

    if (levelMatch) {
      cleanText = cleanText.replace(levelMatch[0], '').trim();
    }

    cleanText = formatLogMessage(cleanText);

    const level = (levelMatch?.[1]?.toLowerCase() || 'info') as LogLevel;

    return {
      id: `${Date.now()}-${idx ?? Math.random()}`,
      ts: parsedTime,
      text: cleanText,
      level,
      direction: 'system'
    };
  }, [formatLogMessage]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await workerService.getLogs(Number(slotId));
        if (cancelled) return;
        const lines = (res.logs || '').split(/\r?\n/).filter((l: string) => l.trim().length > 0);
        const parsed: LogEvent[] = lines.map((line: string, idx: number) => parseLine(line, idx));
        rawLinesRef.current = lines;
        setItems(parsed);
      } catch (e) {
        console.error('Ошибка загрузки логов воркера:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [slotId, parseLine]);

  useEffect(() => {
    if (!slotId) return;
    let active = true;
    let socket: Socket | null = null;
    let connectionTimeout: ReturnType<typeof setTimeout> | undefined;
    // Чтобы не спамить полной HTTP-перезагрузкой на каждой ретрай-попытке сокета —
    // фолбэк-снапшот грузим один раз (на успехе), а его лог печатаем один раз.
    // Дальше живое обновление несёт append-поллинг.
    let httpFallbackLoaded = false;
    let connectErrorLogged = false;

    const loadLogsViaHttp = async () => {
      if (httpFallbackLoaded) return;
      try {
        const response = await workerService.getLogs(Number(slotId));
        const lines = (response.logs || '').split(/\r?\n/).filter((l: string) => l.trim().length > 0);
        const parsed: LogEvent[] = lines.map((line: string, idx: number) => parseLine(line, idx));

        if (active) {
          httpFallbackLoaded = true;
          rawLinesRef.current = lines;
          setItems(parsed);
          console.log('✅ Логи загружены через HTTP:', parsed.length);
        }
      } catch (error) {
        console.error('❌ Ошибка загрузки логов через HTTP:', error);
        if (active) {
          (async () => {
            const { useAppStore } = await import('../store/appStore');
            useAppStore.getState().addNotification({
              id: Date.now().toString(),
              message: 'Не удалось загрузить логи слота',
              type: 'error',
              timestamp: Date.now()
            });
          })();
        }
      }
    };

    (async () => {
      try {
        const userId = localStorage.getItem('userId');
        if (!userId) {
          console.warn('Нет userId для подключения к логам');
          const { useAppStore } = await import('../store/appStore');
          useAppStore.getState().addNotification({
            id: Date.now().toString(),
            message: 'Нет данных авторизации для подключения к логам',
            type: 'error',
            timestamp: Date.now()
          });
          loadLogsViaHttp();
          return;
        }

        console.log('🔌 Подключаемся к логам слота:', slotId);

        socket = io(`${window.location.origin.replace(/\/$/, '')}/logs`, {
          withCredentials: true,
          path: '/socket.io',
          timeout: 10000,
          transports: ['polling'],
          upgrade: false,
          // Где сокет недоступен (ngrok/WebView) — не долбимся бесконечно: логи несёт поллинг.
          reconnectionAttempts: 3,
        });

        connectionTimeout = setTimeout(() => {
          if (socket && !socket.connected) {
            console.warn('⚠️ Таймаут подключения к WebSocket логов');
            socket.disconnect();

            loadLogsViaHttp();
          }
        }, 15000);

        socket.on('connect', () => {
          console.log('✅ Подключен к WebSocket логов слота');
          socketConnectedRef.current = true;
          if (connectionTimeout) clearTimeout(connectionTimeout);
          socket?.emit('join', String(userId), String(slotId));
        });

        socket.on('connect_error', (error) => {
          socketConnectedRef.current = false;
          if (connectionTimeout) clearTimeout(connectionTimeout);
          if (!connectErrorLogged) {
            connectErrorLogged = true;
            console.warn('⚠️ Лог-сокет недоступен, логи обновляются поллингом:', error?.message ?? error);
          }
          loadLogsViaHttp();
        });

        socket.on('log', (line: string) => {
          if (!active || !line) return;
          console.log('📝 Получен лог через WebSocket:', line);

          // Держим сырые строки в синхроне, чтобы поллинг-дифф был корректным,
          // если сокет потом отвалится.
          rawLinesRef.current = [...rawLinesRef.current, line];

          setItems(prev => {
            const ev = parseLine(line);
            const atBottom = (() => {
              const el = scrollerRef.current; if (!el) return true;
              return el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_EPS;
            })();
            const next = [...prev, ev];
            if (atBottom) {
              pendingStickToBottomRef.current = true;
            } else {
              setUnread(u => u + 1);
            }
            return next;
          });
        });

        socket.on('disconnect', (reason) => {
          console.log('🔌 WebSocket логов отключен:', reason);
          socketConnectedRef.current = false;
        });

        socket.on('error', (msg: unknown) => {
          console.warn('[log stream error]', msg);
        });

      } catch (e) {
        console.error('💥 Критическая ошибка WebSocket логов:', e);
        if (connectionTimeout) clearTimeout(connectionTimeout);
        loadLogsViaHttp();
      }
    })();

    return () => {
      active = false;
      if (connectionTimeout) clearTimeout(connectionTimeout);
      try { socket?.disconnect(); } catch { /* noop */ }
    };
  }, [slotId, parseLine]);

  const BOTTOM_EPS = 12;
  const listRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const bottomVisibleRef = useRef(false);
  const didInitialScrollRef = useRef(false);
  const pendingStickToBottomRef = useRef(false);

  // Append-only реконсиляция полного текста логов с уже показанными строками.
  // Логи пода append-only: если новый список начинается с уже показанного — дописываем
  // только хвост (сохраняя скролл/непрочитанные). Иначе (ротация/сброс) — пересобираем.
  const reconcileLogText = useCallback((text: string) => {
    const lines = (text || '').split(/\r?\n/).filter((l) => l.trim().length > 0);
    const prev = rawLinesRef.current;

    let isPrefix = lines.length >= prev.length;
    if (isPrefix) {
      for (let i = 0; i < prev.length; i++) {
        if (prev[i] !== lines[i]) { isPrefix = false; break; }
      }
    }

    if (!isPrefix) {
      rawLinesRef.current = lines;
      setItems(lines.map((line, idx) => parseLine(line, idx)));
      return;
    }

    const tail = lines.slice(prev.length);
    if (tail.length === 0) return;

    const startIdx = prev.length;
    rawLinesRef.current = lines;
    const parsed = tail.map((line, i) => parseLine(line, startIdx + i));

    const el = scrollerRef.current;
    const atBottom = !el || el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_EPS;
    if (atBottom) pendingStickToBottomRef.current = true;
    else setUnread((u) => u + tail.length);

    setItems((curr) => [...curr, ...parsed]);
  }, [parseLine]);

  // Поллинг логов — фолбэк, когда лог-сокет недоступен (ngrok/WebView).
  // Пока сокет не подключён и вкладка активна, подтягиваем свежие логи раз в 4 сек
  // и дописываем новые строки. Единичные 500 от эндпоинта логов просто пропускаем.
  useEffect(() => {
    if (!slotId) return;
    const interval = window.setInterval(async () => {
      if (document.hidden || socketConnectedRef.current) return;
      try {
        clearCache(`/api/worker/logs/${slotId}`);
        const res = await workerService.getLogs(Number(slotId));
        reconcileLogText(res.logs || '');
      } catch {
        /* единичная ошибка эндпоинта — пропускаем тик */
      }
    }, 4000);
    return () => window.clearInterval(interval);
  }, [slotId, reconcileLogText]);

  const scrollToBottom = useCallback((opts?: { force?: boolean; smooth?: boolean }) => {
    const el = scrollerRef.current;
    const bottom = bottomRef.current;
    if (!el || !bottom) return;
    const { force = false, smooth = false } = opts || {};

    if (!force) {
      const atBottomNow = el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_EPS;
      if (!atBottomNow) return;
    }

    const target = el.scrollHeight - el.clientHeight;

    const doImmediate = () => {
      try { bottom.scrollIntoView(); } catch { }
      el.scrollTop = target;
      setUnread(0);
    };

    const doSmooth = () => {
      try {
        bottom.scrollIntoView({ behavior: 'smooth', block: 'end' });
      } catch {
        const node = el as HTMLElement;
        const prev = node.style.scrollBehavior;
        node.style.scrollBehavior = 'smooth';
        node.scrollTop = target;
        setTimeout(() => { node.style.scrollBehavior = prev; }, 350);
      }

      requestAnimationFrame(() => { el.scrollTop = target; });
      setUnread(0);
    };

    requestAnimationFrame(() => {
      if (smooth) {
        doSmooth();
      } else {
        doImmediate();
      }
      requestAnimationFrame(() => {
        if (smooth) {
          doSmooth();
        } else {
          doImmediate();
        }
        setTimeout(() => { if (bottomVisibleRef.current) doImmediate(); }, 32);
      });
    });
  }, [BOTTOM_EPS]);

  const applyAutoScroll = useCallback((force?: boolean, smooth?: boolean) => {
    scrollToBottom({ force, smooth });
  }, [scrollToBottom]);

  useLayoutEffect(() => {
    if (!items.length || didInitialScrollRef.current) return;
    const el = scrollerRef.current;
    const bottom = bottomRef.current;
    if (!el || !bottom) return;

    try { bottom.scrollIntoView(); } catch { }
    el.scrollTop = el.scrollHeight - el.clientHeight;
  }, [items]);

  useEffect(() => {
    if (!didInitialScrollRef.current && items.length) {
      didInitialScrollRef.current = true;
      scrollToBottom({ force: true, smooth: true });
    }
  }, [items, scrollToBottom]);

  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const atBottomNow = el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_EPS;
    if (atBottomNow) setUnread(0);
  }, []);

  useEffect(() => {
    const root = scrollerRef.current;
    const target = bottomRef.current;
    if (!root || !target) return;
    const io = new IntersectionObserver((entries) => {
      const entry = entries[0];
      const visible = !!entry && entry.isIntersecting;
      bottomVisibleRef.current = visible;
      if (visible) setUnread(0);
    }, { root, threshold: 0, rootMargin: '0px 0px -112px 0px' });
    io.observe(target);
    return () => io.disconnect();
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(i => i.text.toLowerCase().includes(q));
  }, [items, query]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'End') applyAutoScroll(true, true);
      if (e.key === 'Home' && listRef.current) listRef.current.focus();
    };
    el.addEventListener('keydown', handler);
    return () => el.removeEventListener('keydown', handler);
  }, [applyAutoScroll]);

  useEffect(() => {
    const t1 = window.setTimeout(() => scrollToBottom({ force: true, smooth: true }), 120);
    const t2 = window.setTimeout(() => scrollToBottom({ force: true, smooth: true }), 300);
    const t3 = window.setTimeout(() => scrollToBottom({ force: true, smooth: false }), 650);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); window.clearTimeout(t3); };
  }, [scrollToBottom]);

  useEffect(() => {
    if (pendingStickToBottomRef.current) {
      pendingStickToBottomRef.current = false;
      scrollToBottom({ force: true, smooth: true });
    }
  }, [items.length, scrollToBottom]);

  return (
    <div
      className="flex flex-col"
      style={{ minHeight: 'var(--app-height, 100vh)', height: 'var(--app-height, 100vh)' }}
    >
      {/* ── Floating header ── */}
      <div className="fixed top-0 left-0 right-0 z-40">
        <div
          className="px-3 flex items-center gap-2"
          style={{
            paddingTop: 'max(var(--safe-area-inset-top, 0px), 8px)',
            paddingBottom: 8,
          }}
        >
          {/* Back button */}
          <motion.div whileTap={{ scale: 0.9 }} transition={SPRING_TAP}>
            <Link
              to={backTo}
              className="w-9 h-9 rounded-full flex items-center justify-center text-white glass-border-light flex-shrink-0"
              style={glassStyle}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </Link>
          </motion.div>

          {/* Title pill */}
          <div
            className="flex-1 min-w-0 h-9 rounded-full flex items-center px-3 gap-2 glass-border-light"
            style={glassStyle}
          >
            <span className="text-white text-[14px] font-semibold truncate">Слот #{slotId}</span>
            <span className="text-white/40 text-[13px] flex-shrink-0">логи</span>
          </div>

          {/* Search pill */}
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center glass-border-light flex-shrink-0 cursor-pointer"
            style={glassStyle}
            onClick={() => {
              const el = document.getElementById('log-search-input');
              if (el) el.focus();
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="white" strokeWidth="2" /><path d="M16.5 16.5L21 21" stroke="white" strokeWidth="2" strokeLinecap="round" /></svg>
          </div>
        </div>

        {/* Search bar */}
        <div className="px-3 pb-2">
          <input
            id="log-search-input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Поиск по логам"
            className="w-full h-9 rounded-full px-4 text-[14px] text-white placeholder:text-white/30 outline-none glass-border-light"
            style={glassInputStyle}
          />
        </div>

        <div className="progressive-blur" style={{ height: 40 }} />
      </div>

      {/* ── Scroll area ── */}
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        tabIndex={0}
        className="flex-1 min-h-0 overflow-y-auto px-3 space-y-3 focus:outline-none"
        style={{
          paddingTop: 'calc(var(--safe-area-inset-top, 0px) + 110px)',
          paddingBottom: 'calc(var(--safe-area-inset-bottom, 0px) + 24px)',
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
        }}
      >
        <div ref={listRef} />
        {filtered.map((ev, index) => (
          <LogBubble key={`${ev.id}-${index}`} ev={ev} />
        ))}
        <div ref={bottomRef} className="h-px" />
      </div>

      {unread > 0 && (
        <motion.button
          onClick={() => applyAutoScroll(true, true)}
          className="fixed right-4 z-40 w-11 h-11 rounded-full flex items-center justify-center glass-border-light active:scale-[0.96] transition"
          style={{
            bottom: 'calc(var(--safe-area-inset-bottom, 0px) + 24px)',
            background: 'rgba(255,255,255,0.10)',
            backdropFilter: 'blur(20px) saturate(1.4) brightness(1.06)',
            WebkitBackdropFilter: 'blur(20px) saturate(1.4) brightness(1.06)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.18)',
          }}
          whileTap={{ scale: 0.92 }}
          transition={SPRING_TAP}
          aria-label="Прокрутить вниз"
        >
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-accent text-black text-[11px] leading-5 text-center font-medium">
            {unread}
          </span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.button>
      )}
    </div>
  );
};

export default SlotLogsPage;
