import { Telegraf } from 'telegraf';
import { AuthContext } from '../middlewares/auth';
import { getTexts, taskKeyboards, createTaskKeyboards, formatTask, formatTasksList } from '../replies';
import { createTask, getAvailableAssignees, prepareTaskPreview } from '../../usecases/tasks/createTask';
import { tasksRepo } from '../../data/repo/tasksRepo';
import { usersRepo } from '../../data/repo/usersRepo';
import { Language, Permission } from '../../interfaces/user';
import { CreateTaskInput, TaskStatus } from '../../interfaces/task';
import { parseDate, parsePriority, parseCategory, parseAssignee } from '../../utils/parse';
import { assertNotEmpty, validateTaskInput } from '../../utils/guard';
import { errorToUserMessage } from '../../utils/errors';
import Log from '../../utils/log';
import { nanoid } from 'nanoid';

/**
 * Состояния пользователей для создания задач
 */
interface TaskCreationSession {
    sessionId: string;
    userId: number;
    chatId: number;
    step: 'message' | 'list' | 'assignee' | 'files' | 'confirm';
    data: Partial<CreateTaskInput>;
    messageId?: number;
    createdAt: Date;
}

// Хранилище сессий создания задач
const taskSessions = new Map<number, TaskCreationSession>();

/**
 * Регистрация обработчиков команд рабочего бота
 */
