import { getDb } from '../db';
import {
    User,
    CreateUserInput,
    UpdateUserInput,
    UserRole,
    Language
} from '../../interfaces/user';
import { AppError, ErrorCodes } from '../../utils/errors';
import Log from '../../utils/log';

/**
 * Репозиторий для работы с пользователями
 * Только SQL-запросы, никакой бизнес-логики!
 */
export const usersRepo = {
    /**
     * Создание нового пользователя
     */
    create(input: CreateUserInput): User {
        const db = getDb();

        try {
            const stmt = db.prepare(`
        INSERT INTO users (
          telegram_id, username, full_name, role, email, language
        ) VALUES (
          @telegramId, @username, @fullName, @role, @email, @language
        )
      `);

            const info = stmt.run({
                telegramId: input.telegramId,
                username: input.username || null,
                fullName: input.fullName || null,
                role: input.role || UserRole.EMPLOYEE,
                email: input.email || null,
                language: input.language || Language.RU,
            });

            Log.info({ userId: input.telegramId }, 'User created', {
                id: info.lastInsertRowid
            });

            return this.getByTelegramId(input.telegramId)!;
        } catch (error: any) {
            if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                throw new AppError(
                    ErrorCodes.ALREADY_EXISTS,
                    'User already exists',
                    { telegramId: input.telegramId }
                );
            }
            throw error;
        }
    },

    /**
     * Получение пользователя по Telegram ID
     */
    getByTelegramId(telegramId: number): User | null {
        const db = getDb();

        const stmt = db.prepare(`
      SELECT * FROM users WHERE telegram_id = ?
    `);

        const row = stmt.get(telegramId);

        if (!row) {
            return null;
        }

        return this.mapRowToUser(row);
    },

    /**
     * Получение пользователя по email
     */
    getByEmail(email: string): User | null {
        const db = getDb();

        const stmt = db.prepare(`
      SELECT * FROM users WHERE LOWER(email) = LOWER(?)
    `);

        const row = stmt.get(email);

        if (!row) {
            return null;
        }

        return this.mapRowToUser(row);
    },

    /**
     * Получение всех пользователей
     */
    getAll(role?: UserRole): User[] {
        const db = getDb();

        const stmt = role
            ? db.prepare('SELECT * FROM users WHERE role = ? ORDER BY created_at DESC')
            : db.prepare('SELECT * FROM users ORDER BY created_at DESC');

        const rows = role ? stmt.all(role) : stmt.all();

        return rows.map(row => this.mapRowToUser(row));
    },

    /**
     * Обновление пользователя
     */
    update(input: UpdateUserInput): User | null {
        const db = getDb();

        const updates: string[] = [];
        const params: any = { telegramId: input.telegramId };

        if (input.username !== undefined) {
            updates.push('username = @username');
            params.username = input.username;
        }

        if (input.fullName !== undefined) {
            updates.push('full_name = @fullName');
            params.fullName = input.fullName;
        }

        if (input.role !== undefined) {
            updates.push('role = @role');
            params.role = input.role;
        }

        if (input.email !== undefined) {
            updates.push('email = @email');
            params.email = input.email;
        }

        if (input.plankaUserId !== undefined) {
            updates.push('planka_user_id = @plankaUserId');
            params.plankaUserId = input.plankaUserId;
        }

        if (input.language !== undefined) {
            updates.push('language = @language');
            params.language = input.language;
        }

        if (updates.length === 0) {
            return this.getByTelegramId(input.telegramId);
        }

        updates.push('updated_at = CURRENT_TIMESTAMP');

        const stmt = db.prepare(`
      UPDATE users 
      SET ${updates.join(', ')}
      WHERE telegram_id = @telegramId
    `);

        const info = stmt.run(params);

        if (info.changes === 0) {
            return null;
        }

        Log.info({ userId: input.telegramId }, 'User updated', params);

        return this.getByTelegramId(input.telegramId);
    },

    /**
     * Удаление пользователя
     */
    delete(telegramId: number): boolean {
        const db = getDb();

        const stmt = db.prepare('DELETE FROM users WHERE telegram_id = ?');
        const info = stmt.run(telegramId);

        if (info.changes > 0) {
            Log.info({ userId: telegramId }, 'User deleted');
            return true;
        }

        return false;
    },

    /**
     * Получение владельцев
     */
    getOwners(): User[] {
        return this.getAll(UserRole.OWNER);
    },

    /**
     * Получение сотрудников
     */
    getEmployees(): User[] {
        return this.getAll(UserRole.EMPLOYEE);
    },

    /**
     * Проверка существования пользователя
     */
    exists(telegramId: number): boolean {
        const db = getDb();

        const stmt = db.prepare(
            'SELECT 1 FROM users WHERE telegram_id = ? LIMIT 1'
        );

        return !!stmt.get(telegramId);
    },

    /**
     * Маппинг строки БД в объект User
     */
    mapRowToUser(row: any): User {
        return {
            id: row.id,
            telegramId: row.telegram_id,
            username: row.username,
            fullName: row.full_name,
            role: row.role as UserRole,
            email: row.email,
            plankaUserId: row.planka_user_id,
            language: row.language as Language,
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at),
        };
    },
};