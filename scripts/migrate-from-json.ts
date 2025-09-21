import fs from 'fs';
import path from 'path';
import { initDatabase, getDb } from '../src/data/db';
import { usersRepo } from '../src/data/repo/usersRepo';
import { invitesRepo } from '../src/data/repo/invitesRepo';
import { UserRole, Language } from '../src/interfaces/user';
import Log from '../src/utils/log';

/**
 * Миграция данных из старого db.json в новую SQLite БД
 */
async function migrateFromJson() {
    const jsonPath = path.join(process.cwd(), 'db.json');

    // Проверяем существование старой БД
    if (!fs.existsSync(jsonPath)) {
        Log.info({}, 'No db.json found, skipping migration');
        return;
    }

    Log.info({}, 'Starting migration from db.json...');

    // Читаем старые данные
    const oldData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

    // Инициализируем новую БД
    initDatabase();
    const db = getDb();

    let migratedUsers = 0;
    let migratedOwners = 0;
    let migratedEmployees = 0;

    try {
        // Начинаем транзакцию
        db.prepare('BEGIN').run();

        // Мигрируем пользователей
        if (oldData.users && Array.isArray(oldData.users)) {
            for (const oldUser of oldData.users) {
                try {
                    // Определяем роль
                    let role = UserRole.EMPLOYEE;
                    if (oldUser.isOwner) {
                        role = UserRole.OWNER;
                    }
                    // Проверяем, не админ ли это (по username или специальному полю)
                    if (oldUser.isAdmin || oldUser.username === process.env.SUPER_ADMIN_USERNAME) {
                        role = UserRole.ADMIN;
                    }

                    // Создаём пользователя
                    usersRepo.create({
                        telegramId: oldUser.chatId,
                        username: oldUser.username || undefined,
                        fullName: oldUser.name || oldUser.firstName || undefined,
                        role,
                        email: oldUser.email || undefined,
                        language: Language.RU, // По умолчанию русский
                    });

                    migratedUsers++;
                    Log.info({}, `Migrated user: ${oldUser.username || oldUser.chatId}`);
                } catch (error: any) {
                    if (error.code === 'ALREADY_EXISTS') {
                        Log.warn({}, `User ${oldUser.chatId} already exists, skipping`);
                    } else {
                        throw error;
                    }
                }
            }
        }

        // Мигрируем owners как инвайты
        if (oldData.owners && Array.isArray(oldData.owners)) {
            for (const oldOwner of oldData.owners) {
                try {
                    // Находим пользователя-владельца
                    const owner = usersRepo.getByTelegramId(oldOwner.chatId);

                    if (owner) {
                        // Создаём инвайт с токеном из старой БД
                        const stmt = db.prepare(`
              INSERT INTO invites (token, created_by, expires_at, created_at)
              VALUES (?, ?, datetime('now', '+30 days'), ?)
            `);

                        stmt.run(
                            oldOwner.id, // Используем старый ID как токен
                            owner.telegramId,
                            oldOwner.createdAt || new Date().toISOString()
                        );

                        migratedOwners++;
                        Log.info({}, `Migrated owner invite: ${oldOwner.id}`);
                    }
                } catch (error: any) {
                    Log.warn({}, `Failed to migrate owner ${oldOwner.chatId}:`, error);
                }
            }
        }

        // Мигрируем employees
        if (oldData.employees && Array.isArray(oldData.employees)) {
            for (const oldEmployee of oldData.employees) {
                try {
                    // Проверяем, существует ли пользователь
                    let user = usersRepo.getByTelegramId(oldEmployee.telegramUserId || oldEmployee.userId);

                    if (!user && (oldEmployee.telegramUserId || oldEmployee.userId)) {
                        // Создаём пользователя если не существует
                        user = usersRepo.create({
                            telegramId: oldEmployee.telegramUserId || oldEmployee.userId,
                            username: oldEmployee.username,
                            fullName: oldEmployee.name || oldEmployee.firstName,
                            role: UserRole.EMPLOYEE,
                            email: oldEmployee.email,
                            language: Language.RU,
                        });
                    }

                    if (user && oldEmployee.email) {
                        // Обновляем email и Planka ID
                        usersRepo.update({
                            telegramId: user.telegramId,
                            email: oldEmployee.email,
                            plankaUserId: oldEmployee.plankaUserId,
                        });

                        migratedEmployees++;
                        Log.info({}, `Migrated employee: ${oldEmployee.username || oldEmployee.email}`);
                    }
                } catch (error: any) {
                    Log.warn({}, `Failed to migrate employee:`, error);
                }
            }
        }

        // Фиксируем транзакцию
        db.prepare('COMMIT').run();

        Log.info({}, 'Migration completed', {
            users: migratedUsers,
            owners: migratedOwners,
            employees: migratedEmployees,
        });

        // Создаём бэкап старого файла
        const backupPath = path.join(process.cwd(), `db.json.backup.${Date.now()}`);
        fs.copyFileSync(jsonPath, backupPath);
        Log.info({}, `Old database backed up to: ${backupPath}`);

    } catch (error) {
        // Откатываем транзакцию при ошибке
        db.prepare('ROLLBACK').run();
        Log.error({}, 'Migration failed', error);
        throw error;
    }
}

// Запуск миграции при прямом вызове
if (require.main === module) {
    migrateFromJson()
        .then(() => {
            Log.info({}, 'Migration script finished');
            process.exit(0);
        })
        .catch((error) => {
            Log.error({}, 'Migration script failed', error);
            process.exit(1);
        });
}

export { migrateFromJson };