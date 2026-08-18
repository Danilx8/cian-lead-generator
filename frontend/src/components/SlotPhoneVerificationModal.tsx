import React, { useEffect, useState } from 'react';
import { workerService } from '../api';
import type { Worker } from '../api/types';
import { useApiErrorHandler } from '../utils/apiErrorHandler';
import {
    extractWorkerPhoneNumber,
    hasLeftExpectingCodeStatus,
    isWaitingVerificationCodeStatus,
} from '../utils/workerState';
import { useAppStore } from '../store/appStore';
import { slotVerifyLog } from '../utils/slotVerifyDebugLog';

const DEFAULT_COUNTRY = '+7';

function normalizeCountryCode(raw: string): string {
    const t = raw.trim();
    if (!t) return '+';
    const digits = t.replace(/[^\d+]/g, '');
    if (!digits) return '+';
    if (digits.startsWith('+')) return '+' + digits.slice(1).replace(/\D/g, '');
    return '+' + digits.replace(/\D/g, '');
}

function normalizeNationalDigits(raw: string): string {
    return raw.replace(/\D/g, '');
}

/** Склеиваем код страны и номер для бэкенда (E.164-подобная строка). */
function combinePhoneForSubmit(country: string, national: string): string {
    const cc = normalizeCountryCode(country);
    const nat = normalizeNationalDigits(national);
    return cc + nat;
}

