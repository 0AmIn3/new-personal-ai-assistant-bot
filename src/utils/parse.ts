import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { TaskPriority, TaskCategory } from '../interfaces/task';
import { REGEX_PATTERNS } from '../config/constants';

// Подключаем плагины dayjs
dayjs.extend(customParseFormat);
dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Парсинг даты из текста
 */
export function parseDate(text: string): Date | null {
    const normalizedText = text.toLowerCase().trim();

    // Относительные даты
    const relativePatterns: Record<string, () => Date> = {
        'сегодня': () => dayjs().toDate(),
        'today': () => dayjs().toDate(),
        'bugun': () => dayjs().toDate(),

        'завтра': () => dayjs().add(1, 'day').toDate(),
        'tomorrow': () => dayjs().add(1, 'day').toDate(),
        'ertaga': () => dayjs().add(1, 'day').toDate(),

        'послезавтра': () => dayjs().add(2, 'day').toDate(),
        'after tomorrow': () => dayjs().add(2, 'day').toDate(),

        'через неделю': () => dayjs().add(1, 'week').toDate(),
        'next week': () => dayjs().add(1, 'week').toDate(),
        'keyingi hafta': () => dayjs().add(1, 'week').toDate(),

        'через месяц': () => dayjs().add(1, 'month').toDate(),
        'next month': () => dayjs().add(1, 'month').toDate(),
        'keyingi oy': () => dayjs().add(1, 'month').toDate(),
    };

    // Проверяем относительные даты
    for (const [pattern, getDate] of Object.entries(relativePatterns)) {
        if (normalizedText.includes(pattern)) {
            return getDate();
        }
    }

    // Парсим "через N дней/часов"
    const inDaysMatch = normalizedText.match(/через\s+(\d+)\s+(день|дня|дней)/);
    if (inDaysMatch) {
        const days = parseInt(inDaysMatch[1], 10);
        return dayjs().add(days, 'day').toDate();
    }

    const inHoursMatch = normalizedText.match(/через\s+(\d+)\s+(час|часа|часов)/);
    if (inHoursMatch) {
        const hours = parseInt(inHoursMatch[1], 10);
        return dayjs().add(hours, 'hour').toDate();
    }

    // Абсолютные даты в формате ДД.ММ.ГГГГ
    const ruDateMatch = text.match(REGEX_PATTERNS.DATE_RU);
    if (ruDateMatch) {
        const [, day, month, year] = ruDateMatch;
        const date = dayjs(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
        if (date.isValid()) {
            return date.toDate();
        }
    }

    // ISO формат YYYY-MM-DD
    const isoDateMatch = text.match(REGEX_PATTERNS.DATE_ISO);
    if (isoDateMatch) {
        const date = dayjs(isoDateMatch[0]);
        if (date.isValid()) {
            return date.toDate();
        }
    }

    // Попытка парсинга через dayjs напрямую
    const date = dayjs(text);
    if (date.isValid()) {
        return date.toDate();
    }

    return null;
}

/**
 * Парсинг приоритета из текста
 */
export function parsePriority(text: string): TaskPriority | null {
    const normalizedText = text.toLowerCase();

    const priorityKeywords: Record<TaskPriority, string[]> = {
        [TaskPriority.CRITICAL]: [
            'критический', 'критично', 'critical', 'kritik',
            'очень срочно', 'very urgent', 'juda shoshilinch'
        ],
        [TaskPriority.HIGH]: [
            'высокий', 'срочно', 'важно', 'high', 'urgent', 'important',
            'yuqori', 'shoshilinch', 'muhim', 'asap', 'быстро', 'tez'
        ],
        [TaskPriority.MEDIUM]: [
            'средний', 'обычный', 'нормальный', 'medium', 'normal',
            'oʻrta', 'oddiy', 'normal'
        ],
        [TaskPriority.LOW]: [
            'низкий', 'не срочно', 'потом', 'low', 'not urgent', 'later',
            'past', 'shoshilmas', 'keyinroq', 'когда будет время'
        ],
    };

    for (const [priority, keywords] of Object.entries(priorityKeywords)) {
        if (keywords.some(keyword => normalizedText.includes(keyword))) {
            return priority as TaskPriority;
        }
    }

    return null;
}

/**
 * Парсинг категории из текста
 */
export function parseCategory(text: string): TaskCategory | null {
    const normalizedText = text.toLowerCase();

    const categoryKeywords: Record<TaskCategory, string[]> = {
        [TaskCategory.DEVELOPMENT]: [
            'разработка', 'код', 'программирование', 'development', 'coding',
            'dasturlash', 'kod', 'backend', 'frontend', 'api', 'баг', 'bug'
        ],
        [TaskCategory.DESIGN]: [
            'дизайн', 'макет', 'ui', 'ux', 'design', 'layout',
            'dizayn', 'maket', 'интерфейс', 'interface'
        ],
        [TaskCategory.TESTING]: [
            'тестирование', 'тест', 'qa', 'testing', 'test',
            'sinov', 'test', 'проверка', 'tekshirish'
        ],
        [TaskCategory.DOCUMENTATION]: [
            'документация', 'документ', 'описание', 'documentation', 'docs',
            'hujjat', 'tavsif', 'инструкция', 'manual'
        ],
        [TaskCategory.OTHER]: [],
    };

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
        if (keywords.some(keyword => normalizedText.includes(keyword))) {
            return category as TaskCategory;
        }
    }

    return TaskCategory.OTHER;
}

