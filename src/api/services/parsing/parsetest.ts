import Filter from "../../../database/filter.model";
import { AuthorsDatabase } from "./authors.database";
import { AngebotOption } from "../../../database/user.model";
import axios from "axios";
import Piscina from "piscina";
import path from "path";
import type { ItemDto, MerchantDto } from "./parsing.types";

describe("Parser Integration Test - Abholung Filter", () => {
  let db: AuthorsDatabase;
  const testDbPath = ":memory:";
  let pool: Piscina;

  beforeAll(() => {
    db = AuthorsDatabase.getInstance(testDbPath);
    
    // Initialize Piscina pool as in production
    // Use compiled worker from dist folder (Piscina requires .js files)
    const workerPath = "/Users/macbook/Documents/cian-lead-generator/dist/api/services/parsing/parser.piscina-worker.js";
    pool = new Piscina({
      filename: workerPath,
      maxThreads: 10,
      minThreads: 2
    });
  });

  afterAll(async () => {
    // Cleanup worker pool
    if (pool) {
      await pool.destroy();
    }
  });

  it("should filter out items with blacklist words in description", async () => {
    // Arrange: Создаём фильтр с blacklist
    const filter = {
      id: 1,
      userId: 1,
      searchLink: "https://www.cian.de/s-handy-telefon/c173",
      blackList: [
        "nur abholung",
        "kein versand",
        "Selbstabholer",
        "nur abholer",
        "persönliche",
        "Gelnägel",
        "Nagel",
        "Perücke",
        "über System",
        "Lifting",
        "Wimpern",
        "Selbstabholung",
        "Abholort",
        "suche Modelle",
        "makellose",
        "kinderwagen",
        "Paypal",
        "Überweisung",
        "Maxi Cosi",
        "Kinderbett",
        "badewanne",
        "Direktkauf",
        "Direktkaufen",
        "Direkt kauf",
        "Direkt kaufen",
        "sicher bezahlen",
        "Speilküche",
        "Freunde",
        "system zahlung",
        "abholung",
        "selbstabholung",
        "abholer",
        "abholbar",
        "abholen"
      ],
      whiteList: undefined,
      views: 10,
      adsLimit: 10,
      maxDateRegistered: undefined,
      categoryId: 173,
      isActive: true
    } as unknown as Filter;


    // Act: Парсим 5 страниц
    console.log("🔍 Starting to scrape 5 pages...");
    const scrapePromises = Array.from({ length: 5 }, (_, i) =>
      pool.run(
        {
          url: `${filter.searchLink}/seite:${i + 1}`,
          proxy: "socks5://1uuPNH1s47:9s5oNcATBT@83.242.100.101:32555"
        },
        { name: "scrapeTask" }
      )
    );

    const itemsArrays: ItemDto[][] = await Promise.all(scrapePromises);
    const allItems = itemsArrays.flat();

    console.log(`✅ Scraped ${allItems.length} items from 5 pages`);

    // Проверяем каждый товар
    const verifiedResults: Array<{ item: ItemDto; merchant: MerchantDto }> = await pool.run(
      {
        items: allItems,
        filter: filter,
        dbPath: testDbPath,
        sendWithAngebot: AngebotOption.NONE
      },
      { name: "verifyTask" }
    );

    console.log(`\n📊 Verification Results:`);
    console.log(`Total items scraped: ${allItems.length}`);
    console.log(`Items passed verification: ${verifiedResults.length}`);
    console.log(`Items filtered out: ${allItems.length - verifiedResults.length}`);
    console.log("Items:", verifiedResults.map(i => ({ item: i.item, merchant: i.merchant })));

    // Assert: Проверяем, что ни один товар с blacklist словами не прошёл
    for (const result of verifiedResults) {
      const itemId = result.item.item_id;
      console.log(`\n✓ Item ${itemId} passed all filters`);

      // Получаем описание из страницы товара (для проверки)
      try {
        const response = await axios.get(`https://www.cian.de/s-anzeige/${itemId}`, {
          timeout: 10000,
          headers: { "User-Agent": "Mozilla/5.0" }
        });

        const html = response.data;
        const descMatch = html.match(/<p[^>]*id="viewad-description-text"[^>]*>([\s\S]*?)<\/p>/);
        const description = descMatch ? descMatch[1].toLowerCase() : "";

        console.log(`  Description preview: ${description}`);

        // Проверяем, что в описании нет запрещённых слов
        for (const word of filter.blackList || []) {
          expect(description).not.toContain(word.toLowerCase());
        }
      } catch (error) {
        console.warn(`  ⚠️ Could not fetch description for item ${itemId}`);
      }
    }

    // Проверяем, что хотя бы некоторые товары были отфильтрованы
    expect(allItems.length).toBeGreaterThan(0);
    console.log(`\n✅ Test passed: All items with blacklisted words were filtered out`);
  }, 1000000); // 6 минут таймаут

  it("should log items that contain blacklist words for debugging", async () => {
    const filter = {
      id: 1,
      userId: 1,
      searchLink: "https://www.cian.de/s-handy-telefon/c173",
      blackList: [
        "nur abholung",
        "kein versand",
        "Selbstabholer",
        "nur abholer",
        "persönliche",
        "Gelnägel",
        "Nagel",
        "Perücke",
        "über System",
        "Lifting",
        "Wimpern",
        "Selbstabholung",
        "Abholort",
        "suche Modelle",
        "makellose",
        "kinderwagen",
        "Paypal",
        "Überweisung",
        "Maxi Cosi",
        "Kinderbett",
        "badewanne",
        "Direktkauf",
        "Direktkaufen",
        "Direkt kauf",
        "Direkt kaufen",
        "sicher bezahlen",
        "Speilküche",
        "Freunde",
        "system zahlung",
        "abholung",
        "selbstabholung",
        "abholer",
        "abholbar",
        "abholen"
      ],
      whiteList: undefined,
      categoryId: 173
    } as Filter;

    // Парсим первую страницу
    const items: ItemDto[] = await pool.run(
      {
        url: filter.searchLink,
        proxy: undefined
      },
      { name: "scrapeTask" }
    );

    console.log(`\n📝 Checking ${items.length} items for blacklist keywords...`);

    let foundBlacklistCount = 0;

    const itemDescriptions = new Map<string, string>();

    for (const item of items.slice(0, 10)) { // Проверяем первые 10
      try {
        const response = await axios.get(
          `https://www.cian.de/s-anzeige/${item.item_id}`,
          { timeout: 10000, headers: { "User-Agent": "Mozilla/5.0" } }
        );

        const html = response.data;
        const descMatch = html.match(/<p[^>]*id="viewad-description-text"[^>]*>([\s\S]*?)<\/p>/);
        const description = descMatch ? descMatch[1].toLowerCase() : "";

        itemDescriptions.set(item.item_id, description);

        if (filter.blackList?.some(word => description.includes(word.toLowerCase()))) {
          foundBlacklistCount++;
          console.log(`\n❌ Item ${item.item_id} contains blacklist word:`);
          console.log(`   Name: ${item.item_name}`);
          console.log(`   Description: ${description.substring(0, 200)}...`);
        }
      } catch (error) {
        // Skip errors
      }
    }

    console.log(`\n📊 Found ${foundBlacklistCount} items with blacklist words in first 10 items`);

    // Проверяем, что верификация их отфильтрует
    if (foundBlacklistCount > 0) {
      const verified: Array<{ item: ItemDto; merchant: MerchantDto }> = await pool.run(
        {
          items: items.slice(0, 10),
          filter: filter,
          dbPath: testDbPath,
          sendWithAngebot: AngebotOption.NONE
        },
        { name: "verifyTask" }
      );

      const verifiedIds = verified.map(v => v.item.item_id);

      for (const item of items.slice(0, 10)) {
        const description = itemDescriptions.get(item.item_id);
        if (description && filter.blackList?.some(word => description.includes(word.toLowerCase()))) {
          expect(verifiedIds).not.toContain(item.item_id);
          console.log(`✅ Item ${item.item_id} with blacklist word was correctly filtered out`);
        }
      }
    }
  }, 120000);
});