export function registerWorkHandlers(bot: Telegraf<AuthContext>) {
    // Команда /start
    bot.command('start', async (ctx) => {
        const lang = ctx.user?.language || Language.RU;
        const t = getTexts(lang);

        if (ctx.user) {
            await ctx.reply(t.welcome.registered(ctx.user.fullName || ctx.user.username || 'User'));
        } else {
            await ctx.reply(t.welcome.start);
        }
    });

    // Команда /help
    bot.command('help', async (ctx) => {
        const lang = ctx.user?.language || Language.RU;
        const t = getTexts(lang);

        let message = t.help.title + '\n\n' + t.help.common;

        if (ctx.isOwner || ctx.isAdmin) {
            message += '\n\n' + t.help.owner;
        }

        if (ctx.isAdmin) {
            message += '\n\n' + t.help.admin;
        }

        message += '\n\n' + t.help.usage;

        await ctx.replyWithMarkdown(message);
    });

    // Команда /my_tasks - просмотр своих задач
    bot.command('my_tasks', async (ctx) => {
        if (!ctx.user) {
            const t = getTexts(Language.RU);
            await ctx.reply(t.auth.notRegistered);
            return;
        }

        const lang = ctx.user.language;
        const t = getTexts(lang);

        try {
            const tasks = tasksRepo.getUserTasks(ctx.user.telegramId);

            if (tasks.length === 0) {
                await ctx.reply(t.tasks.view.noTasks);
                return;
            }

            const message = formatTasksList(tasks, t.tasks.view.title('Ваши задачи'), lang);
            const keyboard = taskKeyboards.tasksList(tasks, lang);

            await ctx.replyWithMarkdown(message, { reply_markup: keyboard });
        } catch (error) {
            Log.error(ctx, 'Failed to get user tasks', error);
            await ctx.reply(errorToUserMessage(error, lang));
        }
    });

    // Команда /create_task - создание задачи (только для владельцев)
    bot.command('create_task', async (ctx) => {
        if (!ctx.user) {
            const t = getTexts(Language.RU);
            await ctx.reply(t.auth.notRegistered);
            return;
        }

        if (!ctx.isOwner && !ctx.isAdmin) {
            const t = getTexts(ctx.user.language);
            await ctx.reply(t.auth.ownerOnly);
            return;
        }

        if (ctx.chat?.type !== 'private') {
            const t = getTexts(ctx.user.language);
            await ctx.reply(t.auth.privateOnly);
            return;
        }

        const lang = ctx.user.language;
        const t = getTexts(lang);

        // Проверяем, нет ли уже активной сессии
        if (taskSessions.has(ctx.user.telegramId)) {
            await ctx.reply(t.tasks.create.alreadyCreating);
            return;
        }

        // Создаём новую сессию
        const session: TaskCreationSession = {
            sessionId: nanoid(10),
            userId: ctx.user.telegramId,
            chatId: ctx.chat.id,
            step: 'message',
            data: {
                userId: ctx.user.telegramId,
                username: ctx.from?.username || '',
                chatId: ctx.chat.id,
            },
            createdAt: new Date(),
        };

        taskSessions.set(ctx.user.telegramId, session);

        await ctx.reply(t.tasks.create.start);

        Log.info(ctx, 'Task creation started', { sessionId: session.sessionId });
    });

    // Команда /stats - статистика (для владельцев)
    bot.command('stats', async (ctx) => {
        if (!ctx.user) {
            const t = getTexts(Language.RU);
            await ctx.reply(t.auth.notRegistered);
            return;
        }

        if (!ctx.isOwner && !ctx.isAdmin) {
            const t = getTexts(ctx.user.language);
            await ctx.reply(t.auth.ownerOnly);
            return;
        }

        const lang = ctx.user.language;
        const t = getTexts(lang);

        try {
            const stats = tasksRepo.getStats(ctx.chat?.id);

            const lines = [
                t.tasks.stats.title,
                '',
                t.tasks.stats.total(stats.total),
                '',
                t.tasks.stats.byStatus,
            ];

            for (const [status, count] of Object.entries(stats.byStatus)) {
                const display = {
                    todo: '📋 К выполнению',
                    in_progress: '⚡ В работе',
                    in_review: '👀 На проверке',
                    done: '✅ Выполнено',
                }[status] || status;
                lines.push(`  ${display}: ${count}`);
            }

            lines.push('');
            lines.push(t.tasks.stats.byPriority);

            for (const [priority, count] of Object.entries(stats.byPriority)) {
                const emoji = {
                    'низкий': '🟢',
                    'средний': '🟡',
                    'высокий': '🟠',
                    'критический': '🔴',
                }[priority] || '⚪';
                lines.push(`  ${emoji} ${priority}: ${count}`);
            }

            if (stats.overdue > 0) {
                lines.push('');
                lines.push(t.tasks.stats.overdue(stats.overdue));
            }

            await ctx.replyWithMarkdown(lines.join('\n'));
        } catch (error) {
            Log.error(ctx, 'Failed to get stats', error);
            await ctx.reply(errorToUserMessage(error, lang));
        }
    });

    // Команда /deadlines - просмотр дедлайнов
    bot.command('deadlines', async (ctx) => {
        if (!ctx.user) {
            const t = getTexts(Language.RU);
            await ctx.reply(t.auth.notRegistered);
            return;
        }

        if (!ctx.isOwner && !ctx.isAdmin) {
            const t = getTexts(ctx.user.language);
            await ctx.reply(t.auth.ownerOnly);
            return;
        }

        const lang = ctx.user.language;
        const t = getTexts(lang);

        try {
            const overdue = tasksRepo.getOverdueTasks();
            const today = tasksRepo.getUpcomingDeadlines(24);
            const thisWeek = tasksRepo.getUpcomingDeadlines(24 * 7);

            const lines = [t.tasks.deadlines.title, ''];

            if (overdue.length > 0) {
                lines.push(t.tasks.deadlines.overdue);
                for (const task of overdue.slice(0, 5)) {
                    lines.push(`  🔴 ${task.title}`);
                }
                lines.push('');
            }

            const todayTasks = today.filter(t => {
                const hours = (t.dueDate!.getTime() - Date.now()) / 1000 / 60 / 60;
                return hours <= 24;
            });

            if (todayTasks.length > 0) {
                lines.push(t.tasks.deadlines.today);
                for (const task of todayTasks) {
                    lines.push(`  📌 ${task.title}`);
                }
                lines.push('');
            }

            const weekTasks = thisWeek.filter(t => {
                const hours = (t.dueDate!.getTime() - Date.now()) / 1000 / 60 / 60;
                return hours > 24 && hours <= 24 * 7;
            });

            if (weekTasks.length > 0) {
                lines.push(t.tasks.deadlines.thisWeek);
                for (const task of weekTasks.slice(0, 5)) {
                    lines.push(`  📅 ${task.title}`);
                }
            }

            if (overdue.length === 0 && todayTasks.length === 0 && weekTasks.length === 0) {
                lines.push(t.tasks.deadlines.noDeadlines);
            }

            await ctx.replyWithMarkdown(lines.join('\n'));
        } catch (error) {
            Log.error(ctx, 'Failed to get deadlines', error);
            await ctx.reply(errorToUserMessage(error, lang));
        }
    });

    // Команда /search_tasks - поиск задач
    bot.command('search_tasks', async (ctx) => {
        if (!ctx.user) {
            const t = getTexts(Language.RU);
            await ctx.reply(t.auth.notRegistered);
            return;
        }

        const lang = ctx.user.language;
        const t = getTexts(lang);

        // Получаем поисковый запрос из команды
        const query = ctx.message.text.replace('/search_tasks', '').trim();

        if (!query) {
            await ctx.reply(t.tasks.search.prompt);
            return;
        }

        try {
            await ctx.reply(t.tasks.search.searching);

            const tasks = tasksRepo.search(query, ctx.chat?.id);

            if (tasks.length === 0) {
                await ctx.reply(t.tasks.search.notFound);
                return;
            }

            const message = formatTasksList(
                tasks,
                t.tasks.search.found(tasks.length),
                lang
            );
            const keyboard = taskKeyboards.tasksList(tasks, lang);

            await ctx.replyWithMarkdown(message, { reply_markup: keyboard });
        } catch (error) {
            Log.error(ctx, 'Failed to search tasks', error);
            await ctx.reply(errorToUserMessage(error, lang));
        }
    });

    // Обработка текстовых сообщений для создания задач
    bot.on('text', async (ctx) => {
        if (!ctx.user) return;

        const session = taskSessions.get(ctx.user.telegramId);
        if (!session || session.step !== 'message') return;

        const lang = ctx.user.language;
        const t = getTexts(lang);

        try {
            const text = ctx.message.text;

            // Анализируем текст
            session.data.title = text.substring(0, 100);
            session.data.description = text;
            session.data.priority = parsePriority(text) || undefined;
            session.data.category = parseCategory(text) || undefined;
            session.data.dueDate = parseDate(text) || undefined;

            const assigneeName = parseAssignee(text);
            if (assigneeName) {
                const assignee = usersRepo.getAll().find(u =>
                    u.username?.toLowerCase() === assigneeName.toLowerCase() ||
                    u.fullName?.toLowerCase().includes(assigneeName.toLowerCase())
                );
                if (assignee) {
                    session.data.assigneeId = String(assignee.telegramId);
                }
            }

            // Показываем предпросмотр
            const preview = prepareTaskPreview(session.data);
            const keyboard = createTaskKeyboards.confirmCreate(session.sessionId, lang);

            const msg = await ctx.replyWithMarkdown(preview, { reply_markup: keyboard });
            session.messageId = msg.message_id;
            session.step = 'confirm';

        } catch (error) {
            Log.error(ctx, 'Failed to process task message', error);
            await ctx.reply(errorToUserMessage(error, lang));
            taskSessions.delete(ctx.user.telegramId);
        }
    });

    // Обработка callback-запросов
    bot.on('callback_query', async (ctx) => {
        if (!ctx.user || !ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
            await ctx.answerCbQuery();
            return;
        }

        const data = ctx.callbackQuery.data;
        const lang = ctx.user.language;
        const t = getTexts(lang);

        try {
            // Просмотр задачи
            if (data.startsWith('view_task_')) {
                const taskId = data.replace('view_task_', '');
                const task = tasksRepo.getByPlankaId(taskId);

                if (!task) {
                    await ctx.answerCbQuery(t.common.notFound);
                    return;
                }

                const message = formatTask(task, lang);
                const keyboard = taskKeyboards.taskActions(taskId, ctx.isOwner, lang);

                await ctx.editMessageText(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                });
                await ctx.answerCbQuery();
                return;
            }

            // Обновление задачи
            if (data.startsWith('refresh_task_')) {
                const taskId = data.replace('refresh_task_', '');
                const task = tasksRepo.getByPlankaId(taskId);

                if (!task) {
                    await ctx.answerCbQuery(t.common.notFound);
                    return;
                }

                const message = formatTask(task, lang);
                const keyboard = taskKeyboards.taskActions(taskId, ctx.isOwner, lang);

                await ctx.editMessageText(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                });
                await ctx.answerCbQuery('🔄 ' + t.common.success);
                return;
            }

            // Подтверждение создания задачи
            if (data.startsWith('confirm_create_')) {
                const sessionId = data.replace('confirm_create_', '');
                const session = taskSessions.get(ctx.user.telegramId);

                if (!session || session.sessionId !== sessionId) {
                    await ctx.answerCbQuery(t.common.error);
                    return;
                }

                await ctx.answerCbQuery(t.common.loading);

                // Создаём задачу
                const result = await createTask(session.data as CreateTaskInput);

                // Очищаем сессию
                taskSessions.delete(ctx.user.telegramId);

                // Отправляем результат
                const successMessage = t.tasks.create.success(
                    result.task.title,
                    result.listName,
                    result.assignee?.fullName || result.assignee?.username
                );

                await ctx.editMessageText(successMessage, { parse_mode: 'Markdown' });

                Log.info(ctx, 'Task created', { taskId: result.task.id });
                return;
            }

            // Отмена создания задачи
            if (data === 'cancel_task' || data === 'cancel') {
                taskSessions.delete(ctx.user.telegramId);
                await ctx.editMessageText(t.common.cancelled);
                await ctx.answerCbQuery();
                return;
            }

            await ctx.answerCbQuery();

        } catch (error) {
            Log.error(ctx, 'Callback query error', error);
            await ctx.answerCbQuery(t.common.error);
        }
    });

    // Очистка старых сессий каждые 5 минут
    setInterval(() => {
        const now = Date.now();
        const timeout = 60 * 60 * 1000; // 1 час

        for (const [userId, session] of taskSessions.entries()) {
            if (now - session.createdAt.getTime() > timeout) {
                taskSessions.delete(userId);
                Log.info({ userId }, 'Task session expired', { sessionId: session.sessionId });
            }
        }
    }, 5 * 60 * 1000);
}