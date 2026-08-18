import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminService, type AdminUserListItem } from '../api/adminService';
import Skeleton from '../components/Skeleton';
import { useSessionAppScroll } from '../hooks/useSessionListScroll';

const profileBgStyle: React.CSSProperties = {
  background: 'linear-gradient(180deg, #00AEEF -163.91%, #F5FAFD 55.2%)',
};

function statusLabel(status?: string): string {
  switch (status) {
    case 'active':
      return 'активен';
    case 'pending':
      return 'на модерации';
    case 'blocked':
      return 'заблокирован';
    default:
      return status ?? '';
  }
}

function statusClass(status?: string): string {
  switch (status) {
    case 'pending':
      return 'text-yellow-600';
    case 'blocked':
      return 'text-red-600';
    default:
      return 'text-white/55';
  }
}

let _savedSearch = '';
// Кэш на сессию: при возврате с карточки юзера список рисуется сразу на всю высоту,
// иначе скролл-рут успевает схлопнуться и восстанавливать позицию некуда.
let _cachedRows: AdminUserListItem[] | null = null;

const AdminUsersListPage: React.FC = () => {
  const [rows, setRows] = useState<AdminUserListItem[]>(_cachedRows ?? []);
  const [loading, setLoading] = useState(!_cachedRows);
  const [error, setError] = useState<string | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState(_savedSearch);

  const handleSearchChange = (v: string) => { _savedSearch = v; setUserSearchQuery(v); };

  const filteredRows = useMemo(() => {
    let list = rows;
    const q = userSearchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((u) => {
        const r = u as AdminUserListItem & { email?: string };
        return (
          (u.username ?? '').toLowerCase().includes(q) ||
          (r.email ?? '').toLowerCase().includes(q)
        );
      });
    }
    // Алфавитная сортировка (без учёта регистра, ru+en).
    return [...list].sort((a, b) => {
      const ra = a as AdminUserListItem & { email?: string };
      const rb = b as AdminUserListItem & { email?: string };
      return (a.username ?? ra.email ?? '').localeCompare(b.username ?? rb.email ?? '', ['ru', 'en'], {
        sensitivity: 'base',
      });
    });
  }, [rows, userSearchQuery]);

  useSessionAppScroll('admin:users', !loading && !error, filteredRows.length);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // При тёплом кэше не показываем скелетон — обновляем список молча.
      if (!_cachedRows) setLoading(true);
      setError(null);
      try {
        const list = await adminService.listUsers();
        _cachedRows = list;
        if (!cancelled) setRows(list);
      } catch (e) {
        console.error(e);
        // Упавшее фоновое обновление не должно подменять уже показанный список ошибкой.
        if (!cancelled && !_cachedRows) {
          setError(e instanceof Error ? e.message : 'Не удалось загрузить пользователей');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen pt-safe" style={profileBgStyle}>
      <style>
        {`
          body {
            background: linear-gradient(180deg, #00AEEF -163.91%, #F5FAFD 55.2%);
          }
        `}
      </style>
      <div className="relative z-10 p-4 pb-32">
        <div className="relative flex items-center justify-center mb-6 min-h-[40px]">
          <Link
            to="/profile"
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 text-white/80 text-sm font-medium px-3 py-1.5 rounded-xl bg-white/10"
          >
            Назад
          </Link>
          <h1 className="text-xl font-bold text-white text-center">Пользователи</h1>
          <Link
            to="/admin/registrations"
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 rounded-xl bg-accent px-3 py-1.5 text-sm font-semibold text-black"
          >
            Заявки
          </Link>
        </div>
        {!loading && !error && rows.length > 0 && (
          <div className="mb-4 flex flex-col gap-3">
            <label className="relative block">
              <span className="sr-only">Поиск по email или нику</span>
              <span
                className="pointer-events-none absolute left-4 top-1/2 z-[1] -translate-y-1/2 text-white/40"
                aria-hidden
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
                    stroke="currentColor"
                    strokeWidth="1.75"
                  />
                  <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                </svg>
              </span>
              <input
                type="search"
                value={userSearchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Поиск по email или нику"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                className="w-full rounded-2xl border border-white/10 bg-white/[0.07] pl-12 pr-11 py-3.5 text-base text-white outline-none transition-[box-shadow,border-color] placeholder:text-white/40 min-h-[52px] focus:border-white/25 focus:ring-2 focus:ring-white/10"
              />
              {userSearchQuery && (
                <button
                  type="button"
                  onClick={() => handleSearchChange('')}
                  aria-label="Очистить поиск"
                  className="absolute right-3 top-1/2 z-[1] -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/50 transition-colors hover:bg-white/15 hover:text-white/80"
                >
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                    <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </label>
            <div className="flex items-center justify-between px-1 text-xs text-white/40">
              <span>
                {userSearchQuery.trim()
                  ? `Найдено: ${filteredRows.length}`
                  : `Всего: ${rows.length}`}
              </span>
              <span className="inline-flex items-center gap-1 text-white/30">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <path d="M7 8h10M7 12h7M7 16h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                А–Я
              </span>
            </div>
          </div>
        )}
        {loading && (
          <div className="flex flex-col gap-3">
            <Skeleton variant="rectangular" className="h-[72px] w-full rounded-xl border border-white/10 bg-white/5" />
            <Skeleton variant="rectangular" className="h-[72px] w-full rounded-xl border border-white/10 bg-white/5" />
            <Skeleton variant="rectangular" className="h-[72px] w-full rounded-xl border border-white/10 bg-white/5" />
          </div>
        )}
        {error && (
          <div className="rounded-xl bg-red-500/15 border border-red-400/30 text-red-600 text-sm p-4">{error}</div>
        )}
        {!loading && !error && (
          <ul className="flex flex-col gap-3">
            {filteredRows.map((u) => {
              const r = u as AdminUserListItem & { email?: string; role?: string; status?: string };
              return (
                <li key={u.id}>
                  <Link
                    to={`/admin/users/${u.id}`}
                    className="group flex items-center justify-between gap-3 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 transition-[background-color,border-color,transform] duration-150 hover:border-white/18 hover:bg-white/[0.08] active:scale-[0.995] active:bg-white/10"
                  >
                    {/* selectable — почта лежит внутри ссылки, но копировать её надо */}
                    <span className="selectable min-w-0 flex flex-col">
                      <span className="truncate text-base font-semibold tracking-tight text-white">
                        {u.username || r.email || `#${u.id}`}
                      </span>
                      {r.email && u.username && (
                        <span className="truncate text-xs text-white/45">{r.email}</span>
                      )}
                    </span>
                    <div className="flex min-w-0 shrink-0 items-center gap-2">
                      {r.role === 'admin' && (
                        <span className="rounded-md border border-accent/40 bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                          админ
                        </span>
                      )}
                      <span className={`max-w-[min(40vw,10rem)] truncate text-right text-sm font-medium ${statusClass(r.status)}`}>
                        {statusLabel(r.status)}
                      </span>
                      <span className="text-white/25 transition-colors group-hover:text-white/45" aria-hidden>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path
                            d="M9 6l6 6-6 6"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
            {rows.length === 0 && (
              <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm text-white/55">
                Список пуст или нет доступа к GET /api/user/all
              </p>
            )}
            {rows.length > 0 && filteredRows.length === 0 && (
              <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm text-white/55">
                По заданному поиску никого не найдено
              </p>
            )}
          </ul>
        )}
      </div>
    </div>
  );
};

export default AdminUsersListPage;
