import express from 'express';
import { config, validateConfig } from './config/env';
import { initDatabase } from './data/db';
import { startWorkBot } from './apps/work-bot';
import { startRegBot } from './apps/reg-bot';
import Log from './utils/log';

/**
 * Главная точка входа - запускает оба бота и Express сервер
 * Эмулирует поведение старого index.js
 */
async function main() {
    try {
        // Валидация конфигурации
        validateConfig();

        Log.info({}, 'Starting application...');

        // Инициализация БД (один раз для обоих ботов)
        initDatabase();

        // Создаём Express сервер для health checks
        const app = express();

        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));

        // Health check endpoint
        app.get('/health', (req, res) => {
            res.json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                bots: {
                    work: 'running',
                    registration: 'running',
                },
            });
        });

        // Info endpoint
        app.get('/info', (req, res) => {
            res.json({
                name: 'TG Assistant v2',
                version: '2.0.0',
                environment: config.env.isProduction ? 'production' : 'development',
            });
        });

        // Запускаем оба бота параллельно
        await Promise.all([
            startWorkBot(),
            startRegBot(),
        ]);

        // Запускаем HTTP сервер
        const PORT = config.server.port;
        app.listen(PORT, () => {
            Log.info({}, `Server & bots running on :${PORT}`);
        });

    } catch (error) {
        Log.error({}, 'Failed to start application', error);
        process.exit(1);
    }
}

// Graceful shutdown
const shutdown = async (signal: string) => {
    Log.info({}, `Received ${signal}, shutting down gracefully...`);

    // Даём время на завершение активных операций
    setTimeout(() => {
        process.exit(0);
    }, 5000);
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

// Обработка необработанных ошибок
process.on('uncaughtException', (error) => {
    Log.error({}, 'Uncaught Exception', error);
    shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
    Log.error({}, 'Unhandled Rejection', reason);
    shutdown('unhandledRejection');
});

// Запуск приложения
if (require.main === module) {
    main();
}

export { main };