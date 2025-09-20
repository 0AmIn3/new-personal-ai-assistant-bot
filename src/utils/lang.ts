import { Language } from '../interfaces/user';
import { LANGUAGE_KEYWORDS } from '../config/constants';

/**
 * Определение языка текста по символам и ключевым словам
 */
export function detectLanguage(text: string): Language {
    const normalizedText = text.toLowerCase();

    // Подсчёт символов кириллицы и латиницы
    const cyrillicCount = (text.match(/[а-яё]/gi) || []).length;
    const latinCount = (text.match(/[a-z]/gi) || []).length;

    // Подсчёт ключевых слов
    let ruKeywordCount = 0;
    let uzKeywordCount = 0;

    for (const keyword of LANGUAGE_KEYWORDS.RU) {
        if (normalizedText.includes(keyword)) {
            ruKeywordCount++;
        }
    }

    for (const keyword of LANGUAGE_KEYWORDS.UZ) {
        if (normalizedText.includes(keyword)) {
            uzKeywordCount++;
        }
    }

    // Определение языка по приоритетам:
    // 1. Если есть явные ключевые слова одного языка
    if (ruKeywordCount > uzKeywordCount) {
        return Language.RU;
    }
    if (uzKeywordCount > ruKeywordCount) {
        return Language.UZ;
    }

    // 2. Проверка специфичных узбекских символов
    const uzbekSpecificChars = /[ʻʼ''ʻ]/g;
    if (uzbekSpecificChars.test(text)) {
        return Language.UZ;
    }

    // 3. Проверка узбекских буквосочетаний
    const uzbekPatterns = [
        /\bsh\b/gi,  // sh как отдельное слово
        /\bch\b/gi,  // ch как отдельное слово
        /oʻ/gi,      // o'
        /gʻ/gi,      // g'
        /ng\b/gi,    // ng в конце слова
    ];

    let uzbekPatternCount = 0;
    for (const pattern of uzbekPatterns) {
        const matches = text.match(pattern);
        if (matches) {
            uzbekPatternCount += matches.length;
        }
    }

    if (uzbekPatternCount > 2) {
        return Language.UZ;
    }

    // 4. По преобладанию алфавита
    if (cyrillicCount > latinCount * 2) {
        return Language.RU;
    }
    if (latinCount > cyrillicCount * 2) {
        return Language.UZ;
    }

    // 5. По умолчанию - русский
    return Language.RU;
}

/**
 * Транслитерация текста
 */
export function transliterate(text: string, direction: 'ru-to-latin' | 'latin-to-ru'): string {
    const ruToLatin: Record<string, string> = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd',
        'е': 'e', 'ё': 'yo', 'ж': 'zh', 'з': 'z', 'и': 'i',
        'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n',
        'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't',
        'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch',
        'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '',
        'э': 'e', 'ю': 'yu', 'я': 'ya',
        'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D',
        'Е': 'E', 'Ё': 'Yo', 'Ж': 'Zh', 'З': 'Z', 'И': 'I',
        'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M', 'Н': 'N',
        'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T',
        'У': 'U', 'Ф': 'F', 'Х': 'Kh', 'Ц': 'Ts', 'Ч': 'Ch',
        'Ш': 'Sh', 'Щ': 'Shch', 'Ъ': '', 'Ы': 'Y', 'Ь': '',
        'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya',
    };

    if (direction === 'ru-to-latin') {
        return text.split('').map(char => ruToLatin[char] || char).join('');
    }

    // Обратная транслитерация (упрощённая)
    const latinToRu: Record<string, string> = {};
    for (const [ru, latin] of Object.entries(ruToLatin)) {
        if (latin) {
            latinToRu[latin.toLowerCase()] = ru.toLowerCase();
        }
    }

    // Сортируем по длине (сначала длинные сочетания)
    const sortedKeys = Object.keys(latinToRu).sort((a, b) => b.length - a.length);

    let result = text.toLowerCase();
    for (const key of sortedKeys) {
        result = result.replace(new RegExp(key, 'g'), latinToRu[key]);
    }

    return result;
}

/**
 * Нормализация текста для поиска
 */
export function normalizeText(text: string): string {
    return text
        .toLowerCase()
        .replace(/[ʻʼ''ʻ]/g, "'")  // Нормализация апострофов
        .replace(/\s+/g, ' ')       // Множественные пробелы в один
        .trim();
}

/**
 * Определение направления текста (LTR/RTL)
 */
export function getTextDirection(text: string): 'ltr' | 'rtl' {
    // Проверка на арабские символы (на случай расширения)
    const arabicPattern = /[\u0600-\u06FF\u0750-\u077F]/;
    if (arabicPattern.test(text)) {
        return 'rtl';
    }

    return 'ltr';
}

/**
 * Получение приветствия в зависимости от времени суток
 */
export function getGreeting(lang: Language = Language.RU): string {
    const hour = new Date().getHours();

    if (lang === Language.UZ) {
        if (hour < 6) return 'Xayrli tun';
        if (hour < 12) return 'Xayrli tong';
        if (hour < 18) return 'Xayrli kun';
        return 'Xayrli kech';
    }

    if (hour < 6) return 'Доброй ночи';
    if (hour < 12) return 'Доброе утро';
    if (hour < 18) return 'Добрый день';
    return 'Добрый вечер';
}

/**
 * Форматирование числительных с правильным склонением
 */
export function pluralize(
    count: number,
    forms: { one: string; few: string; many: string },
    lang: Language = Language.RU
): string {
    if (lang === Language.UZ) {
        // В узбекском нет склонений по числам
        return `${count} ${forms.many}`;
    }

    const lastDigit = count % 10;
    const lastTwoDigits = count % 100;

    if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
        return `${count} ${forms.many}`;
    }

    if (lastDigit === 1) {
        return `${count} ${forms.one}`;
    }

    if (lastDigit >= 2 && lastDigit <= 4) {
        return `${count} ${forms.few}`;
    }

    return `${count} ${forms.many}`;
}

/**
 * Примеры использования pluralize:
 * pluralize(1, { one: 'задача', few: 'задачи', many: 'задач' }) // "1 задача"
 * pluralize(3, { one: 'задача', few: 'задачи', many: 'задач' }) // "3 задачи"
 * pluralize(5, { one: 'задача', few: 'задачи', many: 'задач' }) // "5 задач"
 */