import IBrowserService, { pickRandomScreenPreset, workerBasedBrowserProfileName } from "./IBrowserService";
import { ProfileOptions } from "./types";
import User from "../../../database/user.model";
import Proxy from "../../../database/proxy.model";
import { ENV, logger } from "../../../config";
import { ProxyService } from "../proxy.service";
import { BaseBrowserApiHandler } from "./BaseBrowserApiHandler";
import { ApiCallOptions } from "./BaseBrowserApiHandler";
import { BrowserServiceError, BrowserErrorCode } from "../../errors/browser.error";
import axios, { AxiosResponse } from "axios";
import crypto from "crypto";

/**
 * Indigo X Browser API.
 * API docs: https://documenter.getpostman.com/view/28533318/2sB2ixkZji
 * Base URL: https://launcher.indigobrowser.com:PORT (default port 45011).
 * Rate limits: 10 req/min (general), 1 req/min (list endpoints).
 */

interface IndigoStartResponse {
  status?: string;
  value?: string; // e.g. "http://127.0.0.1:35000"
  data?: { port?: number };
}

interface IndigoSignInResponse {
  data?: { token?: string; refresh_token?: string };
}


class IndigoService extends BaseBrowserApiHandler implements IBrowserService {
  private currentToken: string | null;
  private signInPromise: Promise<string> | null = null;

  constructor() {
    // Для start/stop/delete используем launcher, как в документации.
    const baseURL = "https://host.docker.internal:45011";
    super("Indigo", baseURL, {});
    this.currentToken = ENV.INDIGO_TOKEN ?? null;
    if (this.currentToken) {
      this.axiosInstance.defaults.headers.common["Authorization"] = `Bearer ${this.currentToken}`;
    }
  }

  private hasCredentials(): boolean {
    return Boolean(ENV.INDIGO_EMAIL && (ENV.INDIGO_PASSWORD || ENV.INDIGO_PASSWORD_MD5));
  }

