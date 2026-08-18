import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import StreamingText from './StreamingText';

// Синхронизировано с анимацией перевода в поле ввода (ChatPage):
// оригинал остаётся на месте до первой дельты, затем «уезжает»
// (blur + вверх), после чего перевод печатается стримом.
const EXIT_MS = 300;

interface TranslatedMessageTextProps {
  original: string;
  /** Накопленный перевод ('' — дельты ещё не пришли). */
  translated?: string;
  /** Идёт стрим перевода. */
  translating: boolean;
  className?: string;
}

type Phase = 'original' | 'exiting' | 'stream';

const TranslatedMessageText: React.FC<TranslatedMessageTextProps> = ({
  original,
  translated,
  translating,
  className,
}) => {
  const hasTranslation = !!translated && translated.length > 0;
  // Если перевод уже есть при монтировании (старое сообщение) — сразу stream.
  const [phase, setPhase] = useState<Phase>(hasTranslation ? 'stream' : 'original');
  const exitTimer = useRef<number | null>(null);

  useEffect(() => {
    if (hasTranslation && phase === 'original') {
      // Первая дельта — красиво убираем оригинал, затем показываем стрим.
      setPhase('exiting');
      exitTimer.current = window.setTimeout(() => {
        exitTimer.current = null;
        setPhase('stream');
      }, EXIT_MS);
    } else if (!hasTranslation && !translating && phase !== 'original') {
      // Перевод сброшен (ошибка без результата) — возвращаем оригинал.
      setPhase('original');
    }
  }, [hasTranslation, translating, phase]);

  useEffect(
    () => () => {
      if (exitTimer.current) clearTimeout(exitTimer.current);
    },
    [],
  );

  if (phase === 'stream') {
    return (
      <motion.span
        className="block"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
      >
        <StreamingText text={translated || ''} streaming={translating} className={className} />
      </motion.span>
    );
  }

  return (
    <motion.span
      className={`block ${className ?? ''}`}
      animate={
        phase === 'exiting'
          ? { opacity: 0, filter: 'blur(6px)', y: -6 }
          : { opacity: 1, filter: 'blur(0px)', y: 0 }
      }
      transition={{ duration: phase === 'exiting' ? 0.32 : 0.2, ease: [0.4, 0, 0.6, 1] }}
    >
      {original}
    </motion.span>
  );
};

export default React.memo(TranslatedMessageText);
