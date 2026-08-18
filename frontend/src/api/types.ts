export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  message: string;
  userId: number;
  token: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RegisterRequest {
  email: string;
  password: string;
  username?: string;
}

export interface RegisterResponse {
  message: string;
  userId: number;
  /** "pending" когда включена модерация регистраций (токены не выдаются). */
  status?: 'pending' | string;
}

export type UserStatus = 'active' | 'pending' | 'blocked';
export type UserRole = 'user' | 'admin';

export interface User {
  id: number;
  email: string;
  username: string;
  status: UserStatus;
  role: UserRole;
  sendWithAngebot?: 1 | 2 | 3 | 4 | 5;
  avatarPath?: string;
  itemsChunkSize?: number;
  itemsInterval?: number;
  chunksInterval?: number;
  newMessagesInterval?: number;
  repliesInterval?: number;
  createdAt?: string;
  updatedAt?: string;
}

// ─── Accounts (cian.ru креды, бывшие cookies) ───

export interface Account {
  id: number;
  name?: string;
  login: string;
  password: string;
  userId: number;
  proxyId?: number | null;
}

export interface CreateAccountRequest {
  login: string;
  password: string;
  name?: string;
}

// ─── Proxy (только upload-эндпоинты, CRUD удалён) ───

export interface Proxy {
  id: number;
  host: string;
  port: number;
  protocol: 'http' | 'https' | 'socks4' | 'socks5';
  username?: string;
  password?: string;
  userId?: number;
}

export interface UploadProxyBulkResponse {
  message?: string;
  proxies?: Proxy[];
  created?: number;
  skipped?: number;
  errors?: string[];
}

// ─── Workers / Slots ───

export type WorkerBackendStatus =
  | 'INITIALIZING'
  | 'CONNECTING'
  | 'AUTHENTICATING'
  | 'ACTIVE'
  | 'RECONNECTING'
  | 'PHONE_VERIFICATION'
  | 'EXPECTING_CODE'
  | 'ERROR'
  | 'SHUTDOWN'
  | 'BANNED'
  | 'CONNECTION_LOST';

export interface Worker {
  id: number;
  userId: number;
  filterId?: number;
  status: WorkerBackendStatus | string;
  isActive: boolean;
  port?: number;
  createdAt: string;
  updatedAt: string;
  accountId?: number;
  accountName?: string;
  proxy?: string | null;
  proxyId?: number;
  dialogsCount?: number;
  phoneNumber?: string | null;
}

export interface CreateWorkerRequest {
  profileOptions: {
    accountId?: number;
    proxy?: string;
    proxyId?: number;
    filterOptions?: { id: number; parsingLink?: string };
  };
  amount?: number;
}

export type CreateWorkerResponse = Worker;

export interface UpdateWorkerRequest {
  isActive?: boolean;
  filterId?: number;
  proxy?: string;
  proxyId?: number;
  accountId?: number;
}

export interface SendWorkerMessageRequest {
  message: string;
}

// ─── Templates ───

export interface Template {
  title: string;
  texts: string[];
  isGreeting?: boolean;
  isAutomatic?: boolean;
  isSentImmediately?: boolean;
}

export type CreateTemplateRequest = Template;
export type UpdateTemplateRequest = Partial<Template>;

export interface ReorderTemplateRequest {
  fromIndex: number;
  toIndex: number;
}

export interface GetTemplatesResponse {
  templates: Template[];
}

// ─── Dialogs / Messages / Items ───

export interface Merchant {
  id: number;
  name: string;
  activeSince?: string;
  cianId?: string;
  profilePicture?: string;
  type?: string;
}

export interface Item {
  id: number;
  cianId?: string;
  name: string;
  categoryId?: number;
  merchantId?: number;
  price?: number;
  merchant?: Merchant;
}

export interface Dialog {
  id: number;
  isActive?: boolean;
  emailSent?: boolean;
  isAutomatic?: boolean;
  userId?: number;
  itemId?: number;
  workerId?: number;
  item?: Item;
  // Поля, которые бэкенд денормализует для списка диалогов:
  title?: string;
  merchantName?: string;
  lastMessage?: string;
  price?: number;
  newMessagesAmount?: number;
  dialogImage?: string;
  updatedAt?: string;
  cianId?: string;
  isLastByUser?: boolean;
  isDeleted?: boolean;
}

export interface DialogsRequest {
  page?: number;
  limit?: number;
}

export interface Message {
  id: number;
  isSentByUser: boolean;
  isRead: boolean;
  text: string;
  attachment?: string;
  dialogId: number;
  createdAt: string;
  updatedAt?: string;
  merchantName?: string;
  itemName?: string;
  itemImage?: string;
  price?: number;
  /** Оптимистичная копия с временным отрицательным id; заменяется серверной версией из сокета/поллинга. */
  pending?: boolean;
}

export interface SendMessageRequest {
  messageData: {
    text: string;
    attachment?: string;
  };
}

export interface SendMessageResponse {
  success: boolean;
  message?: Message;
}

// ─── Filters (недвижимость cian.ru) ───

export type DealType = 'buy' | 'rent_long' | 'rent_daily';
export type PropertyType = 'apartment' | 'room' | 'house' | 'land' | 'commercial' | 'garage';
export type MarketType = 'secondary' | 'new_build' | 'any';
export type BuildingType = 'brick' | 'panel' | 'monolith' | 'block' | 'wood' | 'any';
export type RenovationType = 'designer' | 'euro' | 'cosmetic' | 'needs_renovation' | 'any';
export type SellerType = 'owner' | 'agent' | 'developer' | 'any';

export interface Filter {
  id: number;
  name: string;
  isActive: boolean;
  searchLink: string;
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
  whiteList?: string[];
  blackList?: string[];
  adsLimit?: number;
  minDateRegistered?: string;
  maxDateRegistered?: string;
  userId?: number;
  categoryId?: number;
  createdAt?: string;
  updatedAt?: string;
}

// ─── Config ───

export interface Config {
  messageDelay: number;
  messageLimit: number;
  templates: string[];
  logsChatId?: number | null;
}

export interface UpdateConfigRequest {
  messageDelay?: number;
  messageLimit?: number;
}

// ─── Analytics ───

export interface AnalyticsSummary {
  userId?: number;
  items: { total: number };
  merchants: {
    total: number;
    private: number;
    commercial: number;
    privateShare: number;
  };
  dialogs: { total: number; withSellerReply: number };
  messages: { total: number; fromUser: number; fromSeller: number };
  conversion: { leads: number; replied: number; leadToReplyRate: number };
}
