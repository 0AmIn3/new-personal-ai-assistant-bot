import { invitesRepo } from '../data/repo/invitesRepo';
import { getDb } from '../data/db';
import Log from '../utils/log';
import { TIMEOUTS } from '../config/constants';

/**
 * Очистка истёкших и неиспользованных данных
 */
export async function cleanupExpired(): Promise<void> {
    Log.job('cleanup', 'Starting cleanup job...');

    try {
        // 1. Очистка истёкших инвайтов
        const expiredInvites = await cleanupExpiredInvites();

        // 2. Очистка старых сессий создания задач
        const expiredSessions = await cleanupExpiredSessions();

        // 3. Очистка старых записей о напоминаниях (старше 30 дней)
        const oldReminders = await cleanupOldReminders();

        // 4. Очистка черновиков задач (незавершённые более 7 дней)
        const oldDrafts = await cleanupOldDrafts();

        // 5. Оптимизация БД
        await optimizeDatabase();

        Log.job('cleanup', 'Cleanup completed', {
            expiredInvites,
            expiredSessions,
            oldReminders,
            oldDrafts,
        });

    } catch (error) {
        Log.error({ job: 'cleanup' }, 'Cleanup job failed', error);
    }
}

/**
 * Очистка истёкших инвайтов
 */
async function cleanupExpiredInvites(): Promise<number> {
    try {
        const count = invitesRepo.cleanupExpired();

        if (count > 0) {
            Log.info({ job: 'cleanup' }, `Cleaned up ${count} expired invites`);
        }

        return count;
    } catch (error) {
        Log.error({ job: 'cleanup' }, 'Failed to cleanup invites', error);
        return 0;
    }
}

/**
 * Очистка старых сессий
 */
async function cleanupExpiredSessions(): Promise<number> {
    const db = getDb();

    try {
        // Удаляем сессии старше 24 часов
        const stmt = db.prepare(`
      DELETE FROM conversations 
      WHERE updated_at < datetime('now', '-1 day')
    `);

        const info = stmt.run();

        if (info.changes > 0) {
            Log.info({ job: 'cleanup' }, `Cleaned up ${info.changes} expired sessions`);
        }

        return info.changes;
    } catch (error) {
        Log.error({ job: 'cleanup' }, 'Failed to cleanup sessions', error);
        return 0;
    }
}

/**
 * Очистка старых напоминаний
 */
async function cleanupOldReminders(): Promise<number> {
    const db = getDb();

    try {
        // Удаляем записи о напоминаниях старше 30 дней
        const stmt = db.prepare(`
      DELETE FROM reminders 
      WHERE sent_at < datetime('now', '-30 days')
    `);

        const info = stmt.run();

        if (info.changes > 0) {
            Log.info({ job: 'cleanup' }, `Cleaned up ${info.changes} old reminders`);
        }

        return info.changes;
    } catch (error) {
        Log.error({ job: 'cleanup' }, 'Failed to cleanup reminders', error);
        return 0;
    }
}

/**
 * Очистка старых черновиков задач
 */
async function cleanupOldDrafts(): Promise<number> {
    const db = getDb();

    try {
        // Находим и удаляем задачи в статусе "draft" старше 7 дней
        // (если такой функционал будет добавлен)
        const stmt = db.prepare(`
      DELETE FROM tasks 
      WHERE status = 'draft' 
        AND created_at < datetime('now', '-7 days')
    `);

        const info = stmt.run();

        if (info.changes > 0) {
            Log.info({ job: 'cleanup' }, `Cleaned up ${info.changes} old drafts`);
        }

        return info.changes;
    } catch (error) {
        Log.error({ job: 'cleanup' }, 'Failed to cleanup drafts', error);
        return 0;
    }
}

/**
 * Оптимизация базы данных
 */
async function optimizeDatabase(): Promise<void> {
    const db = getDb();

    try {
        // VACUUM уменьшает размер файла БД
        db.prepare('VACUUM').run();

        // ANALYZE обновляет статистику для оптимизатора запросов
        db.prepare('ANALYZE').run();

        // Получаем размер БД после оптимизации
        const stats = db.prepare(`
      SELECT 
        page_count * page_size as size,
        page_count,
        page_size
      FROM pragma_page_count(), pragma_page_size()
    `).get() as { size: number; page_count: number; page_size: number };

        const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

        Log.info({ job: 'cleanup' }, 'Database optimized', {
            sizeMB,
            pages: stats.page_count,
        });

    } catch (error) {
        Log.error({ job: 'cleanup' }, 'Failed to optimize database', error);
    }
}

/**
 * Очистка временных файлов (если используются)
 */
export async function cleanupTempFiles(): Promise<number> {
    // Эта функция будет реализована, если добавится работа с файлами
    // Например, очистка загруженных, но не прикреплённых к задачам файлов

    Log.info({ job: 'cleanup' }, 'Temp files cleanup not implemented yet');
    return 0;
}

/**
 * Получение статистики по очистке
 */
export async function getCleanupStats(): Promise<{
    expiredInvites: number;
    oldReminders: number;
    databaseSizeMB: number;
}> {
    const db = getDb();

    try {
        // Считаем истёкшие инвайты
        const expiredInvitesStmt = db.prepare(`
      SELECT COUNT(*) as count FROM invites 
      WHERE expires_at < CURRENT_TIMESTAMP AND used_by IS NULL
    `);
        const expiredInvites = (expiredInvitesStmt.get() as { count: number }).count;

        // Считаем старые напоминания
        const oldRemindersStmt = db.prepare(`
      SELECT COUNT(*) as count FROM reminders 
      WHERE sent_at < datetime('now', '-30 days')
    `);
        const oldReminders = (oldRemindersStmt.get() as { count: number }).count;

        // Получаем размер БД
        const sizeStmt = db.prepare(`
      SELECT page_count * page_size as size
      FROM pragma_page_count(), pragma_page_size()
    `);
        const { size } = sizeStmt.get() as { size: number };
        const databaseSizeMB = Number((size / 1024 / 1024).toFixed(2));

        return {
            expiredInvites,
            oldReminders,
            databaseSizeMB,
        };

    } catch (error) {
        Log.error({ job: 'cleanup' }, 'Failed to get cleanup stats', error);
        return {
            expiredInvites: 0,
            oldReminders: 0,
            databaseSizeMB: 0,
        };
    }
}