import React, { useState } from "react";
import type { Worker } from "../api/types";
import {
    isSlotRunning,
    canPauseOrContinue,
    canShutdownSlot,
    isPhoneConfirmationStatus,
    isWaitingVerificationCodeStatus,
    extractWorkerPhoneNumber,
} from "../utils/workerState";
import { SlotPhoneVerificationModal, type VerificationStep } from "./SlotPhoneVerificationModal";
import { browserOptionLabel } from "../utils/browserOptionLabel";
import { osLabel, browserCoreLabel } from "../utils/workerLabels";

// Liquid glass тинты для статусов: полупрозрачный цветной фон + цветной текст + светлая рамка
// + backdrop-blur (как кнопка «Добавить слот»), вместо плотных заливок.
const GLASS = "glass-border-light backdrop-blur-md";
const accentGlass = `${GLASS} bg-accent/15 text-accent`;
const yellowGlass = `${GLASS} bg-yellow-400/15 text-yellow-600`;
const amberGlass = `${GLASS} bg-amber-400/15 text-amber-700`;
const skyGlass = `${GLASS} bg-sky-400/15 text-sky-600`;
const redGlass = `${GLASS} bg-red-500/15 text-red-600`;
const neutralGlass = `${GLASS} bg-white/[0.08] text-white/90`;

// Liquid glass кнопки в карточке слота (тон совпадает со статусами и кнопкой «Добавить слот»).
const BTN_BASE = `${GLASS} px-3.5 py-1.5 rounded-[14px] text-xs font-medium text-center transition active:scale-95 disabled:opacity-50`;
const accentBtn = `${BTN_BASE} bg-accent/15 hover:bg-accent/25 text-accent`;
const redBtn = `${BTN_BASE} bg-red-500/15 hover:bg-red-500/25 text-red-600`;
const neutralBtn = `${BTN_BASE} bg-white/[0.08] hover:bg-white/[0.14] text-white`;

const statusMeta: Record<string, { text: string; className: string }> = {
    INITIALIZING: { text: "Инициализация", className: yellowGlass },
    CONNECTING: { text: "Подключение", className: yellowGlass },
    AUTHENTICATING: { text: "Авторизация", className: yellowGlass },
    ACTIVE: { text: "Активный", className: accentGlass },
    RECONNECTING: { text: "Переподключение", className: yellowGlass },
    PHONE_CONFIRMATION: { text: "Подтверждение номера", className: amberGlass },
    PHONE_VERIFICATION: { text: "Подтверждение номера", className: amberGlass },
    VERIFYING_PHONE: { text: "Подтверждение номера", className: amberGlass },
    PHONE_NUMBER_CONFIRMATION: { text: "Подтверждение номера", className: amberGlass },
    WAITING_VERIFICATION_CODE: { text: "Ожидание кода", className: skyGlass },
    EXPECTING_CODE: { text: "Ожидание кода", className: skyGlass },
    WAITING_SMS_CODE: { text: "Ожидание кода", className: skyGlass },
    SMS_CODE_WAIT: { text: "Ожидание кода", className: skyGlass },
    VERIFICATION_CODE_WAIT: { text: "Ожидание кода", className: skyGlass },
    ERROR: { text: "Ошибка", className: redGlass },
    CONNECTION_LOST: { text: "Соединение потеряно", className: redGlass },
    BANNED: { text: "Бан", className: redGlass },
    SHUTDOWN: { text: "Остановлен", className: neutralGlass },
    // Не WorkerState, а обёртки HTTP-ответа старта (runWorker):
    //   queued — слот поставлен в очередь на запуск;
    //   accepted — старт принят (слот уже запущен/уже в очереди). Дальше реальный статус придёт по сокету/поллингу.
    QUEUED: { text: "В очереди", className: yellowGlass },
    ACCEPTED: { text: "Запускается", className: yellowGlass },
    ACCEPT: { text: "Запускается", className: yellowGlass },
};

