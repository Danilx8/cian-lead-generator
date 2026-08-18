import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

export type SearchSelectProps = {
  value: string;
  options: string[];
  placeholder?: string;
  onChange: (v: string) => void;
  className?: string;
  containerClassName?: string;
  valueToLabel?: (v: string) => string;
  dropdownClassName?: string;
  dropdownSearchInputClassName?: string;
  optionButtonClassName?: string;
  optionButtonSelectedClassName?: string;
  hideInlineSearch?: boolean;
};

const SPRING_TAP = { type: 'spring' as const, stiffness: 500, damping: 25 };
const SPRING_DROPDOWN = { type: 'spring' as const, stiffness: 400, damping: 28 };

const triggerStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.6)',
  backdropFilter: 'blur(20px) saturate(1.2)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
};

const dropdownStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.85)',
  backdropFilter: 'blur(8px) saturate(1.4)',
  WebkitBackdropFilter: 'blur(8px) saturate(1.4)',
};

const searchInputStyle: React.CSSProperties = {
  background: 'rgba(11,36,48,0.06)',
};

const SearchSelect: React.FC<SearchSelectProps> = ({
  value,
  options,
  placeholder = 'Выберите…',
  onChange,
  className = '',
  containerClassName = '',
  valueToLabel,
  dropdownClassName,
  dropdownSearchInputClassName,
  optionButtonClassName,
  optionButtonSelectedClassName,
  hideInlineSearch = false,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const toLabel = useCallback((v: string) => (valueToLabel ? valueToLabel(v) : v), [valueToLabel]);

  const filtered = useMemo(() => {
    if (hideInlineSearch) return options;
    const q = query.trim().toLowerCase();
    if (!q) return options;

    const uniqueOptions = Array.from(new Set(options));
    return uniqueOptions.filter((o) => {
      const label = toLabel(o).toLowerCase();
      return label.startsWith(q) || label === q ||
        label.split(' ').some(word => word.startsWith(q));
    });
  }, [options, query, toLabel, hideInlineSearch]);

  // Position the portal dropdown under the trigger
  useLayoutEffect(() => {
    if (!open || !wrapperRef.current) {
      setPos(null);
      return;
    }
    const rect = wrapperRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 8, left: rect.left, width: rect.width });
  }, [open]);

  // Close on outside click (check both trigger wrapper and portal dropdown)
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapperRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('click', onDocClick, true);
    return () => document.removeEventListener('click', onDocClick, true);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      if (!hideInlineSearch) {
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    }
  }, [open, hideInlineSearch]);

  // Блокируем скролл страницы, пока открыт список.
  // Основной скролл-контейнер приложения — #app-scroll-root (фикс. высота),
  // поэтому overflow:hidden на body/html недостаточно.
  useEffect(() => {
    if (!open) return;
    const targets = [
      document.getElementById('app-scroll-root'),
      document.body,
      document.documentElement,
    ].filter((el): el is HTMLElement => !!el);
    const prev = targets.map((el) => el.style.overflow);
    targets.forEach((el) => { el.style.overflow = 'hidden'; });
    return () => {
      targets.forEach((el, i) => { el.style.overflow = prev[i]; });
    };
  }, [open]);

  const defaultDropdownCls = 'glass-border-light';
  const defaultOptionCls = optionButtonClassName ?? 'bg-white/5 hover:bg-white/10';
  const defaultOptionSelectedCls = optionButtonSelectedClassName ?? 'bg-white/15';
  const defaultSearchInputCls = dropdownSearchInputClassName ??
    'w-full px-3 py-2 rounded-xl text-white placeholder:text-white/30 outline-none';

  const dropdown = open && pos && ReactDOM.createPortal(
    <AnimatePresence>
      <motion.div
        ref={dropdownRef}
        initial={{ opacity: 0, scale: 0.95, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -4 }}
        transition={SPRING_DROPDOWN}
        className={`fixed z-[9999] overflow-hidden shadow-[0_16px_48px_rgba(11,36,48,0.18)] rounded-[20px] ${dropdownClassName ?? defaultDropdownCls}`}
        style={{ ...dropdownStyle, top: pos.top, left: pos.left, width: pos.width }}
      >
        {!hideInlineSearch && (
          <div className="p-2">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск"
              className={defaultSearchInputCls}
              style={searchInputStyle}
            />
          </div>
        )}
        <div
          className={`max-h-[min(50vh,26rem)] overflow-y-auto scrollable ${hideInlineSearch ? 'px-2 pb-2 pt-2' : 'px-2 pb-2'}`}
        >
          {filtered.length === 0 && (
            <div className="text-white/50 text-sm px-3 py-3">Ничего не найдено</div>
          )}
          {filtered.map((opt) => {
            const selected = opt === value;
            const optCls = selected ? defaultOptionSelectedCls : defaultOptionCls;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => { onChange(opt); setOpen(false); setQuery(''); }}
                className={`w-full text-left px-4 py-3 rounded-xl mb-2 last:mb-0 transition-colors ${optCls}`}
              >
                <div className="flex items-center justify-between">
                  <span className="truncate text-white">{toLabel(opt)}</span>
                  {selected && (
                    <svg className="w-5 h-5 text-white shrink-0 ml-2" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );

  return (
    <div className={`relative ${containerClassName}`} ref={wrapperRef}>
      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        transition={SPRING_TAP}
        className={`w-full rounded-[16px] px-4 py-3 text-white text-left cursor-pointer flex items-center justify-between glass-border-light ${className}`}
        style={triggerStyle}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`truncate ${value ? 'text-white' : 'text-white/30'}`}>
          {value ? toLabel(value) : placeholder}
        </span>
        <motion.svg
          className="ml-3 w-4 h-4 shrink-0"
          animate={{ rotate: open ? 180 : 0 }}
          transition={SPRING_DROPDOWN}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </motion.svg>
      </motion.button>

      {dropdown}
    </div>
  );
};

export default SearchSelect;
