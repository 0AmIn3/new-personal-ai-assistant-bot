/**
 * Константы приложения
 */

/**
 * Временные окна для напоминаний (в часах)
 */
export const REMINDER_WINDOWS = {
    FIRST: 24,  // За 24 часа
    SECOND: 6,  // За 6 часов
    THIRD: 2,   // За 2 часа
} as const;

/**
 * Лимиты
 */
export const LIMITS = {
    // Файлы
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    MAX_FILES_PER_TASK: 10,

    // Текст
    MAX_TASK_TITLE_LENGTH: 100,
    MAX_TASK_DESCRIPTION_LENGTH: 2000,

    // Поиск
    MAX_SEARCH_RESULTS: 20,

    // Пагинация
    TASKS_PER_PAGE: 10,

    // Инвайты
    DEFAULT_INVITE_TTL_HOURS: 24,
    MAX_ACTIVE_INVITES_PER_USER: 5,

    // Ретраи
    MAX_RETRY_ATTEMPTS: 3,

    // Сессии
    SESSION_TTL_MINUTES: 60,
} as const;

/**
 * Интервалы для джобов (cron patterns)
 */
export const JOB_INTERVALS = {
    // Напоминания - каждые 5 минут
    REMINDERS: '*/5 * * * *',

    // Дайджест - в 9:00 и 18:00
    DIGEST_MORNING: '0 9 * * *',
    DIGEST_EVENING: '0 18 * * *',

    // Очистка мусора - каждый день в 3:00
    CLEANUP: '0 3 * * *',

    // Синхронизация с Planka - каждые 30 минут
    SYNC: '*/30 * * * *',
} as const;

/**
 * Статусы задач для отображения
 */
export const TASK_STATUS_DISPLAY = {
    todo: {
        emoji: '📋',
        ru: 'К выполнению',
        uz: 'Bajarilishi kerak',
    },
    in_progress: {
        emoji: '⚡',
        ru: 'В работе',
        uz: 'Bajarilmoqda',
    },
    in_review: {
        emoji: '👀',
        ru: 'На проверке',
        uz: 'Tekshiruvda',
    },
    done: {
        emoji: '✅',
        ru: 'Выполнено',
        uz: 'Bajarildi',
    },
} as const;

/**
 * Приоритеты задач для отображения
 */
export const TASK_PRIORITY_DISPLAY = {
    низкий: {
        emoji: '🟢',
        color: '#00ff00',
    },
    средний: {
        emoji: '🟡',
        color: '#ffff00',
    },
    высокий: {
        emoji: '🟠',
        color: '#ff9900',
    },
    критический: {
        emoji: '🔴',
        color: '#ff0000',
    },
} as const;

/**
 * Регулярные выражения для парсинга
 */
export const REGEX_PATTERNS = {
    // Дата в формате ДД.ММ.ГГГГ
    DATE_RU: /(\d{1,2})\.(\d{1,2})\.(\d{4})/,

    // Дата в формате YYYY-MM-DD
    DATE_ISO: /(\d{4})-(\d{2})-(\d{2})/,

    // Email
    EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,

    // Telegram username
    TELEGRAM_USERNAME: /^@?[a-zA-Z0-9_]{5,32}$/,

    // ID карточки Planka
    PLANKA_CARD_ID: /^[a-f0-9]{24}$/,

    // Токен инвайта
    INVITE_TOKEN: /^[a-zA-Z0-9_-]{10}$/,
} as const;

/**
 * Ключевые слова для определения языка
 */
export const LANGUAGE_KEYWORDS = {
    RU: [
        'задача', 'создать', 'выполнить', 'срочно', 'важно',
        'сделать', 'нужно', 'необходимо', 'проверить', 'исправить'
    ],
    UZ: [
        'vazifa', 'yaratish', 'bajarish', 'tezkor', 'muhim',
        'qilish', 'kerak', 'zarur', 'tekshirish', 'tuzatish'
    ],
} as const;

/**
 * Ключевые слова для создания задач голосом
 */
export const VOICE_TASK_KEYWORDS = [
    'помощник', 'ассистент', 'ердамчи',
    'pomoshnik', 'assistant', 'yordamchi',
    'ёрдамчи', 'asistent', 'assistant'
] as const;

/**
 * Типы файлов
 */
export const ALLOWED_FILE_TYPES = {
    DOCUMENTS: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
    ],
    IMAGES: [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
    ],
    ARCHIVES: [
        'application/zip',
        'application/x-rar-compressed',
        'application/x-7z-compressed',
    ],
} as const;

/**
 * Список доступных команд
 */
export const BOT_COMMANDS = {
    COMMON: [
        { command: 'start', description: '🚀 Начать работу' },
        { command: 'help', description: '❓ Справка' },
        { command: 'my_tasks', description: '📋 Мои задачи' },
    ],
    OWNER: [
        { command: 'create_task', description: '📝 Создать задачу' },
        { command: 'stats', description: '📊 Статистика' },
        { command: 'deadlines', description: '📅 Дедлайны' },
        { command: 'search_tasks', description: '🔍 Поиск задач' },
    ],
    ADMIN: [
        { command: 'users', description: '👥 Управление пользователями' },
        { command: 'invite', description: '🎫 Создать приглашение' },
        { command: 'broadcast', description: '📢 Рассылка' },
    ],
} as const;

/**
 * Таймауты (в миллисекундах)
 */
export const TIMEOUTS = {
    USER_INPUT: 5 * 60 * 1000,      // 5 минут на ввод пользователя
    FILE_UPLOAD: 2 * 60 * 1000,     // 2 минуты на загрузку файла
    API_REQUEST: 15 * 1000,         // 15 секунд на API запрос
    SESSION_EXPIRE: 60 * 60 * 1000, // 1 час для сессии
} as const;

/**
 * Цвета для лейблов Planka
 */
export const PLANKA_LABEL_COLORS = {
    LOW: '#4caf50',      // Зелёный
    MEDIUM: '#ff9800',   // Оранжевый
    HIGH: '#f44336',     // Красный
    CRITICAL: '#9c27b0', // Фиолетовый
} as const;