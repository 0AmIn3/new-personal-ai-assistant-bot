import dotenv from 'dotenv';

// Загружаем переменные окружения
dotenv.config();

/**
 * Конфигурация приложения из переменных окружения
 * Все обращения к process.env только здесь!
 */
export const config = {
    // Telegram боты
    telegram: {
        workBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
        regBotToken: process.env.TELEGRAM_REG_BOT_TOKEN || '',
        ownerUsername: process.env.OWNER_USERNAME || '',
    },

    // Planka API
    planka: {
        baseUrl: process.env.PLANKA_BASE_URL || 'http://localhost:1337',
        username: process.env.PLANKA_USERNAME || '',
        password: process.env.PLANKA_PASSWORD || '',
        projectId: process.env.PLANKA_PROJECT_ID || '',
        boardId: process.env.PLANKA_BOARD_ID || '',
    },

    // Gemini AI
    gemini: {
        apiKey: process.env.GEMINI_API_KEY || '',
    },

    // База данных
    database: {
        path: process.env.DB_PATH || './data.db',
    },

    // Сервер
    server: {
        port: parseInt(process.env.PORT || '5000', 10),
    },

    // Окружение
    env: {
        isDevelopment: process.env.NODE_ENV === 'development',
        isProduction: process.env.NODE_ENV === 'production',
    },

    // Таймауты (в миллисекундах)
    timeouts: {
        default: 10000, // 10 секунд
        long: 15000,    // 15 секунд
        planka: parseInt(process.env.PLANKA_TIMEOUT || '10000', 10),
        gemini: parseInt(process.env.GEMINI_TIMEOUT || '15000', 10),
    },

    // Лимиты
    limits: {
        maxFileSize: 10 * 1024 * 1024, // 10MB
        maxRetries: 3,
        inviteTTL: 24 * 60 * 60 * 1000, // 24 часа
    },

    // Напоминания (окна в минутах)
    reminders: {
        windows: [1440, 360, 120], // 24ч, 6ч, 2ч до дедлайна
    },
};

/**
 * Валидация обязательных переменных окружения
 */
export function validateConfig(): void {
    const required = [
        'TELEGRAM_BOT_TOKEN',
        'PLANKA_BASE_URL',
        'PLANKA_USERNAME',
        'PLANKA_PASSWORD',
        'GEMINI_API_KEY',
    ];

    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
}