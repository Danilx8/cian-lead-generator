import { Page } from "puppeteer-core";
import { logAdminEvent } from "./logger";

// временный класс для мониторинга запросов для переезда с js-инъекций
export class ApiMonitor {
    private knownFields: Set<string>;
    private specialCaseCount: number;
    private readonly page: Page;

    constructor(page: Page) {
        this.knownFields = new Set(['_meta', 'numUnread', 'numUnreadMessages', 'lastModified', '_links', 'conversations']);
        this.specialCaseCount = 0;
        this.page = page;
    }

    async start() {
        // Перехват ответов
        this.page.on('response', async (response) => {
            const url = response.url();

            // Проверяем паттерн URL: /users/{userId}/conversations
            if (this.matchesApiPattern(url)) {
                try {
                    const data = await response.json();
                    this.analyzeResponse(data, url);
                } catch (error) {
                    // Игнорируем ошибки парсинга
                }
            }
        });
    }

    matchesApiPattern(url: string) {
        return /\/users\/\d+\/conversations/.test(url);
    }

    analyzeResponse(data: any, url: string) {
        // Пропускаем запросы где _meta - единственное поле
        if (Object.keys(data).length === 1 && data._meta) {
            return;
        }

        this.specialCaseCount++;

        logAdminEvent(`\n[${new Date().toISOString()}] Special case #${this.specialCaseCount}`);
        logAdminEvent(`URL: ${url}`);

        // Проверяем наличие специальных полей
        const specialFields = ['numUnread', 'numUnreadMessages', 'lastModified', '_links', 'conversations'];
        const presentFields = specialFields.filter(field => data.hasOwnProperty(field));

        if (presentFields.length > 0) {
            logAdminEvent(`Present special fields: ${presentFields.join(', ')}`);
        }

        // Проверяем неизвестные поля
        const unknownFields = Object.keys(data).filter(key => !this.knownFields.has(key));
        if (unknownFields.length > 0) {
            logAdminEvent(`⚠️  UNKNOWN FIELDS DETECTED: ${unknownFields.join(', ')}`);

            // Если есть поле categories - логируем полный ответ
            if (data.hasOwnProperty('categories')) {
                logAdminEvent(`Full response (contains categories): ${JSON.stringify(data, null, 2)}`);
            } else {
                logAdminEvent(`Full response: ${JSON.stringify(data, null, 2)}`);
            }
        }

        // Логируем _meta если есть
        if (data._meta) {
            logAdminEvent(`_meta: ${JSON.stringify(data._meta)}`);
        }
    }
}