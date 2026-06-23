// parser.piscina-worker.ts
import axios from "axios";
import { SocksProxyAgent } from "socks-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import { AuthorsDatabase } from "./authors.database";
import { VerifyService } from "./verify.service";
import { normalizeProxyUrlForHttpAgent } from "./proxyUrl.util";
import { logger } from "../../../config";
import { AngebotOption } from "./parsing.types";
import type { ItemDto, MerchantDto } from "./parsing.types";
export type { ItemDto, MerchantDto };

// ── Constants ──────────────────────────────────────────────────────────────────

const CIAN_API_SEARCH = "https://api.cian.ru/search-offers/v2/search-offers-desktop/";

/**
 * Known cian.ru region IDs for major Russian cities/regions.
 * Used when parsing friendly-format search URLs (e.g. /moskva/kvartiry/prodam).
 * If the slug is not found here, regionId from scrapeTask payload is used,
 * falling back to Moscow (1).
 */
const SLUG_TO_REGION_ID: Record<string, number> = {
  moskva: 1,
  moscow: 1,
  "moskovskaya-oblast": 4593,
  spb: 2,
  "saint-peterburg": 2,
  "saint-petersburg": 2,
  "sankt-peterburg": 2,
  "leningradskaya-oblast": 4600,
  novosibirsk: 4897,
  "novosibirskaya-oblast": 4598,
  ekaterinburg: 4743,
  "sverdlovskaya-oblast": 4906,
  kazan: 4777,
  "tatarstan": 4896,
  "nizhny-novgorod": 4792,
  "nizhniy-novgorod": 4792,
  "nizhegorodskaya-oblast": 4801,
  chelyabinsk: 4672,
  "chelyabinskaya-oblast": 4673,
  krasnodar: 4827,
  "krasnodarskiy-kray": 4863,
  samara: 4890,
  "samarskaya-oblast": 4891,
  ufa: 4966,
  "bashkortostan": 4649,
  "rostov-na-donu": 4957,
  rostov: 4957,
  "rostovskaya-oblast": 4866,
  perm: 4822,
  "permskiy-kray": 4823,
  voronezh: 4971,
  "voronezhskaya-oblast": 4972,
  omsk: 4812,
  "omskaya-oblast": 4813,
  krasnoyarsk: 4826,
  "krasnoyarskiy-kray": 4825,
  tyumen: 4963,
  "tyumenskaya-oblast": 4964,
  volgograd: 4967,
  "volgogradskaya-oblast": 4968,
  irkutsk: 4771,
  "irkutskaya-oblast": 4772,
  saratov: 4895,
  "saratovskaya-oblast": 4894,
  tomsk: 4960,
  "tomskaya-oblast": 4961,
  vladivostok: 4968,
  khabarovsk: 4685,
};

/** URL path segment → property offer type for API */
const PATH_SEGMENT_TO_OFFER_TYPE: Record<string, string> = {
  kvartiry: "flat",
  komnaty: "room",
  doma_dachi_kottedzhi: "house",
  zemelnye_uchastki: "land",
  kommercheskaya_nedvizhimost: "commercial",
  garazhi_i_mashinomesta: "garage",
};

/** URL path segment → deal type */
const PATH_SEGMENT_TO_DEAL_TYPE: Record<string, "sale" | "rent" | "rent_daily"> = {
  prodam: "sale",
  kupit: "sale",
  "sdam/na_dlitelnyy_srok": "rent",
  sdam: "rent",
  "sdam/posutochno": "rent_daily",
};

/**
 * Maps (offerType, dealType) → cian.ru API _type string.
 * See: https://api.cian.ru/search-offers/v2/search-offers-desktop/
 */
function buildApiType(offerType: string, dealType: "sale" | "rent" | "rent_daily"): string {
  const isSale = dealType === "sale";
  switch (offerType) {
    case "flat":       return isSale ? "flatsale"       : "flatrent";
    case "room":       return isSale ? "roomsale"       : "roomrent";
    case "house":      return isSale ? "suburbansale"   : "suburbanrent";
    case "land":       return isSale ? "suburbansale"   : "suburbanrent";
    case "commercial": return isSale ? "commercialsale" : "commercialrent";
    case "garage":     return isSale ? "garagesale"     : "garagerent";
    default:           return isSale ? "flatsale"       : "flatrent";
  }
}

