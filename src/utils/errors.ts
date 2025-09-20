/**
 * Кастомный класс ошибок приложения
 */
export class AppError extends Error {
    constructor(
        public code: string,
        message: string,
        public meta?: Record<string, any>
    ) {
        super(message);
        this.name = 'AppError';
    }
}

/**
 * Коды ошибок
 */
export const ErrorCodes = {
    // Авторизация
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    INVALID_TOKEN: 'INVALID_TOKEN',

    // Валидация
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    INVALID_INPUT: 'INVALID_INPUT',
    MISSING_REQUIRED: 'MISSING_REQUIRED',

    // База данных
    DB_ERROR: 'DB_ERROR',
    NOT_FOUND: 'NOT_FOUND',
    ALREADY_EXISTS: 'ALREADY_EXISTS',

    // Внешние сервисы
    PLANKA_ERROR: 'PLANKA_ERROR',
    GEMINI_ERROR: 'GEMINI_ERROR',
    TELEGRAM_ERROR: 'TELEGRAM_ERROR',

    // Бизнес-логика
    TASK_CREATE_FAILED: 'TASK_CREATE_FAILED',
    ASSIGNEE_NOT_FOUND: 'ASSIGNEE_NOT_FOUND',
    INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
    INVITE_EXPIRED: 'INVITE_EXPIRED',
    INVITE_ALREADY_USED: 'INVITE_ALREADY_USED',

    // Лимиты
    RATE_LIMIT: 'RATE_LIMIT',
    FILE_TOO_LARGE: 'FILE_TOO_LARGE',
} as const;

/**
 * Преобразование ошибки в сообщение для пользователя
 */
export function errorToUserMessage(error: unknown, lang: 'ru' | 'uz' = 'ru'): string {
    if (error instanceof AppError) {
        const messages: Record<string, Record<'ru' | 'uz', string>> = {
            [ErrorCodes.UNAUTHORIZED]: {
                ru: '❌ У вас нет прав для выполнения этой команды',
                uz: '❌ Ushbu buyruqni bajarish uchun huquqlaringiz yoʻq',
            },
            [ErrorCodes.NOT_FOUND]: {
                ru: '❌ Запрашиваемые данные не найдены',
                uz: '❌ Soʻralgan maʼlumotlar topilmadi',
            },
            [ErrorCodes.PLANKA_ERROR]: {
                ru: '❌ Ошибка при работе с Planka',
                uz: '❌ Planka bilan ishlashda xatolik',
            },
            [ErrorCodes.GEMINI_ERROR]: {
                ru: '❌ Ошибка при анализе текста',
                uz: '❌ Matnni tahlil qilishda xatolik',
            },
            [ErrorCodes.TASK_CREATE_FAILED]: {
                ru: '❌ Не удалось создать задачу',
                uz: '❌ Vazifani yaratib boʻlmadi',
            },
            [ErrorCodes.ASSIGNEE_NOT_FOUND]: {
                ru: '❌ Исполнитель не найден',
                uz: '❌ Ijrochi topilmadi',
            },
            [ErrorCodes.INVITE_EXPIRED]: {
                ru: '❌ Срок действия приглашения истёк',
                uz: '❌ Taklifnoma muddati tugagan',
            },
            [ErrorCodes.FILE_TOO_LARGE]: {
                ru: '❌ Файл слишком большой (макс. 10MB)',
                uz: '❌ Fayl juda katta (maks. 10MB)',
            },
        };

        const message = messages[error.code];
        if (message) {
            return message[lang];
        }
    }

    // Дефолтное сообщение
    return lang === 'ru'
        ? '❌ Произошла ошибка. Попробуйте позже.'
        : '❌ Xatolik yuz berdi. Keyinroq urinib koʻring.';
}

/**
 * Обёртка для безопасного выполнения с обработкой ошибок
 */
export async function withErrorHandling<T>(
    fn: () => Promise<T>,
    defaultValue?: T
): Promise<T | undefined> {
    try {
        return await fn();
    } catch (error) {
        console.error('Error caught:', error);
        return defaultValue;
    }
}