import React, { useEffect, useState } from 'react';
import FastUsersIcon from '@img/fast-users-icon.svg?react';
import { useAppStore } from '../store/appStore';
import { Link } from 'react-router-dom';
import { userService } from '../api';
import { analyticsService } from '../api/analyticsService';
import type { AnalyticsSummary } from '../api/analyticsService';
import { useBodyBackground } from '../hooks/useBodyBackground';
import Skeleton from '../components/Skeleton';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Администратор',
  user: 'Пользователь',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Активен',
  pending: 'Ожидает подтверждения',
  blocked: 'Заблокирован',
};

const ProfilePage: React.FC = () => {
  const { user, setUser } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    if (!user) {
      (async () => {
        setLoading(true);
        setError(null);
        try {
          const u = await userService.getMe();
          if (mounted) {
            setUser(u);
            setError(null);
          }
        } catch (e) {
          console.error('Failed to load user profile', e);
          if (mounted) {
            const errorMessage = e instanceof Error ? e.message : 'Ошибка загрузки профиля';
            setError(errorMessage);
          }
        } finally {
          if (mounted) setLoading(false);
        }
      })();
    }
    return () => { mounted = false; };
  }, [user, setUser]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setSummaryLoading(true);
        const s = await analyticsService.getSummary();
        if (mounted) setSummary(s);
      } catch (e) {
        console.error('Failed to load analytics summary', e);
      } finally {
        if (mounted) setSummaryLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const u = user as (typeof user & { email?: string; role?: string; status?: string }) | null;
  const initials = (u?.username || u?.email || '?').slice(0, 2).toUpperCase();
  const avatarUrl = userService.buildAvatarUrl(user?.avatarPath);
  const isAdmin = u?.role === 'admin';

  useBodyBackground('bg-gradient-noise');

  const infoRows: Array<{ label: string; value: string }> = u
    ? [
      { label: 'Email', value: u.email || '—' },
      { label: 'Имя пользователя', value: u.username || '—' },
      { label: 'Роль', value: ROLE_LABELS[u.role || ''] || u.role || '—' },
      { label: 'Статус', value: STATUS_LABELS[u.status || ''] || u.status || '—' },
    ]
    : [];

  const conversionRate = summary?.conversion?.leadToReplyRate;
  const statRows: Array<{ label: string; value: string }> = summary
    ? [
      { label: 'Объявления', value: String(summary.items?.total ?? 0) },
      { label: 'Продавцы', value: String(summary.merchants?.total ?? 0) },
      { label: 'Диалоги', value: String(summary.dialogs?.total ?? 0) },
      { label: 'Ответы', value: String(summary.dialogs?.withSellerReply ?? 0) },
      {
        label: 'Конверсия',
        value: conversionRate != null ? `${Math.round(conversionRate * 1000) / 10}%` : '—',
      },
    ]
    : [];

  return (
    <div className="min-h-screen pt-safe">
      <div className="relative z-10 p-4 pb-32 pt-4">
        {loading && (
          <div className="flex flex-col gap-6 mt-2">
            <div className="flex items-center gap-4">
              <Skeleton variant="rectangular" className="w-24 h-24 rounded-2xl" />
              <div className="flex flex-col gap-3 flex-1">
                <Skeleton variant="text" className="w-40 h-6" />
                <Skeleton variant="text" className="w-24 h-4" />
              </div>
            </div>
          </div>
        )}
        {error && (
          <div className="text-center py-8">
            <div className="text-red-600 text-sm mb-4">{error}</div>
            <button
              onClick={() => {
                setError(null);
                setUser(null);
              }}
              className="px-4 py-2 bg-white/10 text-white rounded-xl text-sm font-medium"
            >
              Повторить попытку
            </button>
          </div>
        )}
        {!loading && !error && user && (
          <>
            <div className="flex items-center gap-4 mt-2">
              {avatarUrl ? (
                <div className="w-24 h-24 rounded-2xl overflow-hidden bg-white/5">
                  <img
                    src={avatarUrl}
                    alt={user?.username || 'avatar'}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              ) : (
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-[#00AEEF] to-[#0077B6] flex items-center justify-center text-white font-bold text-2xl">
                  {initials}
                </div>
              )}
              <div className="flex flex-col min-w-0">
                <span className="text-white text-2xl font-bold leading-tight truncate">{u?.username || u?.email || '—'}</span>
                {u?.username && <span className="text-white/50 text-sm mt-1 truncate">{u?.email}</span>}
              </div>
            </div>

            {/* Данные аккаунта */}
            <div className="mt-5 rounded-[24px] glass glass-border-light p-4 space-y-2.5">
              {infoRows.map((row) => (
                <div key={row.label} className="flex justify-between gap-3 text-sm">
                  <span className="text-white/50">{row.label}</span>
                  <span className="text-white font-medium text-right truncate">{row.value}</span>
                </div>
              ))}
            </div>

            {/* Аналитика */}
            <div className="mt-5">
              <p className="text-white text-[17px] font-semibold mb-3">Аналитика</p>
              <div className="rounded-[24px] glass glass-border-light p-4 space-y-2.5">
                {summaryLoading && (
                  <div className="space-y-2.5">
                    <Skeleton variant="text" className="w-full h-4" />
                    <Skeleton variant="text" className="w-3/4 h-4" />
                    <Skeleton variant="text" className="w-2/3 h-4" />
                  </div>
                )}
                {!summaryLoading && !summary && (
                  <p className="text-white/40 text-sm">Не удалось загрузить статистику</p>
                )}
                {!summaryLoading && summary && statRows.map((row) => (
                  <div key={row.label} className="flex justify-between gap-3 text-sm">
                    <span className="text-white/50">{row.label}</span>
                    <span className="text-white font-medium tabular-nums">{row.value}</span>
                  </div>
                ))}
              </div>
              <a
                href={analyticsService.getReportCsvUrl()}
                download
                className="mt-3 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-[16px] text-sm font-medium text-white transition-all duration-150 active:scale-[0.98]"
                style={{
                  background: 'rgba(255,255,255,0.6)',
                  border: '1px solid rgba(11,36,48,0.10)',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Скачать CSV
              </a>
            </div>

            {isAdmin && (
              <div className="mt-4">
                <Link
                  to="/admin/users"
                  className="inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-[16px] text-sm font-medium text-white transition-all duration-150 active:scale-[0.98]"
                  style={{
                    background: 'rgba(255,255,255,0.6)',
                    border: '1px solid rgba(11,36,48,0.10)',
                  }}
                >
                  <FastUsersIcon className="w-4 h-4" style={{ filter: 'brightness(0)' }} />
                  Пользователи
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ProfilePage;
