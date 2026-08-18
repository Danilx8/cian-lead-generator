import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useMatch, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useBodyBackground } from '../hooks/useBodyBackground';
import { PillSelect } from '../components/ui/PillSelect';
import { workerService, parserService } from '../api';
import { accountService } from '../api/accountService';
import type { Worker, UpdateWorkerRequest } from '../api/types';
import type { FilterRecord } from '../api/parserService';
import { apiErrorHandler, useApiErrorHandler } from '../utils/apiErrorHandler';
import { useKeyboardOpen } from '../hooks/useKeyboardOpen';

type BrowserCore = 1 | 2;
type BrowserOption = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

/** Аккаунт cian (заменяет старую сущность cookie). */
interface AccountItem {
  id: number;
  login: string;
  name?: string;
}

const FILTER_SELECT_NONE = '__none__';

interface ProfileOptionsPayload {
  browserOption?: number;
  browserCore?: number;
  operatorSystemId?: number;
  userAgent?: string;
  usesBrowser?: boolean;
  filterOptions?: { id: number; parsingLink: string };
}

/** Section card wrapper */
const Section: React.FC<{ title: string; subtitle?: string; required?: boolean; filled?: boolean; className?: string; children: React.ReactNode }> = ({ title, subtitle, required, filled, className, children }) => (
  <div className={className}>
    <div className="mb-3 flex items-baseline gap-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-white text-[17px] font-semibold">{title}</p>
          {required && !filled && (
            <span className="text-[10px] font-medium text-red-600 bg-red-500/10 rounded px-1.5 py-0.5">обязательно</span>
          )}
          {required && filled && (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="8" fill="#22c55e" fillOpacity="0.15" /><path d="M5 8.5L7 10.5L11 6.5" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          )}
        </div>
        {subtitle && <p className="text-[13px] text-white/40 mt-0.5">{subtitle}</p>}
      </div>
    </div>
    <div className="glass glass-border-light rounded-[24px] p-4">
      {children}
    </div>
  </div>
);

const parsePositiveInt = (raw: unknown, fallback: number, max?: number): number => {
  let n: number | null = null;
  if (typeof raw === 'number' && Number.isFinite(raw)) n = Math.floor(raw);
  else if (typeof raw === 'string' && /^\d+$/.test(raw)) n = Number(raw);
  if (n === null || n < 1) return fallback;
  if (max !== undefined && n > max) return fallback;
  return n;
};

const applyWorkerToForm = (wn: Record<string, unknown>) => {
  const browserOpt = parsePositiveInt(
    wn.browserOption ?? wn.browserType ?? wn.BrowserOption ?? wn.BrowserType,
    2,
    11
  ) as BrowserOption;
  const core = parsePositiveInt(wn.browserCore ?? wn.BrowserCore, 1, 2) as BrowserCore;
  const os = parsePositiveInt(
    wn.operationSystem ?? wn.operatorSystemId ?? wn.operationSystemId,
    1,
    3
  );
  const ua = typeof wn.userAgent === 'string' ? wn.userAgent : '';
  const fid = wn.filterId;
  const filterId = typeof fid === 'number' && Number.isFinite(fid) ? fid : undefined;
  return { browserOpt, core, os, userAgent: ua, filterId };
};

const SPRING_TAP = { type: 'spring' as const, stiffness: 500, damping: 25 };

const SlotEditPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { handleError } = useApiErrorHandler();

  useBodyBackground('bg-gradient-noise');

  const editMatch = useMatch('/slots/:workerId/edit');
  const workerIdParam = editMatch?.params.workerId;
  const isEdit = Boolean(workerIdParam && /^\d+$/.test(workerIdParam));
  const editWorkerId = isEdit && workerIdParam ? Number(workerIdParam) : null;

  const [formReady, setFormReady] = useState(() => !Boolean(editMatch));

  const title = isEdit && editWorkerId != null ? `Слот #${editWorkerId}` : 'Новый слот';

  const [browserOption, setBrowserOption] = useState<BrowserOption>(2);
  const [browserCore, setBrowserCore] = useState<BrowserCore>(1);
  const [operatorSystemId, setOperatorSystemId] = useState<number>(1);
  const [userAgent, setUserAgent] = useState('');
  const [amountStr, setAmountStr] = useState('1');
  const [loading, setLoading] = useState(false);

  const [accountItems, setAccountItems] = useState<AccountItem[]>([]);
  const [accountItemsLoading, setAccountItemsLoading] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const currentWorkerAccountIdRef = useRef<number | null>(null);
  const accountItemsCacheRef = useRef<AccountItem[]>([]);

  const [accLogin, setAccLogin] = useState('');
  const [accPassword, setAccPassword] = useState('');
  const [accName, setAccName] = useState('');
  const [accCreating, setAccCreating] = useState(false);
  const [accNotice, setAccNotice] = useState('');

  const [workerMissing, setWorkerMissing] = useState(false);
  const [filters, setFilters] = useState<FilterRecord[]>([]);
  const [filtersLoading, setFiltersLoading] = useState(false);
  const [selectedFilterId, setSelectedFilterId] = useState<number | null>(null);

  const clampAmount = (n: number) => Math.min(999, Math.max(1, Math.floor(n)));

  const parseAmount = (): number => {
    const n = parseInt(amountStr.replace(/\D/g, ''), 10);
    return Number.isFinite(n) ? clampAmount(n) : 1;
  };

  const bumpAmount = (delta: number) => {
    setAmountStr(String(clampAmount(parseAmount() + delta)));
  };

  const onAmountChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (digits === '') {
      setAmountStr('');
      return;
    }
    const n = parseInt(digits, 10);
    if (!Number.isFinite(n)) return;
    setAmountStr(String(Math.min(999, n)));
  };

  const onAmountBlur = () => {
    if (amountStr === '') {
      setAmountStr('1');
      return;
    }
    setAmountStr(String(parseAmount()));
  };

  const hydrateFromWorker = useCallback((wn: Record<string, unknown>) => {
    const { browserOpt, core, os, userAgent: ua, filterId } = applyWorkerToForm(wn);
    setBrowserOption(browserOpt);
    setBrowserCore(core);
    setOperatorSystemId(os);
    setUserAgent(ua);
    if (typeof filterId === 'number') setSelectedFilterId(filterId);
    else setSelectedFilterId(null);
    const accountId = typeof wn.accountId === 'number' ? wn.accountId : null;
    currentWorkerAccountIdRef.current = accountId;
    const cache = accountItemsCacheRef.current;
    const matched = accountId ? cache.find(r => r.id === accountId) : null;
    if (matched) setSelectedAccountId(matched.id);
  }, []);

  useLayoutEffect(() => {
    if (isEdit) {
      setFormReady(false);
      setWorkerMissing(false);
    } else {
      setFormReady(true);
    }
  }, [isEdit, editWorkerId]);

  useEffect(() => {
    if (!isEdit || editWorkerId == null) return;

    let cancelled = false;

    const fromState = (location.state as { worker?: Worker } | undefined)?.worker;
    if (fromState && Number((fromState as any).id) === editWorkerId) {
      hydrateFromWorker(fromState as unknown as Record<string, unknown>);
      setFormReady(true);
      return;
    }

    (async () => {
      try {
        const list = await workerService.getWorkers();
        if (cancelled) return;
        const w = list.find((x) => (x as any).id === editWorkerId);
        if (!w) {
          setWorkerMissing(true);
          setFormReady(true);
          return;
        }
        hydrateFromWorker(w as unknown as Record<string, unknown>);
      } catch (e) {
        if (!cancelled) {
          console.error('load worker', e);
          setWorkerMissing(true);
          apiErrorHandler.handleError(e, 'Не удалось загрузить слот');
        }
      } finally {
        if (!cancelled) setFormReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isEdit, editWorkerId, hydrateFromWorker]);

  useEffect(() => {
    let cancelled = false;
    setFiltersLoading(true);
    (async () => {
      try {
        const list = await parserService.getFilters();
        if (cancelled) return;
        const normalized = Array.isArray(list)
          ? list.filter((f): f is FilterRecord => f && typeof f.id === 'number')
          : [];
        setFilters(normalized);

        if (!isEdit && normalized.length > 0) {
          const def = normalized.find((f) => f.isActive) ?? normalized[0];
          setSelectedFilterId((prev) => (prev ?? def.id));
        }
      } catch (e) {
        console.error('filters', e);
      } finally {
        if (!cancelled) setFiltersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const keyboardOpen = useKeyboardOpen();

  const filterSelectOptions = useMemo(
    () => [
      { value: FILTER_SELECT_NONE, label: isEdit ? 'Без фильтра' : 'Выберите фильтр' },
      ...filters.map((f) => ({
        value: String(f.id),
        label: f.name || `Фильтр #${f.id}`,
      })),
    ],
    [filters, isEdit]
  );

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'instant' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }, 0);
    return () => clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setAccountItemsLoading(true);
      try {
        const items = await accountService.getAccounts();
        if (!isMounted) return;
        const mapped: AccountItem[] = (Array.isArray(items) ? items : []).map((a: any) => ({
          id: a.id,
          login: a.login ?? a.name ?? `Аккаунт #${a.id}`,
          name: a.name,
        }));
        accountItemsCacheRef.current = mapped;
        setAccountItems(mapped);
        const workerAccountId = currentWorkerAccountIdRef.current;
        const matched = workerAccountId ? mapped.find(r => r.id === workerAccountId) : null;
        if (matched) setSelectedAccountId(matched.id);
      } catch (e) {
        console.error('Failed to load accounts', e);
      } finally {
        if (isMounted) setAccountItemsLoading(false);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  const addAccount = async () => {
    const login = accLogin.trim();
    const password = accPassword.trim();
    if (!login || !password) {
      setAccNotice('Укажите логин и пароль аккаунта');
      return;
    }
    setAccCreating(true);
    setAccNotice('');
    try {
      const created: any = await accountService.createAccount({
        login,
        password,
        name: accName.trim() || undefined,
      });
      const item: AccountItem = {
        id: created?.id,
        login: created?.login ?? login,
        name: created?.name ?? (accName.trim() || undefined),
      };
      if (typeof item.id === 'number') {
        setAccountItems(prev => [item, ...prev]);
        accountItemsCacheRef.current = [item, ...accountItemsCacheRef.current];
        setSelectedAccountId(item.id);
      }
      setAccLogin('');
      setAccPassword('');
      setAccName('');
    } catch (e) {
      console.error('Failed to create account', e);
      setAccNotice('Не удалось создать аккаунт');
    } finally {
      setAccCreating(false);
    }
  };

  const removeAccount = async (id: number) => {
    try {
      await accountService.deleteAccount(id);
      setAccountItems(prev => prev.filter(x => x.id !== id));
      accountItemsCacheRef.current = accountItemsCacheRef.current.filter(x => x.id !== id);
      if (selectedAccountId === id) setSelectedAccountId(null);
    } catch (e) {
      console.error('Failed to delete account', e);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const trimmedUserAgent = userAgent.trim();

      if (isEdit && editWorkerId != null) {
        const body: UpdateWorkerRequest = {
          browserType: browserOption,
          browserCore,
          operationSystem: operatorSystemId,
          userAgent: trimmedUserAgent,
        };
        if (filters.length > 0) {
          if (selectedFilterId !== null) body.filterId = selectedFilterId;
        }
        if (selectedAccountId) (body as any).accountId = selectedAccountId;
        await workerService.updateWorker(editWorkerId, body);
        navigate('/slots');
        return;
      }

      const profileOptions: ProfileOptionsPayload = {
        browserOption,
        browserCore,
        operatorSystemId,
      };

      if (selectedFilterId !== null) {
        const selectedFilter = filters.find((f) => f.id === selectedFilterId);
        profileOptions.filterOptions = {
          id: selectedFilterId,
          parsingLink: selectedFilter?.searchLink ?? '',
        };
      }

      if (trimmedUserAgent.length > 0) {
        profileOptions.userAgent = trimmedUserAgent;
      }

      const amount = parseAmount();

      const createPayload = {
        profileOptions,
        amount,
      };
      const created = await workerService.createWorker(createPayload);

      const createdList: unknown[] = Array.isArray((created as any)?.workers)
        ? (created as any).workers
        : [created];
      const createdIds = createdList
        .map((w) => Number((w as any)?.id))
        .filter((n) => Number.isFinite(n));

      // При создании одного слота — привязываем выбранный аккаунт.
      const bulkCreate = amount > 1;
      const accountPool = !bulkCreate && selectedAccountId ? [selectedAccountId] : [];

      if (createdIds.length > 0 && accountPool.length > 0) {
        await Promise.allSettled(
          createdIds.map((id, i) => {
            const patch: UpdateWorkerRequest = {};
            (patch as any).accountId = accountPool[i % accountPool.length];
            return workerService.updateWorker(id, patch);
          })
        );
      }

      navigate('/slots');
    } catch (error) {
      console.error('Ошибка при сохранении слота:', error);
      handleError(error, 'Не удалось сохранить слот');
    } finally {
      setLoading(false);
    }
  };

  if (isEdit && !formReady && !workerMissing) {
    return (
      <div className="min-h-screen pt-safe flex flex-col items-center justify-center px-6">
        <p className="text-white/70">Загрузка слота…</p>
      </div>
    );
  }

  if (isEdit && workerMissing) {
    return (
      <div className="min-h-screen pt-safe flex flex-col">
        <div className="flex items-center gap-3 px-4 pt-4 mb-5">
          <div className="w-9 h-9 shrink-0">
            <motion.button
              type="button"
              onClick={() => navigate('/slots')}
              whileTap={{ scale: 0.9 }}
              transition={SPRING_TAP}
              className="w-9 h-9 rounded-full flex items-center justify-center text-white glass-border-light"
              style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(20px) saturate(1.2)', WebkitBackdropFilter: 'blur(20px) saturate(1.2)' }}
              aria-label="Назад"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </motion.button>
          </div>
          <h1 className="text-white text-[28px] font-bold">{title}</h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <p className="text-white/80 mb-4">Слот не найден или нет доступа.</p>
          <Link to="/slots" className="text-accent font-semibold">
            К списку слотов
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-safe">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 pt-4 mb-5">
        <div className="w-9 h-9 shrink-0">
          <motion.button
            type="button"
            onClick={() => navigate('/slots')}
            whileTap={{ scale: 0.9 }}
            transition={SPRING_TAP}
            className="w-9 h-9 rounded-full flex items-center justify-center text-white glass-border-light"
            style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(20px) saturate(1.2)', WebkitBackdropFilter: 'blur(20px) saturate(1.2)' }}
            aria-label="Назад"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </motion.button>
        </div>
        <h1 className="text-white text-[28px] font-bold">{title}</h1>
      </div>

      {/* ── Form body ── */}
      <div className="px-4 pt-4 pb-44 space-y-5">

        {!isEdit && (
          <Section title="Количество" subtitle="Сколько слотов создать с одинаковыми настройками">
            <div className="flex items-stretch gap-2.5">
              <button
                type="button"
                aria-label="Уменьшить количество"
                onClick={() => bumpAmount(-1)}
                className="shrink-0 w-14 rounded-xl bg-white/[0.06] glass-border-light text-white text-2xl font-semibold leading-none active:scale-[0.96] transition"
              >
                −
              </button>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                aria-label="Количество слотов"
                value={amountStr}
                onChange={(e) => onAmountChange(e.target.value)}
                onBlur={onAmountBlur}
                className="min-w-0 flex-1 rounded-xl bg-white/[0.06] glass-border-light text-white text-center text-lg font-semibold tabular-nums px-3 py-3 focus:outline-none transition"
              />
              <button
                type="button"
                aria-label="Увеличить количество"
                onClick={() => bumpAmount(1)}
                className="shrink-0 w-14 rounded-xl bg-white/[0.06] glass-border-light text-white text-2xl font-semibold leading-none active:scale-[0.96] transition"
              >
                +
              </button>
            </div>
          </Section>
        )}

        <Section title="Фильтр парсинга" subtitle="Привязка фильтра к слоту" className="relative z-30">
          {filtersLoading ? (
            <p className="text-sm text-white/40">Загрузка фильтров…</p>
          ) : filters.length === 0 ? (
            <p className="text-sm text-white/45">
              Нет сохранённых фильтров. Создайте фильтр в настройках парсера.
            </p>
          ) : (
            <>
              <PillSelect
                aria-label="Фильтр парсинга"
                value={selectedFilterId === null ? FILTER_SELECT_NONE : String(selectedFilterId)}
                options={filterSelectOptions}
                onChange={(v) =>
                  setSelectedFilterId(v === FILTER_SELECT_NONE ? null : Number(v))
                }
              />
              {isEdit && (
                <p className="mt-2.5 text-xs text-white/35 leading-snug">
                  «Без фильтра» убирает привязку фильтра парсинга к слоту.
                </p>
              )}
            </>
          )}
        </Section>

        {/* ─── Аккаунт cian (скрыто при создании нескольких слотов) ─── */}
        {(isEdit || parseAmount() <= 1) && (
          <>
            <Section title="Аккаунт" subtitle="Добавьте аккаунт cian (логин и пароль)" required={!isEdit && parseAmount() <= 1} filled={selectedAccountId !== null}>
              <div className="space-y-2.5">
                <input
                  className="w-full bg-white/[0.06] glass-border-light focus:outline-none rounded-xl px-3 py-3 text-white placeholder-white/25 text-sm transition"
                  placeholder="Логин (email / телефон)"
                  autoComplete="off"
                  value={accLogin}
                  onChange={e => setAccLogin(e.target.value)}
                />
                <input
                  className="w-full bg-white/[0.06] glass-border-light focus:outline-none rounded-xl px-3 py-3 text-white placeholder-white/25 text-sm transition"
                  placeholder="Пароль"
                  type="password"
                  autoComplete="new-password"
                  value={accPassword}
                  onChange={e => setAccPassword(e.target.value)}
                />
                <input
                  className="w-full bg-white/[0.06] glass-border-light focus:outline-none rounded-xl px-3 py-3 text-white placeholder-white/25 text-sm transition"
                  placeholder="Название (необязательно)"
                  autoComplete="off"
                  value={accName}
                  onChange={e => setAccName(e.target.value)}
                />
                <button
                  type="button"
                  disabled={accCreating}
                  onClick={addAccount}
                  className="w-full h-10 rounded-xl bg-accent text-black text-sm font-semibold active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {accCreating ? 'Добавление…' : 'Добавить аккаунт'}
                </button>
                {accNotice && <p className="text-xs text-red-600 font-medium">{accNotice}</p>}
              </div>
            </Section>

            {/* Saved accounts list */}
            {(accountItemsLoading || accountItems.length > 0) && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-medium uppercase tracking-wide text-white/35">Сохранённые аккаунты</p>
                  {!accountItemsLoading && accountItems.length > 0 && (
                    <span className="text-[11px] text-white/25 tabular-nums">{accountItems.length} шт.</span>
                  )}
                </div>
                {accountItemsLoading ? (
                  <p className="text-sm text-white/30">Загрузка…</p>
                ) : (
                  <div className="max-h-[220px] overflow-y-auto space-y-1 rounded-xl" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(11,36,48,0.10) transparent' }}>
                    {accountItems.map(r => {
                      const isSelected = r.id === selectedAccountId;
                      const label = r.name ? `${r.name} · ${r.login}` : r.login;
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setSelectedAccountId(isSelected ? null : r.id)}
                          className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 transition-all active:scale-[0.98] ${isSelected
                            ? 'bg-white/[0.1]'
                            : 'bg-white/[0.03] hover:bg-white/[0.06]'
                            }`}
                        >
                          <div className={`w-[18px] h-[18px] rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'border-white bg-white' : 'border-white/20'
                            }`}>
                            {isSelected ? (
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5.5L4 7.5L8 3.5" stroke="#F5FAFD" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            ) : null}
                          </div>
                          <span className={`text-[13px] truncate flex-1 text-left transition-colors ${isSelected ? 'text-white font-medium' : 'text-white/55'}`}>{label}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeAccount(r.id);
                            }}
                            className="shrink-0 p-1 rounded-lg hover:bg-white/10 transition-colors text-white/20 hover:text-red-600"
                          >
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
                          </button>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ─── User Agent ─── */}
        <Section title="User Agent" subtitle="Опционально — будет передан в профиль при запуске">
          <textarea
            value={userAgent}
            onChange={(event) => setUserAgent(event.target.value)}
            placeholder="Mozilla/5.0 ..."
            className="w-full min-h-[80px] bg-white/[0.06] glass-border-light focus:outline-none rounded-xl px-3 py-3 text-white text-sm placeholder-white/25 resize-y transition"
          />
        </Section>

      </div>

      {/* ── Fixed bottom button ── */}
      {!keyboardOpen && (() => {
        const requireAccount = !isEdit && parseAmount() <= 1;
        const canSave = isEdit || (
          (!requireAccount || selectedAccountId !== null) &&
          selectedFilterId !== null
        );
        const missingFields: string[] = [];
        if (!isEdit) {
          if (requireAccount && selectedAccountId === null) missingFields.push('аккаунт');
          if (selectedFilterId === null) missingFields.push('фильтр');
        }
        return (
          <div className="fixed left-0 right-0 bottom-0 z-40 pointer-events-none">
            <div
              style={{
                background: 'linear-gradient(to top, rgba(245,250,253,1) 0%, rgba(245,250,253,0.85) 40%, rgba(245,250,253,0.4) 75%, transparent 100%)',
                paddingTop: '48px',
                paddingBottom: 'calc(var(--safe-area-inset-bottom, 0px) + 16px)',
              }}
              className="px-4"
            >
              <div className="pointer-events-auto">
                {!isEdit && missingFields.length > 0 && (
                  <p className="text-center text-[12px] text-white/35 mb-2.5">
                    Заполните обязательные поля: {missingFields.join(', ')}
                  </p>
                )}
                <motion.button
                  type="button"
                  onClick={handleSave}
                  disabled={loading || !canSave}
                  whileTap={canSave ? { scale: 0.96 } : undefined}
                  transition={SPRING_TAP}
                  className="w-full py-3.5 rounded-[24px] text-[15px] font-semibold glass-border-light"
                  style={canSave
                    ? { background: 'rgba(0,174,239,0.10)', color: '#00AEEF', backdropFilter: 'blur(12px) saturate(1.3)', WebkitBackdropFilter: 'blur(12px) saturate(1.3)' }
                    : { background: 'rgba(255,255,255,0.6)', color: 'rgba(11,36,48,0.35)', backdropFilter: 'blur(12px) saturate(1.3)', WebkitBackdropFilter: 'blur(12px) saturate(1.3)' }
                  }
                >
                  {loading ? 'Сохранение...' : isEdit ? 'Сохранить изменения' : 'Создать слот'}
                </motion.button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default SlotEditPage;
