import Proxy from "../../../database/proxy.model";
import User from "../../../database/user.model";
import IBrowserService, { workerBasedBrowserProfileName } from "./IBrowserService";
import { ProfileOptions } from "./types";
import axios from "axios";
import { ENV } from "../../../config";
import { ProxyService } from "../proxy.service";
import { BaseBrowserApiHandler } from "./BaseBrowserApiHandler";
import { BrowserServiceError, BrowserErrorCode } from "../../errors/browser.error";

class OctoBrowserService extends BaseBrowserApiHandler implements IBrowserService {
  constructor() {
    super("OctoBrowser", "https://app.octobrowser.net/api/v2/automation", {
      "X-Octo-Api-Token": ENV.OCTO_TOKEN!
    });
  }
  async createBrowser(profileOptions: ProfileOptions, user?: User, proxyId?: number): Promise<string> {
    const proxy = await ProxyService.getProxyById(proxyId!);
    if (!proxy) {
      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.PROXY_NOT_FOUND,
        `Proxy not found: ${proxyId}`,
        undefined,
        404
      );
    }

    const fingerprintSource = await this.getFingerprint();

    const response = await this.makeApiCall<{ data: { uuid: string } }>(
      {
        method: "POST",
        url: "/profiles",
        data: {
          "title": workerBasedBrowserProfileName(profileOptions, user),
          "proxy": {
            "type": proxy.protocol,
            "host": proxy.host,
            "port": proxy.port,
            "login": proxy.username,
            "password": proxy.password,
          },
          "storage_options": {
            "cookies": true,
            "passwords": true,
            "extensions": true,
            "localstorage": false,
            "history": false,
            "bookmarks": true
          },
          "cookies": "",
          "fingerprint": {
            "os": "win",
            "os_version": "10",
            "os_arch": "x86",
            ...fingerprintSource,
            "languages": {
              "type": "manual",
              "data": [
                "[de-DE] German (Germany)",
                "[de] German",
                "[en-US] English (United States)",
                "[en] English"
              ]
            },
            "timezone": {
              "type": "manual",
              "data": "Europe/Berlin"
            },
            "geolocation": {
              "type": "ip"
            },
            "cpu": 8,
            "ram": 8,
            "noise": {
              "webgl": true,
              "canvas": true,
              "audio": true,
              "client_rects": true
            },
            "webrtc": {
              "type": "disable_non_proxied_udp"
            },
            "dns": "1.1.1.1",
            "media_devices": {
              "video_in": 0,
              "audio_in": 0,
              "audio_out": 1
            }
          }
        }
      },
      BrowserErrorCode.BROWSER_CREATE_FAILED,
      `Failed to create OctoBrowser profile`
    );

    return response.data.data.uuid;
  }

  async getFingerprint() {
    const renderersResponse = await this.makeApiCall<{
      success: boolean,
      msg: string,
      data?: {
        value: string,
        platform: string,
        archs: []
      }[];
    }>(
      {
        method: "GET",
        url: "/fingerprint/renderers",
        params: {
          page_len: 100,
          page: 0,
          os: "win",
          os_arch: "x86"
        }
      },
      BrowserErrorCode.FINGERPRINT_LOAD_FAILED,
      "Failed to load OctoBrowser renderers for win/x86"
    );

    const screensResponse = await this.makeApiCall<{
      success: boolean,
      msg: string,
      data?: {
        value: string,
        platform: string,
        archs: []
      }[];
    }>(
      {
        method: "GET",
        url: "/fingerprint/screens",
        params: {
          os: "win",
        }
      },
      BrowserErrorCode.FINGERPRINT_LOAD_FAILED,
      "Failed to load OctoBrowser screens for win/x86"
    );

    if (!renderersResponse.data.data || !renderersResponse.data.data[0]) throw new Error("У окто нет отпечатков для поля renderer");
    if (!screensResponse.data.data || !screensResponse.data.data[0]) throw new Error("У окто нет отпечатка для поля screen");

    return {
      "renderer" : renderersResponse.data.data[0].value,
      "screen" : screensResponse.data.data[0].value
    }
  }

  async startBrowser(profileId: string, optionalParameter?: string): Promise<any> {
    const response = await this.wrapWithErrorHandling(
      axios.post("http://host.docker.internal:58888/api/profiles/start", {
        uuid: profileId,
        headless: false,
        debug_port: true,
        timeout: 120,
        only_local: true,
        flags: [],
        password: ""
      }),
      BrowserErrorCode.BROWSER_START_FAILED,
      `Failed to start OctoBrowser profile ${profileId}`
    );

    const debugPortRaw = response.data?.debug_port;
    const port = Number(debugPortRaw);
    if (!port || Number.isNaN(port)) {
      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.BROWSER_START_FAILED,
        `OctoBrowser profile ${profileId} started but debug_port is invalid`,
        undefined,
        500,
        { responseData: response.data }
      );
    }

    return {
      port,
      webdriver: response.data?.ws_endpoint
    };
  }

  addProxy(proxy: Proxy, optionalParameter?: string): any {
    return proxy.id;
  }

  async getBrowserStatus(profileId: string, optionalParameter?: string) {
    throw new BrowserServiceError(
      this.serviceName,
      BrowserErrorCode.BROWSER_STATUS_CHECK_FAILED,
      "OctoBrowser getBrowserStatus method is not implemented yet",
      "Проверка статуса браузера OctoBrowser пока не поддерживается",
      501
    );
  }

  async stopBrowser(profileId: string, optionalParameter?: string): Promise<any> {
    await this.wrapWithErrorHandling(
      axios.post("http://host.docker.internal:58888/api/profiles/stop", {
        "uuid": profileId
      }),
      BrowserErrorCode.BROWSER_STOP_FAILED,
      `Failed to stop OctoBrowser profile ${profileId}`
    );
    
    return true;
  }

  async deleteProfile(profileId: string, optionalParameter?: string): Promise<boolean> {
    await this.wrapWithErrorHandling(
      axios.delete("https://app.octobrowser.net/api/v2/automation/profiles", {
        data: {
          "uuids": [profileId]
        },
        headers: {
          "X-Octo-Api-Token": ENV.OCTO_TOKEN
        }
      }),
      BrowserErrorCode.PROFILE_DELETE_FAILED,
      `Failed to delete OctoBrowser profile ${profileId}`
    );

    return true;
  }
}

export default new OctoBrowserService();