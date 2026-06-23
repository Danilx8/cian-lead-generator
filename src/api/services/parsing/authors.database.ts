import Database, { Statement } from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";

export class AuthorsDatabase {
  private static instance: AuthorsDatabase | null = null;
  private db: Database.Database;

  // Подготовленные запросы
  private checkBlacklistStmt: Statement;
  private insertBlacklistStmt: Statement;
  private getAllBlacklistedStmt: Statement;

  private constructor(databasePath: string = ":memory:") {
    // Создаем папку, если путь не ":memory:"
    if (databasePath !== ":memory:") {
      const dbDir = dirname(databasePath);
      if (!existsSync(dbDir)) {
        mkdirSync(dbDir, { recursive: true });
        console.log(`Created directory: ${dbDir}`);
      }
    }

    this.db = new Database(databasePath);

    // Оптимизации для высокой конкурентности и скорости
    this.db.exec("PRAGMA journal_mode = WAL;"); // Write-Ahead Logging для конкурентности
    this.db.exec("PRAGMA synchronous = NORMAL;"); // Баланс скорости и надежности
    this.db.exec("PRAGMA cache_size = -20000;"); // Кэш 20 МБ для ускорения операций
    this.db.exec("PRAGMA temp_store = MEMORY;"); // Временные таблицы в памяти
    this.db.exec("PRAGMA busy_timeout = 5000;"); // Таймаут 5 сек для обработки блокировок
    this.db.exec("PRAGMA journal_size_limit = 10000000;"); // Ограничение WAL-файла (10 МБ)
    this.db.exec("PRAGMA foreign_keys = OFF;"); // Отключаем внешние ключи (не нужны для блэклиста)

    // Создаем таблицу с индексом
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS blacklist (
        entry TEXT PRIMARY KEY
      );
      CREATE INDEX IF NOT EXISTS idx_blacklist_entry ON blacklist(entry);
    `);

    // Подготавливаем запросы
    this.checkBlacklistStmt = this.db.prepare("SELECT EXISTS (SELECT 1 FROM blacklist WHERE entry = ?)");
    this.insertBlacklistStmt = this.db.prepare("INSERT OR IGNORE INTO blacklist (entry) VALUES (?)");
    this.getAllBlacklistedStmt = this.db.prepare("SELECT entry FROM blacklist");
  }

  /**
   * Получить единственный экземпляр класса (Singleton)
   */
  public static getInstance(databasePath: string = ":memory:"): AuthorsDatabase {
    if (!AuthorsDatabase.instance) {
      AuthorsDatabase.instance = new AuthorsDatabase(databasePath);
    }
    return AuthorsDatabase.instance;
  }

  /**
   * Проверяет, разрешён ли автор (т.е. его нет в чёрном списке)
   */
  public isAuthorAllowed(authorId: string): boolean {
    const result = this.checkBlacklistStmt.get(authorId) as { [key: string]: number };
    return result[Object.keys(result)[0]] !== 1; // Проверяем результат EXISTS
  }

  /**
   * Проверяет, находится ли автор в чёрном списке
   */
  public isInBlacklist(authorId: string): boolean {
    const result = this.checkBlacklistStmt.get(authorId) as { [key: string]: number };
    return result[Object.keys(result)[0]] === 1; // Проверяем результат EXISTS
  }

  /**
   * Добавить автора в чёрный список (если ещё не добавлен)
   */
  public addToBlacklist(authorId: string): void {
    this.insertBlacklistStmt.run(authorId);
  }

  /**
   * Получить все записи из чёрного списка
   */
  public getAllBlacklisted(): string[] {
    return (this.getAllBlacklistedStmt.all() as Array<{ entry: string }>)
      .map(row => row.entry);
  }

  /**
   * Периодическая очистка WAL-файла
   */
  public checkpoint(): void {
    this.db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
  }

  /**
   * Закрыть соединение с базой данных
   */
  public close(): void {
    this.checkpoint(); // Очистка WAL перед закрытием
    this.db.close();
    AuthorsDatabase.instance = null;
  }
}