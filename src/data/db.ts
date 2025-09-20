import Database from 'better-sqlite3';
import { config } from '../config/env';
import Log from '../utils/log';

let db: Database.Database | null = null;

/**
 * Инициализация подключения к БД
 */
export function initDatabase(): Database.Database {
    if (db) return db;

    try {
        db = new Database(config.database.path, {
            verbose: config.env.isDevelopment ? console.log : undefined,
        });

        // Включаем WAL mode для лучшей производительности
        db.pragma('journal_mode = WAL');

        Log.info({}, 'Database connected', { path: config.database.path });

        // Создаём таблицы
        createTables(db);

        return db;
    } catch (error) {
        Log.error({}, 'Failed to initialize database', error);
        throw error;
    }
}

/**
 * Создание таблиц при старте (idempotent)
 */
function createTables(db: Database.Database): void {
    // Таблица пользователей
    db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      telegram_id INTEGER UNIQUE NOT NULL,
      username TEXT,
      full_name TEXT,
      role TEXT CHECK(role IN ('admin', 'owner', 'employee')) DEFAULT 'employee',
      email TEXT UNIQUE,
      planka_user_id TEXT,
      language TEXT DEFAULT 'ru',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
  `);

    // Таблица инвайтов
    db.exec(`
    CREATE TABLE IF NOT EXISTS invites (
      id INTEGER PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      created_by INTEGER NOT NULL,
      expires_at DATETIME NOT NULL,
      used_by INTEGER,
      used_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(telegram_id),
      FOREIGN KEY (used_by) REFERENCES users(telegram_id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_invites_token ON invites(token);
    CREATE INDEX IF NOT EXISTS idx_invites_expires_at ON invites(expires_at);
  `);

    // Таблица задач (локальная связка с Planka)
    db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY,
      planka_card_id TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT DEFAULT 'medium',
      category TEXT DEFAULT 'other',
      status TEXT DEFAULT 'todo',
      created_by INTEGER NOT NULL,
      assigned_to INTEGER,
      chat_id INTEGER NOT NULL,
      due_date DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(telegram_id),
      FOREIGN KEY (assigned_to) REFERENCES users(telegram_id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_tasks_planka_card_id ON tasks(planka_card_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
  `);

    // Таблица напоминаний
    db.exec(`
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY,
      task_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      type TEXT CHECK(type IN ('24h', '6h', '2h')) NOT NULL,
      sent_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES tasks(id),
      FOREIGN KEY (user_id) REFERENCES users(telegram_id),
      UNIQUE(task_id, user_id, type)
    );
    
    CREATE INDEX IF NOT EXISTS idx_reminders_sent_at ON reminders(sent_at);
  `);

    // Таблица состояний диалогов
    db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY,
      chat_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      last_intent TEXT,
      context TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(chat_id, user_id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_conversations_chat_user ON conversations(chat_id, user_id);
  `);

    // Таблица настроек
    db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY,
      user_id INTEGER UNIQUE NOT NULL,
      digest_hour INTEGER DEFAULT 9,
      digest_enabled BOOLEAN DEFAULT 1,
      notifications_enabled BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(telegram_id)
    );
  `);

    Log.info({}, 'Database tables created/verified');
}

/**
 * Получение подключения к БД
 */
export function getDb(): Database.Database {
    if (!db) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return db;
}

/**
 * Закрытие подключения
 */
export function closeDatabase(): void {
    if (db) {
        db.close();
        db = null;
        Log.info({}, 'Database connection closed');
    }
}

/**
 * Хелпер для транзакций
 */
export function transaction<T>(fn: (db: Database.Database) => T): T {
    const database = getDb();
    return database.transaction(fn)(database);
}