import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import DatePicker from './DatePicker';
import { lockScroll, unlockScroll } from '../../utils/scrollLock';

type Props = {
    value?: string;
    onChange: (value: string) => void;
    placeholderDate?: string;
    placeholderTime?: string;
    otherDate?: string; // YYYY-MM-DD of the other picker to highlight
};

const formatTime = (value?: string) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const joinDateAndTime = (date: string, time: string) => {
    if (!date) return '';
    const safeTime = time || '00:00';
    return `${date}T${safeTime}`;
};

const HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, '0'));

// Wheel geometry — iOS-style drum picker.
const ITEM_H = 40;
const VISIBLE_ROWS = 5;
const WHEEL_H = ITEM_H * VISIBLE_ROWS; // 200

const POPUP_STYLE: React.CSSProperties = {
    position: 'fixed',
    visibility: 'hidden',
    background: 'rgba(255,255,255,0.08)',
    backdropFilter: 'blur(24px) saturate(1.35) brightness(1.05)',
    WebkitBackdropFilter: 'blur(24px) saturate(1.35) brightness(1.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    boxShadow: '0 24px 80px rgba(0,0,0,0.28)',
};

type WheelProps = {
    items: string[];
    value: string;
    disabled?: boolean;
    onSettle: (value: string) => void;
};

// translateY that centers item `i` in the viewport.
const offsetForIndex = (i: number) => WHEEL_H / 2 - ITEM_H / 2 - i * ITEM_H;

/**
 * Drum column driven by a manual touch/mouse/wheel drag (transform-based),
 * NOT native overflow scrolling — native scroll is unreliable inside a
 * position:fixed + touchmove-locked modal in iOS WebView.
 */
