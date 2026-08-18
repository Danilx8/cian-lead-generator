import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { generateStream } from '../../api/streamService';
import StreamingText from '../StreamingText';
import SparklesIcon from './SparklesIcon';
import { parseAiSegments, fillSampleVars, splitVarTokens } from '../../utils/aiPrompt';

/**
 * Предпросмотр ИИ-генерации для текста шаблона: показывает сообщение так,
 * как оно может уйти покупателю — каждый участок [[ промпт ]] заменяется
 * живым стримом из /api/ai/generate/stream (последовательно, как на бэке).
 *
 * Вместе с промптом на бэк уходит весь текст шаблона + индекс дырки: из них
 * строится тот же ⟦GAP⟧-контекст, что и при реальной отправке, — модель видит
 * приветствие и соседние фразы, и предпросмотр совпадает с продом.
 *
 * Шаблон при этом не трогается: это только проверка промптов.
 */

type BlockStatus = 'waiting' | 'streaming' | 'done' | 'error';
interface BlockState {
  text: string;
  status: BlockStatus;
  error?: string;
}

const SPRING_SHEET = { type: 'spring' as const, stiffness: 380, damping: 34 };
const SPRING_TAP = { type: 'spring' as const, stiffness: 500, damping: 25 };

/** Статичный текст шаблона: известные {{модификаторы}} показываем их моковым
 *  значением (акцентным), опечатки — как есть приглушённо. */
const StaticText: React.FC<{ text: string }> = ({ text }) => (
  <>
    {splitVarTokens(text).map((t, i) => {
      if (t.type === 'text') return <React.Fragment key={i}>{t.value}</React.Fragment>;
      if (t.type === 'var') {
        return (
          <span key={i} className="text-accent/90">
            {fillSampleVars(t.value)}
          </span>
        );
      }
      // опечатка/пустая пара — сервер оставит как есть
      return (
        <span key={i} className="font-mono text-[12px] text-white/40">
          {t.value}
        </span>
      );
    })}
  </>
);

interface AiPreviewSheetProps {
  text: string;
  onClose: () => void;
}

