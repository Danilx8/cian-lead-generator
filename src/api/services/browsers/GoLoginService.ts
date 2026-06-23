import IBrowserService, { workerBasedBrowserProfileName } from "./IBrowserService";
import { BrowserPlatform, ProfileOptions } from "./types";
import User from "../../../database/user.model";
import Proxy from "../../../database/proxy.model";
import axios from "axios";
import { ENV } from "../../../config";
import { ProxyService } from "../proxy.service";
import { GologinApi } from "gologin";
import { BaseBrowserApiHandler } from "./BaseBrowserApiHandler";
import { BrowserServiceError, BrowserErrorCode } from "../../errors/browser.error";
import { OS } from "gologin/types/profile-params";

class GoLoginService extends BaseBrowserApiHandler implements IBrowserService {
  private readonly apiUrl = "https://api.gologin.com";

  constructor() {
    super("GoLogin", "https://api.gologin.com", {
      "Authorization": `Bearer ${ENV.GOLOGIN_TOKEN}`
    });
  }

  async createBrowser(profileOptions: ProfileOptions, user?: User, proxyId?: number): Promise<string> {
    const operatorSystemId = Number(profileOptions.operatorSystemId);

    // Определяем операционную систему
    let os: OS = "win";
    let osSpec = "win11";
    if (operatorSystemId === BrowserPlatform.macos) {
      os = "mac";
      osSpec = "M1";
    } else if (operatorSystemId === BrowserPlatform.linux) {
      os = "lin";
      osSpec = "";
    }

    // Получаем прокси если указан
    const proxy = proxyId ? await ProxyService.getProxyById(proxyId) : null;

    // Определяем прокси
    const proxyData = proxyId && proxy
      ? {
        mode: proxy.protocol === "socks5" ? "socks5" : "http" as "socks5" | "http" | "none" | "https" | "socks4" | "geolocation" | "tor" | "gologin",
        host: proxy.host,
        port: proxy.port,
        username: proxy.username,
        password: proxy.password
      }
      : {
        mode: "none" as "socks5" | "http" | "none" | "https" | "socks4" | "geolocation" | "tor" | "gologin",
        host: "",
        port: 0,
        username: proxyId && proxy ? "" : undefined,
        password: proxyId && proxy ? "" : undefined
      };

    const gologinApi = GologinApi({
      token: ENV.GOLOGIN_TOKEN!
    });

    const response = await gologinApi.createProfileRandomFingerprint(workerBasedBrowserProfileName(profileOptions, user));

    await gologinApi.changeProfileProxy(response.id, {
      ...proxyData
    });

    return response.id;
  }

  async importCookies(cookies: any[], profileId: string) {
    const parsedCookies = [];
    try {
      parsedCookies.push(...cookies.map(cookie => {
        return {
          url: "https://cian.ru",
          name: cookie.name,
          value: cookie.value,
          path: cookie.path,
          domain: cookie.domain,
          session: cookie.session,
          hostOnly: cookie.hostOnly,
          secure: cookie.secure,
          httpOnly: cookie.httpOnly,
          sameSite: cookie.sameSite,
          creationDate: cookie.creationDate,
          expirationDate: cookie.expirationDate
        };
      }));
    } catch (error) {
      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.COOKIE_FORMAT_INVALID,
        `Wrong cookie format. Required fields: name, value, path, domain. Error: ${error}`,
        undefined,
        400
      );
    }

    await this.wrapWithErrorHandling(
      axios.post(`${this.apiUrl}/browser/${profileId}/cookies`, parsedCookies, {
        headers: {
          "Authorization": `Bearer ${ENV.GOLOGIN_TOKEN}`
        }
      }),
      BrowserErrorCode.COOKIE_IMPORT_FAILED,
      `Failed to import cookies for GoLogin profile ${profileId}`
    );
  }

  async getBrowserStatus(profileId: string): Promise<{ profileId: string; status: any }> {
    try {
      const response = await this.makeApiCall<{ status: any }>(
        {
          method: "GET",
          url: `/browser/${profileId}`
        },
        BrowserErrorCode.BROWSER_STATUS_CHECK_FAILED,
        `Failed to check GoLogin browser status for ${profileId}`
      );

      return {
        profileId: profileId,
        status: response.data
      };
    } catch (error) {
      console.error(`Failed to get browser status for ${profileId}:`, error);
      return { profileId: "", status: undefined };
    }
  }

  async deleteProfile(profileId: string): Promise<boolean> {
    return true;
  }

  async startBrowser(profileId: string): Promise<number> {
    const response = await this.wrapWithErrorHandling(
      axios.post("http://host.docker.internal:3001/start", { profileId }),
      BrowserErrorCode.BROWSER_START_FAILED,
      `Failed to start GoLogin browser ${profileId}`
    );

    if (response.status !== 200 || !response.data.success) {
      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.BROWSER_START_FAILED,
        `Couldn't start GoLogin browser: ${response.statusText}`,
        undefined,
        500,
        { status: response.status, data: response.data }
      );
    }

    return parseInt(response.data.port);
  }

  async getFingerprint(os: string, osSpec: string) {
    const workspaceId = await this.getLastWorkspaceId();

    const response = await this.makeApiCall(
      {
        method: "GET",
        url: `/browser/fingerprint?os=${os}&currentWorkspace=${workspaceId}&osSpec=${osSpec}`
      },
      BrowserErrorCode.FINGERPRINT_LOAD_FAILED,
      `Failed to get fingerprint for OS ${os}`
    );

    return response;
  }

  async getLastWorkspaceId() {
    const response = await this.makeApiCall<{ workspaces: Array<{ id: string }> }>(
      {
        method: "GET",
        url: "/workspaces"
      },
      BrowserErrorCode.UNKNOWN_ERROR,
      `Failed to get GoLogin workspace`
    );

    if (!response.data.workspaces || response.data.workspaces.length === 0) {
      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.UNKNOWN_ERROR,
        `No workspaces found for GoLogin account`,
        undefined,
        404
      );
    }

    return response.data.workspaces[0].id;
  }

  async addProxy(proxy: Proxy): Promise<number> {
    // GoLogin управляет прокси на уровне профиля, поэтому просто возвращаем id прокси
    return proxy.id;
  }

  async stopBrowser(profileId: string, optionalParameter?: string): Promise<any> {
    try {
      const response = await this.wrapWithErrorHandling(
        axios.post("http://host.docker.internal:3001/stop", { profileId }),
        BrowserErrorCode.BROWSER_STOP_FAILED,
        `Failed to stop GoLogin browser ${profileId}`
      );

      if (response.status !== 200 && response.status !== 204) {
        throw new BrowserServiceError(
          this.serviceName,
          BrowserErrorCode.BROWSER_STOP_FAILED,
          `Couldn't stop GoLogin browser: ${response.statusText}`,
          undefined,
          500,
          { status: response.status }
        );
      }

      return true;
    } catch (error: any) {
      // If browser is already stopped (404), consider it a success
      if (error.response && error.response.status === 404) {
        console.log(`GoLogin browser ${profileId} already stopped`);
        return true;
      }

      // Re-throw BrowserServiceError or wrap other errors
      if (error instanceof BrowserServiceError) {
        throw error;
      }

      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.BROWSER_STOP_FAILED,
        `Couldn't stop GoLogin browser: ${error.message}`,
        undefined,
        500,
        { originalError: error.message }
      );
    }
  }
}

export default new GoLoginService();
