import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/appStore';
import { API_BASE_URL } from '../api/config';

type SafeStyle = React.CSSProperties & { '--safe'?: string };

const buildImageUrl = (raw?: string): string | undefined => {
  if (!raw) return undefined;
  const r = String(raw).trim();
  if (!r) return undefined;
  if (/^https?:\/\//i.test(r)) return r;
  const file = r.split(/[\\/]/).pop() || r;
  return `${API_BASE_URL}/images/${file}`;
};

const toastGlassStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.85)',
  backdropFilter: 'blur(16px) saturate(180%) brightness(1.08)',
  WebkitBackdropFilter: 'blur(16px) saturate(180%) brightness(1.08)',
  boxShadow:
    'inset 0 0.5px 0 rgba(255,255,255,0.9), inset 0 -0.5px 0 rgba(255,255,255,0.4), 0 8px 32px rgba(11,36,48,0.15)',
  border: '0.5px solid rgba(11,36,48,0.10)',
};

// TEMP: демо-тост для проверки дизайна — удалить после ревью
const SHOW_DEMO = false;

export const ToastNotifications: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { messageToasts, removeMessageToast, clearDialogToasts } = useAppStore();

  const [closing, setClosing] = React.useState<Set<string>>(new Set());
  const [entered, setEntered] = React.useState<Set<string>>(new Set());

  const timersRef = React.useRef<Record<string, number>>({});
  const draggingRef = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    const ids = new Set(messageToasts.map((t) => t.id));

    setClosing((prev) => {
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });

    setEntered((prev) => {
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [messageToasts]);

  React.useEffect(() => {
    messageToasts.forEach((t) => {
      if (closing.has(t.id)) return;
      if (draggingRef.current.has(t.id)) return;
      if (timersRef.current[t.id]) return;

      const remaining = Math.max(0, 3000 - (Date.now() - t.timestamp));
      timersRef.current[t.id] = window.setTimeout(() => {
        delete timersRef.current[t.id];
        setClosing((prev) => {
          if (prev.has(t.id)) return prev;
          const ns = new Set(prev);
          ns.add(t.id);
          return ns;
        });
      }, remaining);
    });

    Object.keys(timersRef.current).forEach((id) => {
      if (!messageToasts.find((t) => t.id === id)) {
        clearTimeout(timersRef.current[id]);
        delete timersRef.current[id];
      }
    });
  }, [messageToasts, closing]);

  const chatMatch = location.pathname.match(/\/messages\/chat\/(\d+)/);
  const activeDialogId = chatMatch ? Number(chatMatch[1]) : null;

  const visibleToasts = activeDialogId
    ? messageToasts.filter((t) => t.dialogId !== activeDialogId)
    : messageToasts;

  const startPositions = React.useRef<Record<string, { x: number; y: number }>>({});
  const translate = React.useRef<Record<string, number>>({});
  const vertical = React.useRef<Record<string, number>>({});
  const gestureLock = React.useRef<Record<string, 'h' | 'v' | null>>({});

  const processStart = (id: string, x: number, y: number, el?: HTMLElement) => {
    startPositions.current[id] = { x, y };
    gestureLock.current[id] = null;
    draggingRef.current.add(id);

    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }

    if (el) {
      el.classList.add('dragging');
      el.style.transition = 'none';
    }
  };

  const applyTransform = (id: string, dx: number, dy: number, el: HTMLElement) => {
    const lock = gestureLock.current[id];
    if (lock === 'h') dy = 0;
    if (lock === 'v') dx = 0;

    if (dy > 12) dy = 12;
    if (dy > 0) dy *= 0.25;

    translate.current[id] = dx;
    vertical.current[id] = dy;

    const translateY = dy < 0 ? `calc(var(--safe) + ${dy}px)` : 'var(--safe)';
    el.style.transition = 'none';
    el.style.transform = `translateY(${translateY}) translateX(${dx}px)`;
    el.style.opacity = '1';
  };

  const processMove = (id: string, x: number, y: number, el: HTMLElement) => {
    if (!startPositions.current[id]) return;

    const dx = x - startPositions.current[id].x;
    const dy = y - startPositions.current[id].y;

    if (gestureLock.current[id] === null) {
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      if (adx > 10 || ady > 10) {
        gestureLock.current[id] = adx > ady ? 'h' : 'v';
      }
    }

    applyTransform(id, dx, dy, el);
  };

  const processEnd = (id: string) => {
    if (!startPositions.current[id]) return;

    const lock = gestureLock.current[id];
    const dx = translate.current[id] || 0;
    const dy = vertical.current[id] || 0;

    const horizontalCommit = lock === 'h' && Math.abs(dx) > 90;
    const verticalCommit = lock === 'v' && dy < -60;

    const el = document.getElementById(`toast-${id}`) as HTMLElement | null;
    if (!el) return;

    draggingRef.current.delete(id);
    el.classList.remove('dragging');
    el.style.transition = '';

    const isClick = !horizontalCommit && !verticalCommit && Math.abs(dx) < 10 && Math.abs(dy) < 10;
    if (isClick) {
      const toast = messageToasts.find((t) => t.id === id);
      if (toast) {
        clearDialogToasts(toast.dialogId);
        navigate(`/messages/chat/${toast.dialogId}`);
      }
      return;
    }

    if (horizontalCommit) {
      el.style.transition = 'transform 0.35s cubic-bezier(0.22,1,0.36,1), opacity 0.3s ease';
      el.style.transform = `translateY(var(--safe)) translateX(${dx > 0 ? 500 : -500}px)`;
      el.style.opacity = '0';
      setTimeout(() => removeMessageToast(id), 320);
    } else if (verticalCommit) {
      el.style.transition = 'transform 0.4s cubic-bezier(0.22,1,0.36,1), opacity 0.35s ease';
      el.style.transform = 'translateY(calc(-100% - var(--safe)))';
      el.style.opacity = '0';
      setTimeout(() => removeMessageToast(id), 380);
    } else {
      el.style.transition = 'transform 0.5s cubic-bezier(0.34,1.56,0.64,1)';
      el.style.transform = 'translateY(var(--safe)) translateX(0)';
      el.style.opacity = '1';

      if (!closing.has(id) && !timersRef.current[id]) {
        const toast = messageToasts.find((t) => t.id === id);
        if (toast) {
          const remaining = Math.max(1200, 3000 - (Date.now() - toast.timestamp));
          timersRef.current[id] = window.setTimeout(() => {
            delete timersRef.current[id];
            setClosing((prev) => {
              if (prev.has(id)) return prev;
              const ns = new Set(prev);
              ns.add(id);
              return ns;
            });
          }, remaining);
        }
      }
    }

    delete startPositions.current[id];
    delete translate.current[id];
    delete vertical.current[id];
    delete gestureLock.current[id];
  };

  const handlePointerDown = (e: React.PointerEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    processStart(id, e.clientX, e.clientY, e.currentTarget as HTMLElement);
  };

  const handlePointerMove = (e: React.PointerEvent, id: string) => {
    if (!startPositions.current[id]) return;
    e.preventDefault();
    e.stopPropagation();
    processMove(id, e.clientX, e.clientY, e.currentTarget as HTMLElement);
  };

  const handlePointerUp = (e: React.PointerEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    processEnd(id);
  };

  const handleTouchStart = (e: React.TouchEvent, id: string) => {
    if (e.touches.length > 0) {
      const t = e.touches[0];
      const el = document.getElementById(`toast-${id}`) as HTMLElement | null;
      processStart(id, t.clientX, t.clientY, el || undefined);
    }
  };

  const handleTouchMove = (e: React.TouchEvent, id: string) => {
    if (e.touches.length > 0 && startPositions.current[id]) {
      e.preventDefault();
      const t = e.touches[0];
      const el = document.getElementById(`toast-${id}`);
      if (el) processMove(id, t.clientX, t.clientY, el as HTMLElement);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent, id: string) => {
    e.preventDefault();
    processEnd(id);
  };

  const safeStyle: SafeStyle = { ['--safe']: 'calc(var(--safe-area-inset-top, 0px) + 20px)' };

  const renderToast = (
    t: { id: string; dialogId: number; title: string; text: string; image?: string; timestamp: number },
    i: number,
    isDemo = false,
  ) => {
    const isClosing = closing.has(t.id);
    const isEntered = entered.has(t.id);
    const enterClass = !isDemo && !isEntered && !isClosing ? 'toast-enter' : '';
    const closingClass = !isDemo && isClosing ? 'toast-closing' : '';
    const img = buildImageUrl(t.image);

    return (
      <div
        key={t.id}
        id={`toast-${t.id}`}
        data-index={i}
        className={`toast-base ${enterClass} ${closingClass} rounded-[22px] flex items-center pr-4 cursor-pointer select-none touch-none`}
        style={{
          ...toastGlassStyle,
          animationDelay: enterClass ? `${i * 80}ms` : '0ms',
          touchAction: 'none',
          ...(isDemo ? { transform: 'translateY(var(--safe))' } : {}),
        }}
        onAnimationEnd={isDemo ? undefined : (e) => {
          if (closing.has(t.id) && e.animationName === 'toastEnter') {
            // do nothing
          } else if (closing.has(t.id) && e.animationName === 'toastExit') {
            removeMessageToast(t.id);
          } else if (e.animationName === 'toastEnter') {
            setEntered((prev) => {
              if (prev.has(t.id)) return prev;
              const ns = new Set(prev);
              ns.add(t.id);
              return ns;
            });
            const el = e.currentTarget as HTMLElement;
            el.style.transform = 'translateY(var(--safe))';
          }
        }}
        {...(isDemo ? {} : {
          onPointerDown: (e: React.PointerEvent) => handlePointerDown(e, t.id),
          onPointerMove: (e: React.PointerEvent) => handlePointerMove(e, t.id),
          onPointerUp: (e: React.PointerEvent) => handlePointerUp(e, t.id),
          onTouchStart: (e: React.TouchEvent) => handleTouchStart(e, t.id),
          onTouchMove: (e: React.TouchEvent) => handleTouchMove(e, t.id),
          onTouchEnd: (e: React.TouchEvent) => handleTouchEnd(e, t.id),
        })}
      >
        <div className="w-12 h-12 flex-shrink-0 m-2.5 rounded-[14px] overflow-hidden bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
          {img ? <img src={img} alt={t.title} className="w-full h-full object-cover" /> : t.title.substring(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0 py-2.5 mr-2">
          <div className="text-white text-sm font-semibold leading-tight truncate">{t.title}</div>
          <div className="text-white/50 text-xs leading-tight line-clamp-2 break-words mt-0.5">{t.text}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-[999] flex flex-col items-center pointer-events-none" style={safeStyle}>
      <style>{`
        @keyframes toastEnter {
          0% { transform: translateY(calc(-100% - var(--safe))); opacity: 0; }
          55% { transform: translateY(calc(var(--safe) + 10px)); opacity: 1; }
          75% { transform: translateY(calc(var(--safe) - 4px)); }
          88% { transform: translateY(calc(var(--safe) + 1.5px)); }
          100% { transform: translateY(var(--safe)); opacity: 1; }
        }
        @keyframes toastExit {
          0% { transform: translateY(var(--safe)); opacity: 1; }
          40% { transform: translateY(calc(var(--safe) + 6px)); opacity: 0.9; }
          100% { transform: translateY(calc(-100% - var(--safe))); opacity: 0; }
        }
        .toast-base { will-change: transform, opacity; }
        .toast-enter { animation: toastEnter 750ms cubic-bezier(0.22, 1, 0.36, 1) forwards; }
        .toast-closing { animation: toastExit 480ms cubic-bezier(0.55, 0, 0.68, 0.19) forwards; }
        .toast-base.dragging { animation: none !important; }
      `}</style>

      <div className="w-full max-w-md px-3 space-y-2 pointer-events-auto">
        {/* TEMP: демо-тост — удалить после ревью */}
        {SHOW_DEMO && visibleToasts.length === 0 && renderToast(
          {
            id: '__demo__',
            dialogId: 0,
            title: 'Новое сообщение',
            text: 'Привет! Интересует ваш товар, ещё в продаже?',
            image: undefined,
            timestamp: Date.now(),
          },
          0,
          true,
        )}

        {visibleToasts.map((t, i) => renderToast(t, i))}
      </div>
    </div>
  );
};

export default ToastNotifications;