// ── Proxy helpers ──────────────────────────────────────────────────────────────

function buildProxyUrl(raw?: string): string | undefined {
  return normalizeProxyUrlForHttpAgent(raw);
}

function buildAxiosAgents(proxy?: string): { httpsAgent?: any; httpAgent?: any } {
  const proxyUrl = buildProxyUrl(proxy);
  if (!proxyUrl) return {};
  const agent = proxyUrl.startsWith("socks")
    ? new SocksProxyAgent(proxyUrl)
    : new HttpsProxyAgent(proxyUrl);
  return { httpsAgent: agent, httpAgent: agent };
}

// ── URL parsing ────────────────────────────────────────────────────────────────

interface ParsedSearchParams {
  apiType: string;
  regionId: number;
  page: number;
  isDailyRent: boolean;
  rooms?: number[];
  priceMin?: number;
  priceMax?: number;
  byOwnerOnly?: boolean;
}

/** Parse cat.php-style URL: /cat.php?deal_type=sale&offer_type=flat&region=1&p=2 */
function parseCatPhpUrl(u: URL): ParsedSearchParams {
  const dealTypeRaw = u.searchParams.get("deal_type") ?? "sale";
  const offerType   = u.searchParams.get("offer_type") ?? "flat";
  const regionId    = Number(u.searchParams.get("region") ?? "1") || 1;
  const page        = Number(u.searchParams.get("p") ?? "1") || 1;
  const forDay      = u.searchParams.get("for_day") === "1";

  const dealType: "sale" | "rent" | "rent_daily" =
    dealTypeRaw === "rent" ? (forDay ? "rent_daily" : "rent") : "sale";

  // Rooms: room1=1, room2=1, etc. in cat.php format
  const rooms: number[] = [];
  for (let r = 1; r <= 9; r++) {
    if (u.searchParams.get(`room${r}`) === "1") rooms.push(r);
  }

  return {
    apiType:     buildApiType(offerType, dealType),
    regionId,
    page,
    isDailyRent: forDay,
    rooms:       rooms.length ? rooms : undefined,
    priceMin:    u.searchParams.has("pmin") ? Number(u.searchParams.get("pmin")) : undefined,
    priceMax:    u.searchParams.has("pmax") ? Number(u.searchParams.get("pmax")) : undefined,
  };
}

/** Parse friendly-style URL: /moskva/kvartiry/prodam?p=2&pmin=5000000 */
function parseFriendlyUrl(u: URL, regionIdHint?: number): ParsedSearchParams {
  const segs = u.pathname.split("/").filter(Boolean);

  // Segment 0: location slug
  const locationSlug = segs[0] ?? "moskva";
  const regionId = regionIdHint ?? SLUG_TO_REGION_ID[locationSlug] ?? 1;

  // Segment 1: property type
  const propSegment = segs[1] ?? "kvartiry";
  const offerType = PATH_SEGMENT_TO_OFFER_TYPE[propSegment] ?? "flat";

  // Remaining segments joined: deal type (may be multi-segment like "sdam/na_dlitelnyy_srok")
  const remaining = segs.slice(2).join("/");
  let dealType: "sale" | "rent" | "rent_daily" = "sale";
  // Try longest match first
  for (const [path, dt] of Object.entries(PATH_SEGMENT_TO_DEAL_TYPE).sort((a, b) => b[0].length - a[0].length)) {
    if (remaining.startsWith(path)) {
      dealType = dt;
      break;
    }
  }

  const page = Number(u.searchParams.get("p") ?? "1") || 1;

  return {
    apiType:     buildApiType(offerType, dealType),
    regionId,
    page,
    isDailyRent: dealType === "rent_daily",
    priceMin:    u.searchParams.has("pmin") ? Number(u.searchParams.get("pmin")) : undefined,
    priceMax:    u.searchParams.has("pmax") ? Number(u.searchParams.get("pmax")) : undefined,
  };
}

function parseSearchUrl(rawUrl: string, regionIdHint?: number): ParsedSearchParams {
  try {
    const u = new URL(rawUrl);
    if (u.pathname === "/cat.php" || u.pathname.startsWith("/cat.php")) {
      return parseCatPhpUrl(u);
    }
    return parseFriendlyUrl(u, regionIdHint);
  } catch {
    logger.warn(`[cian-scraper] Could not parse URL: ${rawUrl}, using Moscow defaults`);
    return { apiType: "flatsale", regionId: regionIdHint ?? 1, page: 1, isDailyRent: false };
  }
}

