import { api } from './client';
import type {
  Filter,
  DealType,
  PropertyType,
  MarketType,
  BuildingType,
  RenovationType,
  SellerType,
} from './types';

export type {
  Filter,
  DealType,
  PropertyType,
  MarketType,
  BuildingType,
  RenovationType,
  SellerType,
} from './types';

/** Легаси-алиас времён goat-sender. */
export type FilterRecord = Filter;

/** Параметры генерации ссылки поиска cian.ru (POST /api/filter/link). */
export interface UrlFilters {
  dealType?: DealType;
  propertyType?: PropertyType;
  marketType?: MarketType;
  location?: string;
  locationId?: number;
  rooms?: number[];
  priceMin?: number;
  priceMax?: number;
  areaMin?: number;
  areaMax?: number;
  kitchenAreaMin?: number;
  floorMin?: number;
  floorMax?: number;
  floorsInBuildingMin?: number;
  floorsInBuildingMax?: number;
  buildingType?: BuildingType;
  renovationType?: RenovationType;
  sellerType?: SellerType;
  notFirstFloor?: boolean;
  notLastFloor?: boolean;
  withPhotos?: boolean;
  hasMortgage?: boolean;
}

export type FilterCreateOptions = Omit<Filter, 'id' | 'isActive' | 'userId' | 'createdAt' | 'updatedAt'> & {
  name?: string;
  searchLink?: string;
};

export type FilterUpdateOptions = Partial<Omit<Filter, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>;

export interface GenerateFilterUrlResponse {
  url: string;
}

export interface Location {
  id: number;
  slug: string;
  name: string;
  cianId?: number | string;
}

export interface LocationsResponse {
  locations: Location[];
}

export interface Category {
  id: number;
  name: string;
  slug?: string;
}

export interface CategoriesResponse {
  categories: Category[];
}

export const parserService = {
  getFilters: () => api.get<Filter[]>('/api/filter/'),

  createFilter: (filterOptions: FilterCreateOptions) =>
    api.post<Filter>('/api/filter/', { filterOptions }),

  updateFilter: (id: number, updateData: FilterUpdateOptions) =>
    api.patch<Filter>(`/api/filter/${id}`, { updateData }),

  deleteFilter: (id: number) =>
    api.delete<string>(`/api/filter/${id}`),

  generateFilterUrl: async (data: { urlFilterOptions: UrlFilters }): Promise<GenerateFilterUrlResponse> => {
    const res = await api.post<unknown>('/api/filter/link', data);
    if (typeof res === 'string') return { url: res };
    if (res && typeof res === 'object' && typeof (res as { url?: unknown }).url === 'string') {
      return { url: (res as { url: string }).url };
    }
    return { url: String(res) };
  },

  getLocations: (search?: string) => {
    const params = search ? `?search=${encodeURIComponent(search)}` : '';
    return api.get<LocationsResponse>(`/api/location${params}`);
  },

  getLocationByCianId: (cianId: number | string) =>
    api.get<Location>(`/api/location/cianId/${cianId}`),

  getLocationBySlug: (slug: string) =>
    api.get<Location>(`/api/location/slug/${encodeURIComponent(slug)}`),

  getCategories: () =>
    api.get<CategoriesResponse>('/api/categories'),
};
