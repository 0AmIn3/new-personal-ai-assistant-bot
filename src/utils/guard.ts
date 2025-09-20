import { AppError, ErrorCodes } from './errors';
import { LIMITS, REGEX_PATTERNS, ALLOWED_FILE_TYPES } from '../config/constants';

/**
 * Guard-функции для проверки условий
 * Выбрасывают ошибки с понятными сообщениями
 */

/**
 * Проверка, что значение существует
 */
export function assertExists<T>(
    value: T | null | undefined,
    errorMessage: string = 'Value is required'
): asserts value is T {
    if (value === null || value === undefined) {
        throw new AppError(ErrorCodes.MISSING_REQUIRED, errorMessage);
    }
}

/**
 * Проверка, что строка не пустая
 */
export function assertNotEmpty(
    value: string | undefined | null,
    fieldName: string = 'Field'
): asserts value is string {
    assertExists(value, `${fieldName} is required`);

    if (value.trim().length === 0) {
        throw new AppError(
            ErrorCodes.VALIDATION_ERROR,
            `${fieldName} cannot be empty`
        );
    }
}

/**
 * Проверка длины строки
 */
export function assertStringLength(
    value: string,
    min: number,
    max: number,
    fieldName: string = 'Field'
): void {
    if (value.length < min) {
        throw new AppError(
            ErrorCodes.VALIDATION_ERROR,
            `${fieldName} must be at least ${min} characters long`
        );
    }

    if (value.length > max) {
        throw new AppError(
            ErrorCodes.VALIDATION_ERROR,
            `${fieldName} must not exceed ${max} characters`
        );
    }
}

/**
 * Проверка email
 */
export function assertValidEmail(email: string): void {
    if (!REGEX_PATTERNS.EMAIL.test(email)) {
        throw new AppError(
            ErrorCodes.VALIDATION_ERROR,
            'Invalid email format'
        );
    }
}

/**
 * Проверка Telegram username
 */
export function assertValidTelegramUsername(username: string): void {
    if (!REGEX_PATTERNS.TELEGRAM_USERNAME.test(username)) {
        throw new AppError(
            ErrorCodes.VALIDATION_ERROR,
            'Invalid Telegram username format'
        );
    }
}

/**
 * Проверка размера файла
 */
export function assertFileSize(sizeInBytes: number, maxSize: number = LIMITS.MAX_FILE_SIZE): void {
    if (sizeInBytes > maxSize) {
        const maxSizeMB = Math.round(maxSize / 1024 / 1024);
        throw new AppError(
            ErrorCodes.FILE_TOO_LARGE,
            `File size exceeds ${maxSizeMB}MB limit`
        );
    }
}

/**
 * Проверка типа файла
 */
export function assertFileType(mimetype: string, allowedTypes?: string[]): void {
    const allowed = allowedTypes || [
        ...ALLOWED_FILE_TYPES.DOCUMENTS,
        ...ALLOWED_FILE_TYPES.IMAGES,
        ...ALLOWED_FILE_TYPES.ARCHIVES,
    ];

    if (!allowed.includes(mimetype)) {
        throw new AppError(
            ErrorCodes.VALIDATION_ERROR,
            `File type ${mimetype} is not allowed`
        );
    }
}

/**
 * Проверка даты в будущем
 */
export function assertFutureDate(date: Date, fieldName: string = 'Date'): void {
    if (date <= new Date()) {
        throw new AppError(
            ErrorCodes.VALIDATION_ERROR,
            `${fieldName} must be in the future`
        );
    }
}

/**
 * Проверка числа в диапазоне
 */
export function assertInRange(
    value: number,
    min: number,
    max: number,
    fieldName: string = 'Value'
): void {
    if (value < min || value > max) {
        throw new AppError(
            ErrorCodes.VALIDATION_ERROR,
            `${fieldName} must be between ${min} and ${max}`
        );
    }
}

/**
 * Проверка ID карточки Planka
 */
