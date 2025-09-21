import { getDb } from '../db';
import { UserSettings, UpdateSettingsInput } from '../../interfaces/user';
import Log from '../../utils/log';

/**
 * Репозиторий для работы с настройками пользователей
 */
export const settingsRepo = {
    /**
     * Получение настроек пользователя
     */
    get(userId: number): UserSettings | null {
        const db = getDb();

        const stmt = db.prepare(`
      SELECT * FROM settings WHERE user_id = ?
    `);

        const row = stmt.get(userId);

        if (!row) {
            return null;
        }

        return this.mapRowToSettings(row);
    },

    /**
     * Получение настроек с дефолтными значениями
     */
    getOrDefault(userId: number): UserSettings {
        const settings = this.get(userId);

        if (settings) {
            return settings;
        }

        // Возвращаем дефолтные настройки
        return {
            userId,
            digestHour: 9,
            digestEnabled: true,
            notificationsEnabled: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    },

    /**
     * Создание настроек для пользователя
     */
    create(userId: number): UserSettings {
        const db = getDb();

        const stmt = db.prepare(`
      INSERT INTO settings (
        user_id, 
        digest_hour, 
        digest_enabled, 
        notifications_enabled
      ) VALUES (?, 9, 1, 1)
    `);

        try {
            stmt.run(userId);

            Log.info({ userId }, 'User settings created');

            return this.get(userId)!;
        } catch (error: any) {
            if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                // Настройки уже существуют
                return this.get(userId)!;
            }
            throw error;
        }
    },

    /**
     * Обновление настроек
     */
    update(input: UpdateSettingsInput): UserSettings | null {
        const db = getDb();

        // Сначала проверяем существование
        let settings = this.get(input.userId);

        if (!settings) {
            // Создаём если не существует
            this.create(input.userId);
            settings = this.get(input.userId)!;
        }

        const updates: string[] = [];
        const params: any = { userId: input.userId };

        if (input.digestHour !== undefined) {
            updates.push('digest_hour = @digestHour');
            params.digestHour = input.digestHour;
        }

        if (input.digestEnabled !== undefined) {
            updates.push('digest_enabled = @digestEnabled');
            params.digestEnabled = input.digestEnabled ? 1 : 0;
        }

        if (input.notificationsEnabled !== undefined) {
            updates.push('notifications_enabled = @notificationsEnabled');
            params.notificationsEnabled = input.notificationsEnabled ? 1 : 0;
        }

        if (updates.length === 0) {
            return settings;
        }

        updates.push('updated_at = CURRENT_TIMESTAMP');

        const stmt = db.prepare(`
      UPDATE settings 
      SET ${updates.join(', ')}
      WHERE user_id = @userId
    `);

        stmt.run(params);

        Log.info({ userId: input.userId }, 'Settings updated', params);

        return this.get(input.userId);
    },

    /**
     * Включение/отключение дайджеста
     */
    setDigestEnabled(userId: number, enabled: boolean): boolean {
        const result = this.update({
            userId,
            digestEnabled: enabled,
        });

        return result !== null;
    },

    /**
     * Установка времени дайджеста
     */
    setDigestHour(userId: number, hour: number): boolean {
        if (hour < 0 || hour > 23) {
            throw new Error('Hour must be between 0 and 23');
        }

        const result = this.update({
            userId,
            digestHour: hour,
        });

        return result !== null;
    },

    /**
     * Включение/отключение уведомлений
     */
    setNotificationsEnabled(userId: number, enabled: boolean): boolean {
        const result = this.update({
            userId,
            notificationsEnabled: enabled,
        });

        return result !== null;
    },

    /**
     * Получение пользователей с включенным дайджестом на определённый час
     */
    getUsersForDigest(hour: number): number[] {
        const db = getDb();

        const stmt = db.prepare(`
      SELECT user_id FROM settings 
      WHERE digest_enabled = 1 AND digest_hour = ?
    `);

        const rows = stmt.all(hour) as Array<{ user_id: number }>;

        return rows.map(row => row.user_id);
    },

    /**
     * Получение пользователей с включенными уведомлениями
     */
    getUsersWithNotifications(): number[] {
        const db = getDb();

        const stmt = db.prepare(`
      SELECT user_id FROM settings 
      WHERE notifications_enabled = 1
    `);

        const rows = stmt.all() as Array<{ user_id: number }>;

        return rows.map(row => row.user_id);
    },

    /**
     * Удаление настроек пользователя
     */
    delete(userId: number): boolean {
        const db = getDb();

        const stmt = db.prepare('DELETE FROM settings WHERE user_id = ?');
        const info = stmt.run(userId);

        if (info.changes > 0) {
            Log.info({ userId }, 'Settings deleted');
            return true;
        }

        return false;
    },

    /**
     * Получение статистики по настройкам
     */
    getStats(): {
        total: number;
        digestEnabled: number;
        notificationsEnabled: number;
        byDigestHour: Record<number, number>;
    } {
        const db = getDb();

        const totalStmt = db.prepare('SELECT COUNT(*) as count FROM settings');
        const total = (totalStmt.get() as { count: number }).count;

        const digestStmt = db.prepare(
            'SELECT COUNT(*) as count FROM settings WHERE digest_enabled = 1'
        );
        const digestEnabled = (digestStmt.get() as { count: number }).count;

        const notifStmt = db.prepare(
            'SELECT COUNT(*) as count FROM settings WHERE notifications_enabled = 1'
        );
        const notificationsEnabled = (notifStmt.get() as { count: number }).count;

        const hourStmt = db.prepare(`
      SELECT digest_hour, COUNT(*) as count 
      FROM settings 
      WHERE digest_enabled = 1
      GROUP BY digest_hour
    `);
        const hourRows = hourStmt.all() as Array<{ digest_hour: number; count: number }>;

        const byDigestHour: Record<number, number> = {};
        for (const row of hourRows) {
            byDigestHour[row.digest_hour] = row.count;
        }

        return {
            total,
            digestEnabled,
            notificationsEnabled,
            byDigestHour,
        };
    },

    /**
     * Массовое обновление настроек
     */
    bulkUpdate(
        userIds: number[],
        settings: Partial<Omit<UpdateSettingsInput, 'userId'>>
    ): number {
        let updated = 0;

        for (const userId of userIds) {
            const result = this.update({
                userId,
                ...settings,
            });

            if (result) {
                updated++;
            }
        }

        Log.info(
            {},
            'Bulk settings update',
            {
                usersCount: userIds.length,
                updated,
                settings,
            }
        );

        return updated;
    },

    /**
     * Маппинг строки БД в объект
     */
    mapRowToSettings(row: any): UserSettings {
        return {
            userId: row.user_id,
            digestHour: row.digest_hour,
            digestEnabled: Boolean(row.digest_enabled),
            notificationsEnabled: Boolean(row.notifications_enabled),
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at),
        };
    },
};

