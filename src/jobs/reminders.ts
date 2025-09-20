import { Telegraf } from 'telegraf';
import { tasksRepo } from '../data/repo/tasksRepo';
import { usersRepo } from '../data/repo/usersRepo';
import { getDb } from '../data/db';
import { config } from '../config/env';
import { REMINDER_WINDOWS } from '../config/constants';
import { getTexts } from '../bot/replies';
import { formatDate } from '../utils/parse';
import Log from '../utils/log';

// Инициализация бота для отправки сообщений
const bot = new Telegraf(config.telegram.workBotToken);

/**
 * Интерфейс для записи о напоминании
 */
interface ReminderRecord {
    taskId: number;
    userId: number;
    type: '24h' | '6h' | '2h';
    sentAt?: Date;
}

/**
 * Отправка напоминаний о приближающихся дедлайнах
 */
export async function sendReminders(): Promise<void> {
    Log.job('reminders', 'Starting reminders check...');

    const now = new Date();
    const db = getDb();

    try {
        // Проверяем задачи для каждого окна напоминаний
        for (const [type, hours] of Object.entries(REMINDER_WINDOWS)) {
            const tasks = tasksRepo.getUpcomingDeadlines(hours);

            for (const task of tasks) {
                // Пропускаем выполненные задачи
                if (task.status === 'done') continue;

                // Проверяем, не отправляли ли уже напоминание
                if (await wasReminderSent(task.plankaCardId!, type as any)) {
                    continue;
                }

                // Определяем получателей (владелец и исполнитель)
                const recipients = new Set<number>();

                // Добавляем создателя задачи
                recipients.add(parseInt(task.createdBy));

                // Добавляем исполнителя, если назначен
                if (task.assigneeId) {
                    recipients.add(parseInt(task.assigneeId));
                }

                // Отправляем напоминания
                for (const userId of recipients) {
                    await sendReminderToUser(userId, task, type as any);
                }

                // Помечаем напоминание как отправленное
                await markReminderSent(task.plankaCardId!, type as any);
            }
        }

        // Отдельно проверяем просроченные задачи
        const overdueTasks = tasksRepo.getOverdueTasks();

        for (const task of overdueTasks) {
            // Отправляем напоминание раз в день о просрочке
            const lastOverdueReminder = await getLastOverdueReminder(task.plankaCardId!);

            if (!lastOverdueReminder ||
                (now.getTime() - lastOverdueReminder.getTime()) > 24 * 60 * 60 * 1000) {

                const recipients = new Set<number>();
                recipients.add(parseInt(task.createdBy));

                if (task.assigneeId) {
                    recipients.add(parseInt(task.assigneeId));
                }

                for (const userId of recipients) {
                    await sendOverdueReminderToUser(userId, task);
                }

                await markOverdueReminderSent(task.plankaCardId!);
            }
        }

        Log.job('reminders', 'Reminders check completed');

    } catch (error) {
        Log.error({ job: 'reminders' }, 'Failed to send reminders', error);
    }
}

/**
 * Проверка, было ли отправлено напоминание
 */
async function wasReminderSent(
    taskId: string,
    type: '24h' | '6h' | '2h'
): Promise<boolean> {
    const db = getDb();

    const stmt = db.prepare(`
    SELECT sent_at FROM reminders 
    WHERE task_id = (SELECT id FROM tasks WHERE planka_card_id = ?)
      AND type = ?
      AND sent_at IS NOT NULL
  `);

    const row = stmt.get(taskId, type);
    return !!row;
}

/**
 * Пометить напоминание как отправленное
 */
async function markReminderSent(
    taskId: string,
    type: '24h' | '6h' | '2h'
): Promise<void> {
    const db = getDb();

    const stmt = db.prepare(`
    INSERT INTO reminders (task_id, user_id, type, sent_at)
    SELECT t.id, t.created_by, ?, CURRENT_TIMESTAMP
    FROM tasks t
    WHERE t.planka_card_id = ?
    ON CONFLICT(task_id, user_id, type) 
    DO UPDATE SET sent_at = CURRENT_TIMESTAMP
  `);

    stmt.run(type, taskId);
}

