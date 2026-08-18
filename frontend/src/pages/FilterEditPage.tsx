import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import Skeleton from '../components/Skeleton';
import { parserService } from '../api';
import SearchSelect from '../components/SearchSelect';
import Toggle from '../components/ui/Toggle';
import { useBodyBackground } from '../hooks/useBodyBackground';

const SPRING_TAP = { type: 'spring' as const, stiffness: 500, damping: 25 };

/* ─── Enums (значения = коды бэкенда, подписи — русские) ─── */
const DEAL_TYPES: { code: string; label: string }[] = [
    { code: 'buy', label: 'Покупка' },
    { code: 'rent_long', label: 'Аренда длительно' },
    { code: 'rent_daily', label: 'Посуточно' },
];
const PROPERTY_TYPES: { code: string; label: string }[] = [
    { code: 'apartment', label: 'Квартира' },
    { code: 'room', label: 'Комната' },
    { code: 'house', label: 'Дом' },
    { code: 'land', label: 'Участок' },
    { code: 'commercial', label: 'Коммерческая' },
    { code: 'garage', label: 'Гараж' },
];
const MARKET_TYPES: { code: string; label: string }[] = [
    { code: 'secondary', label: 'Вторичка' },
    { code: 'new_build', label: 'Новостройка' },
    { code: 'any', label: 'Любой' },
];
const BUILDING_TYPES: { code: string; label: string }[] = [
    { code: 'any', label: 'Любой' },
    { code: 'brick', label: 'Кирпич' },
    { code: 'panel', label: 'Панель' },
    { code: 'monolith', label: 'Монолит' },
    { code: 'block', label: 'Блок' },
    { code: 'wood', label: 'Дерево' },
];
const RENOVATION_TYPES: { code: string; label: string }[] = [
    { code: 'any', label: 'Любой' },
    { code: 'designer', label: 'Дизайнерский' },
    { code: 'euro', label: 'Евроремонт' },
    { code: 'cosmetic', label: 'Косметический' },
    { code: 'needs_renovation', label: 'Требует ремонта' },
];
const SELLER_TYPES: { code: string; label: string }[] = [
    { code: 'any', label: 'Любой' },
    { code: 'owner', label: 'Собственник' },
    { code: 'agent', label: 'Агент' },
    { code: 'developer', label: 'Застройщик' },
];

const labelOf = (list: { code: string; label: string }[], code: string, fallback: string) =>
    code ? (list.find(x => x.code === code)?.label ?? code) : fallback;

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="text-white/50 text-sm font-medium mb-1.5 ml-0.5">{children}</div>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <h3 className="text-white/40 text-xs font-semibold uppercase tracking-wider ml-1 mb-2">{children}</h3>
);

const glassInputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.6)',
    backdropFilter: 'blur(20px) saturate(1.2)',
    WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
};
const glassInputCls = 'glass-border-light';

const numOrUndef = (raw: string): number | undefined => {
    const digits = raw.replace(/\D/g, '');
    return digits === '' ? undefined : Number(digits);
};