const Wheel: React.FC<WheelProps> = React.memo(({ items, value, disabled, onSettle }) => {
    const viewportRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
    const offsetRef = useRef(0);
    const animRef = useRef<number | null>(null);
    const onSettleRef = useRef(onSettle);
    onSettleRef.current = onSettle;

    const maxOffset = offsetForIndex(0);
    const minOffset = offsetForIndex(items.length - 1);
    const clampOffset = useCallback((o: number) => Math.min(maxOffset, Math.max(minOffset, o)), [maxOffset, minOffset]);
    const indexFromOffset = useCallback(
        (o: number) => Math.min(items.length - 1, Math.max(0, Math.round((offsetForIndex(0) - o) / ITEM_H))),
        [items.length],
    );

    // Direct DOM writes — no React re-render per frame.
    const apply = useCallback((o: number) => {
        offsetRef.current = o;
        if (contentRef.current) contentRef.current.style.transform = `translate3d(0, ${o}px, 0)`;
        const center = WHEEL_H / 2;
        for (let i = 0; i < itemRefs.current.length; i += 1) {
            const node = itemRefs.current[i];
            if (!node) continue;
            const itemCenter = o + i * ITEM_H + ITEM_H / 2;
            const dist = Math.abs(itemCenter - center) / ITEM_H;
            node.style.opacity = String(Math.max(0.08, 1 - dist * 0.42));
            node.style.transform = `scale(${Math.max(0.76, 1 - dist * 0.11)})`;
        }
    }, []);

    const cancelAnim = useCallback(() => {
        if (animRef.current != null) {
            cancelAnimationFrame(animRef.current);
            animRef.current = null;
        }
    }, []);

    const animateTo = useCallback((target: number) => {
        cancelAnim();
        const start = offsetRef.current;
        const dur = 240;
        let t0: number | null = null;
        const step = (ts: number) => {
            if (t0 == null) t0 = ts;
            const p = Math.min(1, (ts - t0) / dur);
            const eased = 1 - Math.pow(1 - p, 3);
            apply(start + (target - start) * eased);
            animRef.current = p < 1 ? requestAnimationFrame(step) : null;
        };
        animRef.current = requestAnimationFrame(step);
    }, [apply, cancelAnim]);

    // Position on the current value when the wheel mounts (popup opens).
    useLayoutEffect(() => {
        const idx = Math.max(0, items.indexOf(value));
        apply(offsetForIndex(idx));
        // Only on mount.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const vp = viewportRef.current;
        if (!vp || disabled) return;

        let dragging = false;
        let startY = 0;
        let startOffset = 0;
        let lastY = 0;
        let lastT = 0;
        let velocity = 0; // px per ms
        let wheelTimer: number | null = null;

        const begin = (y: number, t: number) => {
            cancelAnim();
            dragging = true;
            startY = y;
            startOffset = offsetRef.current;
            lastY = y;
            lastT = t;
            velocity = 0;
        };
        const move = (y: number, t: number) => {
            if (!dragging) return;
            const dt = t - lastT;
            if (dt > 0) velocity = (y - lastY) / dt;
            lastY = y;
            lastT = t;
            apply(clampOffset(startOffset + (y - startY)));
        };
        const end = () => {
            if (!dragging) return;
            dragging = false;
            // Momentum: fling a bit further, then snap to the nearest item.
            const projected = clampOffset(offsetRef.current + velocity * 130);
            const idx = indexFromOffset(projected);
            animateTo(offsetForIndex(idx));
            onSettleRef.current(items[idx]);
        };

        const onTouchStart = (e: TouchEvent) => begin(e.touches[0].clientY, e.timeStamp);
        const onTouchMove = (e: TouchEvent) => {
            if (!dragging) return;
            e.preventDefault(); // stop the page/modal from scrolling instead
            move(e.touches[0].clientY, e.timeStamp);
        };
        const onTouchEnd = () => end();

        const onMouseMove = (e: MouseEvent) => move(e.clientY, e.timeStamp);
        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            end();
        };
        const onMouseDown = (e: MouseEvent) => {
            begin(e.clientY, e.timeStamp);
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        };

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            cancelAnim();
            apply(clampOffset(offsetRef.current - e.deltaY));
            if (wheelTimer != null) window.clearTimeout(wheelTimer);
            wheelTimer = window.setTimeout(() => {
                const idx = indexFromOffset(offsetRef.current);
                animateTo(offsetForIndex(idx));
                onSettleRef.current(items[idx]);
            }, 120);
        };

        vp.addEventListener('touchstart', onTouchStart, { passive: true });
        vp.addEventListener('touchmove', onTouchMove, { passive: false });
        vp.addEventListener('touchend', onTouchEnd);
        vp.addEventListener('touchcancel', onTouchEnd);
        vp.addEventListener('mousedown', onMouseDown);
        vp.addEventListener('wheel', onWheel, { passive: false });

        return () => {
            vp.removeEventListener('touchstart', onTouchStart);
            vp.removeEventListener('touchmove', onTouchMove);
            vp.removeEventListener('touchend', onTouchEnd);
            vp.removeEventListener('touchcancel', onTouchEnd);
            vp.removeEventListener('mousedown', onMouseDown);
            vp.removeEventListener('wheel', onWheel);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            if (wheelTimer != null) window.clearTimeout(wheelTimer);
        };
    }, [disabled, items, clampOffset, indexFromOffset, apply, animateTo, cancelAnim]);

    useEffect(() => () => cancelAnim(), [cancelAnim]);

    return (
        <div
            ref={viewportRef}
            className="relative overflow-hidden select-none"
            style={{
                height: WHEEL_H,
                opacity: disabled ? 0.4 : 1,
                pointerEvents: disabled ? 'none' : 'auto',
                touchAction: 'none',
                cursor: disabled ? 'default' : 'grab',
            }}
        >
            <div ref={contentRef} style={{ willChange: 'transform' }}>
                {items.map((item, i) => (
                    <div
                        key={item}
                        ref={(node) => { itemRefs.current[i] = node; }}
                        className="flex items-center justify-center text-2xl font-semibold text-white tabular-nums"
                        style={{ height: ITEM_H }}
                    >
                        {item}
                    </div>
                ))}
            </div>
        </div>
    );
});

Wheel.displayName = 'Wheel';