/**
 * Извлечение исполнителя из текста
 */
export function parseAssignee(text: string): string | null {
    const normalizedText = text.toLowerCase();

    // Паттерны для поиска исполнителя
    const patterns = [
        /назнач(?:ь|ить)?\s+(?:на\s+)?@?(\w+)/i,
        /исполнитель\s*:?\s*@?(\w+)/i,
        /assign(?:\s+to)?\s+@?(\w+)/i,
        /для\s+@?(\w+)/i,
        /for\s+@?(\w+)/i,
        /uchun\s+@?(\w+)/i,
        /@(\w+)/i, // Просто упоминание username
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }

    return null;
}

/**
 * Форматирование даты для отображения
 */
export function formatDate(
    date: Date,
    format: 'short' | 'long' | 'relative' = 'short',
    locale: 'ru' | 'uz' = 'ru'
): string {
    const d = dayjs(date);

    switch (format) {
        case 'short':
            return d.format('DD.MM.YYYY');

        case 'long':
            if (locale === 'uz') {
                return d.locale('uz').format('DD MMMM YYYY, HH:mm');
            }
            return d.locale('ru').format('DD MMMM YYYY, HH:mm');

        case 'relative':
            const now = dayjs();
            const diffDays = d.diff(now, 'day');
            const diffHours = d.diff(now, 'hour');

            if (locale === 'uz') {
                if (diffDays === 0) return 'Bugun';
                if (diffDays === 1) return 'Ertaga';
                if (diffDays === -1) return 'Kecha';
                if (diffDays > 0) return `${diffDays} kundan keyin`;
                if (diffHours > -24) return `${Math.abs(diffHours)} soat oldin`;
                return `${Math.abs(diffDays)} kun oldin`;
            }

            if (diffDays === 0) return 'Сегодня';
            if (diffDays === 1) return 'Завтра';
            if (diffDays === -1) return 'Вчера';
            if (diffDays > 0) return `Через ${diffDays} дн.`;
            if (diffHours > -24) return `${Math.abs(diffHours)} ч. назад`;
            return `${Math.abs(diffDays)} дн. назад`;

        default:
            return d.format('DD.MM.YYYY');
    }
}

/**
 * Парсинг времени из текста (часы и минуты)
 */
export function parseTime(text: string): { hours: number; minutes: number } | null {
    const patterns = [
        /(\d{1,2}):(\d{2})/,           // 14:30
        /(\d{1,2})\s*ч(?:ас)?/i,       // 14 час, 14ч
        /в\s+(\d{1,2})/i,              // в 14
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            const hours = parseInt(match[1], 10);
            const minutes = match[2] ? parseInt(match[2], 10) : 0;

            if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
                return { hours, minutes };
            }
        }
    }

    return null;
}

/**
 * Извлечение хештегов из текста
 */
export function parseHashtags(text: string): string[] {
    const matches = text.match(/#\w+/g);
    return matches ? matches.map(tag => tag.substring(1)) : [];
}

/**
 * Очистка текста от специальных символов Markdown
 */
export function escapeMarkdown(text: string): string {
    return text.replace(/([*_[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

/**
 * Проверка валидности email
 */
export function isValidEmail(email: string): boolean {
    return REGEX_PATTERNS.EMAIL.test(email);
}