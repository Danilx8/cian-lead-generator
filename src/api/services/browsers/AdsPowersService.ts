import IBrowserService, { workerBasedBrowserProfileName } from "./IBrowserService";
import { BrowserCoreTypes, BrowserPlatform, ProfileOptions } from "./types";
import User from "../../../database/user.model";
import Proxy from "../../../database/proxy.model";
import { ENV } from "../../../config";
import { ProxyService } from "../proxy.service";
import PQueue from "p-queue";
import http from "http";
import httpProxy from "http-proxy";
import { BaseBrowserApiHandler } from "./BaseBrowserApiHandler";
import { BrowserServiceError, BrowserErrorCode } from "../../errors/browser.error";

const adsPowerQueue = new PQueue({
  interval: 1000,
  intervalCap: 1,
  concurrency: 1
});

interface UserAgent {
  ua_browser: string[];
  ua_version?: string[];
  ua_system_version: string[];
}

interface ProxyServerInfo {
  server: http.Server;
}

class AdsPowerService extends BaseBrowserApiHandler implements IBrowserService {
  constructor() {
    super("AdsPower", `http://${ENV.ADSPOWER_PATH}/api`, {
      "Authorization": `Bearer ${ENV.ADSPOWER_TOKEN}`
    });
  }
  private async callAdsPower<T>(fn: () => Promise<T>): Promise<void | T> {
    return adsPowerQueue.add(fn);
  }

  async createBrowser(profileOptions: ProfileOptions, user?: User, proxyId?: number): Promise<string> {
    const groupId = await this.checkGroup(user?.id!);

    const profileId = await this.callAdsPower(async () => {
      const browserCore = Number(profileOptions.browserCore);
      const operatorSystemId = Number(profileOptions.operatorSystemId);

      let random_ua: UserAgent = {
        ua_browser: [],
        ua_system_version: []
      };
      if (!profileOptions.userAgent) {
        random_ua.ua_browser = browserCore === BrowserCoreTypes.Chrome ? ["chrome"] : ["firefox"];
        random_ua.ua_system_version = operatorSystemId === BrowserPlatform.windows ?
          ["Windows 10"] :
          ["Mac OS X"];
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

      const data = {
        name: workerBasedBrowserProfileName(profileOptions, user),
        cookie: "",
        group_id: groupId,
        user_proxy_config: {
          proxy_soft: "other",
          proxy_type: proxy.protocol,
          proxy_host: proxy.host,
          proxy_port: proxy.port.toString(),
          proxy_user: proxy.username,
          proxy_password: proxy.password
        },
        fingerprint_config: {
          automatic_timezone: "0",
          language_switch: "0",
          page_language_switch: "0",
          timezone: "Europe/Berlin",
          webrtc: "forward",
          language: ["de-DE", "de"],
          page_language: "de-DE",
          ua: profileOptions.userAgent ?? undefined,
          screen_resolution: "random",
          webgl: "3",
          hardware_concurrency: [2, 4, 6, 8, 16][Math.floor(Math.random() * 5)].toString(),
          device_memory: [2, 4, 6, 8][Math.floor(Math.random() * 4)].toString(),
          media_devices: "2",
          media_devices_num: { "audioinput_num": "1", "videoinput_num": "1", "audiooutput_num": "2" },
          random_ua: profileOptions.userAgent ? undefined : random_ua,
          browser_kernel_config: {
            version: "ua_auto",
            type: browserCore === BrowserCoreTypes.Chrome ? "chrome" : "firefox"
          },
          gpu: "2"
        }
      };

      const response = await this.makeApiCall<{ code: number; msg: string; data: { profile_id: string } }>(
        {
          method: "POST",
          url: "/v2/browser-profile/create",
          data
        },
        BrowserErrorCode.BROWSER_CREATE_FAILED,
        `Failed to create AdsPower profile`
      );

      if (response.data.code !== 0) {
        throw new BrowserServiceError(
          this.serviceName,
          BrowserErrorCode.BROWSER_CREATE_FAILED,
          `AdsPower API error ${response.data.code}: ${response.data.msg}`,
          undefined,
          400,
          { code: response.data.code, message: response.data.msg }
        );
      }
      
      return response.data.data.profile_id;
    });
    
    if (!profileId) {
      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.BROWSER_CREATE_FAILED,
        "Failed to create AdsPower profile: no profile ID returned",
        undefined,
        500
      );
    }
    
    return profileId;
  }

