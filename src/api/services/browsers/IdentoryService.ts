import IBrowserService, { workerBasedBrowserProfileName } from "./IBrowserService";
import { ProfileOptions } from "./types";
import User from "../../../database/user.model";
import Proxy, { ProxyProtocol } from "../../../database/proxy.model";
import { ENV } from "../../../config";
import { ProxyService } from "../proxy.service";
import { BaseBrowserApiHandler } from "./BaseBrowserApiHandler";
import { BrowserServiceError, BrowserErrorCode } from "../../errors/browser.error";

function rand<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}


class IdentoryService extends BaseBrowserApiHandler implements IBrowserService {
  constructor() {
    const headers: Record<string, string> = {};
    if (ENV.IDENTORY_TOKEN) {
      headers.Authorization = `Bearer ${ENV.IDENTORY_TOKEN}`;
    }
    super("Identory", ENV.IDENTORY_API_URL || undefined, headers);
  }

  async createBrowser(profileOptions: ProfileOptions, user?: User, proxyId?: number): Promise<string> {
    if (!ENV.IDENTORY_API_URL) {
      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.API_CONNECTION_FAILED,
        "Set IDENTORY_API_URL (Identory local API base URL, e.g. http://host.docker.internal:PORT).",
        undefined,
        503
      );
    }
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

    let proxyType = "http://";
    if (proxy.protocol === ProxyProtocol.SOCKS5) proxyType = "socks5://";
    else if (proxy.protocol === ProxyProtocol.SOCKS4) proxyType = "socks4://";

    const payload: Record<string, unknown> = {
      name: workerBasedBrowserProfileName(profileOptions, user),
      useProxy: 2,
      proxyType,
      proxyHost: proxy.host,
      proxyPort: String(proxy.port),
      platform: "Win32",
      platformVersion: rand(["NT 10.0", "NT 10.0.2"]),
      architecture: "x86",
      deviceMemory: rand([2, 4, 6, 8]),
      hardwareConcurrency: rand([2, 4, 6, 8, 12, 16]),
      screenSize: rand(["1024x768","1280x720","1280x800","1280x1024","1360x768","1366x768","1440x900","1536x864","1600x900","1680x1050","1920x1080","1920x1200","2048x1152","2560x1080","2560x1440","3440x1440","3840x2160"]),
      modifyCanvasHash: true,
      modifyWebGLBufferData: true,
      modifyAudioChannelData: true,
      modifyClientRects: true,
      timezone: "Europe/Berlin",
      autoDetectGeolocation: true,
      languages: ["de-DE", "de"],
      videoInputs: Math.random() < 0.5 ? 0 : 1,
      audioInputs: rand([1, 2]),
      audioOutputs: rand([1, 2]),
      replaceBatteryState: true,
      enableFontListMasking: true,
      modifyFontsMetrics: true,
      enableWebGL2: true,
      currentIp: "0.0.0.0",
      overrideCookies: [],
    };
    if (proxy.username) payload.proxyUsername = proxy.username;
    if (proxy.password) payload.proxyPassword = proxy.password;

    if (profileOptions.userAgent) {
      payload.customUserAgent = false;
      payload.userAgent = profileOptions.userAgent;
    }

    const response = await this.makeApiCall<{ id: string }>(
      {
        method: "POST",
        url: "/api/v1/profiles",
        data: payload
      },
      BrowserErrorCode.BROWSER_CREATE_FAILED,
      "Failed to create Identory profile"
    );
    if (!response.data?.id) {
      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.BROWSER_CREATE_FAILED,
        "Identory create response missing id",
        undefined,
        500,
        { responseData: response.data }
      );
    }
    return response.data.id;
  }

  async startBrowser(profileId: string, _optionalParameter?: string): Promise<{ port: number; webdriver?: string }> {
    if (!ENV.IDENTORY_API_URL) {
      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.API_CONNECTION_FAILED,
        "Set IDENTORY_API_URL (Identory local API base URL, e.g. http://host.docker.internal:PORT).",
        undefined,
        503
      );
    }
    const response = await this.makeApiCall<{ browserWSEndpoint: string }>(
      {
        method: "POST",
        url: `/api/v1/profiles/${encodeURIComponent(profileId)}/start`,
        data: {
          skipConnectionCheck: true,
          args: ["--remote-allow-origins=*"]
        },
        timeout: 0
      },
      BrowserErrorCode.BROWSER_START_FAILED,
      `Failed to start Identory browser ${profileId}`
    );
    const ws = response.data?.browserWSEndpoint;
    if (!ws) {
      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.BROWSER_START_FAILED,
        "Identory start response missing browserWSEndpoint",
        undefined,
        500,
        { responseData: response.data }
      );
    }
    const u = new URL(ws.replace(/^ws/i, "http"));
    const port = Number(u.port);
    if (!Number.isFinite(port) || port <= 0) {
      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.BROWSER_START_FAILED,
        `Could not parse CDP port from browserWSEndpoint: ${ws}`,
        undefined,
        500
      );
    }
    return { port, webdriver: ws };
  }

  addProxy(proxy: Proxy, _optionalParameter?: string): Promise<number> {
    return Promise.resolve(proxy.id);
  }

  async getBrowserStatus(profileId: string, _optionalParameter?: string): Promise<{ profileId: string; status: undefined }> {
    return Promise.resolve({ profileId: "", status: undefined });
  }

  async stopBrowser(profileId: string, _optionalParameter?: string): Promise<boolean> {
    if (!ENV.IDENTORY_API_URL) {
      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.API_CONNECTION_FAILED,
        "Set IDENTORY_API_URL (Identory local API base URL, e.g. http://host.docker.internal:PORT).",
        undefined,
        503
      );
    }
    await this.makeApiCall(
      {
        method: "POST",
        url: `/api/v1/profiles/${encodeURIComponent(profileId)}/stop`
      },
      BrowserErrorCode.BROWSER_STOP_FAILED,
      `Failed to stop Identory browser ${profileId}`
    );
    return true;
  }

  /** Профили в Identory никогда не удаляем через API (ни при ошибках, ни при shutdown). */
  async deleteProfile(_profileId: string, _optionalParameter?: string): Promise<boolean> {
    return true;
  }
}

export default new IdentoryService();
