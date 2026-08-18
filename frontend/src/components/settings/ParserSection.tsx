import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { parserService } from '../../api';
import FilterCard, { type UserFilter } from './FilterCard';
import { useAppStore } from '../../store/appStore';

const SPRING_TAP = { type: "spring" as const, stiffness: 500, damping: 25 };

export const ParserSection: React.FC = () => {
    const [filtersLoading, setFiltersLoading] = useState(false);
    const [userFilters, setUserFilters] = useState<UserFilter[]>([]);
    const { addNotification } = useAppStore();
    const [activatingId, setActivatingId] = useState<number | null>(null);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

    const navigate = useNavigate();

    const loadUserFilters = async () => {
        setFiltersLoading(true);
        try {
            const list = await parserService.getFilters?.();
            if (Array.isArray(list)) {
                const normalized: UserFilter[] = list
                    .map((f) => ({
                        id: f.id,
                        name: typeof f.name === 'string' ? f.name : undefined,
                        link: typeof f.searchLink === 'string' ? f.searchLink : undefined,
                        dealType: f.dealType,
                        propertyType: f.propertyType,
                        priceMin: typeof f.priceMin === 'number' ? f.priceMin : undefined,
                        priceMax: typeof f.priceMax === 'number' ? f.priceMax : undefined,
                        minDateRegistered: typeof f.minDateRegistered === 'string' ? f.minDateRegistered : undefined,
                        maxDateRegistered: typeof f.maxDateRegistered === 'string' ? f.maxDateRegistered : undefined,
                        isActive: typeof f.isActive === 'boolean' ? f.isActive : undefined,
                    }))
                    .filter((x) => typeof x.id === 'number');
                setUserFilters(normalized);
            }
        } catch (e) {
            console.error('Failed to load user filters', e);
        } finally { setFiltersLoading(false); }
    };

    useEffect(() => {
        (async () => {
            await loadUserFilters();
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const formatDateShort = (iso?: string) => {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    const activateFilter = async (id: number) => {
        setActivatingId(id);
        try {
            setUserFilters(prev => prev.map(f => ({ ...f, isActive: f.id === id })));
            await parserService.updateFilter(id, { isActive: true });
        } catch (e) {
            console.error('Failed to activate filter', e);
        } finally {
            setActivatingId(null);
        }
    };

    const deleteFilter = (id: number) => {
        setConfirmDeleteId(id);
    };

    const confirmDelete = async () => {
        if (confirmDeleteId === null) return;
        const id = confirmDeleteId;
        setConfirmDeleteId(null);
        setDeletingId(id);
        try {
            await parserService.deleteFilter(id);
            setUserFilters(prev => prev.filter(f => f.id !== id));
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error('Failed to delete filter', id, e);
            addNotification({ id: `del-filter-${id}-${Date.now()}`, message: msg, type: 'error', timestamp: Date.now() });
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <>
        <div className="mt-5 space-y-4">
            <div>
                <div className="mb-3">
                    <div className="flex items-center justify-between">
                        <p className="text-white text-[17px] font-semibold">Фильтры парсинга</p>
                        {filtersLoading && (
                            <span className="relative w-4 h-4 shrink-0">
                                <span className="absolute inset-0 rounded-full border-2 border-white/20" />
                                <span className="absolute inset-0 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                            </span>
                        )}
                    </div>
                    <p className="text-[13px] text-white/40 mt-0.5">Настройки для автоматического парсинга объявлений на Циан</p>
                </div>


                {!filtersLoading && userFilters.length === 0 && (
                    <div className="rounded-[24px] glass glass-border-light py-10 flex flex-col items-center justify-center text-center">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="mb-2.5 opacity-25"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" stroke="#0B2430" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        <p className="text-white/30 text-sm mb-4">Нет сохранённых фильтров</p>
                        <motion.button
                            onClick={() => navigate('/filters/new', { state: { initial: { name: '', parsingLink: '' } } })}
                            whileTap={{ scale: 0.95 }}
                            transition={SPRING_TAP}
                            className="h-9 px-5 rounded-[16px] text-sm font-semibold glass-border-light"
                            style={{ background: 'rgba(255,255,255,0.6)', color: '#0B2430' }}
                            type="button"
                        >
                            + Создать фильтр
                        </motion.button>
                    </div>
                )}
                {!filtersLoading && userFilters.length > 0 && (
                    <div className="space-y-2">
                        {userFilters.map((f) => {
                            const filterId = f.id;
                            return (
                                <FilterCard
                                    key={filterId}
                                    f={f}
                                    active={!!f.isActive}
                                    activating={activatingId === filterId}
                                    deleting={deletingId === filterId}
                                    onActivate={activateFilter}
                                    onDelete={deleteFilter}
                                    onEdit={(id) => {
                                        if (id == null) return;
                                        navigate(`/filters/${String(id)}`);
                                    }}
                                    formatDateShort={formatDateShort}
                                />
                            );
                        })}
                        <motion.button
                            onClick={() => navigate('/filters/new', { state: { initial: { name: '', parsingLink: '' } } })}
                            whileTap={{ scale: 0.95 }}
                            transition={SPRING_TAP}
                            className="w-full h-[44px] rounded-2xl flex items-center justify-center text-[14px] font-medium text-white/50 hover:text-white/70 transition-colors glass-border-light"
                            style={{ background: 'rgba(255,255,255,0.6)' }}
                            type="button"
                        >
                            + Создать фильтр
                        </motion.button>
                    </div>
                )}
            </div>
        </div>

        {confirmDeleteId !== null && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <div
                    className="w-full max-w-sm glass-border-light rounded-[24px] p-5"
                    style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(24px) saturate(1.3)', WebkitBackdropFilter: 'blur(24px) saturate(1.3)' }}
                >
                    <h2 className="text-white text-lg font-semibold mb-2">Удалить фильтр?</h2>
                    <p className="text-white/70 text-sm mb-5">Фильтр #{confirmDeleteId} будет удалён без возможности восстановления.</p>
                    <div className="flex gap-3">
                        <motion.button
                            onClick={() => setConfirmDeleteId(null)}
                            whileTap={{ scale: 0.96 }}
                            transition={SPRING_TAP}
                            className="flex-1 py-3 rounded-[20px] glass glass-border-light text-white font-medium"
                        >
                            Отмена
                        </motion.button>
                        <motion.button
                            onClick={confirmDelete}
                            whileTap={{ scale: 0.96 }}
                            transition={SPRING_TAP}
                            className="flex-1 py-3 rounded-[20px] bg-red-500/80 text-white font-semibold"
                        >
                            Удалить
                        </motion.button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
};

export default ParserSection;
