import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminService } from '../api/adminService';
import { useAppStore } from '../store/appStore';
import Skeleton from '../components/Skeleton';

const profileBgStyle: React.CSSProperties = {
  background: 'linear-gradient(180deg, #00AEEF -163.91%, #F5FAFD 55.2%)',
};

type RegistrationRow = {
  id: number;
  email?: string;
  username?: string | null;
  createdAt?: string;
};

function formatDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const AdminRegistrationsPage: React.FC = () => {
  const { notify } = useAppStore();
  const [rows, setRows] = useState<RegistrationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<number, 'approve' | 'reject'>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const list = (await adminService.getRegistrations()) as unknown;
        const arr = Array.isArray(list)
          ? list
          : Array.isArray((list as { registrations?: unknown })?.registrations)
            ? (list as { registrations: unknown[] }).registrations
            : Array.isArray((list as { users?: unknown })?.users)
              ? (list as { users: unknown[] }).users
              : [];
        const normalized = (arr as Record<string, unknown>[])
          .filter((r) => r && typeof r === 'object')
          .map((r) => ({
            id: Number(r.id ?? r.userId),
            email: typeof r.email === 'string' ? r.email : undefined,
            username: typeof r.username === 'string' ? r.username : null,
            createdAt: typeof r.createdAt === 'string' ? r.createdAt : undefined,
          }))
          .filter((r) => Number.isFinite(r.id));
        if (!cancelled) setRows(normalized);
      } catch (e) {
        console.error(e);
        if (!cancelled) setError(e instanceof Error ? e.message : 'Не удалось загрузить заявки');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const act = async (row: RegistrationRow, action: 'approve' | 'reject') => {
    if (busy[row.id]) return;
    setBusy((b) => ({ ...b, [row.id]: action }));
    // Оптимистично убираем строку — при ошибке вернём назад.
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    try {
      if (action === 'approve') {
        await adminService.approveRegistration(row.id);
        notify(`Заявка ${row.email ?? `#${row.id}`} одобрена`, 'success');
      } else {
        await adminService.rejectRegistration(row.id);
        notify(`Заявка ${row.email ?? `#${row.id}`} отклонена`, 'success');
      }
    } catch (e) {
      console.error(e);
      setRows((prev) => (prev.some((r) => r.id === row.id) ? prev : [row, ...prev]));
      notify(e instanceof Error ? e.message : 'Ошибка обработки заявки', 'error');
    } finally {
      setBusy((b) => {
        const n = { ...b };
        delete n[row.id];
        return n;
      });
    }
  };

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
            to="/admin/users"
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 text-white/80 text-sm font-medium px-3 py-1.5 rounded-xl bg-white/10"
          >
            Назад
          </Link>
          <h1 className="text-xl font-bold text-white text-center">Заявки на регистрацию</h1>
        </div>

        {loading && (
          <div className="flex flex-col gap-3">
            <Skeleton variant="rectangular" className="h-[84px] w-full rounded-xl border border-white/10 bg-white/5" />
            <Skeleton variant="rectangular" className="h-[84px] w-full rounded-xl border border-white/10 bg-white/5" />
            <Skeleton variant="rectangular" className="h-[84px] w-full rounded-xl border border-white/10 bg-white/5" />
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-500/15 border border-red-400/30 text-red-600 text-sm p-4">{error}</div>
        )}

        {!loading && !error && (
          <ul className="flex flex-col gap-3">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3.5"
              >
                <div className="selectable min-w-0">
                  <div className="truncate text-base font-semibold tracking-tight text-white">
                    {r.email ?? `#${r.id}`}
                  </div>
                  <div className="mt-0.5 text-xs text-white/55">
                    {r.username ? `${r.username} · ` : ''}
                    {formatDate(r.createdAt) || `id ${r.id}`}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={!!busy[r.id]}
                    onClick={() => void act(r, 'approve')}
                    className="rounded-lg border border-white/15 bg-accent px-3 py-1.5 text-sm font-semibold text-black transition active:scale-[0.98] disabled:opacity-40"
                  >
                    {busy[r.id] === 'approve' ? '…' : 'Одобрить'}
                  </button>
                  <button
                    type="button"
                    disabled={!!busy[r.id]}
                    onClick={() => void act(r, 'reject')}
                    className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-1.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-500/20 active:scale-[0.98] disabled:opacity-40"
                  >
                    {busy[r.id] === 'reject' ? '…' : 'Отклонить'}
                  </button>
                </div>
              </li>
            ))}
            {rows.length === 0 && (
              <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm text-white/55">
                Нет заявок
              </p>
            )}
          </ul>
        )}
      </div>
    </div>
  );
};

export default AdminRegistrationsPage;