export function assertValidPlankaCardId(id: string): void {
    if (!REGEX_PATTERNS.PLANKA_CARD_ID.test(id)) {
        throw new AppError(
            ErrorCodes.VALIDATION_ERROR,
            'Invalid Planka card ID format'
        );
    }
}

/**
 * Проверка токена инвайта
 */
export function assertValidInviteToken(token: string): void {
    if (!REGEX_PATTERNS.INVITE_TOKEN.test(token)) {
        throw new AppError(
            ErrorCodes.VALIDATION_ERROR,
            'Invalid invite token format'
        );
    }
}

/**
 * Валидация входных данных для создания задачи
 */
export function validateTaskInput(data: {
    title?: string;
    description?: string;
    attachments?: Array<{ size: number; type?: string }>;
}): void {
    if (data.title) {
        assertStringLength(data.title, 1, LIMITS.MAX_TASK_TITLE_LENGTH, 'Title');
    }

    if (data.description) {
        assertStringLength(data.description, 0, LIMITS.MAX_TASK_DESCRIPTION_LENGTH, 'Description');
    }

    if (data.attachments) {
        if (data.attachments.length > LIMITS.MAX_FILES_PER_TASK) {
            throw new AppError(
                ErrorCodes.VALIDATION_ERROR,
                `Cannot attach more than ${LIMITS.MAX_FILES_PER_TASK} files to a task`
            );
        }

        for (const attachment of data.attachments) {
            assertFileSize(attachment.size);
            if (attachment.type) {
                assertFileType(attachment.type);
            }
        }
    }
}

/**
 * Проверка прав доступа
 */
export function assertHasPermission(
    userRole: string,
    requiredRoles: string[],
    action: string = 'perform this action'
): void {
    if (!requiredRoles.includes(userRole)) {
        throw new AppError(
            ErrorCodes.FORBIDDEN,
            `You don't have permission to ${action}`
        );
    }
}

/**
 * Безопасное преобразование в число
 */
export function parseIntSafe(value: string | number, defaultValue?: number): number {
    if (typeof value === 'number') {
        return value;
    }

    const parsed = parseInt(value, 10);

    if (isNaN(parsed)) {
        if (defaultValue !== undefined) {
            return defaultValue;
        }
        throw new AppError(
            ErrorCodes.VALIDATION_ERROR,
            `Invalid number: ${value}`
        );
    }

    return parsed;
}

/**
 * Безопасное преобразование в boolean
 */
export function parseBooleanSafe(value: string | boolean | number): boolean {
    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'number') {
        return value !== 0;
    }

    const normalized = value.toLowerCase().trim();
    return ['true', '1', 'yes', 'да', 'ha'].includes(normalized);
}

/**
 * Проверка и нормализация пагинации
 */
export function validatePagination(params: {
    page?: number | string;
    limit?: number | string;
}): { page: number; limit: number; offset: number } {
    const page = Math.max(1, parseIntSafe(params.page || 1, 1));
    const limit = Math.min(
        LIMITS.TASKS_PER_PAGE * 2,
        Math.max(1, parseIntSafe(params.limit || LIMITS.TASKS_PER_PAGE, LIMITS.TASKS_PER_PAGE))
    );
    const offset = (page - 1) * limit;

    return { page, limit, offset };
}

/**
 * Санитизация строки для безопасного использования
 */
export function sanitizeString(input: string, maxLength: number = 1000): string {
    return input
        .substring(0, maxLength)
        .replace(/[<>]/g, '') // Удаляем потенциально опасные символы
        .trim();
}

/**
 * Проверка, что объект не пустой
 */
export function isNotEmpty(obj: Record<string, any>): boolean {
    return Object.keys(obj).length > 0;
}

/**
 * Type guard для проверки ошибки
 */
export function isError(error: unknown): error is Error {
    return error instanceof Error;
}

/**
 * Type guard для проверки AppError
 */
export function isAppError(error: unknown): error is AppError {
    return error instanceof AppError;
}