const DateTimePicker: React.FC<Props> = ({ value, onChange, placeholderDate = 'Дата', placeholderTime = 'Время', otherDate }) => {
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);
    const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});
    const [open, setOpen] = useState(false);
    const [selectedHour, setSelectedHour] = useState('00');
    const [selectedMinute, setSelectedMinute] = useState('00');
    const [touched, setTouched] = useState(false);

    const dateValue = useMemo(() => {
        if (!value) return undefined;
        const [date] = value.split('T');
        return date || undefined;
    }, [value]);

    const timeValue = useMemo(() => formatTime(value), [value]);

    useEffect(() => {
        if (timeValue) {
            const [hour = '00', minute = '00'] = timeValue.split(':');
            setSelectedHour(hour);
            setSelectedMinute(minute);
        } else {
            setSelectedHour('00');
            setSelectedMinute('00');
        }
    }, [timeValue]);

    useEffect(() => {
        if (!open) return;

        const positionPopup = () => {
            if (!triggerRef.current || !popupRef.current) return;
            const rect = triggerRef.current.getBoundingClientRect();
            const width = Math.min(240, window.innerWidth - 48);
            const height = popupRef.current.offsetHeight;
            const top = rect.bottom + 8 + height > window.innerHeight
                ? Math.max(12, rect.top - height - 8)
                : rect.bottom + 8;
            // По центру экрана горизонтально.
            const left = Math.round((window.innerWidth - width) / 2);
            setPopupStyle({ position: 'fixed', top, left, width, zIndex: 1000 });
        };

        positionPopup();
        window.addEventListener('resize', positionPopup);

        const onDown = (event: MouseEvent) => {
            if (!popupRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
            window.removeEventListener('resize', positionPopup);
        };
    }, [open]);

    useEffect(() => {
        if (open) lockScroll();
        else unlockScroll();
        return () => { unlockScroll(); };
    }, [open]);

    const applyTime = useCallback((hour: string, minute: string) => {
        if (!dateValue) return;
        onChange(joinDateAndTime(dateValue, `${hour}:${minute}`));
    }, [dateValue, onChange]);

    const selectHour = useCallback((hour: string) => {
        setTouched(true);
        setSelectedHour(hour);
        setSelectedMinute((minute) => {
            applyTime(hour, minute);
            return minute;
        });
    }, [applyTime]);

    const selectMinute = useCallback((minute: string) => {
        setTouched(true);
        setSelectedMinute(minute);
        setSelectedHour((hour) => {
            applyTime(hour, minute);
            return hour;
        });
    }, [applyTime]);

    // Время можно выбрать и без даты — при выборе даты подставится уже выбранное время.
    const displayTime = timeValue || (touched ? `${selectedHour}:${selectedMinute}` : '');

    return (
        <div className="relative grid grid-cols-[1fr_120px] gap-3">
            <DatePicker
                value={dateValue}
                otherValue={otherDate}
                onChange={(date) => onChange(joinDateAndTime(date, `${selectedHour}:${selectedMinute}`))}
                placeholder={placeholderDate}
            />
            <button
                type="button"
                ref={triggerRef}
                onClick={() => setOpen((prev) => !prev)}
                className="h-12 w-full rounded-[16px] border border-white/10 bg-white/5 px-4 text-left text-sm text-white placeholder:text-white/40 outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] glass-border-light flex items-center justify-between"
                style={{ backdropFilter: 'blur(20px) saturate(1.2)', WebkitBackdropFilter: 'blur(20px) saturate(1.2)' }}
            >
                <span className={displayTime ? 'text-white' : 'text-white/40'}>{displayTime || placeholderTime}</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-white/50">
                    <path d="M12 6V12L16 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" />
                </svg>
            </button>
            {createPortal(
                <AnimatePresence>
                    {open && (
                        <motion.div
                            ref={popupRef}
                            initial={{ opacity: 0, y: -10, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -10, scale: 0.96 }}
                            transition={{ type: 'spring', stiffness: 340, damping: 30 }}
                            className="rounded-[24px] overflow-hidden glass glass-border-light border border-white/10 bg-white/10"
                            style={{ ...POPUP_STYLE, ...popupStyle, visibility: 'visible' }}
                        >
                            <div className="grid grid-cols-2 px-5 pt-4">
                                <div className="text-center text-xs uppercase tracking-[0.2em] text-white/50">Часы</div>
                                <div className="text-center text-xs uppercase tracking-[0.2em] text-white/50">Минуты</div>
                            </div>
                            <div className="px-3 pb-4 pt-2">
                                <div className="relative">
                                    {/* Центральная выделенная полоса выбора — по центру барабанов */}
                                    <div
                                        className="pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2 rounded-[16px]"
                                        style={{
                                            height: ITEM_H,
                                            background: 'linear-gradient(180deg, rgba(157,220,0,0.24), rgba(157,220,0,0.12))',
                                            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 8px 24px rgba(157,220,0,0.16)',
                                            border: '1px solid rgba(157,220,0,0.24)',
                                        }}
                                    />
                                    <div className="grid grid-cols-2">
                                        <Wheel items={HOURS} value={selectedHour} onSettle={selectHour} />
                                        <Wheel items={MINUTES} value={selectedMinute} onSettle={selectMinute} />
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </div>
    );
};

export default DateTimePicker;
