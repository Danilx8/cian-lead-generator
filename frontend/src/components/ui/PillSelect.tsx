import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type PillSelectOption = {
  value: string;
  label: string;
};

type PillSelectProps = {
  value: string;
  options: PillSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  'aria-label'?: string;
  triggerClassName?: string;
  dropdownClassName?: string;
};

export function PillSelect({
  value,
  options,
  onChange,
  disabled,
  'aria-label': ariaLabel,
  triggerClassName,
  dropdownClassName,
}: PillSelectProps) {
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value);
  const label = selected?.label ?? '';

  const updateDropdownPosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: 'fixed',
      top: rect.bottom + 8,
      left: rect.left,
      width: rect.width,
      zIndex: 9999,
    });
  };

  useEffect(() => {
    if (!open) return;
    updateDropdownPosition();
    window.addEventListener('scroll', updateDropdownPosition, true);
    window.addEventListener('resize', updateDropdownPosition);
    return () => {
      window.removeEventListener('scroll', updateDropdownPosition, true);
      window.removeEventListener('resize', updateDropdownPosition);
    };
  }, [open]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !(document.getElementById(listId)?.contains(target))
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('click', onDoc, true);
    return () => document.removeEventListener('click', onDoc, true);
  }, [listId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={triggerClassName ?? "relative w-full rounded-2xl glass glass-border-light text-white pl-4 pr-14 py-3 text-sm text-left outline-none transition disabled:opacity-50 disabled:pointer-events-none"}
      >
        <span className="block truncate">{label}</span>
        <svg
          className={`pointer-events-none absolute right-5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/80 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && createPortal(
        <div
          id={listId}
          role="listbox"
          style={dropdownStyle}
          className={dropdownClassName ?? "rounded-2xl glass-elevated glass-border-light py-1 shadow-[0_8px_32px_rgba(11,36,48,0.15)]"}
        >
          <div className="max-h-[min(40vh,280px)] overflow-y-auto overflow-x-hidden px-1 pb-1">
            {options.map((opt) => {
              const isSel = opt.value === value;
              return (
                <button
                  key={opt.value === '' ? '__empty__' : opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSel}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center rounded-xl px-4 py-3 text-left text-sm transition-colors ${
                    isSel
                      ? 'bg-white/20 text-white'
                      : 'text-white/90 hover:bg-white/10 active:bg-white/[0.14]'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                  {isSel && (
                    <svg
                      className="ml-2 h-4 w-4 shrink-0 text-white"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      aria-hidden
                    >
                      <path
                        d="M20 6L9 17l-5-5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
