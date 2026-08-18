import type { Worker } from '../api/types';
import { slotVerifyLog } from './slotVerifyDebugLog';

/**
 * «Хорошие» статусы — как в `WorkerState` на бэкенде (worker.model, Sequelize ENUM).
 * Кнопка «Ввести номер»: PHONE_VERIFICATION. «Ввести код»: EXPECTING_CODE.
 */
export const GOOD_STATUSES = [
    "INITIALIZING",
    "CONNECTING",
    "AUTHENTICATING",
    "ACTIVE",
    "RECONNECTING",
    "PHONE_VERIFICATION",
    "EXPECTING_CODE",
] as const;

export const BAD_STATUSES = [
    "ERROR",
    "SHUTDOWN",
    "BANNED",
    "CONNECTION_LOST",
] as const;

export type WorkerStatus = typeof GOOD_STATUSES[number] | typeof BAD_STATUSES[number] | string;

/**
 * Запущен ли слот: не запущен — только SHUTDOWN, всё остальное считается запущенным
 * (в том числе ERROR / BANNED / CONNECTION_LOST — воркер поднят, просто в плохом состоянии).
 * Пустой статус — это отсутствие данных, а не статус, поэтому запущенным не считаем.
 */
export const isSlotRunning = (status?: WorkerStatus) => {
    const n = normStatus(status);
    return n !== "" && n !== "SHUTDOWN";
};

/**
 * Слот «в работе» для счётчика активных: живые статусы + обёртки старта.
 * В отличие от isSlotRunning (всё, что не SHUTDOWN) упавший слот (ERROR / BANNED /
 * CONNECTION_LOST) активным не считается — иначе счётчик не среагировал бы на падение.
 * QUEUED / ACCEPTED — слот принят на старт: воркер ещё не поднялся, но в БД пока SHUTDOWN,
 * так что без них счётчик не менялся бы сразу после нажатия «Старт».
 */
const ACTIVE_STATUSES = new Set<string>([
    ...GOOD_STATUSES,
    "PHONE_CONFIRMATION",
    "VERIFYING_PHONE",
    "PHONE_NUMBER_CONFIRMATION",
    "WAITING_VERIFICATION_CODE",
    "WAITING_SMS_CODE",
    "SMS_CODE_WAIT",
    "VERIFICATION_CODE_WAIT",
    "QUEUED",
    "ACCEPTED",
    "ACCEPT",
]);

export const isSlotActiveStatus = (status?: WorkerStatus) => ACTIVE_STATUSES.has(normStatus(status));

export const canShutdownSlot = (status?: WorkerStatus) => status !== "SHUTDOWN";

/** Пауза / продолжение отписок — только в статусе ACTIVE (см. ТЗ). */
export const canPauseOrContinue = (status?: WorkerStatus) => normStatus(status as string | number) === "ACTIVE";

const normStatus = (s?: string | number) => String(s ?? "").trim().toUpperCase();

/** Этап ввода номера. На бэкенде канонически: PHONE_VERIFICATION. */
export const isPhoneConfirmationStatus = (status?: WorkerStatus) => {
    const n = normStatus(status);
    return (
        n === "PHONE_VERIFICATION" ||
        n === "PHONE_CONFIRMATION" ||
        n === "VERIFYING_PHONE" ||
        n === "PHONE_NUMBER_CONFIRMATION"
    );
};

/** Этап ввода SMS-кода. На бэкенде канонически: EXPECTING_CODE. */
export const isWaitingVerificationCodeStatus = (status?: WorkerStatus) => {
    const n = normStatus(status);
    return (
        n === "EXPECTING_CODE" ||
        n === "WAITING_VERIFICATION_CODE" ||
        n === "WAITING_SMS_CODE" ||
        n === "SMS_CODE_WAIT" ||
        n === "VERIFICATION_CODE_WAIT"
    );
};

/**
 * После успешного `code` RedisService ставит CONNECTING (не сразу ACTIVE).
 * Опрос можно завершить, как только статус перестал быть EXPECTING_CODE.
 */
export const hasLeftExpectingCodeStatus = (status?: WorkerStatus | number) =>
    normStatus(status) !== "EXPECTING_CODE";

export const extractWorkerPhoneNumber = (w: { phoneNumber?: unknown; phone?: unknown } | null | undefined): string => {
    const a = w?.phoneNumber;
    if (typeof a === "string" && a.trim()) return a.trim();
    const b = w?.phone;
    if (typeof b === "string" && b.trim()) return b.trim();
    return "";
};

/**
 * Слияние ответа GET /worker с состоянием карточки.
 * Пока воркер не обработал verify, сервер часто отдаёт phoneNumber: null — { ...p, ...i } затирал бы номер из ответа apply.
 * Исключение: неверный SMS-код → PHONE_VERIFICATION и пустой телефон — доверяем серверу.
 */
export function mergeWorkerServerIntoLocal(prev: Worker, incoming: Worker): Worker {
    const p = prev as unknown as Record<string, unknown>;
    const i = incoming as unknown as Record<string, unknown>;
    const out = { ...p, ...i } as unknown as Worker;

    const prevPhone = extractWorkerPhoneNumber(prev as { phoneNumber?: unknown; phone?: unknown });
    const incRaw = i.phoneNumber;
    const incEmpty =
        incRaw === null ||
        incRaw === undefined ||
        (typeof incRaw === "string" && incRaw.trim() === "");

    const prevSt = normStatus(p.status as string | number);
    const incSt = normStatus(i.status as string | number);
    const smsRejected = prevSt === "EXPECTING_CODE" && incSt === "PHONE_VERIFICATION" && incEmpty;

    const preservedPhone = Boolean(incEmpty && prevPhone && !smsRejected);
    if (preservedPhone) {
        (out as unknown as Record<string, unknown>).phoneNumber = prevPhone;
    }

    slotVerifyLog('mergeWorkerServerIntoLocal', {
        workerId: (incoming as Worker).id,
        prev: { status: prevSt, phone: prevPhone || null },
        server: { status: incSt, phone: incRaw === undefined ? '(key missing)' : incRaw },
        smsRejected,
        preservedPhone,
    });

    return out;
}