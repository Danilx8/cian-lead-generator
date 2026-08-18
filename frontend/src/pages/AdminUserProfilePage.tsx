import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppStore } from '../store/appStore';
import { adminService } from '../api/adminService';
import { templateService } from '../api/templateService';
import type { Template, User, Worker } from '../api/types';
import type { FilterRecord } from '../api/parserService';
import { userService } from '../api/userService';
import Skeleton from '../components/Skeleton';
import { isSlotRunning, canShutdownSlot } from '../utils/workerState';
import { copyToClipboard } from '../utils/clipboard';
import { ApiError } from '../api/client';
import { useSessionAppScroll } from '../hooks/useSessionListScroll';

const profileBgStyle: React.CSSProperties = {
  background: 'linear-gradient(180deg, #00AEEF -163.91%, #F5FAFD 55.2%)',
};

const glassListRow =
  'rounded-xl bg-white/5 px-4 py-3.5 glass-border-light transition-[background-color] duration-150 hover:bg-white/[0.08]';

const glassEmpty =
  'rounded-xl bg-white/5 px-4 py-3 text-center text-sm text-white/55 glass-border-light';

type TemplateFlag = 'isAutomatic' | 'isGreeting' | 'isSentImmediately';

// Названия флагов — как в редакторе шаблона (TemplateEditPage), чтобы админка
// называла их так же, как их видит владелец шаблона.
const TEMPLATE_TAGS: { key: TemplateFlag; label: string }[] = [
  { key: 'isAutomatic', label: 'Автоматический' },
  { key: 'isGreeting', label: 'Приветственный' },
  { key: 'isSentImmediately', label: 'Подряд' },
];

const STATUS_LABELS: Record<string, string> = {
  active: 'активен',
  pending: 'на модерации',
  blocked: 'заблокирован',
};

