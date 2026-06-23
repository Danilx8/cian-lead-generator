import { literal, Op, QueryTypes, Transaction } from "sequelize";
import { logger } from "../../config";
import Proxy, { ProxyProtocol } from "../../database/proxy.model";
import User from "../../database/user.model";
import { ApiError } from "../errors/api.error";
import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import * as fs from "fs/promises";

export class ProxyService {
  /**
   * Получить список прокси пользователя
   */
  static async getProxiesByUserId(userId: number): Promise<Proxy[]> {
    return await Proxy.findAll({
      where: { userId },
      order: [["createdAt", "DESC"]]
    });
  }

  /**
   * Получить прокси по ID
   */
  static async getProxyById(id: number, transaction?: Transaction): Promise<Proxy | null> {
    return await Proxy.findByPk(id, { transaction });
  }

  /**
   * Пинг прокси для проверки работоспособности и получения реального IP
   */
  static async pingProxy(
    host: string,
    port: number,
    protocol: ProxyProtocol,
    username?: string,
    password?: string
  ): Promise<{
    isWorking: boolean;
    ip?: string;
    countryCode?: string;
    country?: string;
    city?: string;
    error?: string;
  }> {
    try {
      let agent;

      // Создаем соответствующий агент в зависимости от протокола
      if (protocol === ProxyProtocol.SOCKS4 || protocol === ProxyProtocol.SOCKS5) {
        const socksVersion = protocol === ProxyProtocol.SOCKS4 ? 4 : 5;
        const auth = username && password ? `${username}:${password}@` : "";
        const socksUrl = `socks${socksVersion}://${auth}${host}:${port}`;
        agent = new SocksProxyAgent(socksUrl, {
          timeout: 5000
        });
      } else {
        const auth = username && password ? `${username}:${password}@` : "";
        const httpUrl = `${protocol}://${auth}${host}:${port}`;
        agent = new HttpsProxyAgent(httpUrl, {
          timeout: 5000
        });
      }

      // Делаем запрос через прокси к сервису, возвращающему IP
      // Уменьшаем таймаут до 5 секунд
      const response = await axios.get("https://icanhazip.com/", {
        httpsAgent: agent,
        httpAgent: agent,
        timeout: 30000, // 30 секунд таймаут
        responseType: "text"
      });

      const raw = response.data as string;
      const ip =
        typeof raw === "string"
          ? raw.trim().split(/\s/)[0]
          : String((response.data as { ip?: string })?.ip ?? "").trim();
      if (!ip) {
        return { isWorking: false, error: "Пустой ответ при проверке IP через прокси." };
      }

      // Получаем информацию о местоположении IP
      const locationData = await this.getIpLocation(ip);

      return {
        isWorking: true,
        ip,
        ...locationData
      };
    } catch (error) {
      let errorMessage = "Не удалось подключиться к прокси. Проверьте данные и повторите попытку.";

      if (axios.isAxiosError(error)) {
        if (error.code === "ECONNABORTED" || error.message.includes("timeout")) {
          errorMessage = "Превышено время ожидания соединения с прокси. Сервер не отвечает.";
        } else if (error.cause) {
          // Определяем более точную причину ошибки
          if (error.cause.message && typeof error.cause.message === "string") {
            if (error.cause.message.includes("timed out")) {
              errorMessage = "Соединение с прокси заняло слишком много времени.";
            } else if (error.cause.message.includes("refused")) {
              errorMessage = "Соединение отклонено. Проверьте, что прокси активен и работает.";
            } else if (error.cause.message.includes("authentication")) {
              errorMessage = "Ошибка аутентификации. Проверьте логин и пароль.";
            }
          }
        }
      }

      logger.error(`Proxy ${host}:${port} check failed...`);
      return { isWorking: false, error: errorMessage };
    }
  }

