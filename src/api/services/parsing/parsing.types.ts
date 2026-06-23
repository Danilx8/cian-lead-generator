export interface ItemDto {
  item_id: string;
  item_name: string;
  item_list_name: string;
  item_category: string;
  item_category2: string;
  item_category3?: string;
  price?: number;
  item_variant: string;
  ad_seller_type: "COMMERCIAL" | "PRIVATE";
}

export interface MerchantDto {
  sellerId: string;
  contactName: string;
  adImageUrl: string;
  activeSince: string;
  deliveryPrice?: number | null;
}

export enum AngebotOption {
  NONE = 1,
  NO_CANCEL_YES_WRITE = 2,
  YES_CANCEL_YES_WRITE = 3,
  NO_CANCEL_NO_WRITE = 4,
  YES_CANCEL_NO_WRITE = 5,
}

export interface PlainFilter {
  blackList?: string[];
  whiteList?: string[];
  searchLink?: string;
  minDateRegistered?: string;
  maxDateRegistered?: string;
  views?: number | null;
  adsLimit?: number | null;
  includeOldMerchants?: boolean;
  includeSicherMerchants?: boolean;
}
