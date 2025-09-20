import { Telegraf } from 'telegraf';
import { tasksRepo } from '../data/repo/tasksRepo';
import { usersRepo } from '../data/repo/usersRepo';
import { getDb } from '../data/db';
import { config } from '../config/env';
import { getTexts, formatTasksList } from '../bot/replies';
import { UserRole } from '../interfaces/user';
import { TaskStatus } from '../interfaces/task';
import Log from '../utils/log';
import dayjs from 'dayjs';

// Инициализация бота для отправки сообщений
const bot = new Telegraf(config.telegram.workBotToken);

/**
 * Отправка ежедневного дайджеста
 */
export async function sendDailyDigest(
    type: 'morning' | 'evening'
): Promise<void> {
    Log.job('digest', `Starting ${type} digest...`);

    try {
        // Получаем всех владельцев и администраторов
        const owners = usersRepo.getAll(UserRole.OWNER);
        const admins = usersRepo.getAll(UserRole.ADMIN);
        const recipients = [...owners, ...admins];

        for (const user of recipients) {
            // Проверяем настройки пользователя
            const settings = await getUserSettings(user.telegramId);

            if (!settings.digestEnabled) {
                continue;
            }

            // Проверяем время для утреннего дайджеста
            if (type === 'morning' && settings.digestHour !== 9) {
                continue;
            }

            // Отправляем дайджест
            if (type === 'morning') {
                await sendMorningDigest(user.telegramId);
            } else {
                await sendEveningDigest(user.telegramId);
            }
        }

        Log.job('digest', `${type} digest completed`);

    } catch (error) {
        Log.error({ job: 'digest' }, `Failed to send ${type} digest`, error);
    }
}

/**
 * Получение настроек пользователя
 */
async function getUserSettings(userId: number): Promise<{
    digestEnabled: boolean;
    digestHour: number;
    notificationsEnabled: boolean;
}> {
    const db = getDb();

    const stmt = db.prepare(`
    SELECT digest_enabled, digest_hour, notifications_enabled
    FROM settings
    WHERE user_id = ?
  `);

    const row = stmt.get(userId) as any;

    if (!row) {
        // Возвращаем настройки по умолчанию
        return {
            digestEnabled: true,
            digestHour: 9,
            notificationsEnabled: true,
        };
    }

    return {
        digestEnabled: Boolean(row.digest_enabled),
        digestHour: row.digest_hour,
        notificationsEnabled: Boolean(row.notifications_enabled),
    };
}

/**
 * Отправка утреннего дайджеста
 */
async function sendMorningDigest(userId: number): Promise<void> {
    try {
        const user = usersRepo.getByTelegramId(userId);
        if (!user) return;

        const t = getTexts(user.language);
        const today = dayjs().startOf('day');
        const tomorrow = today.add(1, 'day');

        // Получаем задачи на сегодня
        const db = getDb();
        const todayTasksStmt = db.prepare(`
      SELECT * FROM tasks
      WHERE (assigned_to = ? OR created_by = ?)
        AND due_date >= ?
        AND due_date < ?
        AND status != ?
      ORDER BY due_date ASC
    `);

        const todayTasksRows = todayTasksStmt.all(
            userId,
            userId,
            today.toISOString(),
            tomorrow.toISOString(),
            TaskStatus.DONE
        );

        // Получаем просроченные задачи
        const overdueTasksStmt = db.prepare(`
      SELECT * FROM tasks
      WHERE (assigned_to = ? OR created_by = ?)
        AND due_date < ?
        AND status != ?
      ORDER BY due_date DESC
    `);

        const overdueTasksRows = overdueTasksStmt.all(
            userId,
            userId,
            today.toISOString(),
            TaskStatus.DONE
        );

        // Формируем сообщение
        const lines = [
            t.notifications.digest.morning,
            '',
        ];

        if (todayTasksRows.length > 0) {
            lines.push(t.notifications.digest.tasksToday(todayTasksRows.length));
            lines.push('');

            for (const row of todayTasksRows.slice(0, 5)) {
                const task = tasksRepo.mapRowToTask(row);
                const statusEmoji = {
                    [TaskStatus.TODO]: '📋',
                    [TaskStatus.IN_PROGRESS]: '⚡',
                    [TaskStatus.IN_REVIEW]: '👀',
                }[task.status] || '📋';

                lines.push(`${statusEmoji} ${task.title}`);

                if (task.dueDate) {
                    const time = dayjs(task.dueDate).format('HH:mm');
                    lines.push(`   ⏰ ${time}`);
                }
            }

            if (todayTasksRows.length > 5) {
                lines.push(`   ... и ещё ${todayTasksRows.length - 5} задач`);
            }
        } else {
            lines.push('✅ На сегодня задач нет');
        }

        if (overdueTasksRows.length > 0) {
            lines.push('');
            lines.push(t.notifications.digest.tasksOverdue(overdueTasksRows.length));

            for (const row of overdueTasksRows.slice(0, 3)) {
                const task = tasksRepo.mapRowToTask(row);
                const daysOverdue = dayjs().diff(dayjs(task.dueDate), 'day');
                lines.push(`🔴 ${task.title} (${daysOverdue} дн.)`);
            }
        }

        // Добавляем мотивационную фразу
        lines.push('');
        lines.push(getMotivationalQuote(user.language));

        // Добавляем кнопки
        const keyboard = {
            inline_keyboard: [
                [{ text: '📋 Мои задачи', callback_data: 'my_tasks' }],
                [{ text: '📊 Статистика', callback_data: 'stats' }],
            ]
        };

        await bot.telegram.sendMessage(userId, lines.join('\n'), {
            parse_mode: 'Markdown',
            reply_markup: keyboard,
        });

        Log.info({ userId }, 'Morning digest sent', {
            todayTasks: todayTasksRows.length,
            overdueTasks: overdueTasksRows.length,
        });

    } catch (error) {
        Log.error({ userId }, 'Failed to send morning digest', error);
    }
}

