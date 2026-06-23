import axios, { AxiosRequestConfig } from "axios";
import { Readable, Writable } from "stream";
import { pipeline } from "stream/promises";
import { Parser } from "htmlparser2";
import { AuthorsDatabase } from "./authors.database";
import { logger } from "../../../config";
import { SocksProxyAgent } from "socks-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import { AngebotOption } from "./parsing.types";
import type { ItemDto, PlainFilter } from "./parsing.types";
import { normalizeProxyUrlForHttpAgent } from "./proxyUrl.util";

interface ParseResult {
  description: string;
  activeSince: string;
  adImageUrl: string;
  viewAdCounterUrl: string;
  sellerId: string;
  contactName: string;
  isMakingOfferPossible: boolean;
  deliveryPrice: number | null;
  adsAmount: number | null;
  containsBadges: boolean;
  isSecurePaymentOn: boolean;
}

function buildProxyAgent(raw?: string): any {
  const url = normalizeProxyUrlForHttpAgent(raw);
  if (!url) return undefined;
  return url.startsWith("socks") ? new SocksProxyAgent(url) : new HttpsProxyAgent(url);
}

export class VerifyService {
  private readonly agent: any;

  constructor(proxy?: string) {
    this.agent = buildProxyAgent(proxy);
  }

  public async extractMerchantIfCorrect(item: ItemDto, filter: PlainFilter, db: AuthorsDatabase, angebotOption: AngebotOption) {
    const parseUrl = "https://www.cian.de/s-anzeige/" + item.item_id;

    const config: AxiosRequestConfig<any> = {
      timeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Accept": "text/html"
      },
      ...(this.agent ? { httpsAgent: this.agent, httpAgent: this.agent } : {})
    };

    const response = await axios.get(parseUrl, config);
    const result = await this.parse(response.data, filter);

    // Учитываем и заголовок объявления при фильтрации по описанию
    result.description = `${item.item_name ?? ""} ${result.description ?? ""}`.trim();

    if (!await this.verifyNewAuthor(result, db)) return null;

    // Если значки есть, то не прошёл
    // if (!filter.includeOldMerchants && result.containsBadges) return null;

    // Если включена безопасная оплата, то не прошёл
    // if (!filter.includeSicherMerchants && result.isSecurePaymentOn) return null;

    const hasVersandJa = ((filter.searchLink || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean)
      .some(l => l.includes("versand:ja")))
    if (hasVersandJa) {
      if (result.deliveryPrice === null || result.deliveryPrice === 0) return null;
    }

    if (angebotOption !== AngebotOption.NONE) {
      if (!this.verifyAngebotAvailable(result)) return null;
    }

    if (!this.verifyActiveSinceDate(result, filter)) return null;

    if (filter.views != null) {
      if (!await this.verifyNumVisits(result, filter, config)) return null;
    }

    if (filter.adsLimit) {
      if (!await this.verifyAdsLimit(result, filter)) return null;
    }

    if (filter.blackList?.length && filter.blackList?.length > 0 ||
      filter.whiteList?.length && filter.whiteList?.length > 0) {
      if (!this.verifyDescription(result, filter)) return null;
    }

    if (result.description.toLowerCase().includes("abhol")) return null;
    if (result.deliveryPrice === null || result.deliveryPrice === 0) return null;
    db.addToBlacklist(result.sellerId);

    if (result.contactName == "") result.contactName = await this.queryContactName(result.sellerId, config);

