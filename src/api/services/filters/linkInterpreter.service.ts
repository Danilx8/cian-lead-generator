import { UrlFilters } from "./types";
import {
  BuildingType,
  DealType,
  MarketType,
  PropertyType,
  RenovationType,
  SellerType
} from "../../../database/filter.model";

const DEAL_TYPE_PATH: Record<DealType, string> = {
  [DealType.BUY]: "prodam",
  [DealType.RENT_LONG]: "sdam/na_dlitelnyy_srok",
  [DealType.RENT_DAILY]: "sdam/posutochno",
};

const PATH_TO_DEAL_TYPE: Record<string, DealType> = {
  prodam: DealType.BUY,
  "sdam/na_dlitelnyy_srok": DealType.RENT_LONG,
  "sdam/posutochno": DealType.RENT_DAILY,
};

const PROPERTY_TYPE_PATH: Record<PropertyType, string> = {
  [PropertyType.APARTMENT]: "kvartiry",
  [PropertyType.ROOM]: "komnaty",
  [PropertyType.HOUSE]: "doma_dachi_kottedzhi",
  [PropertyType.LAND]: "zemelnye_uchastki",
  [PropertyType.COMMERCIAL]: "kommercheskaya_nedvizhimost",
  [PropertyType.GARAGE]: "garazhi_i_mashinomesta",
};

const PATH_TO_PROPERTY_TYPE: Record<string, PropertyType> = Object.fromEntries(
  Object.entries(PROPERTY_TYPE_PATH).map(([k, v]) => [v, k as PropertyType])
);

const MARKET_TYPE_PATH: Record<string, string> = {
  [MarketType.SECONDARY]: "vtorichka",
  [MarketType.NEW_BUILD]: "novostroyka",
};

const PATH_TO_MARKET_TYPE: Record<string, MarketType> = {
  vtorichka: MarketType.SECONDARY,
  novostroyka: MarketType.NEW_BUILD,
};

class LinkInterpreterService {
  private readonly baseUrl = "https://www.cian.ru";

  async parseUrl(url: string): Promise<UrlFilters> {
    const filters: UrlFilters = {};

    const urlObj = new URL(url);
    const pathSegments = urlObj.pathname.split("/").filter(Boolean);

    if (pathSegments.length < 1) {
      throw new Error("Invalid Cian URL format");
    }

    let idx = 0;

    // First segment: location (e.g. "moskva", "sankt-peterburg", "all")
    if (pathSegments[idx] && !PATH_TO_PROPERTY_TYPE[pathSegments[idx]]) {
      const locationSlug = pathSegments[idx];
      if (locationSlug !== "all") {
        filters.location = locationSlug;
      }
      idx++;
    }

    // Next: property type (kvartiry, komnaty, etc.)
    if (idx < pathSegments.length && PATH_TO_PROPERTY_TYPE[pathSegments[idx]]) {
      filters.propertyType = PATH_TO_PROPERTY_TYPE[pathSegments[idx]];
      idx++;
    }

    // Deal type + market type segments
    if (idx < pathSegments.length) {
      const remaining = pathSegments.slice(idx).join("/");
      for (const [path, dealType] of Object.entries(PATH_TO_DEAL_TYPE)) {
        if (remaining.startsWith(path)) {
          filters.dealType = dealType;
          idx += path.split("/").length;
          break;
        }
      }
    }

    // Market type (vtorichka, novostroyka) — comes after deal type
    if (idx < pathSegments.length && PATH_TO_MARKET_TYPE[pathSegments[idx]]) {
      filters.marketType = PATH_TO_MARKET_TYPE[pathSegments[idx]];
      idx++;
    }

    // Query parameters
    const params = urlObj.searchParams;
    if (params.get("pmin")) filters.priceMin = Number(params.get("pmin"));
    if (params.get("pmax")) filters.priceMax = Number(params.get("pmax"));

    return filters;
  }

  async buildUrl(filters: UrlFilters): Promise<string> {
    const parts: string[] = [];

    parts.push(filters.location ?? "all");

    if (filters.propertyType) {
      parts.push(PROPERTY_TYPE_PATH[filters.propertyType]);
    } else {
      parts.push("kvartiry");
    }

    if (filters.dealType) {
      parts.push(DEAL_TYPE_PATH[filters.dealType]);
    }

    if (filters.marketType && filters.marketType !== MarketType.ANY) {
      const marketPath = MARKET_TYPE_PATH[filters.marketType];
      if (marketPath) parts.push(marketPath);
    }

    const queryParams = new URLSearchParams();

    if (filters.priceMin !== undefined) queryParams.set("pmin", String(filters.priceMin));
    if (filters.priceMax !== undefined) queryParams.set("pmax", String(filters.priceMax));

    const path = `${this.baseUrl}/${parts.join("/")}`;
    const qs = queryParams.toString();
    return qs ? `${path}?${qs}` : path;
  }

