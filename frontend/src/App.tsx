import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { useTelegramMiniApp } from './hooks/useTelegramMiniApp';
import { useWebSocket } from './hooks/useWebSocket';
import { useKeyboardOpen } from './hooks/useKeyboardOpen';
import { DevConsole } from './components/DevConsole';
import GlobalNotifications from './components/GlobalNotifications';
import ToastNotifications from './components/ToastNotifications';
import { useGlobalDialogsFallback } from './hooks/useGlobalDialogsFallback';
import { initJwtToken } from './api/client';
import { useAppStore } from './store/appStore';
import Navbar from './components/Navbar';
import AdminGodRoute from './components/AdminGodRoute';

// Navbar pages — eagerly imported (always needed, prevents flash on tab switch)
import HomePage from './pages/HomePage';
import MessagesPage from './pages/MessagesPage';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';

// Secondary pages — lazy loaded, prefetched after app ready
const lazyImports = {
  ChatPage: () => import('./pages/ChatPage'),
  SlotsListPage: () => import('./pages/SlotsListPage'),
  SlotEditPage: () => import('./pages/SlotEditPage'),
  SlotLogsPage: () => import('./pages/SlotLogsPage'),
  TemplatesListPage: () => import('./pages/TemplatesListPage'),
  TemplateEditPage: () => import('./pages/TemplateEditPage'),
  AdminUsersListPage: () => import('./pages/AdminUsersListPage'),
  AdminUserProfilePage: () => import('./pages/AdminUserProfilePage'),
  AdminRegistrationsPage: () => import('./pages/AdminRegistrationsPage'),
  FilterEditPage: () => import('./pages/FilterEditPage'),
};
const ChatPage = lazy(lazyImports.ChatPage);
const SlotsListPage = lazy(lazyImports.SlotsListPage);
const SlotEditPage = lazy(lazyImports.SlotEditPage);
const SlotLogsPage = lazy(lazyImports.SlotLogsPage);
const TemplatesListPage = lazy(lazyImports.TemplatesListPage);
const TemplateEditPage = lazy(lazyImports.TemplateEditPage);
const AdminUsersListPage = lazy(lazyImports.AdminUsersListPage);
const AdminUserProfilePage = lazy(lazyImports.AdminUserProfilePage);
const AdminRegistrationsPage = lazy(lazyImports.AdminRegistrationsPage);
const FilterEditPage = lazy(lazyImports.FilterEditPage);

/** Prefetch all lazy chunks in background after app is ready */
function prefetchLazyPages() {
  setTimeout(() => {
    Object.values(lazyImports).forEach(fn => fn().catch(() => { }));
  }, 1500);
}

function shouldSkipGlobalScrollToTop(pathname: string): boolean {
  if (pathname === '/messages') return true;
  if (pathname === '/slots') return true;
  if (pathname === '/admin/users') return true;
  // Профиль юзера в админке: возврат из логов слота должен попадать на то же место списка.
  if (/^\/admin\/users\/[^/]+$/.test(pathname)) return true;
  return false;
}

const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  useEffect(() => {
    if (shouldSkipGlobalScrollToTop(pathname)) return;

    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    // overflow-x-hidden на корневом div делает его scroll-контейнером —
    // window.scrollTo не достаёт до него, скроллим явно.
    document.getElementById('app-scroll-root')?.scrollTo(0, 0);
  }, [pathname]);

  return null;
};

const LoadingScreen = () => (
  <div className="relative flex flex-col items-center justify-center w-full h-[100vh] gap-6 select-none overflow-hidden"
    style={{ background: 'linear-gradient(180deg, #FDFEFF 0%, #F5FAFD 100%)' }}
  >
    {/* Ambient orbs — same as HomePage */}
    <div className="absolute inset-0 pointer-events-none">
      <div className="ambient-orb ambient-orb--accent" />
      <div className="ambient-orb ambient-orb--blue" />
      <div className="ambient-orb ambient-orb--accent-low" />
    </div>

    {/* Glass spinner card */}
    <div
      className="relative z-[1] flex items-center justify-center w-20 h-20 rounded-[22px] glass-border-light"
      style={{
        background: 'rgba(255,255,255,0.6)',
        backdropFilter: 'blur(24px) saturate(1.3)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
      }}
    >
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-[2.5px] border-white/10" />
        <div className="absolute inset-0 rounded-full border-[2.5px] border-[#00AEEF] border-t-transparent animate-spin" />
      </div>
    </div>
  </div>
);

