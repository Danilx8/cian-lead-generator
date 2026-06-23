import { EventEmitter } from "events";
import type { Browser, Page } from "puppeteer-core";
import { WorkerConfig } from "./types/WorkerConfig";
import { logAdminError, logAdminEvent, logger, logUserEvent } from "./logger";
import puppeteer from "puppeteer-core";

/**
 * Manages browser automation with Puppeteer
 */
export class BrowserManager {
  private readonly workerId: number;
  private readonly config: WorkerConfig;
  private readonly eventEmitter: EventEmitter;

  private browser: Browser | null = null;
  private messagesPage: Page | null = null;
  private itemsPage: Page | null = null;
  private reconnectAttempts: number = 0;
  private isReloading: boolean = false;

  constructor(workerId: number, config: WorkerConfig, eventEmitter: EventEmitter) {
    this.workerId = workerId;
    this.config = config;
    this.eventEmitter = eventEmitter;
  }

  /**
   * Initialize the browser instance
   */
  public async initialize(): Promise<void> {
    try {
      const browserURL = this.config.browserURL;

      // Connect to existing browser
      this.browser = await puppeteer.connect({ browserURL, defaultViewport: null, acceptInsecureCerts: true });
      if (!this.browser) {
        this.eventEmitter.emit("error");
        return;
      }

      // Create pages
      this.messagesPage = await this.browser.newPage();
      this.messagesPage.setDefaultTimeout(this.config.puppeteerTimeout);
      this.itemsPage = await this.browser.newPage();
      this.itemsPage.setDefaultTimeout(this.config.puppeteerTimeout);

      // evaluateOnNewDocument срабатывает только на *следующих* полных загрузках документа.
      // Если вызвать его после первого goto, первый документ (и часть SPA-навигаций) остаётся без скрипта.
      await this.registerPageInitScripts();

      // Navigate itemsPage first for login check
      await this.itemsPage.goto("https://www.cian.ru", { waitUntil: "networkidle2" });

      // Perform login if needed
      if (this.config.login && this.config.password) {
        const loginSuccess = await this.performLoginIfNeeded(this.itemsPage, this.config.login, this.config.password);
        if (!loginSuccess) {
          this.eventEmitter.emit("logout");
          return;
        }
      }

      await this.messagesPage.goto("https://www.cian.ru/profile/messenger", { waitUntil: "networkidle2" });

      // Set up event listeners for page events
      await this.setupPageEventListeners();

      // Notify that messages page is ready for use
      try {
        if (this.messagesPage) {
          this.eventEmitter.emit("messagesPageReady", this.messagesPage);
        }
      } catch (e) {
        logger.error(`Failed to emit messagesPageReady for worker ${this.workerId}:`, e);
      }
    } catch (error) {
      logger.error(`Failed to initialize browser for worker ${this.workerId}:`, error);
      await this.handleError(error as Error);
    }
  }

  /**
   * Get the current page
   * @returns The current page
   */
  public getPages(): { messagePage: Page, itemsPage: Page } {
    if (!this.messagesPage || !this.itemsPage) {
      logAdminError("One of the pages is not present");
      throw new Error("Pages are not present");
    }

    return { messagePage: this.messagesPage, itemsPage: this.itemsPage };
  }

  /**
   * Make screenshots of current pages
   */
  public async makeScreenshots() {
    try {
      await this.messagesPage?.screenshot({
        path: `/storage/pictures/screenshot_messages_${Date.now()}.png`,
        encoding: "binary",
        fromSurface: true
      });

      await this.itemsPage?.screenshot({
        path: `/storage/pictures/screenshot_items_${Date.now()}.png`,
        encoding: "binary",
        fromSurface: true
      });
    } catch (error) {
      logger.error(`Failed to take screenshots for worker ${this.workerId}:`, error);
    }
  }

