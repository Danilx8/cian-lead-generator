/**
 * Разбор токенов в тексте шаблона: ИИ-вставки [[ промпт ]] и переменные {{...}}.
 *
 * Синтаксис [[ ]] зеркалит бэкенд (ai.service.ts): не жадный, многострочный.
 * Переменные {{...}} внутри промпта резолвит сервер до генерации,
 * пустые [[ ]] вырезаются без вызова модели.
 */

/**
 * Временный флаг доступности ИИ-генерации в шаблонах. При false фронт прячет
 * всю обвязку [[ ]] (подсветку, автозакрытие, секцию-подсказку, предпросмотр);
 * обычные переменные {{...}} продолжают работать. Уже сохранённые [[ ]] в тексте
 * просто отображаются как обычный текст — бэкенд-резолв не зависит от фронта.
 */
export const AI_TEMPLATES_ENABLED = true;

/** Модификаторы, которые резолвит сервер. Единый источник для чипов-подсказок
 *  в редакторе, валидации подсветки {{...}} и моковой подстановки в предпросмотре.
 *  `sample` — правдоподобное значение, которым переменная заменяется в живом
 *  предпросмотре ИИ (на сервере при реальной отправке подставятся настоящие
 *  данные диалога). */
export const TEMPLATE_MODIFIERS = [
  { code: '{{product_name}}', desc: 'имя товара', sample: 'iPhone 17 Pro Max 256GB Silver' },
  { code: '{{product_price}}', desc: 'цена без валюты', sample: '1099' },
  { code: '{{product_and_delivery_price}}', desc: 'цена + доставка', sample: '1099 + 15 доставка' },
  { code: '{{delivery_price}}', desc: 'цена доставки', sample: '15' },
  { code: '{{seller_name}}', desc: 'имя продавца', sample: 'Sarah' },
  { code: '{{guten}}', desc: 'приветствие', sample: 'Guten Tag' },
  { code: '{{link}}', desc: 'ссылка на фиш', sample: 'https://cian-pay.ru/s/a1b2c3' },
  { code: '{{time}}', desc: 'время HH:mm', sample: '14:30' },
  { code: '{{date}}', desc: 'дата DD.MM.YYYY', sample: '05.07.2026' },
  { code: '{{timestamp}}', desc: 'дата + время', sample: '05.07.2026 14:30' },
  { code: '{{full_name}}', desc: 'полное имя', sample: 'Thomas Müller' },
  { code: '{{address}}', desc: 'адрес', sample: 'Hauptstraße 12, 10115 Berlin' },
] as const;

const VALID_MODIFIER_CODES = new Set<string>(TEMPLATE_MODIFIERS.map((m) => m.code));
const MODIFIER_SAMPLES: Record<string, string> = Object.fromEntries(
  TEMPLATE_MODIFIERS.map((m) => [m.code, m.sample])
);

/** Заменяет известные {{...}} моковыми значениями (для предпросмотра ИИ).
 *  Неизвестные {{...}} (опечатки) оставляем как есть — как сделал бы сервер. */
export const fillSampleVars = (text: string): string =>
  text.replace(VAR_RE, (m) => MODIFIER_SAMPLES[m] ?? m);

export type AiSegment =
  | { type: 'text'; value: string }
  | { type: 'prompt'; value: string; inner: string } // завершённый [[ промпт ]]
  | { type: 'empty'; value: string; inner: string }  // [[ ]] без промпта — бэк его просто вырежет
  | { type: 'pending'; value: string };              // незакрытый [[ ...

const AI_PROMPT_RE = /\[\[(.*?)\]\]/gs;

export function parseAiSegments(text: string): AiSegment[] {
  const segments: AiSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(AI_PROMPT_RE)) {
    const start = m.index ?? 0;
    if (start > last) segments.push({ type: 'text', value: text.slice(last, start) });
    segments.push({ type: m[1].trim() ? 'prompt' : 'empty', value: m[0], inner: m[1] });
    last = start + m[0].length;
  }
  const rest = text.slice(last);
  const open = rest.indexOf('[[');
  if (open !== -1) {
    if (open > 0) segments.push({ type: 'text', value: rest.slice(0, open) });
    segments.push({ type: 'pending', value: rest.slice(open) });
  } else if (rest) {
    segments.push({ type: 'text', value: rest });
  }
  return segments;
}

export const hasAiPrompt = (text: string): boolean =>
  parseAiSegments(text).some((s) => s.type === 'prompt');

export type VarToken =
  | { type: 'text'; value: string }
  | { type: 'var'; value: string }          // известный модификатор — сервер его заменит
  | { type: 'var-invalid'; value: string }  // {{опечатка}} — сервер оставит как есть
  | { type: 'var-empty'; value: string };   // {{}} — заготовка, ещё не набрана

const VAR_RE = /\{\{[^{}\n]*\}\}/g;

/** Разбивает текст на обычные куски и переменные {{...}} с проверкой по списку. */
export function splitVarTokens(text: string): VarToken[] {
  const tokens: VarToken[] = [];
  let last = 0;
  for (const m of text.matchAll(VAR_RE)) {
    const start = m.index ?? 0;
    if (start > last) tokens.push({ type: 'text', value: text.slice(last, start) });
    const inner = m[0].slice(2, -2);
    const type = !inner.trim() ? 'var-empty' : VALID_MODIFIER_CODES.has(m[0]) ? 'var' : 'var-invalid';
    tokens.push({ type, value: m[0] });
    last = start + m[0].length;
  }
  if (last < text.length) tokens.push({ type: 'text', value: text.slice(last) });
  return tokens;
}

/** Позиция каретки уже внутри завершённой пары [[ ]] — автозакрытие не нужно. */
export const isInsideAiPair = (text: string, pos: number): boolean => {
  for (const m of text.matchAll(AI_PROMPT_RE)) {
    const start = (m.index ?? 0) + 2;
    const end = (m.index ?? 0) + m[0].length - 2;
    if (pos >= start && pos <= end) return true;
  }
  return false;
};
