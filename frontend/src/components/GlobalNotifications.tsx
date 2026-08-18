import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../store/appStore';

const AUTO_CLOSE_MS = 5000;

const SPRING = { type: 'spring' as const, stiffness: 350, damping: 28, mass: 0.8 };

// TEMP: демо-уведомления — удалить после ревью
const SHOW_DEMO = false;
const DEMO_NOTIFICATIONS = [
  { id: '__demo_err__', type: 'error' as const, message: 'Не удалось подключиться к серверу', timestamp: Date.now() },
  { id: '__demo_ok__', type: 'success' as const, message: 'Слот успешно создан и запущен', timestamp: Date.now() },
  { id: '__demo_info__', type: 'info' as const, message: 'Доступно обновление v2.4.0', timestamp: Date.now() },
];

interface VariantCfg {
  tint: string;
  iconColor: string;
  icon: React.ReactNode;
}

const variantMap: Record<string, VariantCfg> = {
  error: {
    tint: 'rgba(239, 68, 68, 0.10)',
    iconColor: 'text-red-600',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4m0 4h.01" />
      </svg>
    ),
  },
  success: {
    tint: 'rgba(34, 197, 94, 0.10)',
    iconColor: 'text-green-600',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M8 12l3 3 5-5" />
      </svg>
    ),
  },
  warning: {
    tint: 'rgba(234, 179, 8, 0.10)',
    iconColor: 'text-yellow-600',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <path d="M12 9v4m0 4h.01" />
      </svg>
    ),
  },
  info: {
    tint: 'rgba(59, 130, 246, 0.10)',
    iconColor: 'text-blue-600',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4m0-4h.01" />
      </svg>
    ),
  },
};

const glassStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.85)',
  backdropFilter: 'blur(16px) saturate(180%) brightness(1.08)',
  WebkitBackdropFilter: 'blur(16px) saturate(180%) brightness(1.08)',
  boxShadow:
    'inset 0 0.5px 0 rgba(255,255,255,0.9), inset 0 -0.5px 0 rgba(255,255,255,0.4), 0 8px 32px rgba(11,36,48,0.15)',
  border: '0.5px solid rgba(11,36,48,0.10)',
};

export const GlobalNotifications: React.FC = () => {
  const { notifications, removeNotification } = useAppStore();

  // Auto-dismiss real notifications (not demos)
  useEffect(() => {
    const timers = notifications.map((n) =>
      window.setTimeout(() => removeNotification(n.id), AUTO_CLOSE_MS),
    );
    return () => timers.forEach((t) => clearTimeout(t));
  }, [notifications, removeNotification]);

  // TEMP: show demo + real notifications
  const allItems = SHOW_DEMO && notifications.length === 0
    ? DEMO_NOTIFICATIONS
    : notifications;

  if (allItems.length === 0) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[1100] pointer-events-none flex flex-col items-center"
      style={{ paddingTop: 'calc(var(--safe-area-inset-top, 0px) + 10px)' }}
    >
      <div className="w-full max-w-md px-3 space-y-2 pointer-events-auto">
        <AnimatePresence mode="popLayout">
          {allItems.map((n) => {
            const cfg = variantMap[n.type] || variantMap.info;
            const isDemo = n.id.startsWith('__demo_');

            return (
              <motion.div
                key={n.id}
                layout
                initial={{ opacity: 0, y: -20, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -16, scale: 0.95 }}
                transition={SPRING}
                className="relative overflow-hidden rounded-[18px] px-4 py-3 flex gap-3 items-center text-white"
                style={glassStyle}
              >
                {/* Variant tint overlay */}
                <div
                  className="absolute inset-0 pointer-events-none rounded-[18px]"
                  style={{ background: cfg.tint }}
                />

                <div className={`relative ${cfg.iconColor} flex-shrink-0`}>
                  {cfg.icon}
                </div>

                <div className="relative flex-1 pr-6 text-[13px] leading-[18px] font-medium whitespace-pre-wrap break-all flex items-center">
                  {n.message}
                </div>

                {!isDemo && (
                  <motion.button
                    onClick={() => removeNotification(n.id)}
                    whileTap={{ scale: 0.85 }}
                    transition={SPRING}
                    className="absolute top-2.5 right-2.5 z-10 text-white/40 hover:text-white/70 transition-colors p-1 rounded-lg"
                    aria-label="Закрыть"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </motion.button>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default GlobalNotifications;