  /**
   * Check if page state is valid
   */
  public async isPageStateValid(page: Page, pageName: string, expectedUrl: string): Promise<boolean> {
    try {
      const url = page.url();
      const isBanned = await page.evaluate(() => {
        return document.querySelector("#error h1")?.textContent?.includes("IP-Bereich vorübergehend gesperrt") ?? false;
      }).catch(() => false);

      const isCorrectUrl = url.includes(expectedUrl) || url.includes(expectedUrl.replace("www.", ""));
      const isEinloggen = url.includes("login") && !url.includes("sessionExpired");

      if (isBanned) {
        logUserEvent(`IP banned on ${pageName}. Triggering reload event.`);
        await this.triggerReload();
        return false;
      }

      if (isEinloggen) {
        logAdminEvent(`Worker ${this.workerId}: session ended on ${pageName} (URL: ${url}), attempting re-login`);
        if (this.config.login && this.config.password) {
          const reloginOk = await this.performLogin(page, this.config.login, this.config.password);
          if (reloginOk) return true;
        }
        logAdminEvent(`Worker ${this.workerId}: re-login failed, emitting logout`);
        this.eventEmitter.emit("logout");
        return false;
      }

      return isCorrectUrl;
    } catch (error) {
      logAdminError(`Error checking page state for ${pageName}: error`);
      await this.handleError(error as Error);
      return false;
    }
  }

  /**
   * Check if the page is on the login screen and, if so, perform login.
   * Returns true if already logged in or login succeeded; false if login failed.
   */
  private async performLoginIfNeeded(page: Page, login: string, password: string): Promise<boolean> {
    const url = page.url();
    const isOnLoginPage = url.includes("login") && !url.includes("sessionExpired");
    if (!isOnLoginPage) {
      logAdminEvent(`Worker ${this.workerId}: already authenticated, skipping login`);
      return true;
    }

    logAdminEvent(`Worker ${this.workerId}: not authenticated, performing login`);
    return await this.performLogin(page, login, password);
  }