/** Эвристика вставки: полная строка с «+», разбить на код (1–3 цифры после +) и остаток. Порядок 2,1,3 лучше покрывает +49 и +1. */
function splitPastedInternational(allDigits: string): { country: string; national: string } | null {
    if (allDigits.length < 8) return null;
    for (const ccLen of [2, 1, 3]) {
        if (allDigits.length - ccLen < 4) continue;
        const cc = allDigits.slice(0, ccLen);
        const nat = allDigits.slice(ccLen);
        if (nat.length < 4) continue;
        return { country: '+' + cc, national: nat };
    }
    return null;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function workerPollSignature(w: Worker): string {
    const st = (w as { status?: string | number }).status;
    return `${String(st ?? '')}|${extractWorkerPhoneNumber(w)}`;
}

function tryApplyPaste(text: string): { country: string; national: string } | null {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const digits =
        trimmed.startsWith('+')
            ? trimmed.slice(1).replace(/\D/g, '')
            : trimmed.replace(/\D/g, '');
    if (digits.length < 8) return null;
    return splitPastedInternational(digits);
}

export type VerificationStep = 'phone' | 'code';

interface Props {
    workerId: number;
    open: boolean;
    step: VerificationStep;
    /** Номер для текста во втором шаге (с бэка / после шага 1). */
    phoneDisplay: string;
    onClose: () => void;
    /** Из шага кода — только локально открыть шаг телефона, без запросов. */
    onBackToPhone: () => void;
    onWorkerUpdated: (w: Worker) => void;
}

export const SlotPhoneVerificationModal: React.FC<Props> = ({
    workerId,
    open,
    step,
    phoneDisplay,
    onClose,
    onBackToPhone,
    onWorkerUpdated,
}) => {
    const { handleError } = useApiErrorHandler();
    const notify = useAppStore((s) => s.notify);
    const [country, setCountry] = useState(DEFAULT_COUNTRY);
    const [national, setNational] = useState('');
    const [code, setCode] = useState('');
    const [savingPhone, setSavingPhone] = useState(false);
    const [savingCode, setSavingCode] = useState(false);

    useEffect(() => {
        if (!open) return;
        if (step === 'phone') {
            setCountry(DEFAULT_COUNTRY);
            setNational('');
        } else {
            setCode('');
        }
    }, [open, step]);

    if (!open) return null;

    const phoneForDescription = phoneDisplay || '—';

    const handlePhonePaste: React.ClipboardEventHandler<HTMLInputElement> = (e) => {
        const text = e.clipboardData.getData('text/plain');
        const split = tryApplyPaste(text);
        if (split) {
            e.preventDefault();
            setCountry(split.country);
            setNational(split.national);
        }
    };

    const submitPhone = async () => {
        const full = combinePhoneForSubmit(country, national).trim();
        if (normalizeNationalDigits(national).length === 0) return;
        setSavingPhone(true);
        try {
            slotVerifyLog('applyPhone → POST /phone/apply', { workerId, phone: full });
            const applyRes = await workerService.applyWorkerPhone(workerId, full);
            slotVerifyLog('applyPhone ← API body (202)', { workerId, applyRes });
            const list = await workerService.getWorkers();
            let w: Worker | null = list.find((x) => (x as { id: number }).id === workerId) ?? null;
            const fromListBeforeMerge = w
                ? {
                      status: (w as { status?: unknown }).status,
                      phone: extractWorkerPhoneNumber(w),
                  }
                : null;
            slotVerifyLog('applyPhone ← GET /worker row (same id)', { workerId, fromListBeforeMerge });
            const phoneFromApply =
                applyRes?.countryCode != null && applyRes?.phoneNumber != null
                    ? `+${String(applyRes.countryCode).replace(/\D/g, '')}${String(applyRes.phoneNumber).replace(/\D/g, '')}`
                    : null;
            if (w && phoneFromApply) {
                w = { ...w, phoneNumber: phoneFromApply };
            } else if (!w && phoneFromApply) {
                w = { id: workerId, phoneNumber: phoneFromApply } as Worker;
            }
            if (w) {
                slotVerifyLog('applyPhone → update card', {
                    workerId,
                    status: (w as { status?: unknown }).status,
                    phone: extractWorkerPhoneNumber(w),
                    pollWillRun: true,
                });
                onWorkerUpdated(w);
                notify(
                    'Номер принят сервером. Статус в приложении обновится, когда подключённый воркер обработает команду (часто несколько секунд). СМС с кодом приходит от площадки, не из этого приложения.',
                    'info'
                );
                let prevSig = workerPollSignature(w);
                void (async () => {
                    for (let i = 0; i < 25; i++) {
                        await sleep(2000);
                        try {
                            const list2 = await workerService.getWorkers();
                            const fresh = list2.find((x) => (x as { id: number }).id === workerId);
                            if (!fresh) {
                                slotVerifyLog('applyPhone poll', { workerId, tick: i + 1, note: 'worker not in list' });
                                continue;
                            }
                            const sig = workerPollSignature(fresh);
                            const st = String((fresh as { status?: string | number }).status ?? '').trim();
                            const phone = extractWorkerPhoneNumber(fresh);
                            slotVerifyLog('applyPhone poll', {
                                workerId,
                                tick: i + 1,
                                status: st,
                                phone,
                                signature: sig,
                                pushedToCard: sig !== prevSig,
                            });
                            if (sig !== prevSig) {
                                prevSig = sig;
                                onWorkerUpdated(fresh);
                            }
                            if (isWaitingVerificationCodeStatus(st) || st.toUpperCase() === 'ACTIVE') {
                                slotVerifyLog('applyPhone poll stop', {
                                    workerId,
                                    reason: isWaitingVerificationCodeStatus(st) ? 'reached EXPECTING_CODE (or alias)' : 'ACTIVE',
                                });
                                return;
                            }
                        } catch (e) {
                            slotVerifyLog('applyPhone poll error', { workerId, tick: i + 1, error: String(e) });
                        }
                    }
                    slotVerifyLog('applyPhone poll stop', { workerId, reason: 'max ticks (25×2s)' });
                })();
            }
            onClose();
        } catch (err) {
            slotVerifyLog('applyPhone ERROR', { workerId, err });
            handleError(err, 'Не удалось отправить номер');
        } finally {
            setSavingPhone(false);
        }
    };

    const submitCode = async () => {
        const c = code.trim();
        if (!c) return;
        setSavingCode(true);
        try {
            slotVerifyLog('verifyCode → POST /phone/verify', { workerId, codeLength: c.length });
            await workerService.verifyWorkerPhoneCode(workerId, c);
            slotVerifyLog('verifyCode ← API ok (202, body may be empty)');
            const list = await workerService.getWorkers();
            let w = list.find((x) => (x as { id: number }).id === workerId);
            if (w) {
                slotVerifyLog('verifyCode ← GET /worker', {
                    workerId,
                    status: (w as { status?: unknown }).status,
                    phone: extractWorkerPhoneNumber(w),
                });
                onWorkerUpdated(w);
                notify(
                    'Код отправлен воркеру. Дальше слот обычно переходит в «Подключение», затем к обычной работе (до «Активный» может быть несколько шагов).',
                    'info'
                );
                let prevSig = workerPollSignature(w);
                void (async () => {
                    for (let i = 0; i < 20; i++) {
                        await sleep(2000);
                        try {
                            const list2 = await workerService.getWorkers();
                            const fresh = list2.find((x) => (x as { id: number }).id === workerId);
                            if (!fresh) {
                                slotVerifyLog('verifyCode poll', { workerId, tick: i + 1, note: 'worker not in list' });
                                continue;
                            }
                            const sig = workerPollSignature(fresh);
                            const st = (fresh as { status?: string | number }).status;
                            slotVerifyLog('verifyCode poll', {
                                workerId,
                                tick: i + 1,
                                status: st,
                                phone: extractWorkerPhoneNumber(fresh),
                                signature: sig,
                                pushedToCard: sig !== prevSig,
                            });
                            if (sig !== prevSig) {
                                prevSig = sig;
                                onWorkerUpdated(fresh);
                            }
                            if (hasLeftExpectingCodeStatus(st)) {
                                slotVerifyLog('verifyCode poll stop', {
                                    workerId,
                                    reason: 'left EXPECTING_CODE',
                                    newStatus: st,
                                });
                                return;
                            }
                        } catch (e) {
                            slotVerifyLog('verifyCode poll error', { workerId, tick: i + 1, error: String(e) });
                        }
                    }
                    slotVerifyLog('verifyCode poll stop', { workerId, reason: 'max ticks (20×2s)' });
                })();
            }
            onClose();
        } catch (err) {
            slotVerifyLog('verifyCode ERROR', { workerId, err });
            handleError(err, 'Не удалось подтвердить код');
        } finally {
            setSavingCode(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => onClose()}
            role="presentation"
        >
            <div
                className="w-full max-w-sm bg-lighter-black rounded-2xl p-5 border border-white/10 shadow-xl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
            >
                {step === 'phone' ? (
                    <>
                        <h2 className="text-white text-lg font-semibold mb-2">Подтвердите номер</h2>
                        <p className="text-white/70 text-sm mb-4 leading-relaxed">
                            Платформа запросила привязку номера к аккаунту. Введите номер для верификации и ожидайте код для ввода на
                            следующем статусе. При успешной привязке статус сменится на «Ожидание кода», а у слота появится новое поле —
                            «Номер телефона».
                        </p>
                        <div className="mb-4">
                            <label className="block text-xs text-white/50 mb-1.5">Номер телефона</label>
                            <div
                                className="flex rounded-xl bg-white/10 border border-white/10 overflow-hidden focus-within:border-accent/50 transition-colors"
                                onPaste={handlePhonePaste}
                            >
                                <input
                                    type="text"
                                    inputMode="tel"
                                    autoComplete="tel-country-code"
                                    value={country}
                                    onChange={(e) => setCountry(normalizeCountryCode(e.target.value))}
                                    onPaste={handlePhonePaste}
                                    placeholder="+7"
                                    className="w-[4.25rem] shrink-0 bg-transparent px-3 py-2.5 text-sm text-white/45 placeholder:text-white/35 outline-none border-r border-white/10 text-right font-mono"
                                />
                                <input
                                    type="tel"
                                    inputMode="numeric"
                                    autoComplete="tel-national"
                                    value={national}
                                    onChange={(e) => setNational(normalizeNationalDigits(e.target.value))}
                                    onPaste={handlePhonePaste}
                                    placeholder="912 3456789"
                                    className="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-sm text-white placeholder:text-white/35 outline-none font-mono"
                                />
                            </div>
                            <p className="text-[10px] text-white/40 mt-1.5 leading-snug">
                                Код страны можно изменить. При вставке полного номера с «+» поля заполнятся автоматически.
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => onClose()}
                                disabled={savingPhone}
                                className="flex-1 py-3 rounded-xl bg-white/10 text-white font-medium active:scale-[0.98] transition disabled:opacity-40"
                            >
                                Отмена
                            </button>
                            <button
                                type="button"
                                onClick={() => void submitPhone()}
                                disabled={savingPhone || normalizeNationalDigits(national).length === 0}
                                className="flex-1 py-3 rounded-xl bg-accent text-black font-semibold active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {savingPhone ? 'Отправка…' : 'Подтвердить'}
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <h2 className="text-white text-lg font-semibold mb-2">Введите код верификации</h2>
                        <p className="text-white/70 text-sm mb-4 leading-relaxed">
                            Введите код верификации для номера {phoneForDescription}. Если СМС не приходит, перейдите на предыдущий этап и
                            введите новый номер (или тот же).
                        </p>
                        <div className="mb-4">
                            <label className="block text-xs text-white/50 mb-1.5">Код</label>
                            <input
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                placeholder="000000"
                                className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/35 outline-none focus:border-accent/50 font-mono tracking-widest"
                            />
                        </div>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => onBackToPhone()}
                                disabled={savingCode}
                                className="flex-1 py-3 rounded-xl bg-white/10 text-white font-medium active:scale-[0.98] transition disabled:opacity-40"
                            >
                                Назад
                            </button>
                            <button
                                type="button"
                                onClick={() => void submitCode()}
                                disabled={savingCode || code.trim().length === 0}
                                className="flex-1 py-3 rounded-xl bg-accent text-black font-semibold active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {savingCode ? 'Проверка…' : 'Подтвердить'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
