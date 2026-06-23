import { ProfileOptions } from "./types";
import User from "../../../database/user.model";
import Proxy from "../../../database/proxy.model";

/** Имя нового профиля для антидетект-браузеров (кроме Vision / Undetectable): `Worker_{id}` или запасной вариант. */
export function workerBasedBrowserProfileName(profileOptions: ProfileOptions, user?: User): string {
  if (profileOptions.workerId != null) {
    return `${profileOptions.workerId}`;
  }
  return `Profile_${user?.id ?? "unknown"}_${Date.now()}`;
}

/** Общие пресеты экрана (width × height, DPR) для антидетект-браузеров. Indigo: custom screen fingerprint. */
export interface BrowserScreenPreset {
  width: number;
  height: number;
  pixel_ratio: number;
}

export const SCREEN_PRESETS: readonly BrowserScreenPreset[] = [
  { width: 1920, height: 1080, pixel_ratio: 1 },
  { width: 1920, height: 1080, pixel_ratio: 2 },
  { width: 1366, height: 768, pixel_ratio: 1 },
  { width: 1536, height: 864, pixel_ratio: 1 },
  { width: 1440, height: 900, pixel_ratio: 2 },
  { width: 1280, height: 720, pixel_ratio: 1 },
  { width: 1600, height: 900, pixel_ratio: 1 },
  { width: 2560, height: 1440, pixel_ratio: 2 }
];

export function pickRandomScreenPreset(): BrowserScreenPreset {
  return SCREEN_PRESETS[Math.floor(Math.random() * SCREEN_PRESETS.length)]!;
}

interface IBrowserService {
  /**
   * Создает новый экземпляр браузера и возвращает его порт WebSocket
   * @param profileOptions Параметры профиля (например, OS, прокси)
   * @param user Пользователь, вызвавший метод
   * @param proxyId Айди прокси, используемого для профиля
   * @returns Промис с ID браузера
   */
  createBrowser(profileOptions: ProfileOptions, user?: User, proxyId?: number): Promise<string>;

  /**
   * Создает новый экземпляр браузера и возвращает его порт WebSocket
   * @param profileId ID профиля браузера
   * @param optionalParameter
   * @returns Промис с ID браузера
   */
  startBrowser(profileId: string, optionalParameter?: string): Promise<any>;

  addProxy(proxy: Proxy, optionalParameter?: string): Promise<any>;

  /**
   * Проверяет статус браузера по его ID
   * @param profileId ID браузера
   * @param optionalParameter
   * @returns Промис с объектом статуса (активен/неактивен, порт WebSocket)
   */
  getBrowserStatus(profileId: string, optionalParameter?: string): any;

  /**
   * Останавливает браузер по его ID
   * @param profileId ID браузера
   * @param optionalParameter
   * @returns Промис с результатом остановки (true при успехе)
   */
  stopBrowser(profileId: string, optionalParameter?: string): Promise<any>;

  /**
   * Останавливает браузер по его ID
   * @param profileId ID браузера
   * @param optionalParameter
   * @returns Промис с результатом удаления (true при успехе)
   */
  deleteProfile(profileId: string, optionalParameter?: string): Promise<boolean>;
}

export default IBrowserService;