  /**
   * Получение информации о местоположении IP
   */
  static async getIpLocation(ip: string): Promise<{
    countryCode?: string;
    country?: string;
    city?: string;
  }> {
    try {
      const response = await axios.get(`https://ipapi.co/${ip}/json/`, {
        timeout: 3000
      });

      if (response.data && response.data.country_name) {
        return {
          countryCode: response.data.country_code,
          country: response.data.country_name,
          city: response.data.city
        };
      }

      // Если ipapi.co не сработал, попробуем альтернативный API
      const backupResponse = await axios.get(`https://ipinfo.io/${ip}/json`, {
        timeout: 3000
      });

      if (backupResponse.data && backupResponse.data.country) {
        return {
          countryCode: backupResponse.data.country,
          country: backupResponse.data.country,
          city: backupResponse.data.city
        };
      }
    } catch (error) {
      console.error("Error getting IP location:", error);

      // Попытка использовать резервный API при ошибке
      try {
        const backupResponse = await axios.get(`https://ipinfo.io/${ip}/json`, {
          timeout: 3000
        });

        if (backupResponse.data && backupResponse.data.country) {
          return {
            countryCode: backupResponse.data.country,
            country: backupResponse.data.country,
            city: backupResponse.data.city
          };
        }
      } catch (backupError) {
        console.error("Error getting IP location from backup service:", backupError);
      }
    }

    // Возвращаем базовые данные, если не удалось получить информацию
    return {
      country: "Неизвестная страна"
    };
  }

  /**
   * Создать новый прокси
   */
  static async createProxy(
    userId: number,
    host: string,
    port: number,
    protocol: ProxyProtocol,
    options: {
      username?: string;
      password?: string;
      maximumConnections?: number;
      country?: string;
      city?: string;
      countryCode?: string;
      realIp?: string;
      isRotating?: boolean;
      refreshUrl?: string;
    } = {}
  ): Promise<Proxy> {
    // Проверка существования пользователя
    const user = await User.findByPk(userId);
    if (!user) {
      throw new ApiError(404, `Пользователь с ID ${userId} не найден`);
    }

    // Создание прокси
    return await Proxy.create({
      userId,
      host,
      port,
      protocol,
      ...options
    });
  }

  /**
   * Проверить прокси на работоспособность и получить реальный IP
   */
  static async checkProxy(id: number): Promise<{
    isWorking: boolean;
    ip?: string;
    countryCode?: string;
    country?: string;
    city?: string;
    error?: string;
  }> {
    const proxy = await Proxy.findByPk(id);
    if (!proxy) {
      throw new ApiError(404, "Proxy not found");
    }

    const result = await this.pingProxy(
      proxy.host,
      proxy.port,
      proxy.protocol,
      proxy.username,
      proxy.password
    );

    // Если проверка успешна, обновляем информацию о прокси
    if (result.isWorking && result.ip) {
      await proxy.update({
        country: result.country || proxy.country,
        city: result.city || proxy.city,
        countryCode: result.countryCode || proxy.countryCode,
        realIp: result.ip
      });
    }

    return result;
  }

  /**
   * Обновить прокси
   */
  static async updateProxy(id: number, updates: Partial<Proxy>): Promise<Proxy | null> {
    const proxy = await Proxy.findByPk(id);
    if (!proxy) {
      return null;
    }

    try {
      // Особая обработка для maximumConnections
      if ("maximumConnections" in updates) {
        if (updates.maximumConnections === null) {
          // Если явно передан null, используем SQL-запрос для установки NULL в базе данных
          const { maximumConnections, ...otherUpdates } = updates;
          await proxy.update(otherUpdates);

          await proxy.sequelize.query(
            `UPDATE "proxies" SET "maximumConnections" = NULL WHERE id = ?`,
            {
              replacements: [id],
              type: QueryTypes.UPDATE
            }
          );
        } else {
          // Иначе обычное обновление с числовым значением
          await proxy.update(updates);
        }
      } else {
        // Обычное обновление для других полей
        await proxy.update(updates);
      }

      await proxy.reload();
      return proxy;
    } catch (error) {
      console.error("Error updating proxy:", error);
      throw error;
    }
  }