  /**
   * Sign-in по документации: POST email + MD5(password) → data.token. Токен живёт ~30 мин, при 401 делаем signin снова.
   * Docs: https://faq.indigobrowser.com/api/postman-automation/configure-postman/
   */
  private async doSignIn(): Promise<string> {
    const email = ENV.INDIGO_EMAIL;
    const passwordMd5 = ENV.INDIGO_PASSWORD_MD5 ?? crypto.createHash("md5").update(ENV.INDIGO_PASSWORD ?? "").digest("hex");
    const baseURL = "https://api.indigobrowser.com";
    const response = await axios.post<IndigoSignInResponse>(
      `${baseURL}/user/signin`,
      { email, password: passwordMd5 },
      { timeout: 15000, headers: { "Content-Type": "application/json" } }
    );
    const token = response.data?.data?.token;
    if (!token) {
      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.API_AUTHENTICATION_FAILED,
        "Indigo signin: token not in response",
        undefined,
        502,
        { responseData: response.data }
      );
    }
    logger.info(`[Indigo] Sign-in successful, token refreshed`);
    return token;
  }

  /**
   * Гарантирует наличие токена: если нет — выполняет signin (один раз при конкуренции).
   * Требует INDIGO_EMAIL + INDIGO_PASSWORD (или INDIGO_PASSWORD_MD5), либо изначально заданный INDIGO_TOKEN.
   */
  private async ensureToken(): Promise<void> {
    if (this.currentToken) return;
    if (!this.hasCredentials()) {
      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.API_AUTHENTICATION_FAILED,
        "Indigo: set INDIGO_EMAIL and INDIGO_PASSWORD (or INDIGO_PASSWORD_MD5) for token refresh, or set INDIGO_TOKEN",
        undefined,
        401
      );
    }
    if (!this.signInPromise) {
      this.signInPromise = this.doSignIn();
    }
    try {
      this.currentToken = await this.signInPromise;
      this.axiosInstance.defaults.headers.common["Authorization"] = `Bearer ${this.currentToken}`;
    } finally {
      this.signInPromise = null;
    }
  }

  /**
   * При 401 сбрасываем токен и один раз переполучаем через signin, затем один раз повторяем запрос.
   */
  protected override async makeApiCall<T = any>(
    options: ApiCallOptions,
    errorCode: BrowserErrorCode = BrowserErrorCode.UNKNOWN_ERROR,
    errorMessage?: string
  ): Promise<AxiosResponse<T>> {
    await this.ensureToken();
    const headers = { ...options.headers, Authorization: `Bearer ${this.currentToken}` };
    const opts: ApiCallOptions = { ...options, headers };
    try {
      return await super.makeApiCall<T>(opts, errorCode, errorMessage);
    } catch (error) {
      const isUnauthorized = error instanceof BrowserServiceError && error.status === 401;
      if (isUnauthorized && this.hasCredentials()) {
        this.currentToken = null;
        this.signInPromise = null;
        logger.warn("[Indigo] Request returned 401, refreshing token via sign-in");
        await this.ensureToken();
        const retryOpts: ApiCallOptions = { ...options, headers: { ...options.headers, Authorization: `Bearer ${this.currentToken}` } };
        return await super.makeApiCall<T>(retryOpts, errorCode, errorMessage);
      }
      throw error;
    }
  }

  async createBrowser(profileOptions: ProfileOptions, user?: User, proxyId?: number): Promise<string> {
    if (!proxyId) {
      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.PROXY_NOT_FOUND,
        "No proxy available for browser start",
        undefined,
        400
      );
    }

    const proxy = await ProxyService.getProxyById(proxyId);
    if (!proxy) {
      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.PROXY_NOT_FOUND,
        `No proxy found with id ${proxyId}`,
        undefined,
        404
      );
    }

    const folderId = ENV.INDIGO_FOLDER_ID ?? "default";
    const screen = pickRandomScreenPreset();
    // Indigo X API: структура по документации. Для custom-флагов обязательно передаём соответствующий fingerprint.
    const createPayload = {
      name: workerBasedBrowserProfileName(profileOptions, user),
      folder_id: folderId,
      browser_type: "mimic",
      os_type: "windows",
      parameters: {
        storage: { is_local: true, save_service_worker: true },
        flags: {
          audio_masking: "mask",
          fonts_masking: "mask",
          geolocation_masking: "mask",
          geolocation_popup: "prompt",
          graphics_masking: "mask",
          graphics_noise: "mask",
          localization_masking: "custom",
          media_devices_masking: "mask",
          navigator_masking: "mask",
          ports_masking: "mask",
          proxy_masking: "custom",
          screen_masking: "custom",
          timezone_masking: "custom",
          webrtc_masking: "mask"
        },
        proxy: {
          type: proxy.protocol === "socks5" ? "socks5" : "http",
          host: proxy.host,
          port: Number(proxy.port),
          username: proxy.username || "",
          password: proxy.password || ""
        },
        fingerprint: {
          screen: {
            width: screen.width,
            height: screen.height,
            pixel_ratio: screen.pixel_ratio
          },
          localization: {
            accept_languages: "de-DE,de;q=0.9,en;q=0.8",
            languages: "de-DE",
            locale: "de-DE"
          },
          timezone: {
            zone: "Europe/Berlin"
          }
        }
      }
    };

    let profileId: string;
    try {
      await this.ensureToken();
      const response = await this.makeApiCall<{ data?: { ids?: string[] } }>(
        {
          method: "POST",
          url: "https://api.indigobrowser.com/profile/create",
          data: createPayload
        },
        BrowserErrorCode.BROWSER_CREATE_FAILED,
        "Failed to create Indigo profile"
      );

      const data = response.data;
      const uuid = data?.data?.ids?.[0];
      if (!uuid) {
        throw new BrowserServiceError(
          this.serviceName,
          BrowserErrorCode.BROWSER_CREATE_FAILED,
          "Indigo create profile succeeded but no profile id was returned",
          undefined,
          500,
          { responseData: data }
        );
      }

      profileId = String(uuid);
    } catch (err) {
      const isBrowserErr = err instanceof BrowserServiceError;
      const status = isBrowserErr ? err.status : 400;
      const responseData = isBrowserErr ? err.details?.responseData : undefined;
      const msg = isBrowserErr ? err.message : (err as Error).message;

      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.BROWSER_CREATE_FAILED,
        `Indigo create profile failed (HTTP ${status}). API response: ${
          responseData != null ? (typeof responseData === "object" ? JSON.stringify(responseData) : String(responseData)) : msg
        }`,
        undefined,
        status,
        { originalError: msg, responseData }
      );
    }

    return profileId;
  }

  async getBrowserStatus(profileId: string): Promise<{ profileId: string; status: any }> {
    return Promise.resolve({ profileId: "", status: undefined });
  }

  async startBrowser(profileId: string, optionalParameter?: string): Promise<{ port: number; webdriver?: string }> {
    const folderId = ENV.INDIGO_FOLDER_ID ?? "default";

    const result = await (async () => {
      // v2: GET /api/v2/profile/f/{folder_id}/p/{profile_id}/start
      let response: { data: IndigoStartResponse };
      // Indigo X API: GET Start Browser Profile. Params: folder_id, profile_id, automation (selenium|puppeteer|playwright), headless_mode.
      // Docs: https://faq.indigobrowser.com/api/postman-automation/start-profile/

      response = await this.makeApiCall<IndigoStartResponse>(
        {
          method: "GET",
          url: `/api/v2/profile/f/${folderId}/p/${profileId}/start?automation_type=puppeteer`,
          // Снимаем таймаут API для старта профиля (0 = без таймаута в axios),
          // чтобы не обрубал долгий запуск Indigo.
          timeout: 0
        },
        BrowserErrorCode.BROWSER_START_FAILED,
        `Failed to start Indigo browser ${profileId}`
      );

      const port = Number(response.data.data?.port);

      if (port == null || isNaN(port)) {
        throw new BrowserServiceError(
          this.serviceName,
          BrowserErrorCode.BROWSER_START_FAILED,
          "Indigo did not return a valid port",
          undefined,
          500,
          { responseData: response.data }
        );
      }

      return { port, webdriver: "" };
    })();

    if (!result?.port) {
      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.BROWSER_START_FAILED,
        "Could not start Indigo browser: invalid port",
        undefined,
        500
      );
    }

    return { port: result.port, webdriver: result.webdriver };
  }

  addProxy(proxy: Proxy): Promise<number> {
    return Promise.resolve(proxy.id);
  }

  // Indigo X API: GET Stop Browser Profile. Docs: https://faq.indigobrowser.com/api/postman-automation/stop-profile/
  async stopBrowser(profileId: string, optionalParameter?: string): Promise<any> {
    try {
      await this.makeApiCall(
        {
          method: "GET",
          url: `/api/v1/profile/stop/p/${profileId}`
        },
        BrowserErrorCode.BROWSER_STOP_FAILED,
        `Failed to stop Indigo browser ${profileId}`
      );
    } catch (e2) {
      if (e2 instanceof BrowserServiceError && e2.status === 404) return true;
      throw e2;
    }
    return true;
  }

  // Indigo X API: Profile Management delete. Exact path from Postman collection.
  async deleteProfile(profileId: string, optionalParameter?: string): Promise<boolean> {
    try {
      await this.makeApiCall(
        {
          method: "DELETE",
          url: `/api/v2/profile/${profileId}`
        },
        BrowserErrorCode.PROFILE_DELETE_FAILED,
        `Failed to delete Indigo profile ${profileId}`
      );
    } catch {
      try {
        await this.makeApiCall(
          {
            method: "DELETE",
            url: `/api/v2/profiles/${profileId}`
          },
          BrowserErrorCode.PROFILE_DELETE_FAILED,
          `Failed to delete Indigo profile ${profileId}`
        );
      } catch {
        // no-op
      }
    }
    return true;
  }
}

export default new IndigoService();
