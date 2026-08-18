import { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const SPRING = { type: "spring" as const, stiffness: 400, damping: 30 };

export const PillTabs: React.FC<{
    tabs: { id: string; label: string }[];
    value: string;
    onChange: (id: string) => void;
    textClassName?: string;
    heightClassName?: string;
}> = ({ tabs, value, onChange, textClassName = 'text-sm', heightClassName = 'h-10' }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
    const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

    useEffect(() => {
        const el = tabRefs.current.get(value);
        const container = containerRef.current;
        if (el && container) {
            const cRect = container.getBoundingClientRect();
            const tRect = el.getBoundingClientRect();
            setIndicator({ left: tRect.left - cRect.left, width: tRect.width });
        }
    }, [value, tabs]);

    return (
        <div
            ref={containerRef}
            className="relative flex gap-1 p-[3px] rounded-full glass-elevated glass-border-light"
        >
            {/* Sliding glass indicator */}
            {indicator && (
                <motion.div
                    className="absolute top-[3px] bottom-[3px] rounded-full"
                    style={{
                        background: 'rgba(255,255,255,0.6)',
                        backdropFilter: 'blur(16px) saturate(180%) brightness(1.08)',
                        WebkitBackdropFilter: 'blur(16px) saturate(180%) brightness(1.08)',
                    }}
                    initial={false}
                    animate={{ left: indicator.left, width: indicator.width }}
                    transition={SPRING}
                />
            )}
            {tabs.map(t => (
                <motion.button
                    key={t.id}
                    ref={(el) => { if (el) tabRefs.current.set(t.id, el); }}
                    onClick={() => onChange(t.id)}
                    whileTap={{ scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 500, damping: 25 }}
                    className={`relative z-10 flex-1 ${heightClassName} rounded-full ${textClassName} font-semibold transition-colors duration-200 ${
                        value === t.id ? 'text-white' : 'text-white/40'
                    }`}
                >
                    {t.label}
                </motion.button>
            ))}
        </div>
    );
};

export default PillTabs;