const AiPreviewSheet: React.FC<AiPreviewSheetProps> = ({ text, onClose }) => {
  const segments = useMemo(() => parseAiSegments(text), [text]);
  const prompts = useMemo(
    () => segments.filter((s): s is Extract<typeof s, { type: 'prompt' }> => s.type === 'prompt'),
    [segments]
  );
  // Индекс каждого промпта среди ВСЕХ [[...]] в тексте (включая пустые [[ ]]):
  // бэкенд нумерует дырки по регулярке, и пустые тоже попадают в счёт.
  const gapIndexes = useMemo(() => {
    const out: number[] = [];
    let matchIdx = 0;
    for (const s of segments) {
      if (s.type === 'prompt') out.push(matchIdx++);
      else if (s.type === 'empty') matchIdx++;
    }
    return out;
  }, [segments]);

  const [run, setRun] = useState(0);
  const [blocks, setBlocks] = useState<BlockState[]>(() =>
    prompts.map(() => ({ text: '', status: 'waiting' }))
  );

  useEffect(() => {
    setBlocks(prompts.map(() => ({ text: '', status: 'waiting' })));
    const ac = new AbortController();

    (async () => {
      // Промпты гоняем последовательно — так же их резолвит бэкенд при отправке.
      for (let i = 0; i < prompts.length; i++) {
        if (ac.signal.aborted) return;
        const patch = (fn: (b: BlockState) => BlockState) =>
          setBlocks((prev) => prev.map((b, j) => (j === i ? fn(b) : b)));

        patch((b) => ({ ...b, status: 'streaming' }));
        // Переменные внутри промпта резолвит сервер до генерации; в предпросмотре
        // подставляем моки, чтобы модель видела готовый текст, а не {{...}}.
        // Полный текст шаблона (тоже с моками вместо {{...}}) + индекс дырки дают
        // бэкенду построить ⟦GAP⟧-контекст — как при реальной отправке.
        await generateStream(
          fillSampleVars(prompts[i].inner).trim(),
          {
            onDelta: (chunk) => {
              if (!ac.signal.aborted) patch((b) => ({ ...b, text: b.text + chunk }));
            },
            onDone: () => {
              if (!ac.signal.aborted) patch((b) => ({ ...b, status: 'done' }));
            },
            onError: (message) => {
              if (!ac.signal.aborted) patch((b) => ({ ...b, status: 'error', error: message }));
            },
          },
          ac.signal,
          { text: fillSampleVars(text), gapIndex: gapIndexes[i] }
        );
      }
    })();

    return () => ac.abort();
  }, [prompts, gapIndexes, text, run]);

  const busy = prompts.length > 0 && blocks.some((b) => b.status === 'waiting' || b.status === 'streaming');

  let promptIndex = -1;

  return (
    <div className="fixed inset-0 z-[70]">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60"
        style={{ backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
        onClick={onClose}
      />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={SPRING_SHEET}
        className="absolute left-0 right-0 bottom-0 rounded-t-[28px] glass-border-light px-5 pt-3 max-h-[78vh] overflow-y-auto no-scrollbar"
        style={{
          background: 'rgba(28,28,28,0.78)',
          backdropFilter: 'blur(32px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(32px) saturate(1.4)',
          boxShadow: '0 -12px 40px rgba(0,0,0,0.45)',
          paddingBottom: 'calc(var(--safe-area-inset-bottom, 0px) + 20px)',
        }}
      >
        <div className="w-9 h-1 rounded-full bg-white/20 mx-auto mb-4" />

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <SparklesIcon size={18} className="text-second-accent" />
            <h2 className="text-white text-[19px] font-bold">Предпросмотр ИИ</h2>
          </div>
          <motion.button
            type="button"
            onClick={onClose}
            whileTap={{ scale: 0.9 }}
            transition={SPRING_TAP}
            className="w-8 h-8 rounded-full flex items-center justify-center glass-border-light"
            style={{ background: 'rgba(255,255,255,0.08)' }}
            aria-label="Закрыть"
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeOpacity="0.8" />
            </svg>
          </motion.button>
        </div>

        <p className="text-white/40 text-xs mb-2">Так может выглядеть сообщение:</p>

        <div className="glass glass-border-light rounded-[20px] p-4 text-white text-[15px] leading-relaxed whitespace-pre-wrap break-words mb-4">
          {segments.map((seg, i) => {
            if (seg.type === 'text') return <StaticText key={i} text={seg.value} />;
            // Пустые [[ ]] бэкенд вырезает, незакрытые [[ остаются текстом.
            if (seg.type === 'empty') return null;
            if (seg.type === 'pending') return <span key={i} className="text-white/30">{seg.value}</span>;

            promptIndex += 1;
            const block = blocks[promptIndex];
            if (!block) return null;

            if (block.status === 'waiting') {
              return (
                <motion.span
                  key={i}
                  className="text-second-accent/70 tracking-widest"
                  animate={{ opacity: [0.25, 0.85, 0.25] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                >
                  •••
                </motion.span>
              );
            }
            if (block.status === 'error') {
              return (
                <span key={i} className="text-red-400/90 text-[13px]">
                  {block.error || 'Ошибка при генерации текста'}
                </span>
              );
            }
            return (
              <span key={i} className="ai-generated">
                <StreamingText text={block.text} streaming={block.status === 'streaming'} />
              </span>
            );
          })}
        </div>

        <motion.button
          type="button"
          onClick={() => setRun((r) => r + 1)}
          disabled={busy}
          whileTap={!busy ? { scale: 0.96 } : undefined}
          transition={SPRING_TAP}
          className="w-full py-3 rounded-[20px] text-[14px] font-semibold glass-border-light mb-3"
          style={
            busy
              ? { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.25)' }
              : { background: 'rgba(12,198,255,0.10)', color: '#0CC6FF' }
          }
        >
          {busy ? 'Генерация…' : 'Сгенерировать заново'}
        </motion.button>

        <p className="text-white/30 text-[11px] leading-relaxed">
          Каждая отправка — новый вариант текста. Переменные{' '}
          <span className="font-mono text-white/45">{'{{…}}'}</span> показаны{' '}
          <span className="text-accent/80">примерными данными</span> — при реальной отправке
          подставятся значения из диалога.
        </p>
      </motion.div>
    </div>
  );
};

export default AiPreviewSheet;
