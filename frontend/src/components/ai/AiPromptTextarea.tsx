import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { parseAiSegments, isInsideAiPair, splitVarTokens, AI_TEMPLATES_ENABLED } from '../../utils/aiPrompt';

/**
 * Текстовое поле шаблона с подсветкой ИИ-вставок [[ промпт ]].
 *
 * Видимый текст рисует подложка: текст самого textarea прозрачный, за ним
 * лежит div с тем же текстом, где буквы [[...]] окрашены переливающимся
 * градиентом (стиль Apple Intelligence). Каретка, выделение и ввод при этом
 * остаются нативными — слои совпадают по метрикам 1:1.
 *
 * UX-помощь: второй `[` автоматически дописывает ` ]]` и ставит каретку
 * внутрь; Backspace внутри пустой пары удаляет её целиком.
 */

interface AiPromptTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Классы размеров/отступов — применяются к обоим слоям (textarea и подсветке). */
  className?: string;
  onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  onFocus?: () => void;
}

// Метрики слоёв должны совпадать 1:1. Важно: глобальный CSS форсирует
// textarea font-size 16px (!important), поэтому подложке размер задаётся
// явно, а межстрочный интервал — одинаковым классом leading-6
// (24px — с запасом под пилюли промптов, чтобы строки не слипались).
const SHARED_CLASSES = 'block w-full text-sm leading-6 whitespace-pre-wrap break-words';

const VAR_TOKEN_CLASS: Record<string, string | undefined> = {
  var: 'tpl-var',
  'var-invalid': 'tpl-var--invalid',
  'var-empty': 'tpl-var--empty',
};

/** Куски текста с подсветкой переменных {{...}} (валидные/опечатки/пустые). */
const renderVars = (text: string) =>
  splitVarTokens(text).map((t, j) =>
    t.type === 'text' ? (
      <React.Fragment key={j}>{t.value}</React.Fragment>
    ) : (
      <span key={j} className={VAR_TOKEN_CLASS[t.type]}>
        {t.value}
      </span>
    )
  );

const AiPromptTextarea: React.FC<AiPromptTextareaProps> = ({
  value,
  onChange,
  placeholder,
  className = '',
  onPaste,
  onFocus,
}) => {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const pendingCaret = useRef<number | null>(null);

  // При выключенном ИИ [[ ]] не выделяем — весь текст обычный (только {{...}}).
  const segments = useMemo(
    () => (AI_TEMPLATES_ENABLED ? parseAiSegments(value) : [{ type: 'text' as const, value }]),
    [value]
  );

  const syncScroll = () => {
    const ov = overlayRef.current;
    const ta = taRef.current;
    if (!ov || !ta) return;
    if (ov.scrollTop !== ta.scrollTop) ov.scrollTop = ta.scrollTop;
    if (ov.scrollLeft !== ta.scrollLeft) ov.scrollLeft = ta.scrollLeft;
  };

  // Каретку двигаем после коммита нового value, иначе setSelectionRange
  // применится к старому тексту. Тут же догоняем скролл подложки: iOS не
  // стреляет scroll на textarea при автопрокрутке к каретке во время набора —
  // видимый текст (подложка) застывал, а невидимый textarea уезжал, из-за чего
  // каретка рисовалась в одном месте, а правки происходили «в другом».
  useLayoutEffect(() => {
    if (pendingCaret.current !== null && taRef.current) {
      taRef.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
    syncScroll();
  });

  // По той же причине держим rAF-цикл синхронизации, пока поле в фокусе или
  // его скроллят пальцем (+ хвост на инерцию): одних событий scroll на iOS мало.
  const focusedRef = useRef(false);
  const syncUntilRef = useRef(0);
  const rafRef = useRef(0);

  const ensureSyncLoop = () => {
    if (rafRef.current) return;
    const tick = () => {
      syncScroll();
      if (focusedRef.current || performance.now() < syncUntilRef.current) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = 0;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const handleTouch = () => {
    syncUntilRef.current = performance.now() + 1500; // инерция после отпускания
    ensureSyncLoop();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const start = ta.selectionStart ?? 0;
    const collapsed = start === (ta.selectionEnd ?? 0);

    // Второй `[` → дописываем пару и ставим каретку внутрь: [[ | ]]
    if (AI_TEMPLATES_ENABLED && e.key === '[' && collapsed && value[start - 1] === '[' && !isInsideAiPair(value, start)) {
      e.preventDefault();
      onChange(`${value.slice(0, start)}[  ]]${value.slice(start)}`);
      pendingCaret.current = start + 2;
      return;
    }

    // Второй `{` → пара для переменной: {{|}} (модификаторы пишутся без пробелов)
    if (e.key === '{' && collapsed && value[start - 1] === '{') {
      e.preventDefault();
      onChange(`${value.slice(0, start)}{}}${value.slice(start)}`);
      pendingCaret.current = start + 1;
      return;
    }

    // Backspace внутри пустой пары [[ | ]] / {{|}} — сносим конструкцию целиком.
    if (e.key === 'Backspace' && collapsed) {
      const pairs = [
        ...(AI_TEMPLATES_ENABLED ? [{ before: /\[\[[ \t]*$/, after: /^[ \t]*\]\]/ }] : []),
        { before: /\{\{$/, after: /^\}\}/ },
      ];
      for (const p of pairs) {
        const before = value.slice(0, start).match(p.before);
        const after = value.slice(start).match(p.after);
        if (before && after) {
          e.preventDefault();
          const from = start - before[0].length;
          onChange(value.slice(0, from) + value.slice(start + after[0].length));
          pendingCaret.current = from;
          return;
        }
      }
    }
  };

  return (
    <div className="relative">
      <div
        ref={overlayRef}
        aria-hidden
        className={`${SHARED_CLASSES} ${className} absolute inset-0 overflow-hidden pointer-events-none text-white`}
        style={{ fontSize: '16px' }}
      >
        {segments.map((seg, i) => {
          if (seg.type === 'text') return <React.Fragment key={i}>{renderVars(seg.value)}</React.Fragment>;
          const cls = seg.type === 'prompt' ? 'tpl-token ai-prompt-mark' : 'tpl-token ai-prompt-mark--pending';
          return (
            <span key={i} className={cls}>
              {renderVars(seg.value)}
            </span>
          );
        })}
        {/* держит высоту последней пустой строки */}
        {'​'}
      </div>
      <textarea
        ref={taRef}
        className={`${SHARED_CLASSES} ${className} ai-editor-input relative z-[1] bg-transparent text-transparent outline-none resize-none placeholder:text-white/30`}
        style={{ caretColor: '#CCFF00' }}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onScroll={syncScroll}
        onTouchStart={handleTouch}
        onTouchMove={handleTouch}
        onPaste={onPaste}
        onFocus={() => {
          focusedRef.current = true;
          ensureSyncLoop();
          onFocus?.();
        }}
        onBlur={() => {
          focusedRef.current = false;
          syncUntilRef.current = performance.now() + 300;
        }}
      />
    </div>
  );
};

export default React.memo(AiPromptTextarea);