  /**
   * Удалить прокси
   */
  static async deleteProxy(id: number, transaction?: Transaction): Promise<boolean> {
    const proxy = await Proxy.findByPk(id);
    if (!proxy) {
      return false;
    }

    await proxy.destroy({ transaction });
    return true;
  }

  /**
   * Парсинг строки прокси в формате ip:port@login:password
   */
  static parseProxyString(proxyStr: string): {
    host: string;
    port: number;
    username?: string;
    password?: string;
  } | null {
    const formatWithAuth = /^(?:(http|socks4|socks5):\/\/)?([^:@\/]+):(\d+)(?:@([^:@]+):([^:@]+))?$/;
    const formatWithoutAuth = /^(?:(http|socks4|socks5):\/\/)?([^:@\/]+):(\d+)$/;

    let match;

    if ((match = proxyStr.match(formatWithAuth))) {
      return {
        host: match[2],
        port: parseInt(match[3]),
        username: match[4],
        password: match[5]
      };
    } else if ((match = proxyStr.match(formatWithoutAuth))) {
      return {
        host: match[2],
        port: parseInt(match[3])
      };
    }

    const fromBulk = ProxyService.parseBulkProxyLine(proxyStr);
    if (fromBulk) {
      return fromBulk;
    }

    return null;
  }

  public static async peekProxy(userId: number, transaction?: Transaction): Promise<Proxy> {
    const proxy = await Proxy.findOne({
      where: {
        userId,
        isInUse: false,
        id: {
          [Op.notIn]: literal(`(SELECT "proxyId" FROM cookies WHERE "proxyId" IS NOT NULL)`) // Exclude proxies with cookies
        }
      },
      order: [["createdAt", "ASC"]],
      lock: transaction?.LOCK.UPDATE,
      skipLocked: true,
      transaction
    });

    if (!proxy) {
      throw new ApiError(417, "Proxy not found");
    }

    if (proxy.isRotating) {
      proxy.isInUse = true;
      await proxy.save({ transaction });
    } else {
      await proxy.destroy({ transaction });
    }

    return proxy;
  }

  static async restoreProxy(id: number) {
    await Proxy.restore({
      where: {
        id
      }
    });
  }

