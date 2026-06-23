import IBrowserService from "./IBrowserService";
import { ProfileOptions } from "./types";
import User from "../../../database/user.model";
import Proxy from "../../../database/proxy.model";

class DolphinService implements IBrowserService {
  createBrowser(profileOptions: ProfileOptions, user?: User, proxyId?: number): Promise<string> {
    return Promise.resolve("0");
  }

  getBrowserStatus(profileId: string) {
    return Promise.resolve({ profileId: "", status: undefined });
  }

  deleteProfile(profileId: string): Promise<boolean> {
    return Promise.resolve(false);
  }

  startBrowser(envId: string): Promise<number> {
    return Promise.resolve(0);
  }

  addProxy(proxy: Proxy): Promise<number> {
    return Promise.resolve(0);
  }

  stopBrowser(profileId: string, optionalParameter?: string): Promise<any> {
    return Promise.resolve(undefined);
  }
}

export default new DolphinService();