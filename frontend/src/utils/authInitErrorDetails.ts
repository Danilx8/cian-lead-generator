import { ApiError } from '../api/client';

export type AuthInitErrorDisplay = { summary: string; details: string };

export function buildAuthInitErrorDisplay(err: unknown): AuthInitErrorDisplay {
  const lines: string[] = [];

  if (err instanceof ApiError) {
    lines.push('API', `  Код: ${err.status || '—'}`, `  Сообщение: ${err.message}`);
  } else if (err instanceof Error) {
    lines.push('Ошибка', `  ${err.name}: ${err.message}`);
    const c = (err as Error & { cause?: unknown }).cause;
    if (c instanceof Error) {
      lines.push('  cause:', `  ${c.name}: ${c.message}`);
    } else if (c != null) {
      lines.push('  cause:', `  ${String(c)}`);
    }
  } else {
    lines.push('Другое', `  ${String(err)}`);
  }

  let summary: string;
  if (err instanceof ApiError) {
    if (err.status === 401) summary = 'Сессия недействительна. Войдите заново.';
    else if (err.status === 403) summary = 'Аккаунт ожидает одобрения администратора.';
    else if (err.status === 0) summary = 'Нет ответа от сервера. Проверьте сеть и адрес API.';
    else if (err.status >= 500) summary = 'Сервер вернул ошибку. Попробуйте позже.';
    else summary = 'Ошибка при входе. Подробности — ниже.';
  } else {
    summary = 'Не удалось инициализировать приложение. Подробности — ниже.';
  }
  return { summary, details: lines.join('\n') };
}
