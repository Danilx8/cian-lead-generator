import { useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { authService, clearAuthTokens, type AuthUser } from '../api/authService';
import { useAppStore } from '../store/appStore';
import { buildAuthInitErrorDisplay, type AuthInitErrorDisplay } from '../utils/authInitErrorDetails';

// Обычный браузер: инсеты нулевые, но CSS-переменные должны существовать.
const applySafeAreaCss = () => {
  const root = document.documentElement;
  root.style.setProperty('--safe-area-inset-top', '0px');
  root.style.setProperty('--safe-area-inset-bottom', '0px');
  root.style.setProperty('--safe-area-inset-bottom-limited', '0px');
  root.style.setProperty('--navbar-height', '86px');
};

const applyAppHeight = () => {
  document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
};

/**
 * Web-аутентификация (email/password JWT). Имя хука сохранено для совместимости
 * с существующими импортами; Telegram SDK больше не используется.
 */
export function useTelegramMiniApp() {
  const [isReady, setReady] = useState(false);
  const [isAuthenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authError, setAuthError] = useState<AuthInitErrorDisplay | null>(null);

  useEffect(() => {
    let mounted = true;

    applySafeAreaCss();
    applyAppHeight();
    useAppStore.getState().setSafeAreas(0, 0);
    window.addEventListener('resize', applyAppHeight);

    const init = async () => {
      if (!authService.hasStoredToken()) {
        if (mounted) setReady(true);
        return;
      }
      try {
        let me: AuthUser;
        try {
          me = await authService.me();
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) {
            const refreshed = await authService.refresh();
            if (!refreshed) throw err;
            me = await authService.me();
          } else {
            throw err;
          }
        }
        if (!mounted) return;
        const store = useAppStore.getState();
        store.setUser(me as unknown as Parameters<typeof store.setUser>[0]);
        store.setChatId(String(me.id));
        setUser(me);
        setAuthenticated(true);
        setReady(true);
      } catch (err) {
        console.error('Auth init failed:', err);
        if (!mounted) return;
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          // Невалидная сессия — уводим на логин без экрана ошибки.
          clearAuthTokens();
          setAuthenticated(false);
          setReady(true);
        } else {
          setAuthError(buildAuthInitErrorDisplay(err));
        }
      }
    };

    init();

    return () => {
      mounted = false;
      window.removeEventListener('resize', applyAppHeight);
    };
  }, []);

  return {
    isReady,
    authError,
    isAuthenticated,
    user,
    safeAreaTop: 0,
    safeAreaBottom: 0,
    platform: 'web' as const,
  } as const;
}

export const useAuth = useTelegramMiniApp;
