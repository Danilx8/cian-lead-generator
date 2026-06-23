import { EventEmitter } from "events";
import { BrowserManager } from "./BrowserManager";
import { logAdminError, logAdminEvent, logger, logUserError, logUserEvent } from "./logger";
import { CianMessage, UserMessage } from "./types/messages";
import { CommunicationManager } from "./CommunicationManager";
import { AngebotOption, WorkerConfig } from "./types/WorkerConfig";
import { Page } from "puppeteer-core";
import { Mutex } from "async-mutex";
import * as path from "node:path";

interface DialogInfo {
  merchantName?: string;
  itemName: string;
  lastMessage: string;
  dialogId: string;
}

export class MessageHandler {
  private readonly config: WorkerConfig;
  private readonly eventEmitter: EventEmitter;
  private communicationManager?: CommunicationManager;
  private readonly browserManager: BrowserManager;
  private readonly mutex: Mutex;
  private isMonitoringActive = false;
  private currentMonitoredPage?: Page;
  private listenersAttached = false;
  private monitorToken = 0;

  private readonly selectors = {
    dialogsList: "div.ConversationByDateList",
    dialogItem: "article.ConversationListItem",
    dialogItemName: "article:nth-child(1) > div > section > header > h3",
    messageList: "ul.MessageList",
    messageImage: "img[data-testid=attachment-image]",
    messageText: "div[data-testid='INBOUND'] > div.Message--Text",
    activeDialog: "ul.MessageList",
    newMessage: "//li[.//div[contains(@class,'MessageListItem--Message')]//div[@data-testid='INBOUND']][last()]//div[@data-testid='INBOUND']",
    itemId: "header.ConversationHeader > div:nth-child(2) > a",
    messageInput: "textarea#nachricht",
    sendButton: "button[data-testid=\"submit-button\"]",
    fileInput: "span:has(>input[data-testid=reply-box-file-input]) > button",
    cancelAngebotButton: ".PaymentMessageBox__content > div > div > button",
    sicherCancelAngebotButton: "dialog > div > div > div > div:nth-child(2) > button"
  };

  constructor(
    config: WorkerConfig,
    eventEmitter: EventEmitter,
    browserManager: BrowserManager,
    mutex: Mutex
  ) {
    this.config = config;
    this.eventEmitter = eventEmitter;
    this.browserManager = browserManager;
    this.mutex = mutex;

    // Attach listeners once to handle page lifecycle
    this.attachLifecycleListeners();
  }

  public setCommunicationManager(communicationManager: CommunicationManager): void {
    this.communicationManager = communicationManager;
  }

  private attachLifecycleListeners(): void {
    if (this.listenersAttached) return;
    this.listenersAttached = true;

    // Page closed: allow a fresh restart later
    this.eventEmitter.on("messagesPageClosed", () => {
      logger.info(`[Lifecycle] messagesPageClosed received (worker ${this.config.workerId}).`);
      this.isMonitoringActive = false;
      this.currentMonitoredPage = undefined;
    });

    // Page ready (newly created or after reload): (re)start polling
    this.eventEmitter.on("messagesPageReady", (page: Page) => {
      logger.info(`[Lifecycle] messagesPageReady received (worker ${this.config.workerId}). Restarting polling on fresh page.`);
      this.isMonitoringActive = false; // unlock monitor start
      this.currentMonitoredPage = page;
      // Fire and forget; internal guards prevent duplicate starts
      void this.startPollingWithRetries().catch(err => {
        logger.error(`[Lifecycle] Failed to (re)start polling:`, err);
      });
    });
  }

  public async start(): Promise<void> {
    await this.mutex.waitForUnlock();
    const release = await this.mutex.acquire();
    try {
      logger.info(`Starting message handler for worker ${this.config.workerId}`);
      const { messagePage } = this.browserManager.getPages();
      await messagePage.reload();

      const maxRetries = 3;
      let attempt = 0;
      let success = false;

      while (attempt < maxRetries && !success) {
        try {
          await messagePage.goto("https://www.cian.ru/profile/messenger", {
            waitUntil: "networkidle2",
            timeout: 60000
          });
          success = true;
        } catch (error: any) {
          attempt++;
          logAdminError(`Reload attempt ${attempt} failed: ${error.message}`);
          if (attempt >= maxRetries) {
            throw new Error(`Failed to reload page: ${error.message}`);
          }
          await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
        }
      }

      await this.startPollingWithRetries();
      logger.info(`Message handler started for worker ${this.config.workerId}`);
    } catch (error) {
      logger.error(`Failed to start message handler: ${error}`);
      throw error;
    } finally {
      release();
    }
  }

