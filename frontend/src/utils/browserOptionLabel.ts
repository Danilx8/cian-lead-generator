export const BROWSER_OPTION_NAMES: Record<number, string> = {
  1: 'MoreLogin',
  2: 'Vision',
  3: 'AdsPower',
  4: 'Dolphine',
  5: 'GoLogin',
  6: 'OctoBrowser',
  7: 'HideMyAcc',
  8: 'Linken Sphere',
  9: 'Indigo',
  10: 'Identitory',
  11: 'Undetectable',
};

export function browserOptionLabel(raw: unknown): string {
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const name = o.name ?? o.title ?? o.label;
    if (typeof name === 'string' && name.trim()) return name.trim();
  }

  const num =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && /^\d+$/.test(raw)
        ? Number(raw)
        : null;

  if (num !== null) {
    const label = BROWSER_OPTION_NAMES[num];
    if (label) return label;
    return `#${num}`;
  }
  if (typeof raw === 'string' && raw.trim()) return raw;
  return '—';
}