  async describeFilters(filters: UrlFilters): Promise<string> {
    const lines: string[] = [];

    if (filters.location) lines.push(`Локация: ${filters.location}`);
    if (filters.propertyType) lines.push(`Тип: ${this.propertyTypeLabel(filters.propertyType)}`);
    if (filters.dealType) lines.push(`Сделка: ${this.dealTypeLabel(filters.dealType)}`);
    if (filters.marketType && filters.marketType !== MarketType.ANY) {
      lines.push(`Рынок: ${filters.marketType === MarketType.SECONDARY ? "Вторичка" : "Новостройка"}`);
    }
    if (filters.rooms?.length) lines.push(`Комнат: ${filters.rooms.join(", ")}`);
    if (filters.priceMin !== undefined || filters.priceMax !== undefined) {
      const min = filters.priceMin !== undefined ? `${filters.priceMin}₽` : "от начала";
      const max = filters.priceMax !== undefined ? `${filters.priceMax}₽` : "без ограничения";
      lines.push(`Цена: ${min} — ${max}`);
    }
    if (filters.areaMin !== undefined || filters.areaMax !== undefined) {
      const min = filters.areaMin !== undefined ? `${filters.areaMin}` : "—";
      const max = filters.areaMax !== undefined ? `${filters.areaMax}` : "—";
      lines.push(`Площадь: ${min}–${max} м²`);
    }
    if (filters.floorMin !== undefined || filters.floorMax !== undefined) {
      const min = filters.floorMin ?? "—";
      const max = filters.floorMax ?? "—";
      lines.push(`Этаж: ${min}–${max}`);
    }
    if (filters.buildingType && filters.buildingType !== BuildingType.ANY) {
      lines.push(`Дом: ${this.buildingTypeLabel(filters.buildingType)}`);
    }
    if (filters.renovationType && filters.renovationType !== RenovationType.ANY) {
      lines.push(`Ремонт: ${this.renovationLabel(filters.renovationType)}`);
    }
    if (filters.sellerType && filters.sellerType !== SellerType.ANY) {
      lines.push(`Продавец: ${this.sellerLabel(filters.sellerType)}`);
    }
    if (filters.notFirstFloor) lines.push("Не первый этаж");
    if (filters.notLastFloor) lines.push("Не последний этаж");
    if (filters.withPhotos) lines.push("Только с фото");
    if (filters.hasMortgage) lines.push("Возможна ипотека");

    return lines.join("\n");
  }

  private propertyTypeLabel(pt: PropertyType): string {
    const map: Record<PropertyType, string> = {
      [PropertyType.APARTMENT]: "Квартира",
      [PropertyType.ROOM]: "Комната",
      [PropertyType.HOUSE]: "Дом / Дача / Коттедж",
      [PropertyType.LAND]: "Земельный участок",
      [PropertyType.COMMERCIAL]: "Коммерческая недвижимость",
      [PropertyType.GARAGE]: "Гараж / Машиноместо",
    };
    return map[pt] ?? pt;
  }

  private dealTypeLabel(dt: DealType): string {
    const map: Record<DealType, string> = {
      [DealType.BUY]: "Покупка",
      [DealType.RENT_LONG]: "Аренда (долгосрочная)",
      [DealType.RENT_DAILY]: "Аренда (посуточная)",
    };
    return map[dt] ?? dt;
  }

  private buildingTypeLabel(bt: BuildingType): string {
    const map: Record<BuildingType, string> = {
      [BuildingType.BRICK]: "Кирпичный",
      [BuildingType.PANEL]: "Панельный",
      [BuildingType.MONOLITH]: "Монолитный",
      [BuildingType.BLOCK]: "Блочный",
      [BuildingType.WOOD]: "Деревянный",
      [BuildingType.ANY]: "Любой",
    };
    return map[bt] ?? bt;
  }

  private renovationLabel(rt: RenovationType): string {
    const map: Record<RenovationType, string> = {
      [RenovationType.DESIGNER]: "Дизайнерский",
      [RenovationType.EURO]: "Евроремонт",
      [RenovationType.COSMETIC]: "Косметический",
      [RenovationType.NEEDS_RENOVATION]: "Требуется ремонт",
      [RenovationType.ANY]: "Любой",
    };
    return map[rt] ?? rt;
  }

  private sellerLabel(st: SellerType): string {
    const map: Record<SellerType, string> = {
      [SellerType.OWNER]: "Собственник",
      [SellerType.AGENT]: "Агент",
      [SellerType.DEVELOPER]: "Застройщик",
      [SellerType.ANY]: "Любой",
    };
    return map[st] ?? st;
  }
}

export default new LinkInterpreterService();