    return {
      sellerId: result.sellerId,
      contactName: result.contactName,
      activeSince: result.activeSince,
      adImageUrl: result.adImageUrl,
      deliveryPrice: result.deliveryPrice
    };
  }

  private createParseStream(_filter: PlainFilter): { stream: Writable; getResult: () => ParseResult } {
    let description = "";
    let activeSince = "";
    let adImageUrl = "";
    let viewAdCounterUrl = "";
    let sellerId = "";
    let sellerName = "";
    let isMakingOfferPossible = false;
    let deliveryPrice: number | null = null;
    let adsAmount: number | null = null;
    let containsBadges: boolean = false;
    let isSecurePaymentOn: boolean = false;

    let inDescription = false;
    let descriptionBuffer = "";
    let inSpan = false;
    let spanBuffer = "";
    let inScript = false;
    let scriptBuffer = "";
    let inProfileName = false;
    let profileNameBuffer = "";
    let inVersand = false;
    let versandBuffer = "";
    let inAnzeigenOnline = false;
    let anzeigenOnlineBuffer = "";

    const parseActiveSinceFromText = (text: string): void => {
      const trimmed = text.trim();
      if (!trimmed.includes("Aktiv seit")) return;

      const match = trimmed.match(/Aktiv seit\s+(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
      if (match) {
        let year = Number(match[3]);
        if (year < 100) {
          year += 2000;
        }
        const day = match[1].padStart(2, "0");
        const month = match[2].padStart(2, "0");
        activeSince = `${day}-${month}-${year}`;
      } else {
        logger.info(`[verify.parse] Не распознали дату "Aktiv seit" из текста: "${trimmed}"`);
      }
    };

    const parser = new Parser({
      onopentag(name, attribs) {
        if (name === "p" && attribs.id === "viewad-description-text") {
          inDescription = true;
        }
        if (name === "span" && attribs.class === "userprofile-vip-details-text") {
          inSpan = true;
        }
        if (name === "span" && attribs.class === "boxedarticle--details--shipping") {
          inVersand = true;
        }
        if (name === "script") {
          inScript = true;
        }
        if (name === "title") {
          inProfileName = true;
        }
        if (name === "a" && attribs.id === "poster-other-ads-link") {
          inAnzeigenOnline = true;
        }
        if (attribs.class === "profile-userbadges") {
          containsBadges = true;
        }
        if (attribs.class === "viewad-secure-payment-badge") {
          isSecurePaymentOn = true;
        }
      },
      ontext(text) {
        if (inDescription) {
          descriptionBuffer += text;
        }
        if (inSpan) {
          spanBuffer += text;
        }
        if (inScript) {
          scriptBuffer += text;
        }
        if (inProfileName) {
          profileNameBuffer += text;
        }
        if (inVersand) {
          versandBuffer += text;
        }
        if (inAnzeigenOnline) {
          anzeigenOnlineBuffer += text;
        }

        // Дату регистрации продавца ищем по тексту "Aktiv seit" глобально по странице,
        // не завязываясь жёстко на конкретный тег/класс.
        if (!activeSince && text.includes("Aktiv seit")) {
          parseActiveSinceFromText(text);
        }
      },
      onclosetag(name) {
        if (name === "p" && inDescription) {
          description = descriptionBuffer.trim();
          inDescription = false;
          descriptionBuffer = "";
        }
        if (name === "span" && inSpan) {
          inSpan = false;
          spanBuffer = "";
        }
        if (name === "span" && inVersand) {
          const text = versandBuffer.trim();
          const versandMatch = text.match(/Versand ab (\d+,\d+)/);
          if (versandMatch) {
            deliveryPrice = parseFloat(versandMatch[1].replace(",", "."));
          } else if (text.length > 0) {
            deliveryPrice = null;
            logger.info(`[verify.parse] Не распознали цену доставки из текста: "${text}"`);
          } else {
            deliveryPrice = null;
          }
          inVersand = false;
          versandBuffer = "";
        }
        if (name === "a" && inAnzeigenOnline) {
          const text = anzeigenOnlineBuffer.trim();
          const match = text.match(/(\d+)\s+Anzeigen online/);
          if (match) {
            adsAmount = Number(match[1] ?? 0);
          } else if (text.length > 0) {
            adsAmount = null;
            logger.info(`[verify.parse] Не распознали количество объявлений продавца из текста: "${text}"`);
          } else {
            adsAmount = null;
          }
          inAnzeigenOnline = false;
          anzeigenOnlineBuffer = "";
        }
        if (name === "script" && inScript) {
          if (scriptBuffer?.includes("viewAdCounterUrl")) {
            const urlMatch = scriptBuffer.match(/viewAdCounterUrl\s*[:=]\s*['"]([^'"]+)['"]/);
            if (urlMatch) {
              viewAdCounterUrl = urlMatch[1];
            } else {
              logger.info("[verify.parse] Не удалось найти viewAdCounterUrl в скрипте объявления");
            }
            const imageMatch = scriptBuffer.match(/adImageUrl:\s*true\s*\?\s*['"]([^'"]+)['"]/);
            if (imageMatch) {
              adImageUrl = imageMatch[1];
            }
          }

          if (scriptBuffer?.includes("sellerId")) {
            const idMatch = scriptBuffer.match(/sellerId:\s*"([^"]+)"/);
            if (idMatch) {
              sellerId = idMatch[1];
            } else {
              logger.info("[verify.parse] Не удалось извлечь sellerId из скрипта объявления");
            }
            const nameMatch = scriptBuffer.match(/contactName:\s*"([^"]+)"/);
            if (nameMatch) {
              sellerName = nameMatch[1];
            }
          }

          if (scriptBuffer?.includes("isOfferEnabled")) {
            const buyNowMatch = scriptBuffer.match(/isBuyNowEnabled:\s*(true|false)/);
            let buyNow = false;
            if (buyNowMatch) {
              buyNow = buyNowMatch[1] === "true";
            }

            if (!buyNow) {
              const offerMatch = scriptBuffer.match(/isOfferEnabled:\s*(true|false)/);
              if (offerMatch) {
                isMakingOfferPossible = offerMatch[1] === "true";
              }
            }
          }

          inScript = false;
          scriptBuffer = "";
        }
        if (inProfileName && profileNameBuffer?.includes("Profil von") && sellerName === "") {
          const text = profileNameBuffer.trim();
          const match = text.match(/Alle Anzeigen von (.*) \| Cian/);
          if (match) {
            sellerName = match[1];
          }
        }
      }
    }, { decodeEntities: true });

    const stream = new Writable({
      write(chunk, encoding, callback) {
        parser.write(chunk.toString());
        callback();
      },
      final(callback) {
        parser.end();
        callback();
      }
    });

    return {
      stream,
      getResult: (): ParseResult => ({
        description,
        activeSince,
        adImageUrl,
        viewAdCounterUrl,
        sellerId,
        contactName: sellerName,
        isMakingOfferPossible,
        deliveryPrice,
        adsAmount,
        containsBadges,
        isSecurePaymentOn
      })
    };
  }

  private async parse(html: string, filter: PlainFilter): Promise<ParseResult> {
    const htmlStream = Readable.from([html]);
    const { stream: parseStream, getResult } = this.createParseStream(filter);
    await pipeline(htmlStream, parseStream);
    return getResult();
  }

  private verifyDescription(result: ParseResult, filter: PlainFilter): boolean {
    const description = result.description.toLowerCase();

    if (filter.blackList && filter.blackList.length > 0) {
      for (const restricted of filter.blackList) {
        if (description.includes(restricted.toLowerCase())) {
          return false;
        }
      }
    }

    if (filter.whiteList && filter.whiteList.length > 0) {
      for (const desired of filter.whiteList) {
        if (description.includes(desired.toLowerCase())) {
          return true;
        }
      }
      return false;
    }

    if (description.toLowerCase().includes("abhol")) {
      return false;
    }
    return true;
  }

  private verifyActiveSinceDate(result: ParseResult, filter: PlainFilter): boolean {
    if (!result.activeSince || !result.activeSince.length) {
      logger.info("[verify.date] activeSince пустая — не фильтруем по дате регистрации продавца");
      return true;
    }

    // result.activeSince всегда в формате DD-MM-YYYY
    const [d, m, y] = result.activeSince.split("-").map(Number);
    const date = new Date(y, m - 1, d);

    if (isNaN(date.getTime())) {
      logger.info(`[verify.date] Некорректная дата activeSince="${result.activeSince}" — пропускаем фильтр по дате`);
      return true;
    }

    // Проверяем минимальную дату (продавец должен быть не раньше minDate)
    if (filter.minDateRegistered) {
      // В БД фильтры хранятся в формате YYYY-MM-DD
      const minDate = new Date(filter.minDateRegistered);
      if (date < minDate) {
        logger.info(`[verify.date] Отклонено по minDateRegistered=${filter.minDateRegistered}, activeSince=${result.activeSince}`);
        return false;
      }
    }
  
    // Проверяем максимальную дату (продавец должен быть не позже maxDate)
    if (filter.maxDateRegistered) {
      const maxDate = new Date(filter.maxDateRegistered);
      if (date > maxDate) {
        logger.info(`[verify.date] Отклонено по maxDateRegistered=${filter.maxDateRegistered}, activeSince=${result.activeSince}`);
        return false;
      }
    }
  
    return true;
  }

  private verifyAngebotAvailable(result: ParseResult): boolean {
    if (!result.isMakingOfferPossible) return false;
    return result.isMakingOfferPossible;
  }

  private async verifyNumVisits(result: ParseResult, filter: PlainFilter, config: AxiosRequestConfig): Promise<boolean> {
    if (filter.views == null) return true;
    if (!result.viewAdCounterUrl) {
      logger.info("[verify.views] viewAdCounterUrl отсутствует — пропускаем фильтр по просмотрам");
      return true;
    }
    try {
      const response = await axios.get(result.viewAdCounterUrl, config);
      const data = response.data;
      const visits = Number((data && (data.numVisits ?? data.numVisitsTotal ?? data.views)) ?? NaN);
      if (!Number.isFinite(visits)) {
        logger.info("[verify.views] Не удалось корректно распарсить количество просмотров из ответа счётчика");
        return true;
      }
      const passed = visits <= filter.views;
      if (!passed) {
        logger.info(`[verify.views] Отклонено по лимиту просмотров: visits=${visits}, limit=${filter.views}`);
      } else {
        logger.info(`[verify.views] Принято по лимиту просмотров: visits=${visits}, limit=${filter.views}`);
      }
      return passed;
    } catch (e) {
      logger.info(`[verify.views] Ошибка при запросе счётчика просмотров: ${(e as Error).message}`);
      return true;
    }
  }

  private async verifyNewAuthor(result: ParseResult, db: AuthorsDatabase): Promise<boolean> {
    if (!result.sellerId) return false;
    return !db.isInBlacklist(result.sellerId);
  }

  private async verifyAdsLimit(result: ParseResult, filter: PlainFilter): Promise<boolean> {
    if (!result.adsAmount || !filter.adsLimit) return true;
    return result.adsAmount <= filter.adsLimit;
  }

  private async queryContactName(sellerId: string, config: AxiosRequestConfig): Promise<string> {
    try {
      const url = "https://www.cian.de/s-bestandsliste.html?userId=" + sellerId;
      const response = await axios.get(url, config);
      const result = await this.parse(response.data, {} as PlainFilter);
      if (result.contactName == "") {
        return "Безымянный мамонт";
      }
      return result.contactName;
    } catch (error) {
      logger.error(error);
      return "Безымянный мамонт";
    }
  }
}