import { getDb } from '../db';
import Log from '../../utils/log';

/**
 * Интерфейс для состояния диалога
 */
export interface Conversation {
    id: number;
    chatId: number;
    userId: number;
    lastIntent?: string;
    context?: any;
    updatedAt: Date;
}

/**
 * Репозиторий для работы с состояниями диалогов
 */
export const convRepo = {
    /**
     * Получение состояния диалога
     */
    get(chatId: number, userId: number): Conversation | null {
        const db = getDb();

        const stmt = db.prepare(`
      SELECT * FROM conversations 
      WHERE chat_id = ? AND user_id = ?
    `);

        const row = stmt.get(chatId, userId);

        if (!row) {
            return null;
        }

        return this.mapRowToConversation(row);
    },

    /**
     * Сохранение состояния диалога
     */
    save(
        chatId: number,
        userId: number,
        lastIntent?: string,
        context?: any
    ): Conversation {
        const db = getDb();

        const contextJson = context ? JSON.stringify(context) : null;

        const stmt = db.prepare(`
      INSERT INTO conversations (chat_id, user_id, last_intent, context, updated_at)
      VALUES (@chatId, @userId, @lastIntent, @context, CURRENT_TIMESTAMP)
      ON CONFLICT(chat_id, user_id) 
      DO UPDATE SET 
        last_intent = @lastIntent,
        context = @context,
        updated_at = CURRENT_TIMESTAMP
    `);

        stmt.run({
            chatId,
            userId,
            lastIntent: lastIntent || null,
            context: contextJson,
        });

        return this.get(chatId, userId)!;
    },

    /**
     * Обновление контекста диалога
     */
    updateContext(
        chatId: number,
        userId: number,
        context: any
    ): boolean {
        const db = getDb();

        const stmt = db.prepare(`
      UPDATE conversations 
      SET context = ?, updated_at = CURRENT_TIMESTAMP
      WHERE chat_id = ? AND user_id = ?
    `);

        const info = stmt.run(
            JSON.stringify(context),
            chatId,
            userId
        );

        return info.changes > 0;
    },

    /**
     * Обновление интента
     */
    updateIntent(
        chatId: number,
        userId: number,
        intent: string
    ): boolean {
        const db = getDb();

        const stmt = db.prepare(`
      UPDATE conversations 
      SET last_intent = ?, updated_at = CURRENT_TIMESTAMP
      WHERE chat_id = ? AND user_id = ?
    `);

        const info = stmt.run(intent, chatId, userId);

        return info.changes > 0;
    },

    /**
     * Очистка состояния диалога
     */
    clear(chatId: number, userId: number): boolean {
        const db = getDb();

        const stmt = db.prepare(`
      DELETE FROM conversations 
      WHERE chat_id = ? AND user_id = ?
    `);

        const info = stmt.run(chatId, userId);

        if (info.changes > 0) {
            Log.info(
                { chatId, userId },
                'Conversation state cleared'
            );
        }

        return info.changes > 0;
    },

    /**
     * Получение всех активных диалогов пользователя
     */
    getUserConversations(userId: number): Conversation[] {
        const db = getDb();

        const stmt = db.prepare(`
      SELECT * FROM conversations 
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `);

        const rows = stmt.all(userId);

        return rows.map(row => this.mapRowToConversation(row));
    },

    /**
     * Получение всех диалогов в чате
     */
    getChatConversations(chatId: number): Conversation[] {
        const db = getDb();

        const stmt = db.prepare(`
      SELECT * FROM conversations 
      WHERE chat_id = ?
      ORDER BY updated_at DESC
    `);

        const rows = stmt.all(chatId);

        return rows.map(row => this.mapRowToConversation(row));
    },

    /**
     * Очистка старых диалогов
     */
    clearOld(daysOld: number = 7): number {
        const db = getDb();

        const stmt = db.prepare(`
      DELETE FROM conversations 
      WHERE updated_at < datetime('now', '-' || ? || ' days')
    `);

        const info = stmt.run(daysOld);

        if (info.changes > 0) {
            Log.info(
                {},
                'Old conversations cleared',
                { count: info.changes, daysOld }
            );
        }

        return info.changes;
    },

    /**
     * Получение статистики по диалогам
     */
    getStats(): {
        total: number;
        active24h: number;
        byIntent: Record<string, number>;
    } {
        const db = getDb();

        const totalStmt = db.prepare('SELECT COUNT(*) as count FROM conversations');
        const total = (totalStmt.get() as { count: number }).count;

        const activeStmt = db.prepare(`
      SELECT COUNT(*) as count FROM conversations 
      WHERE updated_at > datetime('now', '-1 day')
    `);
        const active24h = (activeStmt.get() as { count: number }).count;

        const intentStmt = db.prepare(`
      SELECT last_intent, COUNT(*) as count 
      FROM conversations 
      WHERE last_intent IS NOT NULL
      GROUP BY last_intent
    `);
        const intentRows = intentStmt.all() as Array<{ last_intent: string; count: number }>;

        const byIntent: Record<string, number> = {};
        for (const row of intentRows) {
            byIntent[row.last_intent] = row.count;
        }

        return {
            total,
            active24h,
            byIntent,
        };
    },

    /**
     * Маппинг строки БД в объект
     */
    mapRowToConversation(row: any): Conversation {
        return {
            id: row.id,
            chatId: row.chat_id,
            userId: row.user_id,
            lastIntent: row.last_intent,
            context: row.context ? JSON.parse(row.context) : undefined,
            updatedAt: new Date(row.updated_at),
        };
    },
};

/**
 * Хелперы для работы с контекстом
 */
export const contextHelpers = {
    /**
     * Добавление данных в контекст
     */
    addToContext(
        chatId: number,
        userId: number,
        key: string,
        value: any
    ): void {
        const conv = convRepo.get(chatId, userId);
        const context = conv?.context || {};

        context[key] = value;

        if (conv) {
            convRepo.updateContext(chatId, userId, context);
        } else {
            convRepo.save(chatId, userId, undefined, context);
        }
    },

    /**
     * Получение данных из контекста
     */
    getFromContext(
        chatId: number,
        userId: number,
        key: string
    ): any {
        const conv = convRepo.get(chatId, userId);
        return conv?.context?.[key];
    },

    /**
     * Удаление данных из контекста
     */
    removeFromContext(
        chatId: number,
        userId: number,
        key: string
    ): void {
        const conv = convRepo.get(chatId, userId);

        if (conv?.context?.[key]) {
            delete conv.context[key];
            convRepo.updateContext(chatId, userId, conv.context);
        }
    },

    /**
     * Проверка наличия ключа в контексте
     */
    hasInContext(
        chatId: number,
        userId: number,
        key: string
    ): boolean {
        const conv = convRepo.get(chatId, userId);
        return !!(conv?.context?.[key]);
    },
};