/**
 * Хелперы для работы с настройками
 */
export const settingsHelpers = {
    /**
     * Инициализация настроек для нового пользователя
     */
    initForUser(userId: number): UserSettings {
        return settingsRepo.create(userId);
    },

    /**
     * Переключение настройки (toggle)
     */
    toggleDigest(userId: number): boolean {
        const settings = settingsRepo.getOrDefault(userId);
        return settingsRepo.setDigestEnabled(userId, !settings.digestEnabled);
    },

    /**
     * Переключение уведомлений
     */
    toggleNotifications(userId: number): boolean {
        const settings = settingsRepo.getOrDefault(userId);
        return settingsRepo.setNotificationsEnabled(userId, !settings.notificationsEnabled);
    },

    /**
     * Форматирование настроек для отображения
     */
    format(settings: UserSettings, lang: 'ru' | 'uz' = 'ru'): string {
        const lines = [];

        if (lang === 'uz') {
            lines.push('⚙️ **Sizning sozlamalaringiz:**');
            lines.push('');
            lines.push(`📊 Kunlik dayjest: ${settings.digestEnabled ? '✅ Yoqilgan' : '❌ Oʻchirilgan'}`);

            if (settings.digestEnabled) {
                lines.push(`⏰ Dayjest vaqti: ${settings.digestHour}:00`);
            }

            lines.push(`🔔 Bildirishnomalar: ${settings.notificationsEnabled ? '✅ Yoqilgan' : '❌ Oʻchirilgan'}`);
        } else {
            lines.push('⚙️ **Ваши настройки:**');
            lines.push('');
            lines.push(`📊 Ежедневный дайджест: ${settings.digestEnabled ? '✅ Включен' : '❌ Отключен'}`);

            if (settings.digestEnabled) {
                lines.push(`⏰ Время дайджеста: ${settings.digestHour}:00`);
            }

            lines.push(`🔔 Уведомления: ${settings.notificationsEnabled ? '✅ Включены' : '❌ Отключены'}`);
        }

        return lines.join('\n');
    },
};