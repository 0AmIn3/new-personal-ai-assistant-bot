import { Context, Middleware } from 'telegraf';
import { usersRepo } from '../../data/repo/usersRepo';
import { User, UserRole, Permission, hasPermission } from '../../interfaces/user';
import { AppError, ErrorCodes } from '../../utils/errors';
import Log from '../../utils/log';

/**
 * Расширение контекста Telegraf
 */
export interface AuthContext extends Context {
    user?: User;
    isOwner: boolean;
    isAdmin: boolean;
    isEmployee: boolean;
}

/**
 * Middleware для проверки авторизации
 * Загружает данные пользователя из БД
 */
export const authMiddleware: Middleware<AuthContext> = async (ctx, next) => {
    if (!ctx.from) {
        return;
    }

    try {
        // Получаем пользователя из БД
        const user = usersRepo.getByTelegramId(ctx.from.id);

        if (user) {
            // Добавляем пользователя в контекст
            ctx.user = user;
            ctx.isOwner = user.role === UserRole.OWNER;
            ctx.isAdmin = user.role === UserRole.ADMIN;
            ctx.isEmployee = user.role === UserRole.EMPLOYEE;

            Log.info(ctx, 'User authenticated', {
                role: user.role,
                userId: user.telegramId,
            });
        } else {
            // Пользователь не зарегистрирован
            ctx.user = undefined;
            ctx.isOwner = false;
            ctx.isAdmin = false;
            ctx.isEmployee = false;
        }

        return next();
    } catch (error) {
        Log.error(ctx, 'Auth middleware error', error);
        return next();
    }
};

/**
 * Middleware для проверки, что пользователь зарегистрирован
 */
export const requireAuth: Middleware<AuthContext> = async (ctx, next) => {
    if (!ctx.user) {
        await ctx.reply('❌ Вы не зарегистрированы в системе.\nОбратитесь к администратору для получения приглашения.');
        return;
    }

    return next();
};

/**
 * Middleware для проверки прав владельца
 */
export const ownerOnly: Middleware<AuthContext> = async (ctx, next) => {
    if (!ctx.user) {
        await ctx.reply('❌ Вы не зарегистрированы в системе.');
        return;
    }

    if (!ctx.isOwner && !ctx.isAdmin) {
        Log.warn(ctx, 'Access denied: owner only', {
            userId: ctx.user.telegramId,
            role: ctx.user.role,
        });

        await ctx.reply('❌ Эта команда доступна только владельцам.');
        return;
    }

    return next();
};

/**
 * Middleware для проверки прав администратора
 */
export const adminOnly: Middleware<AuthContext> = async (ctx, next) => {
    if (!ctx.user) {
        await ctx.reply('❌ Вы не зарегистрированы в системе.');
        return;
    }

    if (!ctx.isAdmin) {
        Log.warn(ctx, 'Access denied: admin only', {
            userId: ctx.user.telegramId,
            role: ctx.user.role,
        });

        await ctx.reply('❌ Эта команда доступна только администраторам.');
        return;
    }

    return next();
};

/**
 * Middleware для проверки, что команда в личных сообщениях
 */
export const privateOnly: Middleware<AuthContext> = async (ctx, next) => {
    if (ctx.chat?.type !== 'private') {
        await ctx.reply('❌ Эта команда доступна только в личных сообщениях с ботом.');
        return;
    }

    return next();
};

/**
 * Middleware для проверки конкретного разрешения
 */
export function requirePermission(permission: Permission): Middleware<AuthContext> {
    return async (ctx, next) => {
        if (!ctx.user) {
            await ctx.reply('❌ Вы не зарегистрированы в системе.');
            return;
        }

        if (!hasPermission(ctx.user, permission)) {
            Log.warn(ctx, 'Access denied: missing permission', {
                userId: ctx.user.telegramId,
                role: ctx.user.role,
                permission,
            });

            await ctx.reply('❌ У вас недостаточно прав для выполнения этой операции.');
            return;
        }

        return next();
    };
}

/**
 * Middleware для логирования всех команд
 */
export const logCommand: Middleware<Context> = async (ctx, next) => {
    if ('text' in ctx.message! && ctx.message.text?.startsWith('/')) {
        const command = ctx.message.text.split(' ')[0];

        Log.info(ctx, 'Command received', {
            command,
            chatType: ctx.chat?.type,
            username: ctx.from?.username,
        });
    }

    return next();
};