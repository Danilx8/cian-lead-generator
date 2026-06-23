import { ENV } from '../../config';

/**
 * Возвращает URL одного общего thermoptic-прокси, который запущен
 * как сервис в docker-compose.
 *
 * Если переменные окружения не заданы — возвращает undefined,
 * и воркер будет работать без thermoptic.
 */
export function getThermopticUrl(dockerHostIp: string): string | undefined {
  const port = ENV.THERMOPTIC_PORT;
  const user = ENV.THERMOPTIC_PROXY_USER;
  const pass = ENV.THERMOPTIC_PROXY_PASSWORD;

  if (!port || !user || !pass) return undefined;

  return `http://${user}:${pass}@${dockerHostIp}:${port}`;
}
