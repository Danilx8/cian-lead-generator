import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

interface StreamingTextProps {
  text: string;
  streaming?: boolean;
  className?: string;
}

// Анимируем только «растущий край» — последние TAIL символов.
// Остальной текст статичен: это и держит плавность, и не плодит тысячи узлов.
const TAIL = 48;
const reveal = { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const };

// Режем текст по графемам, а не по code units: split('') рвёт эмодзи на
// суррогатные половинки (каждая в своём span → «квадраты»). Intl.Segmenter
// держит целыми и ZWJ-секвенции (👨‍👩‍👧); фолбэк Array.from — по кодпоинтам.
// Тип объявляем локально — в текущем tsconfig lib нет типов Intl.Segmenter.
type GraphemeSegmenter = {
  segment(input: string): Iterable<{ segment: string }>;
};
const IntlWithSegmenter = Intl as typeof Intl & {
  Segmenter?: new (locales?: string, options?: { granularity: 'grapheme' }) => GraphemeSegmenter;
};
const graphemeSegmenter =
  typeof Intl !== 'undefined' && IntlWithSegmenter.Segmenter
    ? new IntlWithSegmenter.Segmenter(undefined, { granularity: 'grapheme' })
    : null;
const toGraphemes = (s: string): string[] =>
  graphemeSegmenter ? Array.from(graphemeSegmenter.segment(s), (g) => g.segment) : Array.from(s);

/**
 * Плавное посимвольное проявление стримящегося текста: новые символы мягко
 * «натекают» (opacity-фейд без вертикального прыжка → нет дрожания раскладки),
 * в конце — мигающий каретка-курсор пока идёт генерация.
 *
 * Ключи символов хвоста — абсолютный индекс в строке: уже проявленные символы
 * не переигрывают анимацию, стрим лишь дописывает край.
 */
const StreamingText: React.FC<StreamingTextProps> = ({ text, streaming, className }) => {
  const graphemes = useMemo(() => toGraphemes(text), [text]);
  const splitAt = Math.max(0, graphemes.length - TAIL);
  const head = useMemo(() => graphemes.slice(0, splitAt).join(''), [graphemes, splitAt]);
  const tailChars = useMemo(() => graphemes.slice(splitAt), [graphemes, splitAt]);

  return (
    <span className={`whitespace-pre-wrap break-words ${className ?? ''}`}>
      {head}
      {tailChars.map((ch, i) => (
        <motion.span
          key={splitAt + i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={reveal}
          style={{ display: 'inline' }}
        >
          {ch}
        </motion.span>
      ))}
      {streaming && (
        <motion.span
          aria-hidden
          className="inline-block bg-accent rounded-[1px] align-middle ml-[2px]"
          style={{ width: 2, height: '1.05em', transform: 'translateY(-1px)' }}
          animate={{ opacity: [1, 0.15, 1] }}
          transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
    </span>
  );
};

export default React.memo(StreamingText);
