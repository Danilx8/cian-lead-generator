import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { uploadService } from '../../api';
import { ApiError } from '../../api/client';
import Select from '../ui/Select';
import Toggle from '../ui/Toggle';
import { useAppStore } from '../../store/appStore';

const SPRING_TAP = { type: "spring" as const, stiffness: 500, damping: 25 };

type ProxyKind = 'HTTP' | 'HTTPS' | 'SOCKS';
type UseType = 'one_time' | 'rotating';

interface ProxyForm {
    kind: ProxyKind;
    host: string; port: number;
    login?: string; password?: string;
    useType: UseType;
    multiSlotAllowed: boolean;
    rotateUrl?: string;
}

const kindToProtocol = (kind: ProxyKind): string =>
    kind === 'HTTPS' ? 'https' : kind === 'HTTP' ? 'http' : 'socks5';

const parseHostPortUserPass = (trimmed: string): { host: string; port: number; login: string; password: string } | null => {
    if (!trimmed.includes('@')) {
        const parts = trimmed.split(':');
        if (parts.length >= 4 && /^\d+$/.test(parts[1] ?? '')) {
            const host = parts[0] ?? '';
            const port = Number(parts[1]);
            const password = parts[parts.length - 1] ?? '';
            const login = parts.slice(2, -1).join(':');
            if (host && login && Number.isFinite(port) && port > 0) {
                return { host, port, login, password };
            }
        }
    }
    return null;
};

const PROXY_FILE_INPUT_ID = 'proxy-section-bulk-file';

