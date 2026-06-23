import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from "axios";
import { BrowserServiceError, BrowserErrorCode } from "../../errors/browser.error";
import { logger } from "../../../config";
import { with429Retry } from "./retry429";

export interface ApiCallOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  url: string;
  data?: any;
  headers?: Record<string, string>;
  params?: any;
  timeout?: number;
}

export class BaseBrowserApiHandler {
  protected readonly serviceName: string;
  protected readonly axiosInstance: AxiosInstance;

  private getFullUrl(config: AxiosRequestConfig): string {
    try {
      // Axios builds final URL (baseURL + url + params)
      const uri = this.axiosInstance.getUri(config);
      return uri;
    } catch {
      const base = (config.baseURL ?? this.axiosInstance.defaults.baseURL ?? "").toString();
      const url = (config.url ?? "").toString();
      if (!base) return url;
      if (!url) return base;
      if (url.startsWith("http://") || url.startsWith("https://")) return url;
      return base.replace(/\/$/, "") + (url.startsWith("/") ? url : `/${url}`);
    }
  }

  constructor(serviceName: string, baseURL?: string, defaultHeaders?: Record<string, string>) {
    this.serviceName = serviceName;
    
    this.axiosInstance = axios.create({
      baseURL,
      timeout: 30000,
      headers: defaultHeaders || {}
    });

    // Request interceptor for logging
    this.axiosInstance.interceptors.request.use(
      (config) => {
        const fullUrl = this.getFullUrl(config);
        logger.info(`[${this.serviceName}] API Request: ${config.method?.toUpperCase()} ${fullUrl}`, {
          baseURL: config.baseURL ?? this.axiosInstance.defaults.baseURL,
          url: config.url,
          params: config.params,
          timeout: config.timeout,
          data: config.data ? (typeof config.data === 'string' ? config.data : JSON.stringify(config.data).substring(0, 200)) : undefined
        });
        return config;
      },
      (error) => {
        logger.error(`[${this.serviceName}] Request Error:`, error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging
    this.axiosInstance.interceptors.response.use(
      (response) => {
        const fullUrl = this.getFullUrl(response.config);
        logger.info(`[${this.serviceName}] API Response: ${response.status} ${fullUrl}`, {
          status: response.status,
          statusText: response.statusText
        });
        return response;
      },
      (error) => {
        if (error.response) {
          const fullUrl = this.getFullUrl(error.config ?? {});
          logger.error(`[${this.serviceName}] Response Error: ${error.response.status} ${fullUrl}`, {
            status: error.response.status,
            statusText: error.response.statusText,
            data: error.response.data
          });
        } else if (error.request) {
          const fullUrl = this.getFullUrl(error.config ?? {});
          logger.error(`[${this.serviceName}] No Response Error:`, {
            url: fullUrl || error.config?.url,
            message: error.message
          });
        } else {
          logger.error(`[${this.serviceName}] Request Setup Error:`, error.message);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Makes an API call with automatic error handling and logging
   */
  protected async makeApiCall<T = any>(
    options: ApiCallOptions,
    errorCode: BrowserErrorCode = BrowserErrorCode.UNKNOWN_ERROR,
    errorMessage?: string
  ): Promise<AxiosResponse<T>> {
    try {
      const config: AxiosRequestConfig = {
        method: options.method || "GET",
        url: options.url,
        data: options.data,
        params: options.params,
        headers: options.headers,
        timeout: options.timeout
      };

      const response: AxiosResponse<T> = await with429Retry(
        () => this.axiosInstance.request<T>(config),
        { maxRetries: 6, defaultDelayMs: 5000 }
      );
      return response;
    } catch (error) {
      throw this.handleApiError(error, errorCode, errorMessage);
    }
  }

  /**
   * Handles axios errors and converts them to BrowserServiceError
   */
  protected handleApiError(
    error: any,
    errorCode: BrowserErrorCode = BrowserErrorCode.UNKNOWN_ERROR,
    customMessage?: string
  ): BrowserServiceError {
    if (error instanceof BrowserServiceError) {
      return error;
    }

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

      // Network/connection errors
      if (!axiosError.response) {
        if (axiosError.code === "ECONNABORTED" || axiosError.message.includes("timeout")) {
          return new BrowserServiceError(
            this.serviceName,
            BrowserErrorCode.API_TIMEOUT,
            `API timeout: ${axiosError.message}`,
            undefined,
            504,
            { originalError: axiosError.message }
          );
        }

        return new BrowserServiceError(
          this.serviceName,
          BrowserErrorCode.API_CONNECTION_FAILED,
          `Connection failed: ${axiosError.message}`,
          undefined,
          503,
          { originalError: axiosError.message }
        );
      }

      // HTTP errors with response
      const response = axiosError.response;
      const status = response.status;

      // Authentication errors
      if (status === 401 || status === 403) {
        return new BrowserServiceError(
          this.serviceName,
          BrowserErrorCode.API_AUTHENTICATION_FAILED,
          `Authentication failed: ${response.statusText}`,
          undefined,
          status,
          { responseData: response.data }
        );
      }

      // Rate limiting
      if (status === 429) {
        return new BrowserServiceError(
          this.serviceName,
          BrowserErrorCode.API_RATE_LIMIT,
          `Rate limit exceeded: ${response.statusText}`,
          undefined,
          status,
          { responseData: response.data }
        );
      }

      // Not found
      if (status === 404) {
        return new BrowserServiceError(
          this.serviceName,
          BrowserErrorCode.PROFILE_NOT_FOUND,
          `Resource not found: ${response.statusText}`,
          undefined,
          status,
          { responseData: response.data }
        );
      }

      // Generic HTTP error
      const technicalMsg = customMessage || 
        `HTTP ${status} error: ${response.statusText}. ${JSON.stringify(response.data)}`;
      
      return new BrowserServiceError(
        this.serviceName,
        errorCode,
        technicalMsg,
        undefined,
        status,
        { responseData: response.data }
      );
    }

    // Generic error
    const technicalMsg = customMessage || 
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`;
    
    return new BrowserServiceError(
      this.serviceName,
      errorCode,
      technicalMsg,
      undefined,
      500,
      { originalError: error }
    );
  }

  /**
   * Validates response based on custom condition
   */
  protected validateResponse<T>(
    response: T,
    condition: (response: T) => boolean,
    errorCode: BrowserErrorCode,
    errorMessage: string
  ): T {
    if (!condition(response)) {
      throw new BrowserServiceError(
        this.serviceName,
        errorCode,
        errorMessage,
        undefined,
        500,
        { response }
      );
    }
    return response;
  }

  /**
   * Wraps a promise with error handling
   */
  protected async wrapWithErrorHandling<T>(
    promise: Promise<T>,
    errorCode: BrowserErrorCode,
    errorMessage: string
  ): Promise<T> {
    try {
      return await promise;
    } catch (error) {
      throw this.handleApiError(error, errorCode, errorMessage);
    }
  }
}
