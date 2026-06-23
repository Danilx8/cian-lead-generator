import { ApiError } from "./api.error";

export enum BrowserErrorCode {
  // Creation errors
  BROWSER_CREATE_FAILED = "BROWSER_CREATE_FAILED",
  FOLDER_CREATE_FAILED = "FOLDER_CREATE_FAILED",
  GROUP_CREATE_FAILED = "GROUP_CREATE_FAILED",
  FINGERPRINT_LOAD_FAILED = "FINGERPRINT_LOAD_FAILED",
  
  // Profile management errors
  PROFILE_NOT_FOUND = "PROFILE_NOT_FOUND",
  PROFILE_DELETE_FAILED = "PROFILE_DELETE_FAILED",
  PROFILE_UPDATE_FAILED = "PROFILE_UPDATE_FAILED",
  
  // Browser control errors
  BROWSER_START_FAILED = "BROWSER_START_FAILED",
  BROWSER_STOP_FAILED = "BROWSER_STOP_FAILED",
  BROWSER_STATUS_CHECK_FAILED = "BROWSER_STATUS_CHECK_FAILED",
  
  // Proxy errors
  PROXY_ADD_FAILED = "PROXY_ADD_FAILED",
  PROXY_NOT_FOUND = "PROXY_NOT_FOUND",
  PROXY_INVALID = "PROXY_INVALID",
  
  // Cookie errors
  COOKIE_IMPORT_FAILED = "COOKIE_IMPORT_FAILED",
  COOKIE_FORMAT_INVALID = "COOKIE_FORMAT_INVALID",
  
  // API errors
  API_AUTHENTICATION_FAILED = "API_AUTHENTICATION_FAILED",
  API_RATE_LIMIT = "API_RATE_LIMIT",
  API_TIMEOUT = "API_TIMEOUT",
  API_CONNECTION_FAILED = "API_CONNECTION_FAILED",
  
  // Generic errors
  INVALID_PARAMETER = "INVALID_PARAMETER",
  UNKNOWN_ERROR = "UNKNOWN_ERROR"
}

export class BrowserServiceError extends ApiError {
  readonly browserService: string;

  constructor(
    browserService: string,
    code: BrowserErrorCode,
    technicalMessage: string,
    userMessage?: string,
    status: number = 500,
    details?: any
  ) {
    const finalUserMessage = userMessage || BrowserServiceError.getDefaultUserMessage(code);
    super(status, technicalMessage, code, finalUserMessage, details);
    this.browserService = browserService;
    Object.setPrototypeOf(this, BrowserServiceError.prototype);
  }

  private static getDefaultUserMessage(code: BrowserErrorCode): string {
    const messages: Record<BrowserErrorCode, string> = {
      [BrowserErrorCode.BROWSER_CREATE_FAILED]: "Не удалось создать профиль браузера. Пожалуйста, попробуйте позже.",
      [BrowserErrorCode.FOLDER_CREATE_FAILED]: "Не удалось создать папку для профиля. Пожалуйста, попробуйте позже.",
      [BrowserErrorCode.GROUP_CREATE_FAILED]: "Не удалось создать группу профилей. Пожалуйста, попробуйте позже.",
      [BrowserErrorCode.FINGERPRINT_LOAD_FAILED]: "Не удалось загрузить отпечаток браузера. Пожалуйста, попробуйте позже.",
      
      [BrowserErrorCode.PROFILE_NOT_FOUND]: "Профиль браузера не найден.",
      [BrowserErrorCode.PROFILE_DELETE_FAILED]: "Не удалось удалить профиль браузера.",
      [BrowserErrorCode.PROFILE_UPDATE_FAILED]: "Не удалось обновить профиль браузера.",
      
      [BrowserErrorCode.BROWSER_START_FAILED]: "Не удалось запустить браузер. Пожалуйста, попробуйте позже.",
      [BrowserErrorCode.BROWSER_STOP_FAILED]: "Не удалось остановить браузер. Пожалуйста, попробуйте позже.",
      [BrowserErrorCode.BROWSER_STATUS_CHECK_FAILED]: "Не удалось проверить статус браузера.",
      
      [BrowserErrorCode.PROXY_ADD_FAILED]: "Не удалось добавить прокси. Проверьте настройки прокси.",
      [BrowserErrorCode.PROXY_NOT_FOUND]: "Прокси не найден. Пожалуйста, выберите другой прокси.",
      [BrowserErrorCode.PROXY_INVALID]: "Неверные настройки прокси. Проверьте параметры прокси.",
      
      [BrowserErrorCode.COOKIE_IMPORT_FAILED]: "Не удалось импортировать cookies. Проверьте формат данных.",
      [BrowserErrorCode.COOKIE_FORMAT_INVALID]: "Неверный формат cookies. Проверьте структуру данных.",
      
      [BrowserErrorCode.API_AUTHENTICATION_FAILED]: "Ошибка аутентификации с сервисом браузера. Проверьте API ключ.",
      [BrowserErrorCode.API_RATE_LIMIT]: "Превышен лимит запросов к API. Пожалуйста, подождите.",
      [BrowserErrorCode.API_TIMEOUT]: "Превышено время ожидания ответа от сервиса. Попробуйте позже.",
      [BrowserErrorCode.API_CONNECTION_FAILED]: "Не удалось подключиться к сервису браузера. Проверьте соединение.",
      
      [BrowserErrorCode.INVALID_PARAMETER]: "Переданы неверные параметры.",
      [BrowserErrorCode.UNKNOWN_ERROR]: "Произошла неизвестная ошибка. Пожалуйста, обратитесь в поддержку."
    };

    return messages[code] || messages[BrowserErrorCode.UNKNOWN_ERROR];
  }

  toJSON() {
    return {
      error: true,
      status: this.status,
      code: this.code,
      message: this.userMessage,
      browserService: this.browserService,
      ...(this.details && { details: this.details })
    };
  }
}