/**
 * Получить время последнего напоминания о просрочке
 */
async function getLastOverdueReminder(taskId: string): Promise<Date | null> {
    const db = getDb();

    const stmt = db.prepare(`
    SELECT MAX(sent_at) as last_sent
    FROM reminders 
    WHERE task_id = (SELECT id FROM tasks WHERE planka_card_id = ?)
      AND type = 'overdue'
  `);

    const row = stmt.get(taskId) as { last_sent: string | null };

    if (row?.last_sent) {
        return new Date(row.last_sent);
    }

    return null;
}

/**
 * Пометить напоминание о просрочке как отправленное
 */
async function markOverdueReminderSent(taskId: string): Promise<void> {
    const db = getDb();

    // Используем специальный тип 'overdue' через обход типизации
    const stmt = db.prepare(`
    INSERT OR REPLACE INTO reminders (task_id, user_id, type, sent_at)
    SELECT t.id, t.created_by, 'overdue', CURRENT_TIMESTAMP
    FROM tasks t
    WHERE t.planka_card_id = ?
  `);

    stmt.run(taskId);
}

/**
 * Отправка напоминания пользователю
 */
async function sendReminderToUser(
    userId: number,
    task: any,
    type: '24h' | '6h' | '2h'
): Promise<void> {
    try {
        const user = usersRepo.getByTelegramId(userId);
        if (!user) return;

        const t = getTexts(user.language);

        let message = t.notifications.reminder.title + '\n\n';

        switch (type) {
            case '24h':
                message += t.notifications.reminder.in24h(task.title);
                break;
            case '6h':
                message += t.notifications.reminder.in6h(task.title);
                break;
            case '2h':
                message += t.notifications.reminder.in2h(task.title);
                break;
        }

        if (task.description) {
            message += '\n\n📝 ' + task.description.substring(0, 100);
        }

        if (task.dueDate) {
            message += '\n📅 ' + formatDate(task.dueDate, 'long', user.language);
        }

        // Добавляем кнопку для просмотра задачи
        const keyboard = {
            inline_keyboard: [[
                { text: t.buttons.viewTask, callback_data: `view_task_${task.plankaCardId}` }
            ]]
        };

        await bot.telegram.sendMessage(userId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard,
        });

        Log.info({ userId }, 'Reminder sent', {
            taskId: task.plankaCardId,
            type,
        });

    } catch (error) {
        Log.error({ userId }, 'Failed to send reminder', error);
    }
}

/**
 * Отправка напоминания о просроченной задаче
 */
async function sendOverdueReminderToUser(
    userId: number,
    task: any
): Promise<void> {
    try {
        const user = usersRepo.getByTelegramId(userId);
        if (!user) return;

        const t = getTexts(user.language);

        let message = '🔴 **ВНИМАНИЕ!**\n\n';
        message += t.notifications.reminder.overdue(task.title);

        if (task.dueDate) {
            const overdueDays = Math.floor(
                (Date.now() - new Date(task.dueDate).getTime()) / (1000 * 60 * 60 * 24)
            );
            message += `\n\n⏰ Просрочено на ${overdueDays} дней`;
        }

        // Добавляем кнопки
        const keyboard = {
            inline_keyboard: [
                [{ text: t.buttons.viewTask, callback_data: `view_task_${task.plankaCardId}` }],
                [{ text: t.buttons.moveToDone, callback_data: `status_${task.plankaCardId}_done` }],
            ]
        };

        await bot.telegram.sendMessage(userId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard,
        });

        Log.info({ userId }, 'Overdue reminder sent', {
            taskId: task.plankaCardId,
        });

    } catch (error) {
        Log.error({ userId }, 'Failed to send overdue reminder', error);
    }
}