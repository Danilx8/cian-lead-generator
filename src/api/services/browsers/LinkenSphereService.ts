import IBrowserService, { workerBasedBrowserProfileName } from "./IBrowserService";
import { BrowserPlatform, ProfileOptions } from "./types";
import User from "../../../database/user.model";
import Proxy, { ProxyProtocol } from "../../../database/proxy.model";
import { ENV } from "../../../config";
import { BaseBrowserApiHandler } from "./BaseBrowserApiHandler";
import { BrowserServiceError, BrowserErrorCode } from "../../errors/browser.error";
import { ProxyService } from "../proxy.service";

class LinkenSphereService extends BaseBrowserApiHandler implements IBrowserService {
  constructor() {
    super("LinkenSphere", `http://localhost:${ENV.LINKEN_SPHERE_PORT}`);
  }

  async createBrowser(profileOptions: ProfileOptions, user?: User, proxyId?: number): Promise<string> {
    let proxy: Proxy | null = null;
    if (proxyId) proxy = await ProxyService.getProxyById(proxyId);

    const payload: Record<string, any> = {
      name: workerBasedBrowserProfileName(profileOptions, user),
      config: {
        type: "hybrid"
      }
    };

    if (proxy) {
      payload.connection = {
        type: this.mapProxyType(proxy.protocol),
        host: proxy.host,
        port: proxy.port,
        login: proxy.username,
        password: proxy.password
      };
    }

    const response = await this.makeApiCall<{ uuid: string }>(
      {
        method: "POST",
        url: "/sessions",
        data: payload
      },
      BrowserErrorCode.BROWSER_CREATE_FAILED,
      `Failed to create Linken Sphere session for user ${user?.id}`
    );

    const uuid = response.data?.uuid;
    if (!uuid) {
      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.BROWSER_CREATE_FAILED,
        `Linken Sphere did not return a session UUID`,
        undefined,
        500,
        { responseData: response.data }
      );
    }

    return uuid;
  }

  async startBrowser(profileId: string): Promise<number> {
    const response = await this.makeApiCall<{ cdp_url?: string; ws_url?: string }>(
      {
        method: "POST",
        url: `/sessions/${profileId}/start`
      },
      BrowserErrorCode.BROWSER_START_FAILED,
      `Failed to start Linken Sphere session ${profileId}`
    );

    const wsUrl = response.data?.cdp_url ?? response.data?.ws_url;
    if (!wsUrl) {
      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.BROWSER_START_FAILED,
        `Linken Sphere did not return a CDP URL for session ${profileId}`,
        undefined,
        500,
        { responseData: response.data }
      );
    }

    const port = parseInt(new URL(wsUrl).port, 10);
    if (isNaN(port)) {
      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.BROWSER_START_FAILED,
        `Could not parse port from Linken Sphere CDP URL: ${wsUrl}`,
        undefined,
        500,
        { cdpUrl: wsUrl }
      );
    }

    return port;
  }

  async getBrowserStatus(profileId: string): Promise<{ running: boolean }> {
    try {
      const response = await this.makeApiCall<{ state?: string }>(
        {
          method: "GET",
          url: `/sessions/${profileId}`
        },
        BrowserErrorCode.BROWSER_STATUS_CHECK_FAILED,
        `Failed to check Linken Sphere session status for ${profileId}`
      );

      return { running: response.data?.state === "running" };
    } catch (error) {
      return { running: false };
    }
  }

  async stopBrowser(profileId: string): Promise<boolean> {
    try {
      await this.makeApiCall(
        {
          method: "POST",
          url: `/sessions/${profileId}/stop`
        },
        BrowserErrorCode.BROWSER_STOP_FAILED,
        `Failed to stop Linken Sphere session ${profileId}`
      );

      return true;
    } catch (error: any) {
      if (error instanceof BrowserServiceError && error.status === 404) {
        return true;
      }
      throw error;
    }
  }

  async deleteProfile(profileId: string): Promise<boolean> {
    await this.makeApiCall(
      {
        method: "DELETE",
        url: `/sessions/${profileId}`
      },
      BrowserErrorCode.PROFILE_DELETE_FAILED,
      `Failed to delete Linken Sphere session ${profileId}`
    );

    return true;
  }

  async addProxy(proxy: Proxy): Promise<number> {
    return proxy.id;
  }

  private mapProxyType(protocol: ProxyProtocol): string {
    switch (protocol) {
      case ProxyProtocol.SOCKS5:
        return "socks5";
      case ProxyProtocol.HTTP:
      case ProxyProtocol.HTTPS:
        return "http";
      default:
        return "http";
    }
  }
}

export default new LinkenSphereService();
