import { useLayoutEffect, useRef, type RefObject } from 'react';

import {
  LIST_SCROLL_STORAGE_PREFIX,
  persistListScroll,
  readStoredAnchorFromPersistence,
  readStoredScrollYFromPersistence,
} from '../utils/listScrollPersistence';

export { persistListScroll } from '../utils/listScrollPersistence';

function storageKey(scrollKeySuffix: string): string {
  return `${LIST_SCROLL_STORAGE_PREFIX}${scrollKeySuffix}`;
}

function clampScrollTop(scrollEl: HTMLDivElement, y: number): number {
  const max = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
  return Math.min(Math.max(0, y), max);
}

function zeroWindowScroll(): void {
  if (typeof document === 'undefined') return;
  if ((document.documentElement?.scrollTop ?? 0) !== 0) document.documentElement.scrollTop = 0;
  if ((document.body?.scrollTop ?? 0) !== 0) document.body.scrollTop = 0;
  if ((window.scrollY ?? 0) !== 0) window.scrollTo(0, 0);
}

function applyScrollTargets(scrollEl: HTMLDivElement, y: number): void {
  zeroWindowScroll();
  scrollEl.scrollTop = clampScrollTop(scrollEl, y);
}

function scrollAnchorNearest(scrollRoot: HTMLElement, anchorValue: string): void {
  const safe = anchorValue.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const node = scrollRoot.querySelector(`[data-scroll-anchor="${safe}"]`);
  node?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

const APP_SCROLL_ROOT_ID = 'app-scroll-root';

/**
 * То же, что и `useSessionListScroll`, но для страниц без собственного
 * overflow-контейнера: они скроллятся внутри #app-scroll-root.
 * Маршрут такой страницы нужно добавить в `shouldSkipGlobalScrollToTop` (App.tsx),
 * иначе глобальный ScrollToTop обнулит позицию после восстановления.
 */
export function useSessionAppScroll(
  scrollKey: string,
  canRestore: boolean,
  contentStamp?: number
): void {
  const fullKey = storageKey(scrollKey);

  useLayoutEffect(() => {
    const scrollEl = document.getElementById(APP_SCROLL_ROOT_ID);
    if (!scrollEl) return;
    const save = () => persistListScroll(scrollKey, scrollEl);
    scrollEl.addEventListener('scroll', save, { passive: true });
    return () => {
      // Клинап срабатывает до эффектов новой страницы, так что здесь ещё видна
      // позиция списка, а не уже сброшенный скролл.
      save();
      scrollEl.removeEventListener('scroll', save);
    };
  }, [scrollKey]);

  useLayoutEffect(() => {
    const scrollEl = document.getElementById(APP_SCROLL_ROOT_ID);
    if (!scrollEl) return;
    const y = readStoredScrollYFromPersistence(fullKey);
    // Сохранённой позиции нет — глобальный ScrollToTop для этого маршрута отключён,
    // поэтому наверх страницу поднимаем сами.
    if (!Number.isFinite(y)) {
      scrollEl.scrollTop = 0;
      return;
    }
    if (!canRestore) return;
    const max = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
    scrollEl.scrollTop = Math.min(Math.max(0, y), max);
  }, [fullKey, canRestore, contentStamp]);
}

export function useSessionListScroll(
  scrollKey: string,
  canRestore: boolean,
  contentStamp?: number
): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement | null>(null);
  const fullKey = storageKey(scrollKey);

  useLayoutEffect(() => {
    const scrollEl = ref.current;
    if (!scrollEl) return;
    const save = () => persistListScroll(scrollKey, scrollEl);
    scrollEl.addEventListener('scroll', save, { passive: true });
    return () => {
      save();
      scrollEl.removeEventListener('scroll', save);
    };
  }, [scrollKey]);

  useLayoutEffect(() => {
    if (!canRestore) return;
    const scrollEl = ref.current;
    if (!scrollEl) return;

    const rawY = readStoredScrollYFromPersistence(fullKey);
    const anchorId = readStoredAnchorFromPersistence(fullKey);

    if (Number.isFinite(rawY)) {
      applyScrollTargets(scrollEl, rawY);
    } else if (anchorId) {
      zeroWindowScroll();
      scrollAnchorNearest(scrollEl, anchorId);
    }
  }, [fullKey, canRestore, contentStamp]);

  return ref;
}