const DelayedFallback = () => {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 300);
    return () => clearTimeout(t);
  }, []);
  return show ? <LoadingScreen /> : <div className="min-h-screen bg-lighter-black" />;
};

/** Роуты для неавторизованных: только вход и регистрация. */
const AuthRoutes = () => (
  <>
    <ScrollToTop />
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  </>
);

const AppLayout = () => {
  const location = useLocation();
  const isKeyboardOpen = useKeyboardOpen();
  const hideNavbar = useAppStore(s => s.hideNavbar);

  const hideNavbarPaths = ['/messages/chat/', '/slots', '/templates', '/filters', '/admin', '/login', '/register'];

  const shouldHideNavbar =
    hideNavbarPaths.some(path => location.pathname.startsWith(path)) || isKeyboardOpen || hideNavbar;

  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<DelayedFallback />}>
        <Routes>
          {/* Navbar pages (eagerly loaded — no Suspense flash) */}
          <Route path="/" element={<HomePage />} />
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />

          {/* Уже авторизован — /login и /register ведут на главную */}
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/register" element={<Navigate to="/" replace />} />

          {/* Secondary pages (lazy loaded) */}
          <Route path="/messages/chat/:id" element={<ChatPage />} />
          <Route path="/slots" element={<SlotsListPage />} />
          <Route path="/slots/new" element={<SlotEditPage />} />
          <Route path="/slots/:workerId/edit" element={<SlotEditPage />} />
          <Route path="/slots/:id/logs" element={<SlotLogsPage />} />
          <Route path="/templates" element={<TemplatesListPage />} />
          <Route path="/templates/:id" element={<TemplateEditPage />} />
          <Route
            path="/admin/users"
            element={
              <AdminGodRoute>
                <AdminUsersListPage />
              </AdminGodRoute>
            }
          />
          <Route
            path="/admin/users/:userId"
            element={
              <AdminGodRoute>
                <AdminUserProfilePage />
              </AdminGodRoute>
            }
          />
          <Route
            path="/admin/registrations"
            element={
              <AdminGodRoute>
                <AdminRegistrationsPage />
              </AdminGodRoute>
            }
          />
          <Route path="/filters/new" element={<FilterEditPage />} />
          <Route path="/filters/:id" element={<FilterEditPage />} />
        </Routes>
      </Suspense>
      {!shouldHideNavbar && <Navbar />}
    </>
  );
};

export default function App() {
  const { isReady, authError, isAuthenticated } = useTelegramMiniApp();

  useEffect(() => {
    initJwtToken();
  }, []);

  useEffect(() => {
    if (isReady && isAuthenticated && !authError) prefetchLazyPages();
  }, [isReady, isAuthenticated, authError]);

  useWebSocket();

  useGlobalDialogsFallback();

  return (
    <Router>
      <div
        id="app-scroll-root"
        className="text-white overflow-x-hidden"
        style={{
          minHeight: 'var(--app-height, 100vh)',
          height: 'var(--app-height, 100vh)'
        }}
      >
        {authError ? (
          <div
            className="bg-black text-white flex items-center justify-center p-4"
            style={{ minHeight: 'var(--app-height, 100vh)' }}
          >
            <div className="w-full max-w-md text-center">
              <h2 className="text-xl font-bold mb-3">Ошибка аутентификации</h2>
              <p className="text-white/90 mb-4 text-balance leading-snug">{authError.summary}</p>
              <div className="mb-5 text-left">
                <p className="text-xs uppercase tracking-wide text-white/40 mb-1.5">Подробности</p>
                <pre
                  className="text-xs sm:text-sm text-red-600 whitespace-pre-wrap break-words font-mono rounded-2xl bg-white/5 border border-white/10 p-3 max-h-[min(50vh,320px)] overflow-y-auto"
                >
                  {authError.details}
                </pre>
              </div>
              <button
                onClick={() => window.location.reload()}
                className="bg-accent text-black px-6 py-2 rounded-xl font-semibold"
              >
                Перезагрузить
              </button>
            </div>
          </div>
        ) : !isReady ? (
          <div className="bg-black text-white flex items-center justify-center" style={{ minHeight: 'var(--app-height, 100vh)' }}>
            <LoadingScreen />
          </div>
        ) : !isAuthenticated ? (
          <AuthRoutes />
        ) : (
          <AppLayout />
        )}
        <ToastNotifications />
        <GlobalNotifications />
        {import.meta.env.DEV && typeof window !== 'undefined' && (['localhost','127.0.0.1'].includes(window.location.hostname) || window.location.hostname.endsWith('.local')) ? <DevConsole /> : null}
      </div>
    </Router>
  );
}
