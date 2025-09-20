import pino from 'pino';
import { config } from '../config/env';

/**
 * Создаём логгер с настройками
 */
const logger = pino({
    level: config.env.isProduction ? 'info' : 'debug',
    transport: config.env.isDevelopment ? {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
        }
    } : undefined,
    // В проде используем JSON-формат
    formatters: {
        level: (label) => {
            return { level: label.toUpperCase() };
        },
    },
    // Не логируем чувствительные данные
    redact: {
        paths: [
            'password',
            'token',
            'apiKey',
            '*.password',
            '*.token',
            '*.apiKey',
            'headers.authorization',
        ],
        remove: true,
    },
});

/**
 * Интерфейс для контекста логирования
 */
export interface LogContext {
    chatId?: number;
    userId?: number;
    username?: string;
    requestId?: string;
    job?: string;
    [key: string]: any;
}

/**
 * Хелпер для логирования с контекстом из Telegram
 */
export function log(
    ctx: any | LogContext,
    message: string,
    meta?: Record<string, any>
) {
    // Если передан контекст Telegraf
    if (ctx?.chat?.id || ctx?.from?.id) {
        const context: LogContext = {
            chatId: ctx.chat?.id,
            userId: ctx.from?.id,
            username: ctx.from?.username,
            ...meta,
        };
        return logger.info(context, message);
    }

    // Если передан обычный объект контекста
    return logger.info({ ...ctx, ...meta }, message);
}

/**
 * Логирование уровней
 */
export const Log = {
    info: (ctx: any | LogContext, msg: string, meta?: Record<string, any>) => {
        log(ctx, msg, meta);
    },

    warn: (ctx: any | LogContext, msg: string, meta?: Record<string, any>) => {
        if (ctx?.chat?.id || ctx?.from?.id) {
            logger.warn({
                chatId: ctx.chat?.id,
                userId: ctx.from?.id,
                username: ctx.from?.username,
                ...meta,
            }, msg);
        } else {
            logger.warn({ ...ctx, ...meta }, msg);
        }
    },

    error: (ctx: any | LogContext, msg: string, error?: any, meta?: Record<string, any>) => {
        const errorObj = error instanceof Error ? {
            error: {
                message: error.message,
                stack: error.stack,
                name: error.name,
            }
        } : { error };

        if (ctx?.chat?.id || ctx?.from?.id) {
            logger.error({
                chatId: ctx.chat?.id,
                userId: ctx.from?.id,
                username: ctx.from?.username,
                ...errorObj,
                ...meta,
            }, msg);
        } else {
            logger.error({ ...ctx, ...errorObj, ...meta }, msg);
        }
    },

    // Для джобов
    job: (jobName: string, msg: string, meta?: Record<string, any>) => {
        logger.info({ job: jobName, ...meta }, msg);
    },

    // Для внешних вызовов
    external: (service: string, msg: string, meta?: Record<string, any>) => {
        logger.info({ service, ...meta }, msg);
    },
};

export default Log;