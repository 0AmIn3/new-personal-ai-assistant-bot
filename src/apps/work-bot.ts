import { Telegraf } from 'telegraf';
import { config, validateConfig } from '../config/env';
import { initDatabase, closeDatabase } from '../data/db';
import { authMiddleware, logCommand, privateOnly, ownerOnly } from '../bot/middlewares/auth';
import { registerWorkHandlers } from '../bot/handlers/workHandlers';
import { setupScheduledJobs } from '../jobs/scheduler';
import Log from '../utils/log';

/**
 * Запуск рабочего бота
 */
async function startWorkBot() {
    try {
        // Валидация конфигурации
        validateConfig();

        Log.info({}, 'Starting work bot...');

        // Инициализация БД
        initDatabase();

        // Создание бота
        const bot = new Telegraf(config.telegram.workBotToken);

        // Глобальные middleware
        bot.use(logCommand);
        bot.use(authMiddleware);

        // Регистрация обработчиков
        registerWorkHandlers(bot);

        // Установка команд меню
        await bot.telegram.setMyCommands([
            { command: 'start', description: '🚀 Начать работу' },
            { command: 'help', description: '❓ Справка' },
            { command: 'my_tasks', description: '📋 Мои задачи' },
            { command: 'create_task', description: '📝 Создать задачу' },
            { command: 'stats', description: '📊 Статистика' },
            { command: 'deadlines', description: '📅 Дедлайны' },
            { command: 'search_tasks', description: '🔍 Поиск задач' },
        ]);

        // Запуск планировщика задач
        setupScheduledJobs();

        // Обработка ошибок
        bot.catch((error) => {
            Log.error({}, 'Bot error', error);
        });

        // Graceful shutdown
        const shutdown = async (signal: string) => {
            Log.info({}, `Received ${signal}, shutting down...`);

            bot.stop(signal);
            closeDatabase();

            process.exit(0);
        };

        process.once('SIGINT', () => shutdown('SIGINT'));
        process.once('SIGTERM', () => shutdown('SIGTERM'));

        // Запуск бота
        if (config.env.isProduction) {
            // В продакшене используем webhook
            const domain = process.env.WEBHOOK_DOMAIN;
            const port = config.server.port;

            if (domain) {
                await bot.telegram.setWebhook(`${domain}/bot${config.telegram.workBotToken}`);
                bot.startWebhook(`/bot${config.telegram.workBotToken}`, null, port);
                Log.info({}, `Work bot started with webhook on port ${port}`);
            } else {
                // Если webhook не настроен, используем polling
                await bot.launch();
                Log.info({}, 'Work bot started with polling');
            }
        } else {
            // В dev режиме используем polling
            await bot.launch();
            Log.info({}, 'Work bot started in development mode with polling');
        }

    } catch (error) {
        Log.error({}, 'Failed to start work bot', error);
        process.exit(1);
    }
}

// Запуск при прямом вызове
if (require.main === module) {
    startWorkBot();
}

export { startWorkBot };