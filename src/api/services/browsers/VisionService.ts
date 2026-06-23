import IBrowserService from "./IBrowserService";
import { BrowserCoreTypes, BrowserPlatform, ProfileOptions } from "./types";
import { ENV } from "../../../config";
import User from "../../../database/user.model";
import Proxy, { ProxyProtocol } from "../../../database/proxy.model";
import { BaseBrowserApiHandler } from "./BaseBrowserApiHandler";
import { BrowserServiceError, BrowserErrorCode } from "../../errors/browser.error";
import axios from "axios";
import { with429Retry, sleep } from "./retry429";
import { Transaction } from "sequelize";
import { ProxyService } from "../proxy.service";
import { ApiError } from "../../errors/api.error";

class VisionService extends BaseBrowserApiHandler implements IBrowserService {
  private readonly icons: string[] = [
    "Cloud",
    "Google",
    "Facebook",
    "TikTok",
    "Amazon",
    "Bitcoin",
    "Meta",
    "PayPal",
    "Discord",
    "Twitter",
    "Vkontakte",
    "Youtube",
    "Tinder",
    "Onlyfans",
    "Threads"
  ];

  private readonly colors: string[] = [
    "#FFC1073D",
    "#C8E4FFCD",
    "#3366FF3D",
    "#54D62C3D",
    "#FF48423D",
    "#919EAB3D"
  ];

  constructor() {
    super("Vision", "https://v1.empr.cloud/api/v1", {
      "X-Token": ENV.VISION_TOKEN!
    });
  }

  private makeNoise(fractionDigits: number = 8): number {
    return Number((Math.random() * 100).toFixed(fractionDigits));
  }

  async createBrowser(profileOptions: ProfileOptions, user: User, proxyId?: number): Promise<string> {
    let folderId: string | undefined = "";
    if (!user.visionFolderId) {
      user.visionFolderId = await this.createFolder(user.username);
      await user.save();
    }
    folderId = user.visionFolderId;
    if (!folderId) {
      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.FOLDER_CREATE_FAILED,
        `Failed to set vision folder id for user ${user.id}`,
        undefined,
        500
      );
    }

    const fingerprint = await this.getFingerprint(profileOptions.operatorSystemId ?? BrowserPlatform.windows);
    fingerprint.webrtc_pref = "off";
    fingerprint.webgl_pref = { noise: this.makeNoise() };
    fingerprint.canvas_pref = { noise: this.makeNoise() };
    fingerprint.ports_protection = [];
    fingerprint.client_rects = this.makeNoise(6);
    fingerprint.media_devices = {
      audio_input: 1,
      audio_output: 2,
      video_input: 1
    };
    fingerprint.ports_protection = [3389, 5900, 5901, 5800, 7070, 6568, 5938, 1080, 8080, 3128, 3030];
    fingerprint.navigator.language = "German-Germany";
    fingerprint.navigator.timezone = "Europe/Berlin";
    if (profileOptions.userAgent) fingerprint.navigator.user_agent = profileOptions.userAgent;

    const browser = profileOptions.browserCore ? BrowserCoreTypes[profileOptions.browserCore] : "Chrome";
    let platform = profileOptions.operatorSystemId ?
      BrowserPlatform[profileOptions.operatorSystemId].charAt(0).toUpperCase() +
      BrowserPlatform[profileOptions.operatorSystemId].slice(1)
      : "Windows";

    if (platform === "Macos") platform = "MacOS";

    const data = {
      "profile_name": user.id.toString(),
      "proxy_id": proxyId,
      "browser": browser,
      "platform": platform,
      "fingerprint": fingerprint,
      "profile_notes": "",
      "profile_tags": []
    };

    const response = await this.makeApiCall<{ data: { id: string } }>(
      {
        method: "POST",
        url: `/folders/${folderId}/profiles`,
        data
      },
      BrowserErrorCode.BROWSER_CREATE_FAILED,
      `Failed to create Vision profile for user ${user.id}`
    );

    const profileId = response.data.data.id;

