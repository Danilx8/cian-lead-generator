import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { lockScroll, unlockScroll } from '../utils/scrollLock';

type Props = {
    message: string;
    title?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: 'accent' | 'danger';
    onClose: (ok: boolean) => void;
};

const SPRING = { type: 'spring', stiffness: 340, damping: 30 } as const;
const SPRING_TAP = { type: 'spring', stiffness: 400, damping: 28 } as const;

const ConfirmModal: React.FC<Props> = ({
    message,
    title,
    confirmLabel = 'Подтвердить',
    cancelLabel = 'Отмена',
    tone = 'accent',
    onClose,
}) => {
    useEffect(() => {
        lockScroll();
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose(false);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('keydown', onKey);
            unlockScroll();
        };
    }, [onClose]);

    const confirmClass = tone === 'danger'
        ? 'bg-red-600/85 text-white'
        : 'bg-accent text-black';

    return createPortal(
        <AnimatePresence>
            <motion.div
                className="fixed inset-0 z-[2000] flex items-center justify-center p-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
            >
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => onClose(false)} />
                <motion.div
                    role="dialog"
                    aria-modal="true"
                    className="relative w-full max-w-sm rounded-[24px] overflow-hidden glass glass-border-light border border-white/10 p-5"
                    style={{
                        background: 'rgba(255,255,255,0.6)',
                        backdropFilter: 'blur(24px) saturate(1.3)',
                        WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
                        boxShadow: '0 24px 80px rgba(11,36,48,0.18)',
                    }}
                    initial={{ y: 12, scale: 0.96, opacity: 0 }}
                    animate={{ y: 0, scale: 1, opacity: 1 }}
                    exit={{ y: 12, scale: 0.96, opacity: 0 }}
                    transition={SPRING}
                >
                    {title && <h2 className="text-white text-lg font-semibold mb-2">{title}</h2>}
                    <div className="text-sm text-white/80 leading-relaxed whitespace-pre-line">{message}</div>
                    <div className="flex gap-3 mt-5">
                        <motion.button
                            type="button"
                            onClick={() => onClose(false)}
                            whileTap={{ scale: 0.96 }}
                            transition={SPRING_TAP}
                            className="flex-1 py-3 rounded-[18px] glass glass-border-light text-white font-medium"
                        >
                            {cancelLabel}
                        </motion.button>
                        <motion.button
                            type="button"
                            onClick={() => onClose(true)}
                            whileTap={{ scale: 0.96 }}
                            transition={SPRING_TAP}
                            className={`flex-1 py-3 rounded-[18px] font-semibold ${confirmClass}`}
                        >
                            {confirmLabel}
                        </motion.button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>,
        document.body,
    );
};

export default ConfirmModal;
