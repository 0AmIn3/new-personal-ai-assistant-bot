import { Telegraf } from 'telegraf';
import { config, validateConfig } from '../config/env';
import { initDatabase, closeDatabase } from '../data/db';
import { authMiddleware, logCommand } from '../bot/middlewares/auth';
import { registerRegHandlers } from '../bot/handlers/regHandlers';
import Log from '../utils/log';

/**
 * Запуск регистрационного бота
 */
async function startRegBot() {
    try {
        // Валидация конфигурации
        validateConfig();

        Log.info({}, 'Starting registration bot...');

        // Инициализация БД
        initDatabase();

        // Создание бота
        const bot = new Telegraf(config.telegram.regBotToken);

        // Глобальные middleware
        bot.use(logCommand);
        bot.use(authMiddleware);

        // Регистрация обработчиков
        registerRegHandlers(bot);

        // Установка команд меню
        await bot.telegram.setMyCommands([
            { command: 'start', description: '🚀 Начать регистрацию' },
            { command: 'help', description: '❓ Справка' },
            { command: 'invite', description: '🎫 Создать приглашение (админ)' },
            { command: 'invites', description: '📋 Мои приглашения (админ)' },
            { command: 'users', description: '👥 Список пользователей (админ)' },
            { command: 'promote', description: '⬆️ Повысить до владельца (админ)' },
            { command: 'demote', description: '⬇️ Понизить владельца (админ)' },
            { command: 'stats', description: '📊 Статистика (админ)' },
        ]);

        // Обработка ошибок
        bot.catch((error) => {
            Log.error({}, 'Registration bot error', error);
        });

        // Graceful shutdown
        const shutdown = async (signal: string) => {
            Log.info({}, `Received ${signal}, shutting down registration bot...`);

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
            const port = config.server.port + 1; // Используем другой порт

            if (domain) {
                await bot.telegram.setWebhook(`${domain}/regbot${config.telegram.regBotToken}`);
                bot.startWebhook(`/regbot${config.telegram.regBotToken}`, null, port);
                Log.info({}, `Registration bot started with webhook on port ${port}`);
            } else {
                // Если webhook не настроен, используем polling
                await bot.launch();
                Log.info({}, 'Registration bot started with polling');
            }
        } else {
            // В dev режиме используем polling
            await bot.launch();
            Log.info({}, 'Registration bot started in development mode with polling');
        }

    } catch (error) {
        Log.error({}, 'Failed to start registration bot', error);
        process.exit(1);
    }
}

// Запуск при прямом вызове
if (require.main === module) {
    startRegBot();
}

export { startRegBot };