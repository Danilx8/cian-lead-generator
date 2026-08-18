import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { lockScroll, unlockScroll } from '../../utils/scrollLock';

type Props = {
    value?: string;
    onChange: (date: string) => void;
    placeholder?: string;
    otherValue?: string;
};

const SPRING_TAP = { type: "spring" as const, stiffness: 500, damping: 25 };

const monthNamesRu = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];
const daysShort = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const toYMD = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const formatRu = (ymd?: string) => {
    if (!ymd) return '';
    const [y, m, d] = ymd.split('-').map(Number);
    return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
};

const monthMatrix = (monthDate: Date) => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const first = new Date(year, month, 1);
    let startDay = (first.getDay() + 6) % 7;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const cells: { date: Date; inCurrent: boolean }[] = [];

    for (let i = 0; i < startDay; i++) {
        cells.push({
            date: new Date(year, month - 1, prevMonthDays - startDay + 1 + i),
            inCurrent: false
        });
    }

    for (let d = 1; d <= daysInMonth; d++) {
        cells.push({ date: new Date(year, month, d), inCurrent: true });
    }

    /* Only pad to fill the last row (next multiple of 7), not always 42 */
    const targetLen = Math.ceil(cells.length / 7) * 7;
    while (cells.length < targetLen) {
        const last = cells[cells.length - 1].date;
        cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), inCurrent: false });
    }

    return cells;
};

const triggerStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)',
    backdropFilter: 'blur(20px) saturate(1.2)',
    WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
};

const popupStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.10)',
    backdropFilter: 'blur(32px) saturate(1.4)',
    WebkitBackdropFilter: 'blur(32px) saturate(1.4)',
};

