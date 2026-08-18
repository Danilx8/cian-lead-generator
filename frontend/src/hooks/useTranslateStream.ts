import { useCallback, useEffect, useRef, useState } from 'react';
import { translateStream } from '../api/streamService';

type RunOptions = {
  onDone?: (full: string) => void;
  onError?: (message: string) => void;
};

/**
 * Стриминговый перевод: накапливает приходящие дельты в `text`, отменяет
 * предыдущий запрос при новом вызове и при размонтировании.
 */
export function useTranslateStream() {
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }, []);

  const run = useCallback((source: string, opts?: RunOptions) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    let acc = '';
    setText('');
    setStreaming(true);

    translateStream(
      source,
      {
        onDelta: (chunk) => {
          acc += chunk;
          setText(acc);
        },
        onDone: () => {
          if (ac.signal.aborted) return;
          abortRef.current = null;
          setStreaming(false);
          opts?.onDone?.(acc);
        },
        onError: (message) => {
          if (ac.signal.aborted) return;
          abortRef.current = null;
          setStreaming(false);
          opts?.onError?.(message);
        },
      },
      ac.signal,
      'ru', // источник — русский (текст пользователя)
      'de'  // цель — немецкий
    );
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { text, streaming, run, cancel };
}
