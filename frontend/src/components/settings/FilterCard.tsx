import React from 'react';
import { motion } from 'framer-motion';

export interface UserFilter {
    id: number;
    name?: string;
    link?: string;
    dealType?: string;
    propertyType?: string;
    priceMin?: number;
    priceMax?: number;
    minDateRegistered?: string;
    maxDateRegistered?: string;
    isActive?: boolean;
}

interface Props {
    f: UserFilter;
    active: boolean;
    activating: boolean;
    deleting: boolean;
    onActivate: (id: number) => void;
    onDelete: (id: number) => void;
    onEdit?: (id: number) => void;
    formatDateShort: (iso?: string) => string;
}

const SPRING_TAP = { type: "spring" as const, stiffness: 500, damping: 25 };

const rowStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.6)',
};

const DEAL_LABELS: Record<string, string> = {
    buy: 'покупка',
    rent_long: 'аренда',
    rent_daily: 'посуточно',
};

const PROPERTY_LABELS: Record<string, string> = {
    apartment: 'квартира',
    room: 'комната',
    house: 'дом',
    land: 'участок',
    commercial: 'коммерческая',
    garage: 'гараж',
};

const formatRub = (n: number): string => `${n.toLocaleString('ru-RU')} ₽`;

const priceLabel = (f: UserFilter): string | null => {
    if (f.priceMin != null && f.priceMax != null) return `${formatRub(f.priceMin)} – ${formatRub(f.priceMax)}`;
    if (f.priceMin != null) return `от ${formatRub(f.priceMin)}`;
    if (f.priceMax != null) return `до ${formatRub(f.priceMax)}`;
    return null;
};

const tagCls = 'text-[10px] px-2 py-[3px] rounded-lg bg-white/[0.05] border border-white/[0.06] text-white/40';

const FilterCard: React.FC<Props> = ({
    f,
    active,
    activating,
    deleting,
    onActivate,
    onDelete,
    onEdit,
    formatDateShort,
}) => {
    const price = priceLabel(f);
    const deal = f.dealType ? DEAL_LABELS[f.dealType] || f.dealType : null;
    const property = f.propertyType ? PROPERTY_LABELS[f.propertyType] || f.propertyType : null;
    const hasTags = !!(deal || property || price || f.minDateRegistered || f.maxDateRegistered);

    return (
        <div
            className={`rounded-2xl p-3.5 transition-all glass-border-light ${activating ? 'opacity-60' : ''}`}
            style={rowStyle}
        >
            <div className="flex items-center gap-3">
                {/* Radio indicator */}
                <button
                    type="button"
                    onClick={() => { if (!active && !activating) onActivate(f.id); }}
                    className={`w-[18px] h-[18px] rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition-colors ${
                        active ? 'border-accent bg-accent' : 'border-white/20'
                    }`}
                >
                    {active && (
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5.5L4 7.5L8 3.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    )}
                </button>

                {/* Name + tags */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-white text-[14px] font-medium truncate">
                            {f.name || `Фильтр #${f.id}`}
                        </span>
                        {active && (
                            <span className="text-[9px] tracking-wide uppercase px-1.5 py-0.5 rounded-lg bg-accent/15 text-accent font-semibold shrink-0">
                                актив
                            </span>
                        )}
                    </div>
                    {hasTags && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {deal && <span className={tagCls}>{deal}</span>}
                            {property && <span className={tagCls}>{property}</span>}
                            {price && <span className={tagCls}>{price}</span>}
                            {(f.minDateRegistered || f.maxDateRegistered) && (
                                <span className={tagCls}>
                                    {f.minDateRegistered && !f.maxDateRegistered && `от ${formatDateShort(f.minDateRegistered)}`}
                                    {!f.minDateRegistered && f.maxDateRegistered && `до ${formatDateShort(f.maxDateRegistered)}`}
                                    {f.minDateRegistered && f.maxDateRegistered && `${formatDateShort(f.minDateRegistered)} – ${formatDateShort(f.maxDateRegistered)}`}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="flex gap-1.5 shrink-0">
                    {onEdit && (
                        <motion.button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onEdit(f.id); }}
                            whileTap={{ scale: 0.85 }}
                            transition={SPRING_TAP}
                            className="w-8 h-8 rounded-xl flex items-center justify-center text-white/40 hover:text-white/70 transition-colors glass-border-light"
                            style={{ background: 'rgba(255,255,255,0.6)' }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12.7 6.3l5 5L8 21H3v-5l9.7-9.7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M14 4l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                        </motion.button>
                    )}
                    <motion.button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onDelete(f.id); }}
                        disabled={deleting}
                        whileTap={{ scale: 0.85 }}
                        transition={SPRING_TAP}
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-white/25 hover:text-red-600 transition-colors disabled:opacity-50"
                        style={{
                            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(239, 68, 68, 0.02) 100%)',
                            borderTop: '0.5px solid rgba(239, 68, 68, 0.15)',
                            borderLeft: '0.5px solid rgba(239, 68, 68, 0.10)',
                            borderRight: '0.5px solid rgba(239, 68, 68, 0.03)',
                            borderBottom: '0.5px solid rgba(239, 68, 68, 0.03)',
                        }}
                    >
                        {deleting ? (
                            <div className="w-3.5 h-3.5 border-[1.5px] border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                        )}
                    </motion.button>
                </div>
            </div>
        </div>
    );
};

export default FilterCard;
