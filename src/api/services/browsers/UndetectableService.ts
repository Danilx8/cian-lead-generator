import IBrowserService, { workerBasedBrowserProfileName } from "./IBrowserService";
import { BrowserCoreTypes, BrowserPlatform, ProfileOptions } from "./types";
import User from "../../../database/user.model";
import Proxy from "../../../database/proxy.model";
import { ENV } from "../../../config";
import { BaseBrowserApiHandler } from "./BaseBrowserApiHandler";
import { BrowserServiceError, BrowserErrorCode } from "../../errors/browser.error";

/** Ответ POST /profile/create (Undetectable). */
interface UndetectableCreateProfileResponse {
  code: number;
  status: string;
  data?: {
    profile_id: string;
    name?: string;
  };
}

/** Одна запись профиля в ответе GET /list (ключ в `data` — id профиля). */
export interface UndetectableListProfile {
  creation_date: number;
  debug_port: string;
  folder: string;
  modify_date: number;
  name: string;
  status: string;
  tags: string[];
  websocket_link: string;
}

/** Тело ответа списка профилей Undetectable. */
export interface UndetectableListResponse {
  code: number;
  data: Record<string, UndetectableListProfile>;
  status: string;
}

/** Тело ответа старта профиля Undetectable */
export interface UndetectableStartResponse {
  code: number;
  data: UndetectableStartProfile;
  status: string;
}

/** Профиль в ответе Undetectable на запрос на старт профиля */
export interface UndetectableStartProfile {
  name: string;
  websocket_link: string;
  debug_port: string;
  folder: string;
  tags: string[];
}

/** Интеграция с Undetectable Browser (локальный API). */
class UndetectableService extends BaseBrowserApiHandler implements IBrowserService {
  constructor() {
    super("Undetectable", ENV.UNDETECTABLE_API_URL || undefined);
  }

  private notImplemented(method: string): never {
    throw new BrowserServiceError(
      this.serviceName,
      BrowserErrorCode.UNKNOWN_ERROR,
      `Undetectable: ${method} is not implemented yet. Configure UNDETECTABLE_API_URL when ready.`,
      undefined,
      501
    );
  }

  async createBrowser(profileOptions: ProfileOptions, user?: User, _proxyId?: number): Promise<string> {
    const profileName =
      profileOptions.workerId != null
        ? String(profileOptions.workerId)
        : workerBasedBrowserProfileName(profileOptions, user);
    return this.findOrCreateByUndetectableProfileName(profileName, profileOptions);
  }

  /**
   * Ищет профиль в лаунчере по имени (для слота — `String(worker.id)`), иначе POST /profile/create.
   * Вызывать только если у слота ещё нет сохранённого profileId.
   */
  async findOrCreateByUndetectableProfileName(
    undetectableProfileName: string,
    profileOptions: ProfileOptions
  ): Promise<string> {
    const list = await this.getBrowsersList();
    const data = list.data ?? {};
    const matched = Object.entries(data).find(([, p]) => p.name === undetectableProfileName)?.[0];
    if (matched) {
      return matched;
    }
    return this.createProfileViaApi(profileOptions, undetectableProfileName);
  }

  private mapOsToUndetectable(platform?: BrowserPlatform): string {
    switch (platform) {
      case BrowserPlatform.macos:
        return "Mac";
      case BrowserPlatform.android:
        return "Android";
      case BrowserPlatform.ios:
        return "iPhone";
      case BrowserPlatform.linux:
        return "Linux";
      case BrowserPlatform.windows:
      default:
        return "Windows";
    }
  }

  private mapBrowserCoreToUndetectable(core?: BrowserCoreTypes): string {
    return core === BrowserCoreTypes.Firefox ? "FireFox" : "Chrome";
  }

  private async createProfileViaApi(profileOptions: ProfileOptions, name: string): Promise<string> {
    const body: Record<string, unknown> = {
      name,
      os: this.mapOsToUndetectable(profileOptions.operatorSystemId),
      browser: this.mapBrowserCoreToUndetectable(profileOptions.browserCore),
      timezone: "Auto"
    };

    if (profileOptions.userAgent) {
      body.notes = `userAgent: ${profileOptions.userAgent}`;
    }

    const response = await this.makeApiCall<UndetectableCreateProfileResponse>(
      {
        method: "POST",
        url: "/profile/create",
        data: body
      },
      BrowserErrorCode.BROWSER_CREATE_FAILED,
      `Undetectable: failed to create profile "${name}"`
    );

    const payload = response.data;
    if (payload.code !== 0 || !payload.data?.profile_id) {
      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.BROWSER_CREATE_FAILED,
        `Undetectable: create profile rejected (code=${payload.code}, status=${payload.status})`,
        undefined,
        500,
        { responseData: payload }
      );
    }

    return payload.data.profile_id;
  }

  async startBrowser(profileId: string, _optionalParameter?: string): Promise<{ port: number; webdriver?: string }> {
    const response = await this.makeApiCall<UndetectableStartResponse>(
      {
        method: "GET",
        url: `/profile/start/${encodeURIComponent(profileId)}`,
        params: {
          chrome_flags: "--blink-settings=imagesEnabled=false --disable-webgl2"
        }
      },
      BrowserErrorCode.BROWSER_START_FAILED,
      `Failed to start Undetectable browser ${profileId}`
    );

    const inner = response.data?.data;
    if (!inner) {
      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.BROWSER_START_FAILED,
        "Undetectable start response missing data",
        undefined,
        500,
        { responseData: response.data }
      );
    }

    const ws = inner.websocket_link?.trim();
    if (ws) {
      try {
        const u = new URL(ws.replace(/^ws/i, "http"));
        const port = Number(u.port);
        if (Number.isFinite(port) && port > 0) {
          return { port, webdriver: ws };
        }
      } catch {
        /* fall through to debug_port */
      }
    }

    const debug = String(inner.debug_port ?? "").trim();
    const port = parseInt(debug, 10);
    if (!Number.isFinite(port) || port <= 0) {
      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.BROWSER_START_FAILED,
        `Undetectable start: no usable debug_port or websocket_link for ${profileId}`,
        undefined,
        500,
        { responseData: response.data }
      );
    }
    return { port, webdriver: ws || undefined };
  }

  addProxy(proxy: Proxy, _optionalParameter?: string): Promise<number> {
    return Promise.resolve(proxy.id);
  }

  getBrowserStatus(_profileId: string, _optionalParameter?: string): Promise<{ profileId: string; status: undefined }> {
    return Promise.resolve({ profileId: "", status: undefined });
  }

  async stopBrowser(_profileId: string, _optionalParameter?: string): Promise<boolean> {
    await this.makeApiCall({
      method: "GET",
      url: `/profile/stop/${_profileId}`
    })

    return true;
  }

  private async getBrowsersList(): Promise<UndetectableListResponse> {
    const response = await this.makeApiCall<UndetectableListResponse>(
      {
        method: "GET",
        url: "/list"
      },
      BrowserErrorCode.BROWSER_STATUS_CHECK_FAILED,
      "Failed to fetch Undetectable profiles list"
    );
    return response.data;
  }

  /** Профили в Undetectable никогда не удаляем через API (ни при ошибках, ни при shutdown). */
  async deleteProfile(_profileId: string, _optionalParameter?: string): Promise<boolean> {
    return true;
  }
}

export default new UndetectableService();
