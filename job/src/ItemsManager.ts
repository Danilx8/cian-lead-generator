import { ItemMessageData } from "./types/messages";
import { logAdminError, logUserError, logUserEvent } from "./logger";
import { AngebotOption, WorkerConfig } from "./types/WorkerConfig";
import { BrowserManager } from "./BrowserManager";
import { MessageHandler } from "./MessageHandler";
import { StateManager } from "./StateManager";
import { WorkerState } from "./types/WorkerState";
import { CommunicationManager } from "./CommunicationManager";

class PhoneVerificationRequiredError extends Error {
  constructor() {
    super("PHONE_VERIFICATION");
    this.name = "PhoneVerificationRequiredError";
  }
}

type SendMessageOptions = {
  verifyPhone?: { countryCode: string; phoneNumber: string };
};

export class ItemsManager {
  private readonly config: WorkerConfig;
  private readonly browserManager: BrowserManager;
  private readonly messageHandler: MessageHandler;
  private readonly stateManager: StateManager;
  private communicationManager?: CommunicationManager;
  private items: ItemMessageData[] = [];
  private pollingIntervalId: NodeJS.Timeout | null = null;
  private isFirstIteration: boolean = true; // Флаг для отслеживания первой итерации
  private lastMessagingItem: ItemMessageData | null = null;

  constructor(browserManager: BrowserManager, messageHandler: MessageHandler, config: WorkerConfig,
              stateManager: StateManager) {
    this.browserManager = browserManager;
    this.messageHandler = messageHandler;
    this.config = config;
    this.stateManager = stateManager;
  }

  public setCommunicationManager(communicationManager: CommunicationManager) {
    this.communicationManager = communicationManager;
  }

  public addItems(items: ItemMessageData[]): void {
    this.items.push(...items);
  }

  public async initialize() {
    try {
      if (this.pollingIntervalId) {
        return;
      }

      const poll = async () => {
        const start = Date.now();
        await this.iterate();
        const elapsed = Date.now() - start;
        
        // If only one item is in the queue, iterate immediately without timeout
        const delay = this.items.length === 1 ? 0 : Math.max(0, this.config.messageInterval - elapsed);
        this.pollingIntervalId = setTimeout(poll, delay) as NodeJS.Timeout;

        // Ensure interval doesn't prevent Node.js from exiting
        if (this.pollingIntervalId.unref) {
          this.pollingIntervalId.unref();
        }
      };
      await poll();
    } catch (error: any) {
      logAdminError(`Error initializing Items Manager: ${error}`);
      throw error;
    }
  }

  private async iterate() {
    try {
      // Обрабатываем только один элемент за вызов
      if (this.items.length > 0) {
        const item = this.items.pop();
        if (item) {
          if (await this.messageOnItem(item)) await this.communicationManager?.publishSuccessfulUserMessage(item.name);
          if (this.isFirstIteration) {
            await this.runConnectingSequence(item);
            this.isFirstIteration = false;
          }
          await this.browserManager.getPages().messagePage.bringToFront();
        }
      }
    } catch (error) {
      logUserError(`Произошла ошибка при обработке товара`);
      logAdminError(`ItemsManager iterate error: ${JSON.stringify(error)}`);
    }
  }

  private async runConnectingSequence(item: ItemMessageData): Promise<void> {
    this.stateManager.setState(WorkerState.CONNECTING);
    await new Promise(resolve => setTimeout(resolve, 5000));
    try {
      await this.messageHandler.start();
      await this.messageHandler.handleNewDialog(this.browserManager.getPages().itemsPage, item.name);
    } finally {
      this.stateManager.setState(WorkerState.ACTIVE);
    }
  }