const FilterEditPage: React.FC = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const isEdit = !!id;

    useBodyBackground('bg-gradient-noise');

    const [name, setName] = useState('');
    const [isActive, setIsActive] = useState(true);

    const [dealType, setDealType] = useState('buy');
    const [propertyType, setPropertyType] = useState('apartment');
    const [marketType, setMarketType] = useState('any');
    const [rooms, setRooms] = useState<number[]>([]);

    const [priceMin, setPriceMin] = useState<number | undefined>();
    const [priceMax, setPriceMax] = useState<number | undefined>();
    const [areaMin, setAreaMin] = useState<number | undefined>();
    const [areaMax, setAreaMax] = useState<number | undefined>();
    const [kitchenAreaMin, setKitchenAreaMin] = useState<number | undefined>();
    const [floorMin, setFloorMin] = useState<number | undefined>();
    const [floorMax, setFloorMax] = useState<number | undefined>();
    const [floorsInBuildingMin, setFloorsInBuildingMin] = useState<number | undefined>();
    const [floorsInBuildingMax, setFloorsInBuildingMax] = useState<number | undefined>();

    const [buildingType, setBuildingType] = useState('any');
    const [renovationType, setRenovationType] = useState('any');
    const [sellerType, setSellerType] = useState('any');

    const [notFirstFloor, setNotFirstFloor] = useState(false);
    const [notLastFloor, setNotLastFloor] = useState(false);
    const [withPhotos, setWithPhotos] = useState(false);
    const [hasMortgage, setHasMortgage] = useState(false);

    const [whiteListInput, setWhiteListInput] = useState('');
    const [blackListInput, setBlackListInput] = useState('');
    const [adsLimit, setAdsLimit] = useState<number | undefined>();

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!isEdit) return;
        let cancelled = false;

        (async () => {
            setLoading(true);
            try {
                const list = await parserService.getFilters();
                const found = Array.isArray(list) ? (list as any[]).find(f => String((f as any).id) === String(id)) : undefined;
                if (!found || cancelled) return;

                setName(found.name || '');
                setIsActive(found.isActive !== false);
                if (found.dealType) setDealType(found.dealType);
                if (found.propertyType) setPropertyType(found.propertyType);
                if (found.marketType) setMarketType(found.marketType);
                setRooms(Array.isArray(found.rooms) ? found.rooms.filter((r: any) => typeof r === 'number') : []);
                setPriceMin(typeof found.priceMin === 'number' ? found.priceMin : undefined);
                setPriceMax(typeof found.priceMax === 'number' ? found.priceMax : undefined);
                setAreaMin(typeof found.areaMin === 'number' ? found.areaMin : undefined);
                setAreaMax(typeof found.areaMax === 'number' ? found.areaMax : undefined);
                setKitchenAreaMin(typeof found.kitchenAreaMin === 'number' ? found.kitchenAreaMin : undefined);
                setFloorMin(typeof found.floorMin === 'number' ? found.floorMin : undefined);
                setFloorMax(typeof found.floorMax === 'number' ? found.floorMax : undefined);
                setFloorsInBuildingMin(typeof found.floorsInBuildingMin === 'number' ? found.floorsInBuildingMin : undefined);
                setFloorsInBuildingMax(typeof found.floorsInBuildingMax === 'number' ? found.floorsInBuildingMax : undefined);
                if (found.buildingType) setBuildingType(found.buildingType);
                if (found.renovationType) setRenovationType(found.renovationType);
                if (found.sellerType) setSellerType(found.sellerType);
                setNotFirstFloor(!!found.notFirstFloor);
                setNotLastFloor(!!found.notLastFloor);
                setWithPhotos(!!found.withPhotos);
                setHasMortgage(!!found.hasMortgage);
                setWhiteListInput((Array.isArray(found.whiteList) ? found.whiteList : []).join('\n'));
                setBlackListInput((Array.isArray(found.blackList) ? found.blackList : []).join('\n'));
                setAdsLimit(typeof found.adsLimit === 'number' ? found.adsLimit : undefined);
            } catch (e) {
                console.error('Failed to load filter', e);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [id, isEdit]);

    const toggleRoom = (r: number) => {
        setRooms(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r].sort((a, b) => a - b));
    };

    const buildPayload = () => {
        const whiteList = whiteListInput.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        const blackList = blackListInput.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        return {
            name: name || undefined,
            isActive,
            dealType,
            propertyType,
            marketType,
            rooms: rooms.length ? rooms : undefined,
            priceMin,
            priceMax,
            areaMin,
            areaMax,
            kitchenAreaMin,
            floorMin,
            floorMax,
            floorsInBuildingMin,
            floorsInBuildingMax,
            buildingType,
            renovationType,
            sellerType,
            notFirstFloor,
            notLastFloor,
            withPhotos,
            hasMortgage,
            whiteList: whiteList.length ? whiteList : undefined,
            blackList: blackList.length ? blackList : undefined,
            adsLimit,
        };
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const payload = buildPayload();
            if (isEdit) {
                await parserService.updateFilter(Number(id), payload as any);
            } else {
                await parserService.createFilter(payload as any);
            }
            navigate('/settings', { state: { tab: 'parser', filterSaved: true } });
        } catch (e) {
            console.error('Failed to save filter', e);
        } finally {
            setSaving(false);
        }
    };

    const toggleRow = (label: string, checked: boolean, onChange: (v: boolean) => void) => (
        <div className="flex items-center justify-between px-4 py-3.5">
            <span className="text-white text-[15px] font-medium">{label}</span>
            <Toggle checked={checked} onChange={onChange} />
        </div>
    );

    const numInput = (placeholder: string, value: number | undefined, setter: (v: number | undefined) => void) => (
        <input
            className={`w-full rounded-[16px] px-4 py-3 text-white placeholder:text-white/30 outline-none ${glassInputCls}`}
            style={glassInputStyle}
            placeholder={placeholder}
            inputMode="numeric"
            value={value ?? ''}
            onChange={e => setter(numOrUndef(e.target.value))}
        />
    );

    return (
        <div className="min-h-screen pt-safe">
            <div className="px-4 pt-4 pb-44">
                {/* Header */}
                <div className="flex items-center gap-3 mb-5">
                    <div className="w-9 h-9 shrink-0">
                        <motion.button
                            type="button"
                            onClick={() => navigate('/settings')}
                            whileTap={{ scale: 0.9 }}
                            transition={SPRING_TAP}
                            className="w-9 h-9 rounded-full flex items-center justify-center text-white glass-border-light"
                            style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(20px) saturate(1.2)', WebkitBackdropFilter: 'blur(20px) saturate(1.2)' }}
                            aria-label="Назад"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </motion.button>
                    </div>
                    <h1 className="text-white text-[28px] font-bold">{isEdit ? 'Редактирование' : 'Новый фильтр'}</h1>
                </div>

                {loading ? (
                    <div className="space-y-3">
                        <Skeleton width="30%" height={16} className="mb-2 rounded-md" />
                        <Skeleton width="100%" height={48} className="rounded-[16px]" />
                        <Skeleton width="100%" height={100} className="rounded-[16px]" />
                        <div className="grid grid-cols-2 gap-3">
                            <Skeleton width="100%" height={48} className="rounded-[16px]" />
                            <Skeleton width="100%" height={48} className="rounded-[16px]" />
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Name */}
                        <input
                            className={`w-full rounded-[16px] px-4 py-3 text-white placeholder:text-white/30 outline-none ${glassInputCls}`}
                            style={glassInputStyle}
                            placeholder="Название фильтра"
                            value={name}
                            onChange={e => setName(e.target.value)}
                        />

                        {/* Тип сделки и объект */}
                        <div className="relative z-40">
                            <SectionTitle>Тип сделки и объект</SectionTitle>
                            <div className="glass glass-border-light rounded-[24px] p-4 space-y-3">
                                <div>
                                    <Label>Тип сделки</Label>
                                    <SearchSelect
                                        value={dealType}
                                        options={DEAL_TYPES.map(x => x.code)}
                                        onChange={setDealType}
                                        placeholder="Тип сделки"
                                        hideInlineSearch
                                        valueToLabel={(v) => labelOf(DEAL_TYPES, v, 'Тип сделки')}
                                    />
                                </div>
                                <div>
                                    <Label>Тип недвижимости</Label>
                                    <SearchSelect
                                        value={propertyType}
                                        options={PROPERTY_TYPES.map(x => x.code)}
                                        onChange={setPropertyType}
                                        placeholder="Тип недвижимости"
                                        hideInlineSearch
                                        valueToLabel={(v) => labelOf(PROPERTY_TYPES, v, 'Тип недвижимости')}
                                    />
                                </div>
                                <div>
                                    <Label>Рынок</Label>
                                    <SearchSelect
                                        value={marketType}
                                        options={MARKET_TYPES.map(x => x.code)}
                                        onChange={setMarketType}
                                        placeholder="Рынок"
                                        hideInlineSearch
                                        valueToLabel={(v) => labelOf(MARKET_TYPES, v, 'Рынок')}
                                    />
                                </div>
                                <div>
                                    <Label>Комнаты</Label>
                                    <div className="flex gap-2">
                                        {[1, 2, 3, 4, 5].map(r => {
                                            const active = rooms.includes(r);
                                            return (
                                                <button
                                                    key={r}
                                                    type="button"
                                                    onClick={() => toggleRoom(r)}
                                                    className={`flex-1 h-11 rounded-[16px] text-sm font-semibold glass-border-light transition ${active ? 'bg-accent/15 text-accent' : 'bg-white/[0.06] text-white/70'}`}
                                                >
                                                    {r === 5 ? '5+' : r}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Цена и площадь */}
                        <div>
                            <SectionTitle>Цена и площадь</SectionTitle>
                            <div className="glass glass-border-light rounded-[24px] p-4 space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                    {numInput('Цена от, ₽', priceMin, setPriceMin)}
                                    {numInput('Цена до, ₽', priceMax, setPriceMax)}
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    {numInput('Площадь от, м²', areaMin, setAreaMin)}
                                    {numInput('Площадь до, м²', areaMax, setAreaMax)}
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    {numInput('Кухня от, м²', kitchenAreaMin, setKitchenAreaMin)}
                                    {numInput('Лимит объявлений', adsLimit, setAdsLimit)}
                                </div>
                            </div>
                        </div>

                        {/* Этажность */}
                        <div>
                            <SectionTitle>Этажность</SectionTitle>
                            <div className="glass glass-border-light rounded-[24px] p-4 space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                    {numInput('Этаж от', floorMin, setFloorMin)}
                                    {numInput('Этаж до', floorMax, setFloorMax)}
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    {numInput('Этажей в доме от', floorsInBuildingMin, setFloorsInBuildingMin)}
                                    {numInput('Этажей в доме до', floorsInBuildingMax, setFloorsInBuildingMax)}
                                </div>
                            </div>
                        </div>

                        {/* Дом и продавец */}
                        <div className="relative z-30">
                            <SectionTitle>Дом и продавец</SectionTitle>
                            <div className="glass glass-border-light rounded-[24px] p-4 space-y-3">
                                <div>
                                    <Label>Тип дома</Label>
                                    <SearchSelect
                                        value={buildingType}
                                        options={BUILDING_TYPES.map(x => x.code)}
                                        onChange={setBuildingType}
                                        placeholder="Тип дома"
                                        hideInlineSearch
                                        valueToLabel={(v) => labelOf(BUILDING_TYPES, v, 'Тип дома')}
                                    />
                                </div>
                                <div>
                                    <Label>Ремонт</Label>
                                    <SearchSelect
                                        value={renovationType}
                                        options={RENOVATION_TYPES.map(x => x.code)}
                                        onChange={setRenovationType}
                                        placeholder="Ремонт"
                                        hideInlineSearch
                                        valueToLabel={(v) => labelOf(RENOVATION_TYPES, v, 'Ремонт')}
                                    />
                                </div>
                                <div>
                                    <Label>Продавец</Label>
                                    <SearchSelect
                                        value={sellerType}
                                        options={SELLER_TYPES.map(x => x.code)}
                                        onChange={setSellerType}
                                        placeholder="Продавец"
                                        hideInlineSearch
                                        valueToLabel={(v) => labelOf(SELLER_TYPES, v, 'Продавец')}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Параметры */}
                        <div>
                            <SectionTitle>Параметры</SectionTitle>
                            <div className="glass glass-border-light rounded-[24px] divide-y divide-white/[0.06] overflow-hidden">
                                {toggleRow('Не первый этаж', notFirstFloor, setNotFirstFloor)}
                                {toggleRow('Не последний этаж', notLastFloor, setNotLastFloor)}
                                {toggleRow('Только с фото', withPhotos, setWithPhotos)}
                                {toggleRow('Возможна ипотека', hasMortgage, setHasMortgage)}
                                {isEdit && toggleRow('Активен', isActive, setIsActive)}
                            </div>
                        </div>

                        {/* Списки */}
                        <div>
                            <SectionTitle>Списки (по одному значению на строку)</SectionTitle>
                            <div className="glass glass-border-light rounded-[24px] p-4 space-y-3">
                                <textarea
                                    rows={3}
                                    className={`w-full rounded-[16px] px-4 py-3 text-white placeholder:text-white/30 outline-none resize-y ${glassInputCls}`}
                                    style={glassInputStyle}
                                    placeholder="Вайт-лист: по одному слову на строку"
                                    value={whiteListInput}
                                    onChange={(e) => setWhiteListInput(e.target.value)}
                                />
                                <textarea
                                    rows={3}
                                    className={`w-full rounded-[16px] px-4 py-3 text-white placeholder:text-white/30 outline-none resize-y ${glassInputCls}`}
                                    style={glassInputStyle}
                                    placeholder="Блэк-лист: по одному слову на строку"
                                    value={blackListInput}
                                    onChange={(e) => setBlackListInput(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Floating save button */}
            <div className="fixed left-0 right-0 bottom-0 z-40 pointer-events-none">
                <div
                    style={{
                        background: 'linear-gradient(to top, rgba(245,250,253,1) 0%, rgba(245,250,253,0.85) 40%, rgba(245,250,253,0.4) 75%, transparent 100%)',
                        paddingTop: '48px',
                        paddingBottom: 'calc(var(--safe-area-inset-bottom, 0px) + 16px)',
                    }}
                    className="px-4"
                >
                    <div className="pointer-events-auto">
                        <motion.button
                            onClick={handleSave}
                            disabled={saving}
                            whileTap={{ scale: 0.96 }}
                            transition={SPRING_TAP}
                            className="w-full h-[52px] rounded-[24px] text-accent text-base font-semibold glass-border-light disabled:opacity-50"
                            style={{
                                background: saving ? 'rgba(0,174,239,0.05)' : 'rgba(0,174,239,0.10)',
                                backdropFilter: 'blur(24px) saturate(1.3)',
                                WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
                            }}
                        >
                            {saving ? (isEdit ? 'Сохранение...' : 'Создание...') : (isEdit ? 'Сохранить' : 'Создать')}
                        </motion.button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FilterEditPage;