/**
 * Отправка вечернего дайджеста
 */
async function sendEveningDigest(userId: number): Promise<void> {
    try {
        const user = usersRepo.getByTelegramId(userId);
        if (!user) return;

        const t = getTexts(user.language);
        const today = dayjs().startOf('day');
        const tomorrow = today.add(1, 'day');

        // Получаем выполненные сегодня задачи
        const db = getDb();
        const completedStmt = db.prepare(`
      SELECT COUNT(*) as count FROM tasks
      WHERE (assigned_to = ? OR created_by = ?)
        AND status = ?
        AND updated_at >= ?
        AND updated_at < ?
    `);

        const completed = completedStmt.get(
            userId,
            userId,
            TaskStatus.DONE,
            today.toISOString(),
            tomorrow.toISOString()
        ) as { count: number };

        // Получаем задачи на завтра
        const tomorrowTasksStmt = db.prepare(`
      SELECT * FROM tasks
      WHERE (assigned_to = ? OR created_by = ?)
        AND due_date >= ?
        AND due_date < ?
        AND status != ?
      ORDER BY due_date ASC
    `);

        const tomorrowTasksRows = tomorrowTasksStmt.all(
            userId,
            userId,
            tomorrow.toISOString(),
            tomorrow.add(1, 'day').toISOString(),
            TaskStatus.DONE
        );

        // Формируем сообщение
        const lines = [
            t.notifications.digest.evening,
            '',
        ];

        if (completed.count > 0) {
            lines.push(t.notifications.digest.tasksCompleted(completed.count));
            lines.push('');
        }

        if (tomorrowTasksRows.length > 0) {
            lines.push('📅 **Задачи на завтра:**');

            for (const row of tomorrowTasksRows.slice(0, 5)) {
                const task = tasksRepo.mapRowToTask(row);
                const priorityEmoji = {
                    'низкий': '🟢',
                    'средний': '🟡',
                    'высокий': '🟠',
                    'критический': '🔴',
                }[task.priority] || '';

                lines.push(`• ${task.title} ${priorityEmoji}`);
            }

            if (tomorrowTasksRows.length > 5) {
                lines.push(`• ... и ещё ${tomorrowTasksRows.length - 5} задач`);
            }
        } else {
            lines.push('✨ На завтра задач пока нет');
        }

        // Добавляем итоги дня
        lines.push('');
        lines.push(getDailySummary(userId, user.language));

        await bot.telegram.sendMessage(userId, lines.join('\n'), {
            parse_mode: 'Markdown',
        });

        Log.info({ userId }, 'Evening digest sent', {
            completed: completed.count,
            tomorrowTasks: tomorrowTasksRows.length,
        });

    } catch (error) {
        Log.error({ userId }, 'Failed to send evening digest', error);
    }
}

/**
 * Получение мотивационной цитаты
 */
function getMotivationalQuote(lang: 'ru' | 'uz'): string {
    const quotes = {
        ru: [
            '💪 Отличный день для великих дел!',
            '🚀 Каждая выполненная задача - шаг к цели!',
            '⭐ Сегодня вы можете больше, чем вчера!',
            '🎯 Фокус на главном - ключ к успеху!',
            '✨ Продуктивного дня!',
        ],
        uz: [
            '💪 Buyuk ishlar uchun ajoyib kun!',
            '🚀 Har bir bajarilgan vazifa - maqsadga qadam!',
            '⭐ Bugun siz kechagidan koʻproq qila olasiz!',
            '🎯 Asosiyga eʼtibor - muvaffaqiyat kaliti!',
            '✨ Samarali kun boʻlsin!',
        ],
    };

    const quotesForLang = quotes[lang] || quotes.ru;
    return quotesForLang[Math.floor(Math.random() * quotesForLang.length)];
}

/**
 * Получение итогов дня
 */
function getDailySummary(userId: number, lang: 'ru' | 'uz'): string {
    const db = getDb();
    const today = dayjs().startOf('day');
    const tomorrow = today.add(1, 'day');

    // Считаем статистику за день
    const stats = db.prepare(`
    SELECT 
      COUNT(CASE WHEN status = 'done' AND updated_at >= ? AND updated_at < ? THEN 1 END) as completed,
      COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress,
      COUNT(CASE WHEN due_date < CURRENT_TIMESTAMP AND status != 'done' THEN 1 END) as overdue
    FROM tasks
    WHERE assigned_to = ? OR created_by = ?
  `).get(
        today.toISOString(),
        tomorrow.toISOString(),
        userId,
        userId
    ) as { completed: number; in_progress: number; overdue: number };

    if (lang === 'uz') {
        return `📊 **Kun natijalari:**
• Bajarildi: ${stats.completed}
• Jarayonda: ${stats.in_progress}
${stats.overdue > 0 ? `• Muddati oʻtgan: ${stats.overdue}` : ''}`;
    }

    return `📊 **Итоги дня:**
• Выполнено: ${stats.completed}
• В работе: ${stats.in_progress}
${stats.overdue > 0 ? `• Просрочено: ${stats.overdue}` : ''}`;
}