const DatePicker: React.FC<Props> = ({ value, onChange, placeholder = 'Дата регистрации', otherValue }) => {
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);

    const [open, setOpen] = useState(false);
    const [month, setMonth] = useState(() => {
        const d = value ? new Date(value) : new Date();
        return new Date(d.getFullYear(), d.getMonth(), 1);
    });
    const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

    const computePos = useCallback(() => {
        if (!triggerRef.current) return;

        const r = triggerRef.current.getBoundingClientRect();
        const padding = 8;
        const viewportH = window.innerHeight;
        const viewportW = window.innerWidth;

        const popupHeight = 320;
        const popupWidth = Math.min(320, viewportW - 32);

        const spaceBelow = viewportH - r.bottom;
        const spaceAbove = r.top;

        const openUp = spaceBelow < popupHeight && spaceAbove > spaceBelow;

        const top = openUp
            ? Math.max(16, r.top - popupHeight - padding)
            : r.bottom + padding;

        // По центру экрана горизонтально.
        const centeredLeft = Math.round((viewportW - popupWidth) / 2);

        setPos({
            top,
            left: centeredLeft,
            width: popupWidth
        });
    }, []);

    useEffect(() => {
        if (!open) return;
        computePos();

        const onDown = (e: MouseEvent) => {
            if (!popupRef.current?.contains(e.target as Node) &&
                !triggerRef.current?.contains(e.target as Node)) {
                setOpen(false);
            }
        };

        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);

        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        window.addEventListener('resize', computePos);

        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
            window.removeEventListener('resize', computePos);
        };
    }, [open, computePos]);

    useEffect(() => {
        if (open) lockScroll();
        else unlockScroll();
        return () => { unlockScroll(); };
    }, [open]);

    const todayYmd = toYMD(new Date());

    const selectDate = (d: Date) => {
        onChange(toYMD(d));
        setOpen(false);
    };

    return (
        <>
            <motion.button
                ref={triggerRef}
                type="button"
                onClick={() => setOpen(v => !v)}
                whileTap={{ scale: 0.97 }}
                transition={SPRING_TAP}
                className="rounded-[16px] px-3 py-3 text-white w-full flex items-center justify-between glass-border-light"
                style={triggerStyle}
            >
                <span className={`flex-1 text-left text-sm ${value ? 'text-white' : 'text-white/30'}`}>
                    {value ? formatRu(value) : placeholder}
                </span>
                <svg width="16" height="16" viewBox="0 0 24 24" className="opacity-50">
                    <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2" fill="none" />
                </svg>
            </motion.button>
            {createPortal(
                <AnimatePresence>
                    {open && (
                        <motion.div
                            ref={popupRef}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ type: "spring", stiffness: 500, damping: 30 }}
                            className="fixed z-[1000] p-4 rounded-[24px] glass-border-light"
                            style={{ ...popupStyle, top: pos.top, left: pos.left, width: pos.width }}
                        >
                            {/* Nav header */}
                            <div className="flex justify-between items-center mb-3">
                                <div className="flex items-center gap-1">
                                    <motion.button
                                        type="button"
                                        whileTap={{ scale: 0.9 }}
                                        transition={SPRING_TAP}
                                        onClick={() =>
                                            setMonth(d => new Date(d.getFullYear() - 1, d.getMonth(), 1))
                                        }
                                        className="w-8 h-8 rounded-full flex items-center justify-center text-white/50 hover:text-white/80 bg-white/5 hover:bg-white/10 transition-colors"
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 18L6 12l12-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                    </motion.button>
                                    <motion.button
                                        type="button"
                                        whileTap={{ scale: 0.9 }}
                                        transition={SPRING_TAP}
                                        onClick={() =>
                                            setMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
                                        }
                                        className="w-8 h-8 rounded-full flex items-center justify-center text-white/50 hover:text-white/80 bg-white/5 hover:bg-white/10 transition-colors"
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                    </motion.button>
                                </div>
                                <div className="text-white text-sm font-semibold">
                                    {monthNamesRu[month.getMonth()]} {month.getFullYear()}
                                </div>
                                <div className="flex items-center gap-1">
                                    <motion.button
                                        type="button"
                                        whileTap={{ scale: 0.9 }}
                                        transition={SPRING_TAP}
                                        onClick={() =>
                                            setMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))
                                        }
                                        className="w-8 h-8 rounded-full flex items-center justify-center text-white/50 hover:text-white/80 bg-white/5 hover:bg-white/10 transition-colors"
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                    </motion.button>
                                    <motion.button
                                        type="button"
                                        whileTap={{ scale: 0.9 }}
                                        transition={SPRING_TAP}
                                        onClick={() =>
                                            setMonth(d => new Date(d.getFullYear() + 1, d.getMonth(), 1))
                                        }
                                        className="w-8 h-8 rounded-full flex items-center justify-center text-white/50 hover:text-white/80 bg-white/5 hover:bg-white/10 transition-colors"
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 6-12 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                    </motion.button>
                                </div>
                            </div>

                            {/* Weekday headers */}
                            <div className="grid grid-cols-7 mb-1">
                                {daysShort.map(d => (
                                    <div key={d} className="text-center text-[11px] text-white/30 font-medium py-1">
                                        {d}
                                    </div>
                                ))}
                            </div>

                            {/* Day cells */}
                            <div className="grid grid-cols-7">
                                {monthMatrix(month).map((c, i) => {
                                    const ymd = toYMD(c.date);
                                    const selected = value === ymd;
                                    const other = otherValue === ymd;
                                    const isToday = ymd === todayYmd && c.inCurrent;

                                    return (
                                        <div key={i} className="flex items-center justify-center py-0.5">
                                            <motion.button
                                                type="button"
                                                whileTap={{ scale: 0.85 }}
                                                transition={SPRING_TAP}
                                                onClick={() => selectDate(c.date)}
                                                className={`w-9 h-9 rounded-full text-[13px] relative flex items-center justify-center transition-colors ${selected
                                                    ? 'bg-accent text-black font-semibold'
                                                    : other
                                                        ? 'ring-2 ring-[#9ddc00]/60 text-white font-semibold bg-[#9ddc0060]'
                                                        : isToday
                                                            ? 'text-white/60'
                                                            : c.inCurrent
                                                                ? 'text-white/80 hover:bg-white/10'
                                                                : 'text-white/15'
                                                    }`}
                                            >
                                                {c.date.getDate()}
                                            </motion.button>
                                        </div>
                                    );
                                })}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </>
    );
};

export default DatePicker;