  static parseBulkProxyLine(line: string): { host: string; port: number; username?: string; password?: string } | null {
    let str = line.trim().replace(/^\uFEFF/, "");
    if (!str) return null;

    // Strip protocol prefix if present
    str = str.replace(/^\w+:\/\//, "");

    // login:pass@host:port
    const authFirst = str.match(/^([^:@]+):([^:@]+)@([^:@]+):(\d+)$/);
    if (authFirst) {
      return { username: authFirst[1], password: authFirst[2], host: authFirst[3], port: Number(authFirst[4]) };
    }

    // host:port@login:pass
    const hostFirst = str.match(/^([^:@]+):(\d+)@([^:@]+):([^:@]+)$/);
    if (hostFirst) {
      return { host: hostFirst[1], port: Number(hostFirst[2]), username: hostFirst[3], password: hostFirst[4] };
    }

    // host:port:login:password — пароль после последнего ':', логин может содержать ':'
    const hostPortTail = str.match(/^([^:]+):(\d+):(.+)$/);
    if (hostPortTail) {
      const port = Number(hostPortTail[2]);
      if (port >= 1 && port <= 65535) {
        const tail = hostPortTail[3];
        const lastColon = tail.lastIndexOf(":");
        if (lastColon > 0) {
          return {
            host: hostPortTail[1],
            port,
            username: tail.slice(0, lastColon),
            password: tail.slice(lastColon + 1)
          };
        }
      }
    }

    // login:pass:host:port (порт только в конце, чтобы не пересечься с host:port:login:pass выше)
    const loginHostPort = str.match(/^([^:]+):([^:]+):([^:]+):(\d+)$/);
    if (loginHostPort) {
      return {
        username: loginHostPort[1],
        password: loginHostPort[2],
        host: loginHostPort[3],
        port: Number(loginHostPort[4])
      };
    }

    // host:port (no auth)
    const noAuth = str.match(/^([^:@]+):(\d+)$/);
    if (noAuth) {
      return { host: noAuth[1], port: Number(noAuth[2]) };
    }

    return null;
  }

  public static async bulkSaveProxiesFromFiles(
    filePaths: string[],
    userId: number,
    protocol: ProxyProtocol = ProxyProtocol.HTTP,
    options?: { isRotating?: boolean; refreshUrl?: string }
  ): Promise<{ created: number; skipped: number; errors: string[] }> {
    const rows: Array<{
      userId: number; host: string; port: number; protocol: ProxyProtocol;
      username?: string; password?: string; isRotating?: boolean; refreshUrl?: string;
    }> = [];
    const errors: string[] = [];
    let skipped = 0;
    const seen = new Set<string>();

    for (const filePath of filePaths) {
      const content = await fs.readFile(filePath, "utf8");
      const lines = content.split(/\r?\n/);

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const parsed = this.parseBulkProxyLine(trimmed);
        if (!parsed) {
          errors.push(trimmed);
          continue;
        }

        const key = `${parsed.host}:${parsed.port}`;
        if (seen.has(key)) { skipped++; continue; }
        seen.add(key);

        rows.push({
          userId,
          host: parsed.host,
          port: parsed.port,
          protocol,
          username: parsed.username,
          password: parsed.password,
          isRotating: options?.isRotating,
          refreshUrl: options?.refreshUrl,
        });
      }
    }

    if (rows.length === 0) return { created: 0, skipped, errors };

    const BATCH = 500;
    let created = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const result = await Proxy.bulkCreate(chunk, { ignoreDuplicates: true });
      created += result.length;
    }

    return { created, skipped, errors };
  }

  public static async saveProxiesFromFile(
    filePath: string,
    userId: number,
    name: string,
    options?: { defaultProtocol?: ProxyProtocol }
  ): Promise<Proxy[]> {
    const content = await fs.readFile(filePath, "utf8");
    const lines = content.split(/\r?\n/).map(line => line.trim().replace(/^\uFEFF/, "")).filter(line => line.length > 0);
    const createdProxies: Proxy[] = [];
    const defaultProtocol = options?.defaultProtocol ?? ProxyProtocol.HTTP;

    const results = await Promise.allSettled(lines.map(async (proxyString) => {
      let protocol: ProxyProtocol = defaultProtocol;
      let body = proxyString;

      const protocolMatch = proxyString.match(/^(\w+):\/\//);
      if (protocolMatch) {
        const p = protocolMatch[1].toLowerCase();
        if (!Object.values(ProxyProtocol).includes(p as ProxyProtocol)) {
          throw new Error(`Invalid protocol in proxy string: ${p}`);
        }
        protocol = p as ProxyProtocol;
        body = proxyString.replace(/^\w+:\/\//, "");
      }

      const parsedProxy = ProxyService.parseBulkProxyLine(body);
      if (!parsedProxy) {
        throw new Error(`Invalid proxy string format: ${proxyString}`);
      }

      const { host, port, username, password } = parsedProxy;
      const proxyCheck = await ProxyService.pingProxy(host, port, protocol as ProxyProtocol, username, password);
      if (!proxyCheck.isWorking) {
        throw new Error(proxyCheck.error || `Proxy not working: ${proxyString}`);
      }

      return ProxyService.createProxy(userId, host, port, protocol as ProxyProtocol, {
        username,
        password,
        country: proxyCheck.country,
        city: proxyCheck.city,
        countryCode: proxyCheck.countryCode,
        realIp: proxyCheck.ip
      });
    }));

    results.forEach(result => {
      if (result.status === "fulfilled") {
        createdProxies.push(result.value);
      } else {
        logger.error(`Error creating proxy: ${result.reason}`);
      }
    });

    return createdProxies;
  }
}