function SectionCard(props: {
  title: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(props.defaultCollapsed ?? false);
  const isCollapsible = props.collapsible ?? false;
  const contentId = useMemo(() => `section-${Math.random().toString(36).slice(2)}`, []);

  return (
    <section className="rounded-2xl bg-white/5 border border-white/10 p-4 mb-4">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={isCollapsible ? () => setCollapsed((c) => !c) : undefined}
          disabled={!isCollapsible}
          aria-expanded={isCollapsible ? !collapsed : undefined}
          aria-controls={isCollapsible ? contentId : undefined}
          className="group flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
        >
          {isCollapsible && (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              className={`shrink-0 text-white/50 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}
              aria-hidden="true"
            >
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          <h2 className="min-w-0 flex-1 text-base font-semibold leading-snug text-white uppercase tracking-wide">
            {props.title}
          </h2>
        </button>
        {props.headerRight != null ? <div className="shrink-0">{props.headerRight}</div> : null}
      </div>
      {!(isCollapsible && collapsed) && (
        <div id={isCollapsible ? contentId : undefined} className="mt-3">
          {props.children}
        </div>
      )}
    </section>
  );
}

const AdminUserProfilePage: React.FC = () => {
  const { userId: userIdParam } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user: viewer, notify } = useAppStore();
  const viewerId = viewer?.id;
  const userId = userIdParam ? Number(userIdParam) : NaN;

  const [user, setUser] = useState<User | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [filters, setFilters] = useState<FilterRecord[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // У страницы нет своего overflow-контейнера — она скроллится внутри #app-scroll-root,
  // поэтому восстанавливаем позицию через useSessionAppScroll. Ключ на конкретного юзера.
  useSessionAppScroll(
    `admin:user:${userIdParam ?? ''}`,
    !loading && !!user,
    workers.length + filters.length + templates.length
  );

  const [copyingAll, setCopyingAll] = useState(false);
  const [copyAllNote, setCopyAllNote] = useState<string | null>(null);

  const [slotBusy, setSlotBusy] = useState<Record<number, 'start' | 'stop'>>({});
  const [startingAllSlots, setStartingAllSlots] = useState(false);
  const [filterBusy, setFilterBusy] = useState<Record<number, boolean>>({});
  const [filterCheckBusy, setFilterCheckBusy] = useState<Record<number, boolean>>({});

  const hasStoppedSlots = useMemo(() => workers.some((w) => !isSlotRunning(w.status)), [workers]);

  const loadAll = useCallback(async () => {
    if (!Number.isFinite(userId)) return;
    setLoading(true);
    setError(null);
    try {
      let effectiveViewerId: number | undefined = viewerId ?? undefined;
      if (effectiveViewerId == null) {
        try {
          effectiveViewerId = (await userService.getMe()).id;
        } catch {
          // нет доступа к /me — оставляем viewerId как есть
        }
      }

      const u = await adminService.getUser(userId);
      setUser(u);

      const [w, f, t] = await Promise.all([
        adminService.getWorkersForUser(userId, effectiveViewerId).catch((e) => {
          console.warn('workers load', e);
          return [] as Worker[];
        }),
        adminService.getFiltersForUser(userId, effectiveViewerId).catch((e) => {
          console.warn('filters load', e);
          return [] as FilterRecord[];
        }),
        adminService.getTemplatesForUser(userId, effectiveViewerId).catch((e) => {
          console.warn('templates load', e);
          return [] as Template[];
        }),
      ]);
      setWorkers(w);
      setFilters(f);
      setTemplates(t);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [userId, viewerId]);

  useEffect(() => {
    if (!Number.isFinite(userId)) {
      setError('Некорректный id');
      setLoading(false);
      return;
    }
    void loadAll();
  }, [userId, loadAll]);

  const avatarUrl = userService.buildAvatarUrl(user?.avatarPath);
  const urec = user as (User & { email?: string; role?: string; status?: string }) | null;
  const initials = (user?.username || urec?.email || '?').slice(0, 2).toUpperCase();

  const onStartSlot = async (workerId: number) => {
    setSlotBusy((s) => ({ ...s, [workerId]: 'start' }));
    try {
      const w = await adminService.startWorker(workerId);
      setWorkers((prev) => prev.map((p) => (p.id === workerId ? { ...p, ...w } : p)));
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Ошибка запуска');
    } finally {
      setSlotBusy((s) => {
        const n = { ...s };
        delete n[workerId];
        return n;
      });
    }
  };

  const onStopSlot = async (workerId: number) => {
    setSlotBusy((s) => ({ ...s, [workerId]: 'stop' }));
    try {
      const w = await adminService.shutdownWorker(workerId);
      setWorkers((prev) => prev.map((p) => (p.id === workerId ? { ...p, ...w } : p)));
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Ошибка остановки');
    } finally {
      setSlotBusy((s) => {
        const n = { ...s };
        delete n[workerId];
        return n;
      });
    }
  };

  const onStartAllStoppedSlots = async () => {
    if (startingAllSlots || !Number.isFinite(userId) || workers.length === 0 || !hasStoppedSlots) return;

    setStartingAllSlots(true);
    try {
      const res = await adminService.startAllWorkersForUser(userId);
      const failed = res.failedRuns ?? [];
      if (failed.length > 0) {
        const msg = failed.map((f) => `#${f.id}: ${f.reason}`).join('\n');
        setError(msg.length > 420 ? `${msg.slice(0, 420)}…` : msg);
      }
      await loadAll();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Ошибка массового запуска слотов');
    } finally {
      setStartingAllSlots(false);
    }
  };

  const toggleFilter = async (f: FilterRecord) => {
    if (!user) return;
    setFilterBusy((b) => ({ ...b, [f.id]: true }));
    try {
      const next = await adminService.patchUserFilter(user.id, f.id, { isActive: !f.isActive });
      setFilters((prev) => prev.map((x) => (x.id === f.id ? next : x)));
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Ошибка (проверьте эндпоинт фильтров на бэкенде)';
      setError(msg);
    } finally {
      setFilterBusy((b) => {
        const n = { ...b };
        delete n[f.id];
        return n;
      });
    }
  };

  const checkFilter = async (f: FilterRecord) => {
    setFilterCheckBusy((b) => ({ ...b, [f.id]: true }));
    try {
      const res = await adminService.checkFilter(f.id);
      const type = res.status === 'ok' ? 'success' : res.status === 'ineffective_filter' ? 'warning' : 'error';
      notify(`${f.name || `Фильтр #${f.id}`}: ${res.message}`, type);
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setFilterCheckBusy((b) => {
        const n = { ...b };
        delete n[f.id];
        return n;
      });
    }
  };

  const onCopyAllTemplates = async () => {
    if (copyingAll || templates.length === 0) return;
    setCopyingAll(true);
    setCopyAllNote(null);
    try {
      let ok = 0;
      for (const t of templates) {
        await templateService.createTemplate({
          title: t.title,
          texts: t.texts,
          isGreeting: t.isGreeting,
          isAutomatic: t.isAutomatic,
          isSentImmediately: t.isSentImmediately,
        });
        ok += 1;
      }
      setCopyAllNote(`Скопировано себе: ${ok} из ${templates.length}`);
    } catch (e) {
      console.error(e);
      setCopyAllNote(e instanceof Error ? e.message : 'Не удалось скопировать шаблоны');
    } finally {
      setCopyingAll(false);
    }
  };

  const onCopyTemplateText = async (t: Template, idx: number) => {
    const text = (t.texts ?? []).filter(Boolean).join('\n\n');
    try {
      await copyToClipboard(text);
      notify(`Скопировано: ${t.title || `Шаблон #${idx + 1}`}`, 'success');
    } catch (e) {
      console.error(e);
      notify('Не удалось скопировать', 'error');
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
        <div className="flex items-center gap-3 mb-4">
          <button
            type="button"
            onClick={() => navigate('/admin/users')}
            className="text-white/80 text-sm font-medium px-3 py-1.5 rounded-xl bg-white/10"
          >
            Назад
          </button>
        </div>
        {loading && (
          <div className="flex flex-col gap-4">
            <Skeleton variant="rectangular" className="h-24 w-full rounded-2xl border border-white/10 bg-white/5" />
            <Skeleton variant="rectangular" className="h-40 w-full rounded-2xl border border-white/10 bg-white/5" />
          </div>
        )}
        {error && (
          <div className="rounded-xl bg-red-500/15 border border-red-400/30 text-red-600 text-sm p-4 mb-4">{error}</div>
        )}
        {!loading && user && (
          <>
            <div className="flex items-center gap-4 mb-6">
              {avatarUrl ? (
                <div className="w-20 h-20 rounded-2xl overflow-hidden bg-white/5">
                  <img
                    src={avatarUrl}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#00AEEF] to-[#0077B6] flex items-center justify-center text-black font-bold text-xl">
                  {initials}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-white text-2xl font-bold truncate">
                  {user.username || urec?.email || `#${user.id}`}
                </div>
                {urec?.email && (
                  <div className="selectable text-text-secondary text-sm truncate">{urec.email}</div>
                )}
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-text-secondary text-sm">
                  <span>id {user.id}</span>
                  {urec?.role === 'admin' && (
                    <span className="rounded-md border border-accent/40 bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                      админ
                    </span>
                  )}
                  {urec?.status && (
                    <span
                      className={
                        urec.status === 'blocked'
                          ? 'text-red-600'
                          : urec.status === 'pending'
                            ? 'text-yellow-600'
                            : 'text-white/55'
                      }
                    >
                      {STATUS_LABELS[urec.status] ?? urec.status}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <SectionCard
              title="Слоты"
              collapsible
              headerRight={
                <button
                  type="button"
                  disabled={startingAllSlots || workers.length === 0 || !hasStoppedSlots}
                  onClick={() => void onStartAllStoppedSlots()}
                  className="rounded-lg border border-white/15 bg-accent px-2.5 py-1 text-[11px] sm:text-xs font-semibold text-black transition active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap"
                  aria-label="Запустить все остановленные слоты"
                >
                  {startingAllSlots ? 'Запуск…' : 'Запустить все'}
                </button>
              }
            >
              {workers.length === 0 ? (
                <p className={glassEmpty}>Нет слотов или нет доступа к списку воркеров.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {workers.map((w) => {
                    const running = isSlotRunning(w.status);
                    const canStop = canShutdownSlot(w.status);
                    const busy = slotBusy[w.id];
                    const wrec = w as Worker & Record<string, unknown>;
                    return (
                      <li
                        key={w.id}
                        className={`group flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${glassListRow}`}
                      >
                        <div className="min-w-0">
                          <div className="text-base font-semibold tracking-tight text-white">Слот #{w.id}</div>
                          <div className="mt-0.5 text-xs text-white/55">
                            {String(w.status)} {w.isActive ? '· активен' : ''}
                          </div>
                          {wrec.accountId != null && (
                            <div className="mt-0.5 text-xs text-white/55">
                              Аккаунт: <span className="text-white/80 font-medium">#{String(wrec.accountId)}</span>
                            </div>
                          )}
                          {wrec.dialogsCount != null && (
                            <div className="mt-0.5 text-xs text-white/55">
                              Диалогов: <span className="text-white/80 font-medium">{String(wrec.dialogsCount)}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={!!busy || running}
                            onClick={() => void onStartSlot(w.id)}
                            className="rounded-lg border border-white/15 bg-accent px-3 py-1.5 text-sm font-semibold text-black disabled:opacity-40"
                          >
                            {busy === 'start' ? '…' : 'Запуск'}
                          </button>
                          <button
                            type="button"
                            disabled={!!busy || !canStop}
                            onClick={() => void onStopSlot(w.id)}
                            className="rounded-lg border border-white/10 bg-white/15 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-40"
                          >
                            {busy === 'stop' ? '…' : 'Стоп'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              navigate(`/slots/${w.id}/logs`, {
                                state: { adminBackTo: `/admin/users/${userId}` },
                              })
                            }
                            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white transition-colors hover:bg-white/10"
                          >
                            Логи
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="Фильтры">
              {filters.length === 0 ? (
                <p className={glassEmpty}>Нет фильтров или нет доступа к списку.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {filters.map((f) => (
                    <li
                      key={f.id}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${glassListRow}`}
                    >
                      <div className="min-w-0">
                        <div className="text-base font-semibold tracking-tight text-white">
                          {f.name || `Фильтр #${f.id}`}
                        </div>
                        <div className="mt-0.5 text-xs text-white/55">{f.isActive ? 'Активен' : 'Выключен'}</div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={!!filterCheckBusy[f.id]}
                          onClick={() => void checkFilter(f)}
                          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white transition-colors hover:bg-white/15 disabled:opacity-50"
                        >
                          {filterCheckBusy[f.id] ? '…' : 'Проверить'}
                        </button>
                        <button
                          type="button"
                          disabled={!!filterBusy[f.id]}
                          onClick={() => void toggleFilter(f)}
                          className="rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-sm text-white transition-colors hover:bg-white/15 disabled:opacity-50"
                        >
                          {filterBusy[f.id] ? '…' : f.isActive ? 'Выключить' : 'Включить'}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard
              title="Шаблоны"
              headerRight={
                <button
                  type="button"
                  disabled={copyingAll || templates.length === 0}
                  onClick={() => void onCopyAllTemplates()}
                  className="rounded-lg border border-white/15 bg-accent px-2.5 py-1 text-[11px] sm:text-xs font-semibold text-black transition active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap"
                  aria-label="Скопировать все шаблоны себе"
                >
                  {copyingAll ? 'Копирование…' : 'Копировать все'}
                </button>
              }
            >
              {copyAllNote && <p className="mb-3 text-xs text-white/70">{copyAllNote}</p>}
              {templates.length === 0 ? (
                <p className={glassEmpty}>Нет шаблонов или бэкенд ещё не отдаёт чужие шаблоны.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {templates.map((t, idx) => {
                    const preview = (t.texts ?? []).find((x) => x && x.trim()) ?? '';
                    const tags = TEMPLATE_TAGS.filter((tag) => t[tag.key]);
                    return (
                      <li key={idx}>
                        {/* Вся карточка — кнопка копирования. */}
                        <button
                          type="button"
                          onClick={() => void onCopyTemplateText(t, idx)}
                          className={`block w-full text-left ${glassListRow}`}
                          aria-label={`Скопировать тексты шаблона «${t.title || `Шаблон #${idx + 1}`}»`}
                        >
                          <div className="min-w-0">
                            <div className="text-base font-semibold tracking-tight text-white truncate">
                              {t.title || `Шаблон #${idx + 1}`}
                            </div>
                            {preview && (
                              <div className="mt-0.5 text-xs text-white/55 line-clamp-2 break-words">{preview}</div>
                            )}
                            <div className="mt-0.5 text-[11px] text-white/40">Текстов: {t.texts?.length ?? 0}</div>
                            {tags.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {tags.map((tag) => (
                                  <span
                                    key={tag.key}
                                    className="rounded-md bg-white/[0.08] px-1.5 py-0.5 text-[10px] text-white/50"
                                  >
                                    {tag.label}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </SectionCard>
          </>
        )}
      </div>
    </div>
  );
};

export default AdminUserProfilePage;