// ── API types ──────────────────────────────────────────────────────────────────

interface CianApiOffer {
  id: number;
  category?: string;
  dealType?: string;
  offerType?: string;
  title?: string | null;
  formattedCardInfo?: string;
  formattedFullInfo?: string;
  formattedShortInfo?: string;
  formattedShortPrice?: string;
  formattedFullPrice?: string;
  isByHomeowner?: boolean;
  isPro?: boolean;
  isFromDeveloper?: boolean | null;
  userId?: number;
  siteUrl?: string;
  geo?: {
    address?: Array<{
      fullName?: string;
      name?: string;
      isFormingAddress?: boolean;
      locationTypeId?: number | null;
      type?: string;
    }>;
    userInput?: string;
  };
  photos?: Array<{ small?: string; full?: string }>;
}

interface CianApiResponse {
  items?: Array<{ type?: string; offer?: CianApiOffer }>;
  isPaginationEnd?: boolean;
  totalCount?: number;
  itemsCount?: number;
}

// ── API call ───────────────────────────────────────────────────────────────────

async function callCianSearchApi(
  params: ParsedSearchParams,
  proxy?: string,
): Promise<CianApiOffer[]> {
  const agents = buildAxiosAgents(proxy);

  // Build jsonQuery
  const jsonQuery: Record<string, any> = {
    _type:          params.apiType,
    engine_version: { type: "term",  value: 2 },
    region:         { type: "terms", value: [params.regionId] },
    page:           { type: "term",  value: params.page },
  };

  if (params.isDailyRent) {
    jsonQuery.for_day = { type: "term", value: "1" };
  }
  if (params.rooms?.length) {
    jsonQuery.room = { type: "terms", value: params.rooms };
  }
  if (params.priceMin != null || params.priceMax != null) {
    const rangeVal: Record<string, number> = {};
    if (params.priceMin != null) rangeVal.gte = params.priceMin;
    if (params.priceMax != null) rangeVal.lte = params.priceMax;
    jsonQuery.price = { type: "range", value: rangeVal };
  }
  if (params.byOwnerOnly) {
    jsonQuery.is_by_homeowner = { type: "term", value: true };
  }

  const res = await axios.post<CianApiResponse>(
    CIAN_API_SEARCH,
    { jsonQuery },
    {
      timeout: 15_000,
      headers: {
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Referer": "https://www.cian.ru/",
        "Origin": "https://www.cian.ru",
      },
      ...agents,
    },
  );

  const raw = res.data?.items ?? [];
  return raw
    .filter((i): i is { type: string; offer: CianApiOffer } => i.type === "offer" && !!i.offer)
    .map(i => i.offer);
}

// ── Offer → ItemDto mapping ────────────────────────────────────────────────────

/**
 * Approximate cian.ru numeric category IDs for the category model lookup.
 * Cian.ru real estate hierarchy: 1000 → 1100 (flats) → 1110/1120 (sale/rent), etc.
 */
const OFFER_CATEGORY_TO_NUM: Record<string, string> = {
  flatsale:        "1110",
  flatrent:        "1120",
  dailyflatsale:   "1125",
  dailyflatrent:   "1125",
  roomsale:        "1210",
  roomrent:        "1220",
  suburbansale:    "1310",
  suburbanrent:    "1320",
  commercialsale:  "1510",
  commercialrent:  "1520",
  garagesale:      "1610",
  garagerent:      "1620",
};

function extractCityName(offer: CianApiOffer): string {
  const addresses = offer.geo?.address ?? [];
  // locationTypeId 1 = city, 2 = region/oblast — prefer the city
  const city =
    addresses.find(a => a.locationTypeId === 1 && a.isFormingAddress) ??
    addresses.find(a => a.isFormingAddress);
  return city?.fullName ?? city?.name ?? "";
}

function parsePriceFromFormatted(offer: CianApiOffer): number | undefined {
  const raw = offer.formattedFullPrice ?? offer.formattedShortPrice ?? "";
  // Strip everything except digits (handles "6 500 000 ₽", "26 000 ₽/мес", etc.)
  const digits = raw.replace(/\D/g, "");
  const n = Number(digits);
  return n > 0 ? n : undefined;
}

