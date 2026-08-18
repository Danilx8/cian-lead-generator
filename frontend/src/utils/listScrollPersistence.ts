export const LIST_SCROLL_STORAGE_PREFIX = 'ui:scroll:v1:';

const ANCHOR_SUFFIX = ':anchor';

const memoryScrollY = new Map<string, number>();
const memoryAnchorId = new Map<string, string>();

function maxWindowScroll(): number {
  if (typeof window === 'undefined') return 0;
  return Math.max(
    window.scrollY,
    document.documentElement?.scrollTop ?? 0,
    document.body?.scrollTop ?? 0
  );
}

function writePair(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch { }
  try {
    localStorage.setItem(key, value);
  } catch { }
}

function readPair(key: string): string | null {
  try {
    const s = sessionStorage.getItem(key);
    if (s != null && s !== '') return s;
  } catch { }
  try {
    const l = localStorage.getItem(key);
    if (l != null && l !== '') return l;
  } catch { }
  return null;
}

function removePair(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch { }
  try {
    localStorage.removeItem(key);
  } catch { }
}

export function persistListScroll(
  scrollKeySuffix: string,
  scrollEl: HTMLElement | null,
  anchorId?: string | number | null
): void {
  if (anchorId === undefined && (!scrollEl || !scrollEl.isConnected)) {
    return;
  }

  const baseKey = `${LIST_SCROLL_STORAGE_PREFIX}${scrollKeySuffix}`;
  const winY = maxWindowScroll();
  const inner = scrollEl?.scrollTop ?? 0;
  const y = Math.max(0, inner, winY);
  writePair(baseKey, String(y));
  memoryScrollY.set(baseKey, y);

  if (anchorId === undefined) {
    return;
  }
  const anchorFullKey = `${baseKey}${ANCHOR_SUFFIX}`;
  if (anchorId === null || anchorId === '') {
    removePair(anchorFullKey);
    memoryAnchorId.delete(baseKey);
    return;
  }
  const av = String(anchorId);
  writePair(anchorFullKey, av);
  memoryAnchorId.set(baseKey, av);
}

export function readStoredScrollYFromPersistence(fullKey: string): number {
  const mem = memoryScrollY.get(fullKey);
  if (mem !== undefined && Number.isFinite(mem) && mem >= 0) return mem;

  const raw = readPair(fullKey);
  if (raw == null || raw === '') return NaN;
  const y = Number(raw);
  if (!Number.isFinite(y) || y < 0) return NaN;
  memoryScrollY.set(fullKey, y);
  return y;
}

export function readStoredAnchorFromPersistence(fullKey: string): string | null {
  const m = memoryAnchorId.get(fullKey);
  if (m != null && m !== '') return m;

  const raw = readPair(`${fullKey}${ANCHOR_SUFFIX}`);
  if (raw != null && raw !== '') {
    memoryAnchorId.set(fullKey, raw);
    return raw;
  }
  return null;
}