  public async startPollingWithRetries(): Promise<void> {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        logger.info(`Starting message polling for worker ${this.config.workerId} (attempt ${attempt + 1})`);
        const page = this.currentMonitoredPage || this.browserManager.getPages().messagePage;

        if (this.isMonitoringActive && this.currentMonitoredPage === page) {
          logger.warn("Polling is already active on the current messages page. Skipping restart.");
          return;
        }

        // Invalidate any previous timers/loops and mark a new monitoring token
        this.monitorToken++;
        this.currentMonitoredPage = page;
        this.isMonitoringActive = false; // will be set to true by monitorDialogs after successful start

        this.monitorDialogs(page);
        return; // Успех - выходим
      } catch (error) {
        attempt++;
        logger.error(`Polling attempt ${attempt} failed: ${error}`);

        if (attempt >= maxRetries) {
          throw new Error(`Failed to start polling after ${maxRetries} attempts: ${error}`);
        }

        // Пауза перед повтором
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  private monitorDialogs(dialogsPage: Page): void {
    if (this.isMonitoringActive) {
      logger.warn("Monitoring already running");
      return;
    }

    logger.info(`[MonitorDialogs] Starting polling-based monitoring`);

    // const processedDialogs = new Set<string>();
    let lastActiveMessageText: string | null = null;
    let isProcessingActiveDialog = false;

    // Функция для рандомной задержки
    const getRandomDelay = (min: number, max: number): number => {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    };

    // Функция для создания рандомного setTimeout вместо setInterval
    const scheduleDialogsCheck = () => {
      const delay = getRandomDelay(10000, 15000); // 10-15 сек
      setTimeout(async () => {
        try {
          if (isProcessingActiveDialog) {
            logger.debug("[MonitorDialogs] Skipping dialogs check - active dialog is processing");
            scheduleDialogsCheck(); // Планируем следующий
            return;
          }

          const newDialogs = await dialogsPage.evaluate(() => {
            const dialogs = document.querySelectorAll("article.ConversationListItem");
            const result: Array<{ id: string, itemName: string, messagesAmount: number }> = [];

            dialogs.forEach(dialog => {
              const hasNewBadge = Array.from(dialog.querySelectorAll("span"))
                .some(span => span.textContent?.trim() === "NEU");

              if (hasNewBadge) {
                const input = dialog.querySelector("input[data-testid]");
                const dialogId = input?.getAttribute("data-testid");
                const itemName = dialog.querySelector("h3")?.textContent || "";
                const messagesAmount = Number(dialog.querySelector(".text-onUrgent")?.textContent || "1");

                if (dialogId) {
                  result.push({ id: dialogId, itemName, messagesAmount });
                }
              }
            });

            return result;
          });

          for (const dialog of newDialogs) {
            logger.info(`[MonitorDialogs] New dialog detected: ${dialog.itemName}`);
            isProcessingActiveDialog = true;
            try {
              await this.handleMessageInDialog(dialogsPage, dialog.id, dialog.messagesAmount);
              await new Promise(resolve => setTimeout(resolve, 1500));
              // processedDialogs.add(dialog.id);
            } finally {
              isProcessingActiveDialog = false;
            }
          }

          await this.mutex.waitForUnlock();
          const release = await this.mutex.acquire(1);
          try {
            await this.clickFirstDialogInList(dialogsPage);
          } finally {
            release();
          }
        } catch (error) {
          isProcessingActiveDialog = false;
          logger.error("[MonitorDialogs] Dialogs polling error:", error);
        } finally {
          scheduleDialogsCheck(); // Планируем следующий цикл
        }
      }, delay);
    };

    const scheduleActiveDialogCheck = () => {
      const delay = getRandomDelay(6000, 10000); // 6-10 сек
      setTimeout(async () => {
        try {
          if (isProcessingActiveDialog) {
            scheduleActiveDialogCheck();
            return;
          }

          const lastMessageData = await dialogsPage.evaluate((selector: string) => {
            const result = document.evaluate(
              selector,
              document,
              null,
              XPathResult.FIRST_ORDERED_NODE_TYPE,
              null
            );

            const messageNode = result.singleNodeValue as HTMLElement | null;
            if (!messageNode || messageNode.getAttribute("data-testid") !== "INBOUND") {
              return null;
            }

            const textElement = messageNode.querySelector("div.Message--Text");
            const imageElement = messageNode.querySelector("img[data-testid=attachment-image]") as HTMLImageElement;

            return {
              text: textElement?.textContent?.trim() || null,
              image: imageElement?.src || null
            };
          }, this.selectors.newMessage);

          if (lastMessageData) {
            if (lastMessageData.text !== lastActiveMessageText) {
              logger.info(`[MonitorDialogs] New message in active dialog`);
              isProcessingActiveDialog = true;
              try {
                await this.handleMessageInActiveDialog(dialogsPage);
                lastActiveMessageText = lastMessageData.text;
              } finally {
                isProcessingActiveDialog = false;
              }
            }
          }

        } catch (error) {
          isProcessingActiveDialog = false;
          logger.debug("[MonitorDialogs] Active dialog check skipped");
        } finally {
          scheduleActiveDialogCheck(); // Планируем следующий цикл
        }
      }, delay);
    };

    scheduleDialogsCheck();
    // scheduleActiveDialogCheck();

    logger.info(`[MonitorDialogs] Polling started successfully with randomized intervals`);

    this.isMonitoringActive = true;
  }

  private async handleMessageInDialog(dialogsPage: Page, dialogId: string, messagesAmount: number): Promise<void> {
    await this.mutex.waitForUnlock();
    const release = await this.mutex.acquire(1);
    try {
      await this.handleMessageInDialogInternal(dialogsPage, dialogId, messagesAmount);
    } catch (error) {
      logger.error("[HandleMessageInDialog] Error:", error);
    } finally {
      release();
    }
  }

  private async handleMessageInDialogInternal(dialogsPage: Page, dialogId: string, messagesAmount: number): Promise<void> {
    const dialogSelector = `div:has(>input[data-testid="${dialogId}"]) + div`;
    await this.simulateHumanClick(dialogsPage, dialogSelector);
    try {
      await dialogsPage.waitForNavigation({ timeout: 5000 });
    } catch (error) {
      logger.error("[HandleMessageInDialogInternal] Error:", error);
    }

    const [texts, imagePaths, itemId] = await Promise.all([
      this.getLastMessageText(dialogsPage, this.selectors.messageList, this.selectors.messageText, messagesAmount),
      this.getLastMessageImagePath(dialogsPage, this.selectors.messageList, this.selectors.messageImage, messagesAmount),
      this.getItemIdFromDialog(dialogsPage, this.selectors.itemId)
    ]);

    if (!itemId) {
      logAdminError(`Couldn't parse itemId for message ${texts}`);
      return;
    }

    logAdminEvent(`Worker ${this.config.workerId} new message: ${texts ?? "Couldn't read text"} for ${itemId}`);

    if (texts.length > 0 || imagePaths.length > 0) {
      for (const text of texts ?? []) {
        const message = this.createMerchantMessage(itemId, text, undefined);
        await this.communicationManager?.publishMessage(message);
      }
      for (const img of imagePaths ?? []) {
        const message = this.createMerchantMessage(itemId, "", img);
        await this.communicationManager?.publishMessage(message);
      }
    }
  }

  private async handleMessageInActiveDialog(dialogsPage: Page): Promise<void> {
    const [texts, imagePaths, itemId] = await Promise.all([
      this.getLastMessageText(dialogsPage, this.selectors.messageList, this.selectors.messageText),
      this.getLastMessageImagePath(dialogsPage, this.selectors.messageList, this.selectors.messageImage),
      this.getItemIdFromDialog(dialogsPage, this.selectors.itemId)
    ]);

    if (!itemId) {
      logAdminError(`Couldn't parse itemId for message ${texts}`);
      return;
    }

    if (texts.length > 0 || imagePaths.length > 0) {
      for (const text of texts ?? []) {
        const message = this.createMerchantMessage(itemId, text, undefined);
        await this.communicationManager?.publishMessage(message);
      }
      for (const img of imagePaths ?? []) {
        const message = this.createMerchantMessage(itemId, "", img);
        await this.communicationManager?.publishMessage(message);
      }
    }
  }

  private async stop(): Promise<void> {
    logger.info(`Message handler stopped for worker ${this.config.workerId}`);
  }

  public async sendUserMessage(message: UserMessage): Promise<void> {
    await this.mutex.waitForUnlock();
    const release = await this.mutex.acquire();
    try {
      const page = this.browserManager.getPages().messagePage;
      const dialogDetails = await this.sendMessageToMerchantInternal(page, message);
      if (dialogDetails) logUserEvent(`Написал сообщение в диалог: ${JSON.stringify(dialogDetails)}`);
      else logUserError(`Ошибка при написании сообщения в диалог ${message.itemName}`);
    } finally {
      release();
    }
  }

  private async getLastMessageText(page: Page, messageListSelector: string, messageTextSelector: string, messagesAmount: number = 1): Promise<string[]> {
    return await page.evaluate((listSelector: string, textSelector: string, amount: number) => {
      const messages = document.querySelector(listSelector);
      if (!messages) return [];

      const textElements = messages.querySelectorAll(textSelector) as NodeListOf<Element>;
      if (textElements.length === 0) return [];

      const result: string[] = [];
      const startIndex = Math.max(0, textElements.length - amount);

      for (let i = startIndex; i < textElements.length; i++) {
        const text = textElements[i].textContent?.trim();
        if (text) {
          result.push(text);
        }
      }

      return result;
    }, messageListSelector, messageTextSelector, messagesAmount);
  }

  private async getLastMessageImagePath(page: Page, messageListSelector: string, imageSelector: string, messagesAmount: number = 1): Promise<string[]> {
    return await page.evaluate(async (listSelector: string, imgSelector: string, amount: number) => {
      const messages = document.querySelector(listSelector);
      if (!messages) return [];

      const messageElements = messages.querySelectorAll("div[data-testid]") as NodeListOf<Element>;
      if (messageElements.length === 0) return [];

      const result: string[] = [];
      const startIndex = Math.max(0, messageElements.length - amount);

      for (let i = startIndex; i < messageElements.length; i++) {
        const message = messageElements[i];
        const image = message.querySelector(imgSelector) as HTMLImageElement;
        if (image && image.src) {
          result.push(image.src);
        }
      }

      return result;
    }, messageListSelector, imageSelector, messagesAmount);
  }

  private async getItemIdFromDialog(page: Page, itemIdSelector: string): Promise<string | null> {
    return await page.evaluate((selector: string) => {
      const link = document.querySelector(selector) as HTMLAnchorElement;
      if (!link) return null;
      const url = link.href;
      const parts = url.split("/");
      return parts[parts.length - 1] || null;
    }, itemIdSelector);
  }

  private createMerchantMessage(itemId: string, text?: string | null, image?: string): CianMessage {
    return {
      userId: this.config.userId,
      workerId: this.config.workerId,
      itemId: itemId,
      payload: {
        attachment: image,
        text: text ?? undefined
      }
    };
  }

  private async simulateHumanClick(page: Page, selector: string): Promise<void> {
    try {
      await page.waitForSelector(selector, { visible: true, timeout: 2500 });
      await page.waitForFunction(
        (sel: string) => {
          const element = document.querySelector(sel) as HTMLElement;
          return element && !element.hasAttribute("disabled");
        },
        { timeout: 2500 },
        selector
      );

      await page.mouse.move(
        Math.random() * 100 + 100,
        Math.random() * 100 + 100,
        { steps: Math.floor(Math.random() * 5 + 2) }
      );

      await new Promise(resolve => setTimeout(resolve, Math.random() * 150 + 100));

      await page.evaluate((sel: string) => {
        const element = document.querySelector(sel) as HTMLElement;
        if (element) {
          const rect = element.getBoundingClientRect();
          const x = rect.left + Math.random() * rect.width * 0.8 + rect.width * 0.1;
          const y = rect.top + Math.random() * rect.height * 0.8 + rect.height * 0.1;
          const clickEvent = new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y
          });
          element.dispatchEvent(clickEvent);
        }
      }, selector);

      await new Promise(resolve => setTimeout(resolve, Math.random() * 250 + 150));
    } catch (error) {
      logAdminError(`Human click simulation failed for ${selector}: ${error}`);
    }
  }

  /** Вставка текста одним действием (без по-символьного ввода и без проверки содержимого). */
  private async pasteTextIntoReplyBox(page: Page, selector: string, text: string): Promise<void> {
    try {
      await page.waitForSelector(selector, { visible: true, timeout: 7500 });
      await page.focus(selector);
      await page.evaluate((sel: string, value: string) => {
        const textarea = document.querySelector(sel) as HTMLTextAreaElement | null;
        if (!textarea) throw new Error(`textarea not found: ${sel}`);
        textarea.focus();
        const proto = window.HTMLTextAreaElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        if (setter) {
          setter.call(textarea, value);
        } else {
          textarea.value = value;
        }
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
      }, selector, text);
      await new Promise(resolve => setTimeout(resolve, 50));
    } catch (error) {
      logAdminError(`Paste text failed for ${selector}: ${error}`);
      logUserEvent("Ошибка при написании текста");
    }
  }

  private async simulateHumanFileUpload(page: Page, buttonSelector: string, filePath: string): Promise<void> {
    try {
      const attachButton = await page.waitForSelector("span:has(>input[data-testid=reply-box-file-input]) > button");
      if (!attachButton) throw new Error(`Attach button not found for ${buttonSelector}`);

      const [fileChooser, _] = await Promise.all([
        page.waitForFileChooser({ timeout: 2500 }),
        this.simulateHumanClick(page, "span:has(>input[data-testid=reply-box-file-input]) > button")
      ]);
      logAdminEvent(`fileChooser: ${fileChooser}`);
      logAdminEvent(`pic path: ${filePath}`);
      await fileChooser.accept([filePath]);

      await new Promise(resolve => setTimeout(resolve, Math.random() * 250 + 150));
      logAdminEvent("Attachment successfully added");
    } catch (error) {
      logAdminError(`Human file upload simulation failed for ${buttonSelector}: ${error}`);
      logUserError("Ошибка при вставке приложения");
    }
  }

  private async sendMessageToMerchantInternal(page: Page, userMessage: UserMessage): Promise<DialogInfo | undefined> {
    const itemName = userMessage.itemName;
    const text = userMessage.text;
    let attachment: string | undefined = userMessage.attachment;

    const dialogInfo = await this.getDialog(page, itemName);
    if (!dialogInfo) {
      logUserError(`Не получилось найти диалога по товару "${itemName}"`);
      return;
    }

    await this.simulateHumanClick(page, `div:has(>input[data-testid="${dialogInfo.dialogId}"]) + div`);

    if (attachment) {
      attachment = path.join(this.config.mainFolderPath, attachment);
      await this.simulateHumanFileUpload(page, this.selectors.fileInput, attachment);
    }

    if (text) {
      await this.pasteTextIntoReplyBox(page, this.selectors.messageInput, text);
      await new Promise(resolve => setTimeout(resolve, Math.random() * 150 + 100));
    }

    await page.bringToFront();
    await this.simulateHumanClick(page, this.selectors.sendButton);

    await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 250));
    return dialogInfo;
  }

  private async handleNewDialogInternal(page: Page, itemName: string): Promise<void> {
    logger.info(`[handleNewDialog] Starting for item: ${itemName}, config: ${this.config.angebot}`);

    await page.bringToFront();

    logger.info(`[handleNewDialog] Processing angebot option: ${this.config.angebot}`);

    switch (this.config.angebot) {
      case AngebotOption.NONE.valueOf():
        logger.info(`[handleNewDialog] NONE option for ${itemName}`);
        logUserEvent(`Отписал по товару: ${itemName}`);
        break;
      case AngebotOption.NO_CANCEL_NO_WRITE.valueOf():
        logger.info(`[handleNewDialog] NO_CANCEL_NO_WRITE option for ${itemName}`);
        break;
      case AngebotOption.NO_CANCEL_YES_WRITE.valueOf():
        logger.info(`[handleNewDialog] NO_CANCEL_YES_WRITE option for ${itemName}`);
        logUserEvent(`Отписываю по товару ${itemName} без отмены ангебота`);
        break;
      case AngebotOption.YES_CANCEL_NO_WRITE.valueOf():
        logger.info(`[handleNewDialog] YES_CANCEL_NO_WRITE option for ${itemName}`);
        await this.cancelAngebotInternal(page, itemName);
        logUserEvent(`Отменил ангебот у товара ${itemName}`);
        break;
      case AngebotOption.YES_CANCEL_YES_WRITE.valueOf():
        logger.info(`[handleNewDialog] YES_CANCEL_YES_WRITE option for ${itemName}`);
        await this.cancelAngebotInternal(page, itemName);
        logUserEvent(`Отменил ангебот у товара ${itemName} и пишу сообщение`);
        break;
      default:
        logger.error(`[handleNewDialog] Unknown angebot option: ${this.config.angebot}`);
        logUserError("Опция ангебота не определена");
    }

    logger.info(`[handleNewDialog] Completed for item: ${itemName}`);
  }

  public async handleNewDialog(page: Page, itemName: string): Promise<void> {
    await this.mutex.waitForUnlock();
    const release = await this.mutex.acquire();
    try {
      await this.handleNewDialogInternal(page, itemName);
    } catch (error) {
      logger.error(`[handleNewDialog] Error for ${itemName}:`, error);
    } finally {
      release();
    }
  }

  private async getDialog(page: Page, itemName: string): Promise<DialogInfo | null> {
    await page.bringToFront();
    const dialogInfo = await page.evaluate((selector: string, targetItemName: string): DialogInfo | null => {
      const dialogs = document.querySelectorAll(selector);
      for (const dialog of dialogs) {
        const dialogElement = dialog as HTMLElement;
        const dialogItemName = dialogElement.querySelector("h3")?.textContent;
        if (dialogItemName?.includes(targetItemName)) {
          const lastMessage = dialogElement.querySelector("div:nth-child(3) > section > span > div > span")?.textContent || "";
          const dialogId = dialogElement.querySelector("div:nth-child(1) > input")?.getAttribute("data-testid") || "";
          const merchantName = dialogElement.querySelector("header > span > span:last-child")?.textContent || "";
          dialogElement.click();
          return { itemName: dialogItemName, lastMessage, dialogId, merchantName };
        }
      }
      return null;
    }, this.selectors.dialogItem, itemName);

    if (dialogInfo) {
      await page.waitForNavigation({ timeout: 2500 }).catch((error) => {
        logAdminError(`Navigation failed after clicking dialog for ${itemName}: ${error}`);
      });
    }

    return dialogInfo;
  }

  private async cancelAngebotInternal(page: Page, itemName: string): Promise<void> {
    const dialogInfo = await this.getDialog(page, itemName);
    if (!dialogInfo) {
      logUserError(`Не получилось найти диалога по товару "${itemName}"`);
      return;
    }

    await page.bringToFront();
    await this.simulateHumanClick(page, `div:has(>input[data-testid="${dialogInfo.dialogId}"]) + div`);
    await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 500));
    await page.bringToFront();
    await this.simulateHumanClick(page, this.selectors.cancelAngebotButton);
    await page.waitForSelector("dialog", { timeout: 60000 });
    await page.bringToFront();
    await this.simulateHumanClick(page, this.selectors.sicherCancelAngebotButton);

    await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 250));
    const dialog = await page.$("dialog");
    if (dialog) {
      logAdminError("Dialog still visible after cancel, possible anti-bot block");
      logUserError("Не получилось подтвердить отмену предложения");
    } else logUserEvent(`Отменил предложение к ${itemName}`);
  }

  private async clickFirstDialogInList(page: Page): Promise<string | null> {
    try {
      const firstDialogId = await page.evaluate((dialogItemSelector: string) => {
        const dialogs = document.querySelectorAll(dialogItemSelector);
        if (dialogs.length === 0) {
          console.log("[ClickFirstDialog] No dialogs found");
          return null;
        }

        const firstDialog = dialogs[dialogs.length - 1] as HTMLElement;
        const input = firstDialog.querySelector("input[data-testid]");
        const dialogId = input?.getAttribute("data-testid");

        if (!dialogId) {
          console.log("[ClickFirstDialog] No dialogId found in first dialog");
          return null;
        }

        console.log("[ClickFirstDialog] First dialog ID:", dialogId);
        return dialogId;
      }, this.selectors.dialogItem);

      if (!firstDialogId) {
        logAdminError("Could not find first dialog in list");
        return null;
      }

      const dialogSelector = `div:has(>input[data-testid="${firstDialogId}"]) + div`;
      await this.simulateHumanClick(page, dialogSelector);

      await page.waitForNavigation({ timeout: 2500 }).catch((error) => {
        logAdminError(`Navigation failed after clicking first dialog: ${error}`);
      });

      logger.info(`[ClickFirstDialog] Successfully clicked dialog with ID: ${firstDialogId}`);
      return firstDialogId;

    } catch (error) {
      logAdminError(`Failed to click first dialog: ${error}`);
      return null;
    }
  }

  public async close(): Promise<void> {
    await this.stop();
  }
}