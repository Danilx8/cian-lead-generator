import IBrowserService, { workerBasedBrowserProfileName } from "./IBrowserService";
import { ProfileOptions } from "./types";
import { ENV } from "../../../config";
import Proxy, { ProxyProtocol } from "../../../database/proxy.model";
import User from "../../../database/user.model";
import { BaseBrowserApiHandler } from "./BaseBrowserApiHandler";
import { BrowserServiceError, BrowserErrorCode } from "../../errors/browser.error";

class MoreLoginService extends BaseBrowserApiHandler implements IBrowserService {
  constructor() {
    super("MoreLogin", `http://localhost:${ENV.MORE_LOGIN_PORT!}/api`, {
      "x-api-key": ENV.MORE_LOGIN_ID!
    });
  }
  async createBrowser(profileOptions: ProfileOptions, user?: User, proxyId?: number): Promise<string> {
    const response = await this.makeApiCall<{ code: number; data: string; msg: string }>(
      {
        method: "POST",
        url: "/env/create/advanced",
        data: {
          browserTypeId: profileOptions.browserCore ?? 1,
          operatorSystemId: profileOptions.operatorSystemId ?? 1,
          quantity: 1,
          cookies: "",
          proxyId: proxyId,
          name: workerBasedBrowserProfileName(profileOptions, user)
        }
      },
      BrowserErrorCode.BROWSER_CREATE_FAILED,
      `Failed to create MoreLogin browser`
    );

    if (response.data.code !== 0) {
      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.BROWSER_CREATE_FAILED,
        `MoreLogin API error ${response.data.code}: ${response.data.msg}`,
        undefined,
        400,
        { code: response.data.code, message: response.data.msg }
      );
    }

    return response.data.data.toString();
  }

  async getBrowserStatus(profileId: string) {
    const response = await this.makeApiCall<{ code: number; data: any; msg: string }>(
      {
        method: "POST",
        url: "/env/status",
        data: { envId: profileId }
      },
      BrowserErrorCode.BROWSER_STATUS_CHECK_FAILED,
      `Failed to check MoreLogin browser status for ${profileId}`
    );

    if (response.data.code !== 0) {
      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.BROWSER_STATUS_CHECK_FAILED,
        `MoreLogin API error ${response.data.code}: ${response.data.msg}`,
        undefined,
        400,
        { code: response.data.code, message: response.data.msg }
      );
    }

    const status = response.data.data?.status ?? response.data.data;
    return { running: status === "running" };
  }

  async deleteProfile(profileId: string): Promise<boolean> {
    const response = await this.makeApiCall<{ code: number; msg: string }>(
      {
        method: "POST",
        url: "/env/removeToRecycleBin/batch",
        data: { envIds: [profileId] }
      },
      BrowserErrorCode.PROFILE_DELETE_FAILED,
      `Failed to delete MoreLogin profile ${profileId}`
    );

    if (response.data.code !== 0) {
      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.PROFILE_DELETE_FAILED,
        `MoreLogin API error ${response.data.code}: ${response.data.msg}`,
        undefined,
        400,
        { code: response.data.code, message: response.data.msg }
      );
    }

    return true;
  }

  async startBrowser(envId: string): Promise<number> {
    const response = await this.makeApiCall<{ code: number; data: { debugPort: number }; msg: string }>(
      {
        method: "POST",
        url: "/env/start",
        data: {
          envId,
          isHeadless: false,
          cdpEvasion: true
        }
      },
      BrowserErrorCode.BROWSER_START_FAILED,
      `Failed to start MoreLogin browser ${envId}`
    );

    if (response.data.code !== 0) {
      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.BROWSER_START_FAILED,
        `MoreLogin API error ${response.data.code}: ${response.data.msg}`,
        undefined,
        400,
        { code: response.data.code, message: response.data.msg }
      );
    }

    return response.data.data.debugPort;
  }

  async addProxy(proxy: Proxy): Promise<number> {
    const response = await this.makeApiCall<{ code: number; data: number; msg: string }>(
      {
        method: "POST",
        url: "/proxyInfo/add",
        data: {
          proxyIp: proxy.host,
          proxyPort: proxy.port,
          username: proxy.username,
          password: proxy.password,
          proxyProvider: this.locateProvider(proxy.protocol),
          ipChangeAction: 1,
          ipMonitor: true,
          city: proxy.city,
          country: proxy.country,
          refreshUrl: proxy.refreshUrl
        }
      },
      BrowserErrorCode.PROXY_ADD_FAILED,
      `Failed to add proxy ${proxy.id} to MoreLogin`
    );

    if (response.data.code !== 0) {
      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.PROXY_ADD_FAILED,
        `MoreLogin API error ${response.data.code}: ${response.data.msg}`,
        undefined,
        400,
        { code: response.data.code, message: response.data.msg }
      );
    }

    return response.data.data;
  }

  locateProvider(protocol: ProxyProtocol): number {
    switch (protocol) {
      case ProxyProtocol.HTTP:
        return 0;
      case ProxyProtocol.HTTPS:
        return 1;
      case ProxyProtocol.SOCKS5:
        return 2;
      case ProxyProtocol.SOCKS4:
        throw new BrowserServiceError(
          this.serviceName,
          BrowserErrorCode.PROXY_INVALID,
          "SOCKS4 protocol is not supported by MoreLogin",
          undefined,
          400
        );
      default:
        throw new BrowserServiceError(
          this.serviceName,
          BrowserErrorCode.PROXY_INVALID,
          `Unknown proxy protocol: ${protocol}`,
          undefined,
          400
        );
    }
  }

  async stopBrowser(profileId: string): Promise<any> {
    const response = await this.makeApiCall<{ code: number; data: { envId: string }; msg: string }>(
      {
        method: "POST",
        url: "/env/close",
        data: { envId: profileId }
      },
      BrowserErrorCode.BROWSER_STOP_FAILED,
      `Failed to stop MoreLogin browser ${profileId}`
    );

    if (response.data.code !== 0) {
      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.BROWSER_STOP_FAILED,
        `MoreLogin API error ${response.data.code}: ${response.data.msg}`,
        undefined,
        400,
        { code: response.data.code, message: response.data.msg }
      );
    }

    return response.data.data.envId;
  }
}

export default new MoreLoginService();