    return profileId;
  }

  async createFolder(username: string) {
    const response = await this.makeApiCall<{ data: { id: string } }>(
      {
        method: "POST",
        url: "/folders",
        data: {
          "folder_name": username,
          "folder_icon": this.icons[Math.floor(Math.random() * this.icons.length)],
          "folder_color": this.colors[Math.floor(Math.random() * this.colors.length)]
        }
      },
      BrowserErrorCode.FOLDER_CREATE_FAILED,
      `Failed to create Vision folder for user ${username}`
    );

    return response.data.data.id;
  }

  async startBrowser(profileId: string, folderId?: string, userId?: number, transaction?: Transaction): Promise<number> {
    if (!folderId) {
      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.INVALID_PARAMETER,
        `Failed to start Vision browser: folderId is required`,
        undefined,
        400
      );
    }

    // Retry loop for proxy errors
    while (true) {
      try {
        // Configure axios to not throw on 500 status, so we can check for proxy errors in response
        const response = await with429Retry(() => axios.post(`http://${ENV.HOST}:3030/start/${folderId}/${profileId}`, {
          "args": [
            "--remote-debugging-address=0.0.0.0",
            "--disable-renderer-backgrounding",
            "--disable-background-timer-throttling",
            "--disable-backgrounding-occluded-windows",
            "--proxy-bypass-list=<-loopback,127.0.0.1,localhost,*.svc.cluster.local,host.docker.internal,*.docker.internal>",
            ...(ENV.HEADLESS ? ["--headless"] : [])]
        }, {
          headers: {
            "X-Token": ENV.VISION_TOKEN
          },
          validateStatus: function(status) {
            return status >= 200 && status < 300 || status === 500; // Resolve if status is in 2xx range or is 500
          }
        }), { maxRetries: 6, defaultDelayMs: 5000 });

        // Check for proxy error in the response
        if (response.data.error || response.data.message) {
          const errorMessage = response.data.error || response.data.message || "";
          console.error(errorMessage);
          // Detect proxy error
          if (errorMessage.includes("Proxy error:") && userId) {

            // Try to get a new proxy
            try {
              const newProxy = await ProxyService.peekProxy(userId, transaction);

              // Add the new proxy to Vision
              const proxyId = await this.addProxy(newProxy, folderId);

              // Update the profile with the new proxy
              await this.updateProfile(folderId, profileId, { proxy_id: proxyId });

              // Short backoff before retrying to avoid tight loop
              await sleep(1000);

              // Continue the loop to retry with the new proxy
              continue;
            } catch (proxyError: any) {
              // Check if it's "no proxies left" error
              if (proxyError instanceof ApiError && proxyError.status === 417) {
                // Re-throw the "Proxy not found" error with user-friendly message
                throw new BrowserServiceError(
                  this.serviceName,
                  BrowserErrorCode.PROXY_NOT_FOUND,
                  `No proxies available for user ${userId}`,
                  "У вас не осталось доступных прокси",
                  417
                );
              }
              // Re-throw other proxy errors
              throw proxyError;
            }
          }

          // Non-proxy error or no userId provided - throw error
          throw new BrowserServiceError(
            this.serviceName,
            BrowserErrorCode.BROWSER_START_FAILED,
            `Failed to start Vision browser: ${errorMessage}`,
            undefined,
            500,
            { error: errorMessage }
          );
        }

        // Success - set status and return port
        const statusId = await this.getStatusCreateIfNotExists(folderId);
        await this.setStatus(folderId, profileId, statusId);

        return response.data.port;
      } catch (error: any) {
        // If it's already a BrowserServiceError, just re-throw it
        if (error instanceof BrowserServiceError || error instanceof ApiError) {
          throw error;
        }

        // Wrap other errors
        throw new BrowserServiceError(
          this.serviceName,
          BrowserErrorCode.BROWSER_START_FAILED,
          `Failed to start Vision browser: ${error.message}`,
          undefined,
          500,
          { originalError: error.message }
        );
      }
    }
  }

  async getBrowserStatus(profileId: string, folderId?: string) {
    if (!folderId) {
      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.INVALID_PARAMETER,
        `Failed to check Vision profile: folderId is required`,
        undefined,
        400
      );
    }

    const response = await this.makeApiCall<{ data: { running: boolean } }>(
      {
        method: "GET",
        url: `/folders/${folderId}/profiles/${profileId}`
      },
      BrowserErrorCode.BROWSER_STATUS_CHECK_FAILED,
      `Failed to check Vision profile ${profileId} status`
    );

    console.log("Status check: ", response);
    return { running: response.data.data.running };
  }

  async stopBrowser(profileId: string, folderId?: string) {
    if (!folderId) {
      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.INVALID_PARAMETER,
        `Failed to stop Vision browser: folderId is required`,
        undefined,
        400
      );
    }

    // Vision launcher: stop is GET (see Vision docs), not POST
    try {
      await this.wrapWithErrorHandling(
        with429Retry(() => axios.get(`http://${ENV.HOST}:3030/stop/${folderId}/${profileId}`, {
          headers: {
            "X-Token": ENV.VISION_TOKEN
          },
          validateStatus: (status) => (status >= 200 && status < 300) || status === 404 || status === 409
        }), { maxRetries: 6, defaultDelayMs: 5000 }),
        BrowserErrorCode.BROWSER_STOP_FAILED,
        `Failed to stop Vision browser ${profileId}`
      );
    } catch (e: any) {
      // If response explicitly indicates not found/already stopped, treat as success
      const status = e?.response?.status;
      if (status === 404 || status === 409) {
        return true;
      }
      throw e;
    }

    return true;
  }

  async deleteProfile(profileId: string, folderId?: string): Promise<boolean> {
    if (!folderId) {
      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.INVALID_PARAMETER,
        `Failed to delete Vision profile: folderId is required`,
        undefined,
        400
      );
    }

    const tagUUID = await this.getTagCreateIfNotExists(folderId);
    await this.setTag(folderId, profileId, tagUUID);

    return true;
  }

  async addProxy(proxy: Proxy, folderId?: string): Promise<number> {
    if (!folderId) {
      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.INVALID_PARAMETER,
        `Failed to add proxy to Vision browser: folderId is required`,
        undefined,
        400
      );
    }

    const proxyType = proxy.protocol == "https" ? ProxyProtocol.HTTP : proxy.protocol;
    const response = await this.makeApiCall<{ data: Array<{ id: number }> }>(
      {
        method: "POST",
        url: `/folders/${folderId}/proxies`,
        data: {
          proxies: [{
            proxy_name: proxy.id.toString(),
            proxy_type: proxyType.toUpperCase(),
            proxy_ip: proxy.host,
            proxy_port: proxy.port,
            proxy_username: proxy.username,
            proxy_password: proxy.password,
            update_url: proxy.refreshUrl
          }]
        }
      },
      BrowserErrorCode.PROXY_ADD_FAILED,
      `Failed to add proxy ${proxy.id} to Vision browser`
    );

    return response.data.data[0].id;
  }

  async getLastAvailableProfileId(folderId: string): Promise<string | undefined> {
    const response = await this.makeApiCall<{ data: { items: Array<{ id: string, profile_status: any }> } }>(
      {
        method: "GET",
        url: `/folders/${folderId}/profiles?ps=200`
      },
      BrowserErrorCode.PROFILE_NOT_FOUND,
      `Failed to get profiles for folder ${folderId}`
    );

    const profiles = response.data.data.items;
    for (const profile of profiles) {
      if (!profile.profile_status) return profile.id;
    }
  }

  async restoreProfile(profileId: string, folderId: string) {
    await this.setStatus(folderId, profileId);
  }

  async changeProxy(profileId: string, folderId: string, proxy: Proxy) {
    const proxyId = await this.addProxy(proxy, folderId);
    if (!proxyId) throw new BrowserServiceError(
      this.serviceName,
      BrowserErrorCode.PROXY_NOT_FOUND,
      "Didn't find any added proxy",
      "Добавь прокси 🙏",
      417
    );

    await this.updateProfile(folderId, profileId, { proxy_id: proxyId });
    return true;
  }

  // Public helper to update profile's proxy
  public async setProfileProxy(folderId: string, profileId: string, proxyId: number): Promise<string> {
    return await this.updateProfile(folderId, profileId, { proxy_id: proxyId });
  }

  // Public helper to list all profiles in folder that have no status set
  public async getProfilesWithoutStatus(folderId: string): Promise<string[]> {
    const response = await this.makeApiCall<{ data: { items: Array<{ id: string, profile_status: any }> } }>(
      {
        method: "GET",
        url: `/folders/${folderId}/profiles?ps=200`
      },
      BrowserErrorCode.PROFILE_NOT_FOUND,
      `Failed to get profiles for folder ${folderId}`
    );

    const profiles = response.data.data.items;
    return profiles.filter(p => !p.profile_status).map(p => p.id);
  }

  private async getFingerprint(browserPlatform: BrowserPlatform) {
    const platform = BrowserPlatform[browserPlatform];

    const response = await this.makeApiCall<{ data: { fingerprint: any } }>(
      {
        method: "GET",
        url: `/fingerprints/${platform}/latest`
      },
      BrowserErrorCode.FINGERPRINT_LOAD_FAILED,
      `Failed to load fingerprint for platform ${platform}`
    );

    return response.data.data.fingerprint;
  }

  private async importCookies(cookies: any[], folderId: string, profileId: string) {
    const parsedCookies = [];
    try {
      parsedCookies.push(...cookies.map(cookie => {
        return {
          name: cookie.name,
          value: cookie.value,
          path: cookie.path,
          domain: cookie.domain,
          expires: parseInt(cookie.expires ?? cookie.expirationDate)
        };
      }));
    } catch (error) {
      throw new BrowserServiceError(
        this.serviceName,
        BrowserErrorCode.COOKIE_FORMAT_INVALID,
        `Wrong cookie format. Required fields: name, value, path, domain and expires or expirationDate. Error: ${error}`,
        undefined,
        400
      );
    }

    await this.makeApiCall(
      {
        method: "POST",
        url: `/cookies/import/${folderId}/${profileId}`,
        data: { cookies: parsedCookies }
      },
      BrowserErrorCode.COOKIE_IMPORT_FAILED,
      `Failed to import cookies for profile ${profileId}`
    );

    return true;
  }

  private async updateProfile(folderId: string, profileId: string, data: any) {
    const response = await this.makeApiCall<{ data: { id: string } }>(
      {
        method: "PATCH",
        url: `/folders/${folderId}/profiles/${profileId}`,
        data
      },
      BrowserErrorCode.PROFILE_UPDATE_FAILED,
      `Failed to update profile ${profileId}`
    );

    return response.data.data.id;
  }

  private async setStatus(folderId: string, profileId: string, statusUuid?: string) {
    return await this.updateProfile(folderId, profileId, { profile_status: statusUuid });
  }

  private async getStatusCreateIfNotExists(folderId: string) {
    const response = await this.makeApiCall<{ data: Array<{ id: string }> }>(
      {
        method: "GET",
        url: `/folders/${folderId}/statuses`
      },
      BrowserErrorCode.PROFILE_UPDATE_FAILED,
      `Failed to get statuses for folder ${folderId}`
    );

    if (!response.data.data.length || response.data.data.length === 0) {
      return this.createStatus(folderId);
    }

    return response.data.data[0].id;
  }

  private async createStatus(folderId: string) {
    const response = await this.makeApiCall<{ data: Array<{ id: string }> }>(
      {
        method: "POST",
        url: `/folders/${folderId}/statuses`,
        data: {
          statuses: [
            [
              "Running",
              "#FF0000"
            ]
          ]
        }
      },
      BrowserErrorCode.PROFILE_UPDATE_FAILED,
      `Failed to create status for folder ${folderId}`
    );

    return response.data.data[0].id;
  }

  private async setTag(folderId: string, profileId: string, tagUuid?: string) {
    return await this.updateProfile(folderId, profileId, { profile_tags: [tagUuid] });
  }

  private async getTagCreateIfNotExists(folderId: string) {
    const response = await this.makeApiCall<{ data: Array<{ id: string }> }>(
      {
        method: "GET",
        url: `/folders/${folderId}/tags`
      },
      BrowserErrorCode.PROFILE_UPDATE_FAILED,
      `Failed to get tags for folder ${folderId}`
    );

    if (!response.data.data.length || response.data.data.length === 0) {
      return this.createTag(folderId);
    }

    return response.data.data[0].id;
  }

  private async createTag(folderId: string) {
    const response = await this.makeApiCall<{ data: Array<{ id: string }> }>(
      {
        method: "POST",
        url: `/folders/${folderId}/tags`,
        data: {
          tags: ["DELETED"]
        }
      },
      BrowserErrorCode.PROFILE_UPDATE_FAILED,
      `Failed to create tag for folder ${folderId}`
    );

    return response.data.data[0].id;
  }
}

export default new VisionService();