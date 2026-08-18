import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { accountService } from '../../api';
import { useAppStore } from '../../store/appStore';

const SPRING_TAP = { type: "spring" as const, stiffness: 500, damping: 25 };

const rowStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.6)',
};

interface CianAccount {
    id: number;
    name?: string;
    login: string;
    proxyId?: number;
}

export const AccountsSection: React.FC<{ onMount?: (loadFn: () => Promise<void>) => void }> = ({ onMount }) => {
    const notify = useAppStore(s => s.notify);
    const [records, setRecords] = useState<CianAccount[]>([]);
    const [login, setLogin] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [notice, setNotice] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
    const onMountRef = useRef(onMount);
    onMountRef.current = onMount;
    const firstListFetchRef = useRef(true);

    const loadAccounts = useCallback(async () => {
        if (firstListFetchRef.current) setLoading(true);
        try {
            const data = await accountService.getAccounts();
            setRecords(Array.isArray(data) ? (data as CianAccount[]).slice().sort((a, b) => b.id - a.id) : []);
        } catch (e) {
            console.error('Failed to load accounts:', e);
            setNotice('Ошибка загрузки аккаунтов');
        } finally {
            setLoading(false);
            firstListFetchRef.current = false;
        }
    }, []);

    useEffect(() => {
        loadAccounts();
    }, [loadAccounts]);

    useEffect(() => {
        onMountRef.current?.(loadAccounts);
    }, [loadAccounts]);

    const addAccount = async () => {
        const l = login.trim();
        const p = password.trim();
        if (!l || !p) {
            setNotice('Укажите логин и пароль от аккаунта Циан');
            return;
        }
        try {
            setSaving(true);
            setNotice('');
            await accountService.createAccount({ login: l, password: p, name: name.trim() || undefined });
            await loadAccounts();
            setLogin('');
            setPassword('');
            setName('');
            notify('Аккаунт добавлен', 'success');
        } catch (e) {
            console.error('Failed to save account:', e);
            setNotice('Ошибка сохранения аккаунта');
        } finally {
            setSaving(false);
        }
    };

    const removeAccount = async (id: number) => {
        try {
            await accountService.deleteAccount(id);
            setRecords(prev => prev.filter(r => r.id !== id));
        } catch (e) {
            console.error('Failed to delete account:', e);
            setNotice('Ошибка удаления аккаунта');
        }
    };

    const confirmDelete = async () => {
        if (confirmDeleteId === null) return;
        const id = confirmDeleteId;
        setConfirmDeleteId(null);
        await removeAccount(id);
    };

    const inputCls = "w-full bg-white/60 border border-[rgba(11,36,48,0.10)] focus:border-accent/40 focus:outline-none rounded-2xl px-3.5 py-2.5 text-white text-sm placeholder-white/25 transition";

    return (
        <>
        <div className="mt-5 space-y-6">
            {/* Add account form */}
            <div>
                <div className="mb-3">
                    <div className="flex items-center justify-between">
                        <p className="text-white text-[17px] font-semibold">Добавить аккаунт</p>
                        {loading && (
                            <span className="relative w-4 h-4 shrink-0">
                                <span className="absolute inset-0 rounded-full border-2 border-white/20" />
                                <span className="absolute inset-0 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                            </span>
                        )}
                    </div>
                    <p className="text-[13px] text-white/40 mt-0.5">Логин и пароль от аккаунта на cian.ru</p>
                </div>
                <div className="rounded-[24px] glass glass-border-light p-4 space-y-3">
                    <input
                        className={inputCls}
                        placeholder="Логин (email или телефон)"
                        autoComplete="off"
                        spellCheck={false}
                        value={login}
                        onChange={e => setLogin(e.target.value)}
                    />
                    <input
                        className={inputCls}
                        type="password"
                        placeholder="Пароль"
                        autoComplete="new-password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                    />
                    <input
                        className={inputCls}
                        placeholder="Название (необязательно)"
                        value={name}
                        onChange={e => setName(e.target.value)}
                    />
                    <motion.button disabled={saving} onClick={addAccount}
                        whileTap={{ scale: 0.95 }}
                        transition={SPRING_TAP}
                        className="w-full h-11 rounded-2xl text-sm font-semibold disabled:opacity-40 transition-colors"
                        style={{
                            background: 'linear-gradient(135deg, rgba(0, 174, 239, 0.20) 0%, rgba(0, 174, 239, 0.06) 100%)',
                            borderTop: '0.5px solid rgba(0, 174, 239, 0.22)',
                            borderLeft: '0.5px solid rgba(0, 174, 239, 0.14)',
                            borderRight: '0.5px solid rgba(0, 174, 239, 0.04)',
                            borderBottom: '0.5px solid rgba(0, 174, 239, 0.04)',
                            color: '#0077B6',
                        }}>
                        {saving ? 'Сохранение…' : 'Добавить'}
                    </motion.button>
                    {notice && <p className="text-xs text-red-600 font-medium">{notice}</p>}
                </div>
            </div>

            {/* Saved accounts list — hidden during initial load */}
            <AnimatePresence>
                {!loading && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    >
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-white text-[17px] font-semibold">Сохранённые</p>
                            {records.length > 0 && (
                                <span className="text-[11px] text-white/25 tabular-nums">{records.length} шт.</span>
                            )}
                        </div>
                        {records.length === 0 ? (
                            <div className="rounded-[24px] glass glass-border-light py-8 flex flex-col items-center justify-center text-center">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="mb-2 opacity-25"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="#0B2430" strokeWidth="1.5" strokeLinecap="round"/><circle cx="12" cy="7" r="4" stroke="#0B2430" strokeWidth="1.5"/></svg>
                                <p className="text-white/30 text-sm">Нет аккаунтов</p>
                            </div>
                        ) : (
                            <div className="max-h-[280px] overflow-y-auto space-y-2 rounded-2xl" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(11,36,48,0.1) transparent' }}>
                                {records.map((rec) => (
                                    <div key={rec.id} className="rounded-2xl p-3.5 flex items-center gap-3 glass-border-light" style={rowStyle}>
                                        <div className="min-w-0 flex-1">
                                            <div className="text-white/90 text-[13px] font-medium truncate">
                                                {rec.name?.trim() || rec.login || `Аккаунт #${rec.id}`}
                                            </div>
                                            <div className="text-white/30 text-[11px] mt-0.5 truncate">
                                                {rec.login}
                                            </div>
                                        </div>
                                        <motion.button
                                            onClick={() => setConfirmDeleteId(rec.id)}
                                            whileTap={{ scale: 0.85 }}
                                            transition={SPRING_TAP}
                                            className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-white/20 hover:text-red-600 transition-colors glass-border-light"
                                            style={{ background: 'rgba(255,255,255,0.6)' }}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                                        </motion.button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>

        {confirmDeleteId !== null && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <div
                    className="w-full max-w-sm glass-border-light rounded-[24px] p-5"
                    style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(24px) saturate(1.3)', WebkitBackdropFilter: 'blur(24px) saturate(1.3)' }}
                >
                    <h2 className="text-white text-lg font-semibold mb-2">Удалить аккаунт?</h2>
                    <p className="text-white/70 text-sm mb-5">Аккаунт #{confirmDeleteId} будет удалён без возможности восстановления.</p>
                    <div className="flex gap-3">
                        <motion.button
                            onClick={() => setConfirmDeleteId(null)}
                            whileTap={{ scale: 0.96 }}
                            transition={SPRING_TAP}
                            className="flex-1 py-3 rounded-[20px] glass glass-border-light text-white font-medium"
                        >
                            Отмена
                        </motion.button>
                        <motion.button
                            onClick={confirmDelete}
                            whileTap={{ scale: 0.96 }}
                            transition={SPRING_TAP}
                            className="flex-1 py-3 rounded-[20px] bg-red-500/80 text-white font-semibold"
                        >
                            Удалить
                        </motion.button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
};