  /**
   * Perform Cian login: navigate to the login page, fill credentials and submit.
   * Returns true on success, false on failure.
   */
  private async performLogin(page: Page, login: string, password: string): Promise<boolean> {
    try {
      await page.goto("https://www.cian.ru/login/", { waitUntil: "networkidle2" });

      // Fill email / phone field
      await page.waitForSelector('input[name="email"], input[type="email"], input[type="text"]', { timeout: 15000 });
      await page.type('input[name="email"], input[type="email"], input[type="text"]', login, { delay: 60 });

      // Fill password field
      await page.waitForSelector('input[name="password"], input[type="password"]', { timeout: 10000 });
      await page.type('input[name="password"], input[type="password"]', password, { delay: 60 });

      // Submit
      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }),
        page.keyboard.press("Enter")
      ]);

      const afterUrl = page.url();
      if (afterUrl.includes("login")) {
        logAdminError(`Worker ${this.workerId}: login failed — still on login page after submit`);
        return false;
      }

      logAdminEvent(`Worker ${this.workerId}: login successful`);
      logUserEvent("Авторизация прошла успешно");
      return true;
    } catch (error) {
      logAdminError(`Worker ${this.workerId}: login error: ${error}`);
      return false;
    }
  }

  /**
   * Set up event listeners for page events
   */
  private async setupPageEventListeners(): Promise<void> {
    if (!this.messagesPage || !this.itemsPage || !this.browser) {
      return;
    }

    const pages: [Page | null, string, string][] = [
      [this.messagesPage, "messagesPage", "https://www.cian.ru/profile/messenger"],
      [this.itemsPage, "itemsPage", "https://www.cian.ru"]
    ];

    // Handle page errors (unhandled exceptions)
    for (const [page, pageName] of pages) {
      if (!page) continue;

      page.on("response", async (response) => {
        const url = response.url();
        const status = response.status();
        const method = response.request().method();

        if (method === "GET" && url.includes("token") && status === 401) {
          logAdminEvent(`Detected 401 status on GET request with 'token' in URL (${url}) for ${pageName}. Emitting logout.`);
          this.eventEmitter.emit("logout");
        }
      });

      page.on("pageerror", async (err) => {
        logAdminError(`Page error in worker ${this.workerId}: ${err}`);
        await this.handleError(new Error(err.message));
      });

      page.on("error", async (err) => {
        logAdminError(`Page error in worker ${this.workerId}: ${err}`);
        await this.handleError(new Error(err.message));
      });

      page.on("requestfailed", async request => {
        const err = request.failure()?.errorText || "";
        if (err === "net::ERR_PROXY_CONNECTION_FAILED" || err === "net::ERR_SOCKS_CONNECTION_FAILED") {
          logAdminEvent(`Worker ${this.workerId} proxy connection failed (ignored): ${err}`);
        }
      });

      page.on("close", async () => {
        logAdminError(`Page closed unexpectedly in worker ${this.workerId}`);
        // Emit specific event when messages page is closed so consumers can reset their state
        if (pageName === "messagesPage") {
          try {
            this.eventEmitter.emit("messagesPageClosed");
          } catch (e) {
            logger.error(`Failed to emit messagesPageClosed for worker ${this.workerId}:`, e);
          }
        }
        await this.handleError(new Error("Page closed"));
      });

      page.on("console", (msg) => {
        if (msg.type() === "error") {
          logger.debug(`Console error [${msg.type()}]: ${msg.text()}`);
        }
      });

      page.on("framenavigated", async (frame) => {
        const url = frame.url();
        logger.debug(`Navigated to (${pageName}, frame): ${url}`);
        await this.isPageStateValid(page, pageName, pages.find(p => p[0] === page)![2]);
      });

      page.on("load", async () => {
        const url = page.url();
        logger.debug(`Loaded page (${pageName}): ${url}`);
        await this.isPageStateValid(page, pageName, pages.find(p => p[0] === page)![2]);
      });

      page.on("offline", async () => {
        logAdminEvent(`Worker ${this.workerId} went offline`);
        await this.handleError(new Error("Offline"));
      });
    }

    // Handle browser errors
    this.browser.on("error", async (err: any) => {
      logger.error(`Browser error in worker ${this.workerId}:`, err);
      await this.handleError(new Error(err.message));
    });

    // Handle browser disconnection
    this.browser.on("disconnected", async () => {
      logAdminEvent("Browser disconnected. Triggering reload event.");
      await this.handleError(new Error("Browser disconnected"));
    });
  }

  /** Слушатели в контексте страницы на каждую *новую* загрузку документа (до первого goto). */
  private async registerPageInitScripts(): Promise<void> {
    if (!this.messagesPage || !this.itemsPage) return;
    for (const page of [this.messagesPage, this.itemsPage]) {
      await page.evaluateOnNewDocument(() => {
        window.addEventListener("error", (event) => {
          console.error("Global error:", event.message);
        });
        window.addEventListener("unhandledrejection", (event) => {
          console.error("Unhandled promise rejection:", event.reason);
        });
      });
    }
  }

  private async handleError(err: Error) {
    logAdminError(`Error in worker ${this.workerId}: ${err.message}`);

    const isAccountBan = (err.message.includes("einloggen.html") && !err.message.includes("sessionExpired"));
    const isNoInternet = err.message.includes("net::ERR_PROXY_CONNECTION_FAILED") ||
      err.message.includes("Offline") || err.message.includes("ERR_SOCKS_CONNECTION_FAILED");

    if (isAccountBan) {
      logAdminError(`Account error: ${err.message}. Emitting error.`);
      this.eventEmitter.emit("logout");
      return;
    }

    if (isNoInternet) {
      logAdminError(`Proxy error: ${err.message}. Emitting error.`);
      this.eventEmitter.emit("connection_lost");
      return;
    }

    // For other errors, trigger reload
    await this.triggerReload();
  }

  /**
   * Trigger reload event with attempt counting
   */
  private async triggerReload(): Promise<void> {
    if (this.isReloading) {
      logAdminEvent(`Reload already in progress for worker ${this.workerId}. Skipping.`);
      return;
    }

    this.isReloading = true;

    try {
      let success = false;
      const maxAttempts = 3;

      while (this.reconnectAttempts < maxAttempts && !success) {
        this.reconnectAttempts++;
        const delay = 5000 * this.reconnectAttempts;

        logAdminEvent(`Triggering reload event (attempt ${this.reconnectAttempts}/${maxAttempts})`);

        await new Promise(resolve => setTimeout(resolve, delay));

        // Check if pages are still valid
        if (this.messagesPage?.isClosed() || this.itemsPage?.isClosed() || !this.browser) {
          logAdminError(`One or more pages closed or browser invalid in worker ${this.workerId}. Reinitializing.`);
          await this.close();
          await this.initialize();

          success = true;
          continue;
        }

        // Check if reload is needed
        const isMessagesValid = await this.isPageStateValid(
          this.messagesPage!,
          "messagesPage",
          "https://www.cian.ru/profile/messenger"
        );
        const isItemsValid = await this.isPageStateValid(
          this.itemsPage!,
          "itemsPage",
          "https://www.cian.ru"
        );

        if (isMessagesValid && isItemsValid) {
          logAdminEvent("Pages are already in valid state, no reload needed");
          success = true;
          continue;
        }

        // Emit reload event
        const navigationTimeout = this.config.puppeteerTimeout || 30000;
        const reloadPromise = new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Reload event timed out")), navigationTimeout);
          this.eventEmitter.once("pageReloaded", async () => {
            try {
              clearTimeout(timeout);
              await Promise.all([
                this.messagesPage?.waitForNavigation({ waitUntil: "networkidle2", timeout: navigationTimeout }),
                this.itemsPage?.waitForNavigation({ waitUntil: "networkidle2", timeout: navigationTimeout })
              ]);
              resolve();
            } catch (error) {
              reject(error);
            }
          });
        });

        this.eventEmitter.emit("pageReloaded", this.messagesPage, this.itemsPage);

        // Wait for reload to complete
        await reloadPromise;

        // Verify page state after reload
        const isMessagesValidAfter = await this.isPageStateValid(
          this.messagesPage!,
          "messagesPage",
          "https://www.cian.ru/profile/messenger"
        );
        const isItemsValidAfter = await this.isPageStateValid(
          this.itemsPage!,
          "itemsPage",
          "https://www.cian.ru"
        );

        if (isMessagesValidAfter && isItemsValidAfter) {
          logAdminEvent("Reload successful");
          // Notify listeners that messages page is ready after reload
          try {
            if (this.messagesPage) {
              this.eventEmitter.emit("messagesPageReady", this.messagesPage);
            }
          } catch (e) {
            logger.error(`Failed to emit messagesPageReady after reload for worker ${this.workerId}:`, e);
          }
          success = true;
        } else {
          logAdminError(`Reload failed. Retrying.`);
        }
      }

      if (!success) {
        logAdminError(`Exceeded max reload attempts (${maxAttempts}) for worker ${this.workerId}. Emitting error.`);
        this.eventEmitter.emit("error");
      }

      this.reconnectAttempts = 0;
    } catch (error) {
      logAdminError(`Error during reload attempt for worker ${this.workerId}: error`);
      await this.handleError(error as Error);
    } finally {
      this.isReloading = false;
    }
  }

  /**
   * Close pages and browser
   */
  public async close(): Promise<void> {
    try {
      if (this.messagesPage || this.itemsPage || this.browser) {
        logger.info(`Closing resources for worker ${this.workerId}`);
        await Promise.all([
          this.messagesPage?.close(),
          this.itemsPage?.close()
        ]);
        this.messagesPage = null;
        this.itemsPage = null;
        this.browser = null;
      }
    } catch (error) {
      logger.error(`Failed to close resources for worker ${this.workerId}:`, error);
    }
  }
}