function buildItemName(offer: CianApiOffer): string {
  // Prefer a descriptive title; fall back to formattedCardInfo or address
  const candidates = [
    offer.title,
    offer.formattedCardInfo,
    offer.formattedFullInfo,
    offer.formattedShortInfo,
    offer.geo?.userInput,
    `Объявление ${offer.id}`,
  ];
  return candidates.find(c => c && c.trim().length > 0)?.trim() ?? String(offer.id);
}

function mapOfferToItemDto(offer: CianApiOffer): ItemDto | null {
  if (!offer?.id) return null;

  const name = buildItemName(offer);
  const category  = (offer.category  ?? "flatSale").toLowerCase().replace(/\s/g, "");
  const offerType = offer.offerType  ?? "flat";
  const dealType  = offer.dealType   ?? "sale";
  const cityName  = extractCityName(offer);
  const price     = parsePriceFromFormatted(offer);

  // item_category → numeric cian category ID (used for DB category lookup)
  const item_category  = OFFER_CATEGORY_TO_NUM[category] ?? "1000";
  // item_category2 → more specific category for the offer type
  const item_category2 =
    offerType === "flat"       ? (dealType === "sale" ? "1110" : "1120") :
    offerType === "room"       ? (dealType === "sale" ? "1210" : "1220") :
    offerType === "house"      ? "1300" :
    offerType === "land"       ? "1400" :
    offerType === "commercial" ? "1500" :
    offerType === "garage"     ? "1600" :
    "1000";

  // Commercial agent / developer = COMMERCIAL; private owner = PRIVATE
  const isCommercial =
    offer.isPro === true ||
    offer.isFromDeveloper === true ||
    offer.isByHomeowner === false;

  return {
    item_id:         String(offer.id),
    item_name:       name,
    item_list_name:  offer.category ?? category,
    item_category,
    item_category2,
    item_category3:  cityName || undefined,
    price,
    item_variant:    "organic_ad",
    ad_seller_type:  isCommercial ? "COMMERCIAL" : "PRIVATE",
  };
}

// ── Main scraping pipeline ─────────────────────────────────────────────────────

async function fetchCianItems(
  url: string,
  proxy?: string,
  regionId?: number,
): Promise<ItemDto[]> {
  const params = parseSearchUrl(url, regionId);

  logger.info(
    `[cian-scraper] Fetching: apiType=${params.apiType} region=${params.regionId} page=${params.page}`,
  );

  let offers: CianApiOffer[];
  try {
    offers = await callCianSearchApi(params, proxy);
  } catch (err: any) {
    logger.error(`[cian-scraper] API request failed for url="${url}": ${err?.message ?? err}`);
    return [];
  }

  const items: ItemDto[] = [];
  for (const offer of offers) {
    const dto = mapOfferToItemDto(offer);
    if (dto) items.push(dto);
  }

  logger.info(
    `[cian-scraper] Parsed ${items.length}/${offers.length} offers → ItemDto`,
  );
  return items;
}

// ── verifyItems ────────────────────────────────────────────────────────────────

async function verifyItems(
  items: ItemDto[],
  filter: any,
  dbPath: string,
  sendWithAngebot: AngebotOption,
  proxy?: string,
): Promise<Array<{ item: ItemDto; merchant: MerchantDto }>> {
  const db = AuthorsDatabase.getInstance(dbPath);
  const verifier = new VerifyService(proxy);
  const results: Array<{ item: ItemDto; merchant: MerchantDto }> = [];

  for (const item of items) {
    const merchant = await verifier.extractMerchantIfCorrect(item, filter, db, sendWithAngebot);
    if (merchant !== null) results.push({ item, merchant });
  }

  return results;
}

// ── Exported Piscina tasks ─────────────────────────────────────────────────────

export async function scrapeTask(task: {
  url: string;
  proxy?: string;
  /** Cian region ID (from filter.locationId) — improves accuracy of friendly-URL parsing */
  regionId?: number;
}): Promise<ItemDto[]> {
  return fetchCianItems(task.url, task.proxy, task.regionId);
}

export async function verifyTask(task: {
  items: ItemDto[];
  filter: any;
  dbPath: string;
  sendWithAngebot: AngebotOption;
  proxy?: string;
}): Promise<Array<{ item: ItemDto; merchant: MerchantDto }>> {
  return verifyItems(task.items, task.filter, task.dbPath, task.sendWithAngebot, task.proxy);
}
