import { motion } from 'framer-motion';

const SPRING = { type: "spring" as const, stiffness: 300, damping: 24, mass: 0.8 };

export const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label?: React.ReactNode }> = ({ checked, onChange, label }) => (
    <button
        type="button"
        className="inline-flex items-center gap-3 select-none"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
    >
        {label && <span className="text-white/90 text-left">{label}</span>}
        <motion.span
            className="relative w-[52px] h-[26px] rounded-full glass-border-light cursor-pointer"
            animate={{
                background: checked
                    ? '#00AEEF'
                    : 'rgba(11, 36, 48, 0.15)',
            }}
            transition={SPRING}
            style={{
                backdropFilter: 'blur(12px) saturate(1.3)',
                WebkitBackdropFilter: 'blur(12px) saturate(1.3)',
            }}
        >
            <motion.span
                className="absolute top-[4px] rounded-full"
                animate={{
                    left: checked ? 26 : 4,
                    background: checked ? '#FFFFFF' : 'rgba(255, 255, 255, 0.9)',
                }}
                transition={SPRING}
                style={{ width: 22, height: 18 }}
            />
        </motion.span>
    </button>
);

export default Toggle;