export const ProxySection: React.FC = () => {
    const notify = useAppStore(s => s.notify);
    const [creating, setCreating] = useState(false);
    const [bulkUploading, setBulkUploading] = useState(false);
    const [bulkResult, setBulkResult] = useState<{
        ok: number;
        fail: number;
        skipped: number;
        hint?: string;
    } | null>(null);

    const [form, setForm] = useState<Partial<ProxyForm>>({
        kind: 'SOCKS', host: '', port: 0, useType: 'one_time', multiSlotAllowed: false, login: '', password: '', rotateUrl: ''
    });

    const parseProxyString = (input: string): boolean => {
        const trimmed = input.trim();
        if (!trimmed) return false;

        const hostPortUserPass = parseHostPortUserPass(trimmed);
        if (hostPortUserPass) {
            setForm(f => ({
                ...f,
                host: hostPortUserPass.host,
                port: hostPortUserPass.port,
                login: hostPortUserPass.login,
                password: hostPortUserPass.password,
            }));
            return true;
        }

        const withAuthMatch = trimmed.match(/^(.+?):(.+?)@(.+?):(\d+)$/);
        if (withAuthMatch) {
            const [, login, password, host, port] = withAuthMatch;
            setForm(f => ({
                ...f,
                login,
                password,
                host,
                port: Number(port)
            }));
            return true;
        }

        const simpleMatch = trimmed.match(/^(.+?):(\d+)$/);
        if (simpleMatch) {
            const [, first, second] = simpleMatch;
            if (/^\d+$/.test(first) && /^\d+$/.test(second)) {
                setForm(f => ({
                    ...f,
                    login: first,
                    password: second,
                }));
                return true;
            }
            setForm(f => ({
                ...f,
                host: first,
                port: Number(second),
                login: '',
                password: ''
            }));
            return true;
        }

        return false;
    };

    const handleProxyPaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
        const text = event.clipboardData?.getData('text') ?? '';
        if (parseProxyString(text)) {
            event.preventDefault();
        }
    };

    const addItem = async () => {
        const host = form.host?.trim() || '';
        const port = Number(form.port) || 0;
        if (!host || !port) return;

        setCreating(true);
        try {
            await uploadService.uploadProxy({
                host,
                port,
                protocol: kindToProtocol((form.kind || 'SOCKS') as ProxyKind),
                username: form.login?.trim() || undefined,
                password: form.password?.trim() || undefined,
                maximumConnections: form.useType === 'rotating' ? (form.multiSlotAllowed ? 5 : 1) : 1,
                isRotating: form.useType === 'rotating',
                refreshUrl: form.rotateUrl?.trim() || undefined,
            });
            notify('Прокси добавлен', 'success');
            setForm({ kind: 'SOCKS', host: '', port: 0, useType: 'one_time', multiSlotAllowed: false, login: '', password: '', rotateUrl: '' });
        } catch (e) {
            console.error('Failed to upload proxy', e);
            const msg = e instanceof ApiError ? e.message : 'Ошибка добавления прокси';
            notify(msg, 'error');
        } finally {
            setCreating(false);
        }
    };

    const runBulkProxyUpload = async (files: File[]) => {
        const totalBytes = files.reduce((n, f) => n + f.size, 0);
        if (!files.length || totalBytes === 0) {
            setBulkResult({
                ok: 0,
                fail: 0,
                skipped: 0,
                hint: 'Нет файлов или файл пустой.',
            });
            return;
        }

        const res = await uploadService.uploadProxyBulk({
            files,
            protocol: kindToProtocol((form.kind || 'SOCKS') as ProxyKind),
            isRotating: form.useType === 'rotating',
            refreshUrl: form.rotateUrl?.trim() || undefined,
        });

        const list = res.proxies ?? [];
        const createdCount = res.created ?? list.length;
        const errCount = res.errors?.length ?? 0;
        const skipped = res.skipped ?? 0;

        if (createdCount === 0 && list.length === 0) {
            setBulkResult({
                ok: 0,
                fail: errCount,
                skipped,
                hint:
                    res.message ||
                    (errCount > 0
                        ? `Не удалось разобрать ${errCount} строк(и). Пример: ${String(res.errors?.[0] ?? '').slice(0, 120)}`
                        : 'Ни один прокси не создан — проверьте формат строк в .txt.'),
            });
            return;
        }

        const okCount = list.length > 0 ? list.length : createdCount;
        setBulkResult({
            ok: okCount,
            fail: errCount,
            skipped,
            hint:
                errCount > 0
                    ? `Создано ${okCount}, не распознано строк: ${errCount}${res.errors?.[0] ? ` (напр. «${String(res.errors[0]).slice(0, 60)}…»)` : ''}`
                    : undefined,
        });
    };

    const handleProxyFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const input = event.currentTarget;
        const picked = input.files?.length ? Array.from(input.files) : [];
        input.value = '';
        if (!picked.length) return;

        setBulkUploading(true);
        setBulkResult(null);

        try {
            await runBulkProxyUpload(picked);
        } catch (e) {
            console.error('Failed to read or upload proxy files', e);
            const hint =
                e instanceof ApiError
                    ? e.message
                    : e instanceof Error
                      ? e.message
                      : 'Не удалось прочитать или отправить файл.';
            setBulkResult({
                ok: 0,
                fail: 0,
                skipped: 0,
                hint,
            });
        } finally {
            setBulkUploading(false);
        }
    };

    useEffect(() => {
        if (!bulkResult) return;
        const t = window.setTimeout(() => setBulkResult(null), 8000);
        return () => window.clearTimeout(t);
    }, [bulkResult]);

    const inputCls = "w-full bg-white/60 border border-[rgba(11,36,48,0.10)] focus:border-accent/40 focus:outline-none rounded-2xl px-3.5 py-2.5 text-white text-sm placeholder-white/25 transition";

    return (
        <div className="mt-5 space-y-6">
            {/* Add proxy form */}
            <div>
                <div className="mb-3">
                    <p className="text-white text-[17px] font-semibold">Добавить прокси</p>
                    <p className="text-[13px] text-white/40 mt-0.5">Вставьте строку login:pass@host:port или заполните поля</p>
                </div>
                <div className="rounded-[24px] glass glass-border-light p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-2.5">
                        <Select className={inputCls} value={form.kind as string}
                            onChange={e => setForm(f => ({ ...f, kind: e.target.value as ProxyKind }))}>
                            <option value="HTTPS">HTTPS</option>
                            <option value="SOCKS">SOCKS</option>
                        </Select>
                        <Select className={inputCls} value={form.useType as string}
                            onChange={e => setForm(f => ({ ...f, useType: e.target.value as UseType }))}>
                            <option value="one_time">Одноразовый</option>
                            <option value="rotating">Ротация</option>
                        </Select>
                        <input className={inputCls} placeholder="Хост" value={form.host || ''}
                            onPaste={handleProxyPaste}
                            onChange={e => {
                                const value = e.target.value;
                                if (value.includes(':') && (value.includes('@') || value.match(/:\d+$/))) {
                                    if (!parseProxyString(value)) setForm(f => ({ ...f, host: value }));
                                } else {
                                    setForm(f => ({ ...f, host: value }));
                                }
                            }} />
                        <input className={inputCls} placeholder="Порт" inputMode="numeric" value={form.port || ''}
                            onChange={e => {
                                const value = e.target.value;
                                if (value.includes(':') && (value.includes('@') || value.match(/:\d+$/))) {
                                    if (!parseProxyString(value)) setForm(f => ({ ...f, port: Number(value.replace(/\D/g, '') || 0) }));
                                } else {
                                    setForm(f => ({ ...f, port: Number(value.replace(/\D/g, '') || 0) }));
                                }
                            }} />
                        <input className={inputCls} placeholder="Логин" autoComplete="off" spellCheck={false} value={form.login || ''}
                            onChange={e => {
                                const value = e.target.value;
                                if (value.includes(':') && (value.includes('@') || value.match(/:\d+$/))) {
                                    if (!parseProxyString(value)) setForm(f => ({ ...f, login: value }));
                                } else {
                                    setForm(f => ({ ...f, login: value }));
                                }
                            }} />
                        <input className={inputCls} placeholder="Пароль" autoComplete="new-password" spellCheck={false} value={form.password || ''}
                            onChange={e => {
                                const value = e.target.value;
                                if (value.includes(':') && (value.includes('@') || value.match(/:\d+$/))) {
                                    if (!parseProxyString(value)) setForm(f => ({ ...f, password: value }));
                                } else {
                                    setForm(f => ({ ...f, password: value }));
                                }
                            }} />
                        <input className={`${inputCls} col-span-2`} placeholder="Rotate URL (для ротации)" value={form.rotateUrl || ''}
                            onChange={e => setForm(f => ({ ...f, rotateUrl: e.target.value }))} />
                    </div>
                    <div className="flex items-center justify-between py-1 px-1">
                        <span className="text-sm text-white/70">Несколько слотов</span>
                        <Toggle checked={!!form.multiSlotAllowed} onChange={(v) => setForm(f => ({ ...f, multiSlotAllowed: v }))} />
                    </div>
                    <div className="flex gap-2.5">
                        <input id={PROXY_FILE_INPUT_ID} type="file"
                            accept=".txt,text/plain,*/*" multiple
                            className="sr-only" onChange={handleProxyFiles} />
                        <motion.button type="button" onClick={creating || bulkUploading ? undefined : addItem}
                            disabled={creating || bulkUploading}
                            whileTap={{ scale: 0.95 }}
                            transition={SPRING_TAP}
                            className="flex-1 h-11 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                            style={{
                                background: creating
                                    ? 'linear-gradient(135deg, rgba(0, 174, 239, 0.10) 0%, rgba(0, 174, 239, 0.03) 100%)'
                                    : 'linear-gradient(135deg, rgba(0, 174, 239, 0.20) 0%, rgba(0, 174, 239, 0.06) 100%)',
                                borderTop: '0.5px solid rgba(0, 174, 239, 0.22)',
                                borderLeft: '0.5px solid rgba(0, 174, 239, 0.14)',
                                borderRight: '0.5px solid rgba(0, 174, 239, 0.04)',
                                borderBottom: '0.5px solid rgba(0, 174, 239, 0.04)',
                                color: creating ? 'rgba(0, 119, 182, 0.5)' : '#0077B6',
                            }}>
                            {creating && <span className="relative w-4 h-4 shrink-0"><span className="absolute inset-0 rounded-full border-2 border-current opacity-30" /><span className="absolute inset-0 rounded-full border-2 border-current border-t-transparent animate-spin" /></span>}
                            {creating ? 'Добавление…' : 'Добавить'}
                        </motion.button>
                        <motion.label htmlFor={creating || bulkUploading ? undefined : PROXY_FILE_INPUT_ID}
                            whileTap={{ scale: 0.95 }}
                            transition={SPRING_TAP}
                            className={`flex-1 h-11 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 text-white/80 select-none transition-colors cursor-pointer glass-border-light ${
                                creating || bulkUploading ? 'opacity-40 pointer-events-none' : ''
                            }`}
                            style={{ background: 'rgba(255,255,255,0.6)' }}>
                            {bulkUploading && <span className="relative w-4 h-4 shrink-0"><span className="absolute inset-0 rounded-full border-2 border-current opacity-30" /><span className="absolute inset-0 rounded-full border-2 border-current border-t-transparent animate-spin" /></span>}
                            {bulkUploading ? 'Импорт…' : 'Файл .txt'}
                        </motion.label>
                    </div>
                    {bulkResult && (
                        <div className="text-xs text-white/50 space-y-0.5">
                            <p>
                                {bulkResult.ok > 0 && <span className="text-green-600">+{bulkResult.ok}</span>}
                                {bulkResult.fail > 0 && <>{bulkResult.ok > 0 && ' · '}<span className="text-red-600">{bulkResult.fail} ошибок</span></>}
                                {bulkResult.skipped > 0 && <>{(bulkResult.ok > 0 || bulkResult.fail > 0) && ' · '}{bulkResult.skipped} пропущено</>}
                                {bulkResult.ok === 0 && bulkResult.fail === 0 && bulkResult.skipped === 0 && 'Импорт не выполнен'}
                            </p>
                            {bulkResult.hint && <p className="text-yellow-600 leading-snug">{bulkResult.hint}</p>}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProxySection;
