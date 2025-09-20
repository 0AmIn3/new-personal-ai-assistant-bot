import { getDb } from '../db';
import { AppError, ErrorCodes } from '../../utils/errors';
import Log from '../../utils/log';
import { nanoid } from 'nanoid';

/**
 * Интерфейс инвайта
 */
export interface Invite {
    id: number;
    token: string;
    createdBy: number;
    expiresAt: Date;
    usedBy?: number;
    usedAt?: Date;
    createdAt: Date;
}

/**
 * Репозиторий для работы с инвайтами
 */
export const invitesRepo = {
    /**
     * Создание нового инвайта
     */
    create(createdBy: number, ttlHours: number = 24): Invite {
        const db = getDb();

        const token = nanoid(10); // Генерируем короткий токен
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + ttlHours);

        try {
            const stmt = db.prepare(`
        INSERT INTO invites (token, created_by, expires_at)
        VALUES (@token, @createdBy, @expiresAt)
      `);

            const info = stmt.run({
                token,
                createdBy,
                expiresAt: expiresAt.toISOString(),
            });

            Log.info({ userId: createdBy }, 'Invite created', {
                token,
                expiresAt,
            });

            return this.getByToken(token)!;
        } catch (error: any) {
            if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                // Если токен уже существует (маловероятно), пробуем ещё раз
                return this.create(createdBy, ttlHours);
            }
            throw error;
        }
    },

    /**
     * Получение инвайта по токену
     */
    getByToken(token: string): Invite | null {
        const db = getDb();

        const stmt = db.prepare(`
      SELECT * FROM invites WHERE token = ?
    `);

        const row = stmt.get(token);

        if (!row) {
            return null;
        }

        return this.mapRowToInvite(row);
    },

    /**
     * Получение активных инвайтов пользователя
     */
    getUserActiveInvites(userId: number): Invite[] {
        const db = getDb();

        const stmt = db.prepare(`
      SELECT * FROM invites 
      WHERE created_by = ? 
        AND expires_at > CURRENT_TIMESTAMP
        AND used_by IS NULL
      ORDER BY created_at DESC
    `);

        const rows = stmt.all(userId);

        return rows.map(row => this.mapRowToInvite(row));
    },

    /**
     * Получение всех инвайтов пользователя
     */
    getUserInvites(userId: number): Invite[] {
        const db = getDb();

        const stmt = db.prepare(`
      SELECT * FROM invites 
      WHERE created_by = ?
      ORDER BY created_at DESC
    `);

        const rows = stmt.all(userId);

        return rows.map(row => this.mapRowToInvite(row));
    },

    /**
     * Использование инвайта
     */
    use(token: string, usedBy: number): Invite {
        const db = getDb();

        // Проверяем существование и валидность
        const invite = this.getByToken(token);

        if (!invite) {
            throw new AppError(
                ErrorCodes.NOT_FOUND,
                'Invite not found',
                { token }
            );
        }

        if (invite.usedBy) {
            throw new AppError(
                ErrorCodes.INVITE_ALREADY_USED,
                'Invite already used',
                { token, usedBy: invite.usedBy }
            );
        }

        if (new Date(invite.expiresAt) < new Date()) {
            throw new AppError(
                ErrorCodes.INVITE_EXPIRED,
                'Invite expired',
                { token, expiresAt: invite.expiresAt }
            );
        }

        // Помечаем как использованный
        const stmt = db.prepare(`
      UPDATE invites 
      SET used_by = @usedBy, used_at = CURRENT_TIMESTAMP
      WHERE token = @token
    `);

        stmt.run({ token, usedBy });

        Log.info({ userId: usedBy }, 'Invite used', { token });

        return this.getByToken(token)!;
    },

    /**
     * Проверка валидности инвайта
     */
    isValid(token: string): boolean {
        const invite = this.getByToken(token);

        if (!invite) {
            return false;
        }

        if (invite.usedBy) {
            return false;
        }

        if (new Date(invite.expiresAt) < new Date()) {
            return false;
        }

        return true;
    },

    /**
     * Удаление истёкших инвайтов
     */
    cleanupExpired(): number {
        const db = getDb();

        const stmt = db.prepare(`
      DELETE FROM invites 
      WHERE expires_at < CURRENT_TIMESTAMP 
        AND used_by IS NULL
    `);

        const info = stmt.run();

        if (info.changes > 0) {
            Log.info({}, 'Expired invites cleaned up', { count: info.changes });
        }

        return info.changes;
    },

    /**
     * Продление инвайта
     */
    extend(token: string, additionalHours: number): Invite | null {
        const db = getDb();

        const invite = this.getByToken(token);

        if (!invite || invite.usedBy) {
            return null;
        }

        const newExpiresAt = new Date(invite.expiresAt);
        newExpiresAt.setHours(newExpiresAt.getHours() + additionalHours);

        const stmt = db.prepare(`
      UPDATE invites 
      SET expires_at = @expiresAt
      WHERE token = @token
    `);

        stmt.run({
            token,
            expiresAt: newExpiresAt.toISOString(),
        });

        Log.info({}, 'Invite extended', { token, newExpiresAt });

        return this.getByToken(token);
    },

    /**
     * Отзыв инвайта
     */
    revoke(token: string): boolean {
        const db = getDb();

        const stmt = db.prepare(`
      DELETE FROM invites 
      WHERE token = ? AND used_by IS NULL
    `);

        const info = stmt.run(token);

        if (info.changes > 0) {
            Log.info({}, 'Invite revoked', { token });
            return true;
        }

        return false;
    },

    /**
     * Получение статистики по инвайтам
     */
    getStats(): {
        total: number;
        active: number;
        used: number;
        expired: number;
    } {
        const db = getDb();

        const totalStmt = db.prepare('SELECT COUNT(*) as count FROM invites');
        const total = (totalStmt.get() as { count: number }).count;

        const activeStmt = db.prepare(`
      SELECT COUNT(*) as count FROM invites 
      WHERE expires_at > CURRENT_TIMESTAMP AND used_by IS NULL
    `);
        const active = (activeStmt.get() as { count: number }).count;

        const usedStmt = db.prepare('SELECT COUNT(*) as count FROM invites WHERE used_by IS NOT NULL');
        const used = (usedStmt.get() as { count: number }).count;

        const expiredStmt = db.prepare(`
      SELECT COUNT(*) as count FROM invites 
      WHERE expires_at < CURRENT_TIMESTAMP AND used_by IS NULL
    `);
        const expired = (expiredStmt.get() as { count: number }).count;

        return { total, active, used, expired };
    },

    /**
     * Маппинг строки БД в объект Invite
     */
    mapRowToInvite(row: any): Invite {
        return {
            id: row.id,
            token: row.token,
            createdBy: row.created_by,
            expiresAt: new Date(row.expires_at),
            usedBy: row.used_by,
            usedAt: row.used_at ? new Date(row.used_at) : undefined,
            createdAt: new Date(row.created_at),
        };
    },
};