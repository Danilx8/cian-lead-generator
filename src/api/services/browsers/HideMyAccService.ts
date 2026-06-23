import Proxy from "../../../database/proxy.model";
import User from "../../../database/user.model";
import IBrowserService, { pickRandomScreenPreset, workerBasedBrowserProfileName } from "./IBrowserService";
import { BrowserPlatform, ProfileOptions } from "./types";
import { BrowserErrorCode } from "../../errors/browser.error";
import { BaseBrowserApiHandler } from "./BaseBrowserApiHandler";
import { ProxyService } from "../proxy.service";

class HideMyAccService extends BaseBrowserApiHandler implements IBrowserService {
  constructor() {
    super("HideMyAcc", "http://host.docker.internal:2268/");
  }

  async createBrowser(profileOptions: ProfileOptions, user?: User, proxyId?: number): Promise<string> {
    let proxy = undefined;
    if (proxyId) proxy = await ProxyService.getProxyById(proxyId);

    const os = (() => {
      switch (profileOptions.operatorSystemId) {
        case BrowserPlatform.windows.valueOf():
          return "win";
        case BrowserPlatform.macos.valueOf():
          return "mac";
        case BrowserPlatform.linux.valueOf():
          return "linux";
        case BrowserPlatform.android.valueOf():
          return "android";
        case BrowserPlatform.ios.valueOf():
          return "ios";
        default:
          return "win";
      }
    });

    const screen = pickRandomScreenPreset();
    const data = {
      os,
      name: workerBasedBrowserProfileName(profileOptions, user),
      browserType: "brave",
      browserSource: "marco",
      proxy: "{ host: proxy?.host, mode: proxy?.protocol.valueOf(), password: proxy?.password, port: proxy?.port, username: proxy?.username, changeIpURL: proxy?.refreshUrl }",
      resolution: `${screen.width}x${screen.height}`
    };

    const response = await this.makeApiCall<{ data: { id: string } }>(
      {
        method: "POST",
        url: `/profiles`,
        data
      },
      BrowserErrorCode.BROWSER_CREATE_FAILED,
      `Failed to create Vision profile for user ${user?.id}`
    );

    return response.data.data.id;
  }

  async startBrowser(profileId: string, optionalParameter?: string): Promise<any> {
    const response = await this.makeApiCall<{ data: { port: string} }>(
      {
        method: "POST",
        url: `/profiles/start/${profileId}`,
      }
    )

    await this.updateProfileById(profileId, {
      notes: "RUNNING"
    });

    // Return a number to align with WorkerService expectations
    const portStr = response.data.data.port;
    const portNum = typeof portStr === 'string' ? parseInt(portStr, 10) : (portStr as unknown as number);
    return portNum;
  }

  addProxy(proxy: Proxy, optionalParameter?: string): any {
    return proxy.id;
  }

  getBrowserStatus(profileId: string, optionalParameter?: string) {
    throw new Error("Method not implemented.");
  }

  async stopBrowser(profileId: string, optionalParameter?: string): Promise<any> {
    await this.makeApiCall(
      {
        method: "POST",
        url: `/profiles/stop/${profileId}`
      }
    )

    return true;
  }

  async deleteProfile(profileId: string, optionalParameter?: string): Promise<boolean> {
    await this.updateProfileById(profileId, {
      notes: "DELETED"
    })

    return true;
  }

  async restoreProfile(profileId: string): Promise<boolean> {
    await this.updateProfileById(profileId, { notes: "" });
    return true;
  }

  async getLastAvailableProfileId(folderId?: string): Promise<string | undefined> {
    const response = await this.makeApiCall<{ data: Array<{ id: string, notes: string }> }>(
      {
        method: "GET",
        url: `/profiles`
      },
      BrowserErrorCode.PROFILE_NOT_FOUND,
      `Failed to get profiles for folder ${folderId}`
    );

    const profiles = response.data.data;
    for (const profile of profiles) {
      if (profile.notes.length === 0) return profile.id;
    }
  }

  private async updateProfileById(profileId: string, data: any) {
    await this.makeApiCall(
      {
        method: "PUT",
        url: `/profiles/${profileId}`,
        data
      }
    );

    return true;
  }
}

export default new HideMyAccService();