const formatDateTime = (iso?: string) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mi} ${dd}.${mm}`;
};

const accountLabel = (w: Worker) => {
    const wa = w as any;
    const acc = wa.account ?? null;
    const name = acc?.name ?? wa.accountName ?? wa.name;
    const login = acc?.login ?? wa.accountLogin ?? wa.login;
    const n = typeof name === "string" ? name.trim() : "";
    const l = typeof login === "string" ? login.trim() : "";
    if (!n && !l) return "—";
    if (n && l) return `${n} • ${l}`;
    return n || l;
};

interface Props {
    worker: Worker;
    onOpen: () => void;
    onEdit: () => void;
    onDelete: () => void;

    onStart: () => void;
    onShutdown: () => void;

    onPause: () => void;
    onContinue: () => void;

    starting?: boolean;
    stopping?: boolean;
    pausing?: boolean;
    continuing?: boolean;
    deleting?: boolean;
    onWorkerUpdated?: (worker: Worker) => void;
}

const SlotCard: React.FC<Props> = ({
    worker,
    onOpen,
    onEdit,
    onDelete,
    onStart,
    onShutdown,
    onPause,
    onContinue,
    starting,
    stopping,
    pausing,
    continuing,
    deleting,
    onWorkerUpdated,
}) => {
    const st = (worker as any).status as string | undefined;
    const upper = (st || "").toUpperCase();
    const badge =
        statusMeta[st || ""] ||
        statusMeta[upper] || {
            text: st || "—",
            className: neutralGlass,
        };

    const running = isSlotRunning(st);
    const showPauseControls = running && canPauseOrContinue(st);

    const [verifyOpen, setVerifyOpen] = useState(false);
    const [verifyStep, setVerifyStep] = useState<VerificationStep>("phone");

    const phoneValue = extractWorkerPhoneNumber(worker as any);
    const showPhoneRow = phoneValue.length > 0;
    const showEnterPhone = isPhoneConfirmationStatus(st);

    const showEnterCode =
        isWaitingVerificationCodeStatus(st) ||
        (isPhoneConfirmationStatus(st) && phoneValue.length > 0);

    const w = worker as any;
    const browserOption = browserOptionLabel(
        w.browserOption ?? w.BrowserOption ?? w.browserType ?? w.BrowserType
    );
    const browserCore = browserCoreLabel(w.browserCore ?? w.BrowserCore);
    const proxyRaw = (worker as any).proxy ?? (worker as any).proxyString ?? (worker as any).proxyUrl ?? null;
    // Пустой/непривязанный прокси бэкенд отдаёт как «://:» — показываем как «—».
    const proxy =
        typeof proxyRaw === "string" &&
            proxyRaw.replace(/^[a-z0-9]+:\/\//i, "").replace(/[:@/]/g, "").trim().length > 0
            ? proxyRaw
            : null;
    const mailedDialogsCount = (worker as any).mailedDialogsCount;
    const dialogsCount = (worker as any).dialogsCount;

    return (
        <>
            <div
                className="glass glass-border-light rounded-[24px] p-4 cursor-pointer active:scale-[0.99] transition-transform duration-200 shadow-[0_8px_32px_rgba(0,0,0,0.35)]"
                onClick={onOpen}
                role="button"
                tabIndex={0}
            >
                <div className="mb-3 space-y-2">
                    {/* Строка 1: название слота + иконки редактировать/удалить */}
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="text-white text-lg font-semibold truncate">Слот #{(worker as any).id}</h3>
                        <div className="flex items-center gap-0 -mr-2 -mt-2">
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onEdit();
                                }}
                                aria-label="Редактировать слот"
                                className="p-2 text-white/60 hover:text-white active:scale-95 transition"
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                    <path
                                        d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
                                        stroke="currentColor"
                                        strokeWidth="1.8"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                    <path
                                        d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
                                        stroke="currentColor"
                                        strokeWidth="1.8"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                </svg>
                            </button>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete();
                                }}
                                disabled={deleting}
                                aria-label="Удалить слот"
                                className="p-2 text-white/60 hover:text-white active:scale-95 transition disabled:opacity-40"
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                    <path
                                        d="M5 7h14M10 10v6M14 10v6M9 7l.867-2.6A1 1 0 0 1 10.824 4h2.352a1 1 0 0 1 .957.4L15 7m4 0-1 13.2a2 2 0 0 1-1.995 1.8H7.995A2 2 0 0 1 6 20.2L5 7"
                                        stroke="currentColor"
                                        strokeWidth="1.8"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                </svg>
                            </button>
                        </div>
                    </div>
                    {/* Строка 2: статус + кнопки действий (статус на линии первой кнопки) */}
                    <div className="flex items-start justify-between gap-3">
                        <span className={`inline-flex items-center justify-center px-3.5 py-1.5 rounded-[14px] text-xs font-medium text-center w-fit ${badge.className}`}>
                            {badge.text}
                        </span>
                        {/* Кнопки действий равняются по самой широкой: items-stretch + ширина по контенту */}
                        <div className="flex flex-col items-stretch gap-2">
                            {!running ? (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onStart();
                                    }}
                                    disabled={starting}
                                    aria-label="Запустить слот"
                                    className={accentBtn}
                                >
                                    {starting ? "Запуск слота" : "Старт слота"}
                                </button>
                            ) : (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onShutdown();
                                    }}
                                    disabled={stopping || !canShutdownSlot((worker as any).status)}
                                    aria-label="Остановить слот"
                                    className={redBtn}
                                >
                                    {stopping ? "Остановка слота" : "Остановить слот"}
                                </button>
                            )}
                            {showPauseControls &&
                                ((worker as any).isActive ? (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onPause();
                                        }}
                                        disabled={pausing}
                                        aria-label="Прервать отписки"
                                        className={neutralBtn}
                                    >
                                        {pausing ? "Прерывание…" : "Прервать отписки"}
                                    </button>
                                ) : (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onContinue();
                                        }}
                                        disabled={continuing}
                                        aria-label="Продолжить отписки"
                                        className={accentBtn}
                                    >
                                        {continuing ? "Возобновление…" : "Продолжить отписки"}
                                    </button>
                                ))}
                            {showEnterPhone && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setVerifyStep("phone");
                                        setVerifyOpen(true);
                                    }}
                                    className={accentBtn}
                                >
                                    Ввести номер
                                </button>
                            )}
                            {showEnterCode && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setVerifyStep("code");
                                        setVerifyOpen(true);
                                    }}
                                    className={accentBtn}
                                >
                                    Ввести код
                                </button>
                            )}
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs md:text-sm">
                    <div className="text-white/40">ОС</div>
                    <div className="text-white truncate">
                        {osLabel(
                            w.operatorSystemId ??
                            w.operationSystem ??
                            w.operationSystemId ??
                            w.platform
                        )}
                    </div>
                    <div className="text-white/40">Браузер</div>
                    <div className="text-white truncate">
                        <span>{browserOption}</span>
                        <span className="text-white/50"> / </span>
                        <span className={browserCore === "—" ? "text-white/40" : ""}>{browserCore}</span>
                    </div>
                    <div className="text-white/40">Аккаунт</div>
                    <div className="text-white truncate">{accountLabel(worker)}</div>
                    {showPhoneRow && (
                        <>
                            <div className="text-white/40">Номер телефона</div>
                            <div className="text-white truncate font-mono text-[13px]">{phoneValue}</div>
                        </>
                    )}
                    <div className="text-white/40">Прокси</div>
                    <div className="text-white truncate">{proxy || "—"}</div>
                    <div className="text-white/40">Создан</div>
                    <div className="text-white truncate">{formatDateTime((worker as any).createdAt)}</div>
                    <div className="text-white/40">Количество отписок</div>
                    <div className="text-white truncate">{dialogsCount || "—"}</div>
                    <div className="text-white/40">Отправленные почты</div>
                    <div className="text-white truncate">{mailedDialogsCount || "—"}</div>
                </div>
            </div>
            <SlotPhoneVerificationModal
                workerId={(worker as any).id as number}
                open={verifyOpen}
                step={verifyStep}
                phoneDisplay={phoneValue}
                onClose={() => setVerifyOpen(false)}
                onBackToPhone={() => setVerifyStep("phone")}
                onWorkerUpdated={(w) => {
                    onWorkerUpdated?.(w);
                    setVerifyOpen(false);
                }}
            />
        </>
    );
};

export default SlotCard;