  private async messageOnItem(item: ItemMessageData) {
    const maxRetries = 5;
    this.lastMessagingItem = item;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.browserManager.getPages().itemsPage.goto(`https://www.cian.ru/item/${item.cianId}`, {
          waitUntil: "networkidle2"
        });
        await this.browserManager.getPages().itemsPage.bringToFront();
        await this.browserManager.getPages().itemsPage.keyboard.press("Escape");

        const logData = JSON.stringify({
          name: item.name,
          merchant: item.merchantName,
          url: `https://www.cian.ru/item/${item.cianId}`
        });

        if (this.config.angebot !== AngebotOption.NONE) {
          try {
            logUserEvent(`Отправляю предложение товару ${logData} (попытка ${attempt}/${maxRetries})`);
            await this.sendAngebot(item);
            return true;
          } catch (error: any) {
            if (attempt === maxRetries) {
              logUserEvent(`Отправить предложение не получилось после ${maxRetries} попыток. Идём дальше`);
              logAdminError(error);
              return false;
            }
            logUserEvent(`Ошибка при отправке предложения (попытка ${attempt}/${maxRetries}). Повторяю...`);
            await new Promise(resolve => setTimeout(resolve, 2000)); // задержка 2 секунды
          }
        } else {
          logUserEvent(`Вставляю сообщение по товару ${logData} (попытка ${attempt}/${maxRetries})`);
          await this.sendMessage(item);
          logUserEvent("Успешно отписался по указанному товару");
          return true;
        }
      } catch (error) {
        if (error instanceof PhoneVerificationRequiredError) {
          return false;
        }
        if (attempt === maxRetries) {
          const logData = JSON.stringify({ name: item.name, merchant: item.merchantName });
          logUserError(`Ошибка при отписке по товару после ${maxRetries} попыток: ${logData}`);
          logAdminError(`Error messaging item: ${item.id}: ${error}`);
          return false;
        }
        logUserEvent(`Ошибка (попытка ${attempt}/${maxRetries}). Повторяю...`);
        await new Promise(resolve => setTimeout(resolve, 2000)); // задержка 2 секунды
      }
    }

    return false;
  }

  private async sendAngebot(item: ItemMessageData) {
    const itemsPage = this.browserManager.getPages().itemsPage;
    if (!this.config.isHeadless) await itemsPage.bringToFront();
    const button = await itemsPage.waitForSelector("button[data-cy=\"offer-btn\"]", {
      timeout: 30000
    });
    if (!button) throw new Error("waitforselector didn't find button");
    await button?.evaluate(b => b.click());

    if (this.isFirstIteration) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      await this.browserManager.getPages().itemsPage.keyboard.press("Escape");
    }

    if (!this.config.isHeadless) await itemsPage.bringToFront();
    await itemsPage.waitForSelector("input#price-input");
    await itemsPage.type("input#price-input", (item.price * 100).toString());
    // Проверяем, заблокирован ли select, и выбираем первый доступный option
    const selectElement = await itemsPage.$("select#shipping-select");
    if (selectElement) {
      const isDisabled = await selectElement.evaluate(sel => sel.disabled);
      if (!isDisabled) {
        const firstOption = await selectElement.$("option:not(:disabled):not(.fillOption)");
        if (firstOption) {
          const optionValue = await (await firstOption.getProperty("value")).jsonValue();
          await selectElement.select(optionValue);
        }
      }
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
    if (!this.config.isHeadless) await itemsPage.bringToFront();
    const sendButton = await itemsPage.waitForSelector("footer > button",
      { timeout: 30000 });
    sendButton?.evaluate(b => b.click());
    // на будущее - тру будет возвращаться если будет выбрана опция отписки с ангеботом
    await new Promise(resolve => setTimeout(resolve, 5000));
    const angebotSentTitle = await itemsPage.waitForSelector(".AskForRedirectModal",
      { timeout: 30000 });
    if (!angebotSentTitle) throw new Error("angebotSentTitle failed to load");
  }

  /**
   * TODO: определить по UI, требуется ли привязка телефона перед отправкой сообщения.
   */
  private async checkNumberVerification(): Promise<boolean> {
    return true;
  }

  /**
   * TODO: ввод номера на экране верификации Cian.
   */
  private async verifyNumber(_params: { countryCode: string; phoneNumber: string }): Promise<boolean> {
    return true;
  }

  /**
   * TODO: ввод кода из SMS.
   */
  private async enterSmsCode(_code: string): Promise<boolean> {
    return true;
  }

  private async verifyNumberWithRetries(countryCode: string, phoneNumber: string): Promise<boolean> {
    const fullPhone = `+${countryCode}${phoneNumber}`;
    for (let attempt = 1; attempt <= 3; attempt++) {
      logUserEvent(`verifyNumber попытка ${attempt}/3`);
      if (await this.verifyNumber({ countryCode, phoneNumber })) {
        await this.communicationManager?.publishWorkerVerification({ success: true, phoneNumber: fullPhone });
        return true;
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    await this.communicationManager?.publishWorkerVerification({ success: false });
    return false;
  }

  private async enterSmsCodeWithRetries(code: string): Promise<boolean> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      logUserEvent(`Ввод кода SMS попытка ${attempt}/3`);
      if (await this.enterSmsCode(code)) {
        return true;
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    return false;
  }

  public async handleReverifyCommand(countryCode: string, phoneNumber: string): Promise<void> {
    if (!this.lastMessagingItem?.cianId) {
      logAdminError("REVERIFY: нет последнего товара или cianId для отписки");
      return;
    }
    const itemsPage = this.browserManager.getPages().itemsPage;
    try {
      await itemsPage.goto(`https://www.cian.ru/item/${this.lastMessagingItem.cianId}`, {
        waitUntil: "networkidle2"
      });
      await itemsPage.bringToFront();
      await itemsPage.keyboard.press("Escape");
      await this.sendMessage(this.lastMessagingItem, { verifyPhone: { countryCode, phoneNumber } });
    } catch (e) {
      if (e instanceof PhoneVerificationRequiredError) return;
      logAdminError(`REVERIFY: ${e}`);
    }
  }

  public async handleVerifyCommand(countryCode: string, phoneNumber: string): Promise<void> {
    await this.verifyNumberWithRetries(countryCode, phoneNumber);
  }

  public async handleCodeCommand(code: string): Promise<void> {
    const item = this.lastMessagingItem;
    if (!item) {
      logAdminError("CODE: нет контекста товара для CONNECTING-последовательности");
      await this.communicationManager?.publishWorkerCode({ success: false });
      return;
    }
    if (await this.enterSmsCodeWithRetries(code)) {
      await this.communicationManager?.publishWorkerCode({ success: true });
      await this.runConnectingSequence(item);
      return;
    }
    await this.communicationManager?.publishWorkerCode({ success: false });
  }

  private async sendMessage(item: ItemMessageData, options?: SendMessageOptions): Promise<void> {
    const itemsPage = this.browserManager.getPages().itemsPage;

    if (!(await this.checkNumberVerification())) {
      await this.communicationManager?.publishWorkerVerification({ success: false });
      throw new PhoneVerificationRequiredError();
    }

    await itemsPage.waitForSelector("textarea", { timeout: 60000 });
    await itemsPage.waitForFunction(
      () => {
        const textarea = document.querySelector("textarea") as HTMLTextAreaElement;
        return textarea && !textarea.disabled && !textarea.readOnly;
      },
      { timeout: 15000 }
    );
    const textarea = await itemsPage.$("textarea");
    if (!textarea) throw new Error("Textarea element not found");

    await textarea.focus();
    const text = item.firstMessage;
    await itemsPage.evaluate((t) => {
      const el = document.querySelector("textarea") as HTMLTextAreaElement;
      if (!el) return;
      const proto = window.HTMLTextAreaElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(el, t);
      else el.value = t;
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste", data: t }));
    }, text);

    await new Promise((r) => setTimeout(r, 200));

    // Ждем кнопку и проверяем ее состояние
    try {
      await itemsPage.waitForSelector("button.viewad-contact-submit", { timeout: 60000 });
      await itemsPage.waitForFunction(
        () => {
          const button = document.querySelector("button.viewad-contact-submit") as HTMLButtonElement;
          return button && !button.disabled;
        },
        { timeout: 15000 }
      );
    } catch (error) {
      throw new Error(`Failed to find or enable submit button: ${error}`);
    }

    // Имитация клика с движением мыши
    await itemsPage.mouse.move(
      Math.random() * 100 + 100,
      Math.random() * 100 + 100,
      { steps: Math.floor(Math.random() * 10 + 5) }
    );
    await new Promise(resolve => setTimeout(resolve, Math.random() * 300 + 200));

    await itemsPage.bringToFront();
    // Клик через evaluate для надежности
    await itemsPage.evaluate(() => {
      const button = document.querySelector("button.viewad-contact-submit") as HTMLButtonElement;
      if (button) {
        const rect = button.getBoundingClientRect();
        const x = rect.left + Math.random() * rect.width * 0.8 + rect.width * 0.1;
        const y = rect.top + Math.random() * rect.height * 0.8 + rect.height * 0.1;
        const clickEvent = new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y
        });
        button.dispatchEvent(clickEvent);
      }
    });

    if (options?.verifyPhone) {
      await this.verifyNumberWithRetries(options.verifyPhone.countryCode, options.verifyPhone.phoneNumber);
    }
  }

  public pause() {
    this.items = [];
  }

  public async close() {
    if (this.pollingIntervalId) {
      clearInterval(this.pollingIntervalId);
      this.pollingIntervalId = null;
    }
  }
}