  private async checkGroup(userId: number) {
    const response = await this.callAdsPower(async () => {
      return await this.makeApiCall<{ data: { list: Array<{ group_id: string }> } }>(
        {
          method: "GET",
          url: "/v1/group/list",
          params: {
            group_name: userId.toString()
          }
        },
        BrowserErrorCode.GROUP_CREATE_FAILED,
        `Failed to check AdsPower group for user ${userId}`
      );
    });

    if (!response) {
      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.GROUP_CREATE_FAILED,
        "Check group response didn't come",
        undefined,
        500
      );
    }

    if (!response.data.data.list.length) {
      return await this.createGroup(userId);
    }

    return response.data.data.list[0].group_id;
  }

  async createGroup(userId: number) {
    return await this.callAdsPower(async () => {
      const response = await this.makeApiCall<{ code: number; msg: string; data: { group_id: string } }>(
        {
          method: "POST",
          url: "/v1/group/create",
          data: {
            group_name: userId.toString()
          }
        },
        BrowserErrorCode.GROUP_CREATE_FAILED,
        `Failed to create AdsPower group for user ${userId}`
      );

      if (response.data.code !== 0) {
        throw new BrowserServiceError(
          this.serviceName,
          BrowserErrorCode.GROUP_CREATE_FAILED,
          `AdsPower API error ${response.data.code}: ${response.data.msg}`,
          undefined,
          400,
          { code: response.data.code, message: response.data.msg }
        );
      }

      return response.data.data.group_id;
    });
  }

  async getBrowserStatus(profileId: string) {
    return Promise.resolve({ profileId: "", status: undefined });
  }

  async deleteProfile(profileId: string): Promise<boolean> {
    const isDeleted = await this.callAdsPower(async () => {
      const response = await this.makeApiCall<{ code: number; msg: string }>(
        {
          method: "POST",
          url: "/v2/browser-profile/delete",
          data: {
            profile_id: [profileId]
          }
        },
        BrowserErrorCode.PROFILE_DELETE_FAILED,
        `Failed to delete AdsPower profile ${profileId}`
      );

      if (response.data.code !== 0) {
        throw new BrowserServiceError(
          this.serviceName,
          BrowserErrorCode.PROFILE_DELETE_FAILED,
          `AdsPower API error ${response.data.code}: ${response.data.msg}`,
          undefined,
          400,
          { code: response.data.code, message: response.data.msg }
        );
      }

      return true;
    });
    return isDeleted !== null && typeof isDeleted === "boolean" ? isDeleted : false;
  }

  async startBrowser(envId: string): Promise<{ port: number, webdriver: string }> {
    const result = await this.callAdsPower(async () => {
      const response = await this.makeApiCall<{ code: number; msg: string; data: { marionette_port: string; webdriver: string } }>(
        {
          method: "POST",
          url: "/v2/browser-profile/start",
          data: {
            profile_id: envId,
            launch_args: [
              "--remote-allow-origins=*"
            ],
            delete_cache: "1"
          }
        },
        BrowserErrorCode.BROWSER_START_FAILED,
        `Failed to start AdsPower browser ${envId}`
      );

      if (response.data.code !== 0) {
        throw new BrowserServiceError(
          this.serviceName,
          BrowserErrorCode.BROWSER_START_FAILED,
          `AdsPower API error ${response.data.code}: ${response.data.msg}`,
          undefined,
          400,
          { code: response.data.code, message: response.data.msg }
        );
      }

      return { port: parseInt(response.data.data.marionette_port), webdriver: response.data.data.webdriver };
    });

    if (result?.port === null || typeof result?.port !== "number") {
      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.BROWSER_START_FAILED,
        "Couldn't start AdsPower browser: invalid port returned",
        undefined,
        500
      );
    }

    return { port: result.port, webdriver: result.webdriver };
  }

  async addProxy(proxy: Proxy): Promise<number> {
    return proxy.id;
  }

  async stopBrowser(profileId: string, optionalParameter?: string): Promise<any> {
    return await this.callAdsPower(async () => {
      const response = await this.makeApiCall<{ code: number; msg: string }>(
        {
          method: "POST",
          url: "/v2/browser-profile/stop",
          data: {
            profile_id: profileId.toString()
          }
        },
        BrowserErrorCode.BROWSER_STOP_FAILED,
        `Failed to stop AdsPower browser ${profileId}`
      );

      if (response.data.code !== 0) {
        throw new BrowserServiceError(
          this.serviceName,
          BrowserErrorCode.BROWSER_STOP_FAILED,
          `AdsPower API error ${response.data.code}: ${response.data.msg}`,
          undefined,
          400,
          { code: response.data.code, message: response.data.msg }
        );
      }

      return true;
    });
  }
}

export default new AdsPowerService();