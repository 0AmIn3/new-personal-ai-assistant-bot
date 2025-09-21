import { Telegraf } from 'telegraf';
import { AuthContext } from '../middlewares/auth';
import { getTexts } from '../replies';
import {
    generateInvite,
    getUserInvites,
    revokeInvite,
    validateInvite
} from '../../usecases/registration/generateInvite';
import {
    registerEmployee,
    completeRegistration,
    getAllUsers
} from '../../usecases/registration/registerEmployee';
import {
    promoteToOwner,
    demoteFromOwner,
    getOwners,
    getRolesStats
} from '../../usecases/registration/promoteOwner';
import { Language, UserRole } from '../../interfaces/user';
import { errorToUserMessage } from '../../utils/errors';
import { assertValidEmail } from '../../utils/guard';
import Log from '../../utils/log';

/**
 * Состояния регистрации
 */
interface RegistrationState {
    step: 'waiting_email' | 'confirming';
    inviteToken?: string;
    email?: string;
    createdAt: Date;
}

const registrationStates = new Map<number, RegistrationState>();

/**
 * Регистрация обработчиков регистрационного бота
 */
export function registerRegHandlers(bot: Telegraf<AuthContext>) {
    // Команда /start с токеном инвайта
    bot.command('start', async (ctx) => {
        const text = ctx.message.text;
        const parts = text.split(' ');

        // Если есть параметр - это токен инвайта
        if (parts.length > 1) {
            const token = parts[1];
            await handleInviteToken(ctx, token);
            return;
        }

        // Обычный /start
        const lang = ctx.user?.language || Language.RU;
        const t = getTexts(lang);

        if (ctx.user) {
            // Пользователь уже зарегистрирован
            if (ctx.user.role === UserRole.ADMIN || ctx.user.role === UserRole.OWNER) {
                await showAdminMenu(ctx);
            } else {
                await ctx.reply(t.welcome.registered(
                    ctx.user.fullName || ctx.user.username || 'User'
                ));
            }
        } else {
            await ctx.reply(
                '👋 Добро пожаловать в регистрационный бот!\n\n' +
                'Для регистрации в системе вам нужно получить приглашение от администратора.\n\n' +
                'Если у вас есть код приглашения, отправьте его или используйте ссылку.'
            );
        }
    });

    // Команда /invite - создание приглашения (для админов)
    bot.command('invite', async (ctx) => {
        if (!ctx.user) {
            await ctx.reply('❌ Вы не зарегистрированы в системе');
            return;
        }

        if (ctx.user.role !== UserRole.ADMIN && ctx.user.role !== UserRole.OWNER) {
            await ctx.reply('❌ Только администраторы могут создавать приглашения');
            return;
        }

        const lang = ctx.user.language;

        try {
            const { invite, inviteLink } = await generateInvite(ctx.user.telegramId);

            const expiresIn = Math.round(
                (invite.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60)
            );

            await ctx.reply(
                '🎫 **Новое приглашение создано!**\n\n' +
                `🔑 Код: \`${invite.token}\`\n` +
                `🔗 Ссылка: ${inviteLink}\n` +
                `⏱ Действительно: ${expiresIn} часов\n\n` +
                'Отправьте эту ссылку новому сотруднику для регистрации.',
                { parse_mode: 'Markdown' }
            );

            Log.info(ctx, 'Invite created', { token: invite.token });

        } catch (error) {
            await ctx.reply(errorToUserMessage(error, lang));
        }
    });

    // Команда /invites - просмотр своих приглашений
    bot.command('invites', async (ctx) => {
        if (!ctx.user) {
            await ctx.reply('❌ Вы не зарегистрированы в системе');
            return;
        }

        if (ctx.user.role !== UserRole.ADMIN && ctx.user.role !== UserRole.OWNER) {
            await ctx.reply('❌ У вас нет доступа к приглашениям');
            return;
        }

        try {
            const invites = await getUserInvites(ctx.user.telegramId, true);

            if (invites.length === 0) {
                await ctx.reply('У вас нет активных приглашений');
                return;
            }

            let message = '🎫 **Ваши активные приглашения:**\n\n';

            for (const { invite, link, status } of invites) {
                const statusEmoji = {
                    active: '✅',
                    used: '👤',
                    expired: '⏰',
                }[status];

                message += `${statusEmoji} \`${invite.token}\`\n`;

                if (status === 'active') {
                    const expiresIn = Math.round(
                        (invite.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60)
                    );
                    message += `   Осталось: ${expiresIn}ч\n`;
                    message += `   [Ссылка](${link})\n`;
                }

                message += '\n';
            }

            await ctx.reply(message, {
                parse_mode: 'Markdown',
                disable_web_page_preview: true,
            });

        } catch (error) {
            await ctx.reply('❌ Ошибка при получении списка приглашений');
        }
    });

    // Команда /users - список пользователей
    bot.command('users', async (ctx) => {
        if (!ctx.user) {
            await ctx.reply('❌ Вы не зарегистрированы в системе');
            return;
        }

        if (ctx.user.role !== UserRole.ADMIN && ctx.user.role !== UserRole.OWNER) {
            await ctx.reply('❌ У вас нет доступа к списку пользователей');
            return;
        }

        try {
            const users = await getAllUsers(ctx.user.telegramId);

            if (users.length === 0) {
                await ctx.reply('Пользователей не найдено');
                return;
            }

            let message = '👥 **Список пользователей:**\n\n';

            // Группируем по ролям
            const byRole = {
                [UserRole.ADMIN]: users.filter(u => u.role === UserRole.ADMIN),
                [UserRole.OWNER]: users.filter(u => u.role === UserRole.OWNER),
                [UserRole.EMPLOYEE]: users.filter(u => u.role === UserRole.EMPLOYEE),
            };

            if (byRole[UserRole.ADMIN].length > 0) {
                message += '👑 **Администраторы:**\n';
                for (const user of byRole[UserRole.ADMIN]) {
                    message += formatUserLine(user);
                }
                message += '\n';
            }

            if (byRole[UserRole.OWNER].length > 0) {
                message += '💼 **Владельцы:**\n';
                for (const user of byRole[UserRole.OWNER]) {
                    message += formatUserLine(user);
                }
                message += '\n';
            }

            if (byRole[UserRole.EMPLOYEE].length > 0) {
                message += '👤 **Сотрудники:**\n';
                for (const user of byRole[UserRole.EMPLOYEE].slice(0, 10)) {
                    message += formatUserLine(user);
                }
                if (byRole[UserRole.EMPLOYEE].length > 10) {
                    message += `... и ещё ${byRole[UserRole.EMPLOYEE].length - 10}\n`;
                }
            }

            message += `\n📊 Всего: ${users.length}`;

            await ctx.reply(message, { parse_mode: 'Markdown' });

        } catch (error) {
            await ctx.reply('❌ Ошибка при получении списка пользователей');
        }
    });

    // Команда /promote - повышение до владельца
    bot.command('promote', async (ctx) => {
        if (!ctx.user || ctx.user.role !== UserRole.ADMIN) {
            await ctx.reply('❌ Только администраторы могут повышать пользователей');
            return;
        }

        const text = ctx.message.text;
        const username = text.replace('/promote', '').trim().replace('@', '');

        if (!username) {
            await ctx.reply(
                'Использование: /promote @username\n' +
                'Повышает пользователя до владельца'
            );
            return;
        }

        try {
            const users = await getAllUsers(ctx.user.telegramId);
            const targetUser = users.find(u => u.username === username);

            if (!targetUser) {
                await ctx.reply(`❌ Пользователь @${username} не найден`);
                return;
            }

            const promoted = await promoteToOwner(targetUser.telegramId, ctx.user.telegramId);

            await ctx.reply(
                `✅ Пользователь @${username} повышен до владельца!`
            );

            Log.info(ctx, 'User promoted', {
                targetId: targetUser.telegramId,
                targetUsername: username,
            });

        } catch (error: any) {
            await ctx.reply(`❌ ${error.message}`);
        }
    });

    // Команда /demote - понижение владельца
    bot.command('demote', async (ctx) => {
        if (!ctx.user || ctx.user.role !== UserRole.ADMIN) {
            await ctx.reply('❌ Только администраторы могут понижать пользователей');
            return;
        }

        const text = ctx.message.text;
        const username = text.replace('/demote', '').trim().replace('@', '');

        if (!username) {
            await ctx.reply(
                'Использование: /demote @username\n' +
                'Понижает владельца до сотрудника'
            );
            return;
        }

        try {
            const users = await getAllUsers(ctx.user.telegramId);
            const targetUser = users.find(u => u.username === username);

            if (!targetUser) {
                await ctx.reply(`❌ Пользователь @${username} не найден`);
                return;
            }

            const demoted = await demoteFromOwner(targetUser.telegramId, ctx.user.telegramId);

            await ctx.reply(
                `✅ Пользователь @${username} понижен до сотрудника`
            );

            Log.info(ctx, 'User demoted', {
                targetId: targetUser.telegramId,
                targetUsername: username,
            });

        } catch (error: any) {
            await ctx.reply(`❌ ${error.message}`);
        }
    });

    // Команда /stats - статистика системы
    bot.command('stats', async (ctx) => {
        if (!ctx.user) {
            await ctx.reply('❌ Вы не зарегистрированы в системе');
            return;
        }

        if (ctx.user.role !== UserRole.ADMIN) {
            await ctx.reply('❌ Только администраторы могут просматривать статистику');
            return;
        }

        try {
            const rolesStats = await getRolesStats();

            const message = `📊 **Статистика системы:**\n\n` +
                `👥 Всего пользователей: ${rolesStats.total}\n` +
                `👑 Администраторов: ${rolesStats.byRole[UserRole.ADMIN]}\n` +
                `💼 Владельцев: ${rolesStats.byRole[UserRole.OWNER]}\n` +
                `👤 Сотрудников: ${rolesStats.byRole[UserRole.EMPLOYEE]}\n\n` +
                `📧 С email: ${rolesStats.withEmail}\n` +
                `🔗 Подключены к Planka: ${rolesStats.withPlanka}`;

            await ctx.reply(message, { parse_mode: 'Markdown' });

        } catch (error) {
            await ctx.reply('❌ Ошибка при получении статистики');
        }
    });

    // Обработка текстовых сообщений
    bot.on('text', async (ctx) => {
        const userId = ctx.from?.id;
        if (!userId) return;

        const text = ctx.message.text;
        const state = registrationStates.get(userId);

        // Проверка токена инвайта
        if (!ctx.user && text.length === 10) {
            await handleInviteToken(ctx, text);
            return;
        }

        // Обработка состояния регистрации
        if (state && state.step === 'waiting_email') {
            try {
                assertValidEmail(text);

                state.email = text;
                state.step = 'confirming';

                await ctx.reply(
                    `📧 Email: ${text}\n\n` +
                    'Подтвердите правильность email или отправьте другой:',
                    {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '✅ Подтвердить', callback_data: 'confirm_email' }],
                                [{ text: '❌ Отмена', callback_data: 'cancel_registration' }],
                            ],
                        },
                    }
                );
            } catch {
                await ctx.reply('❌ Неверный формат email. Попробуйте ещё раз:');
            }
        }
    });

    // Обработка callback-запросов
    bot.on('callback_query', async (ctx) => {
        if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
            await ctx.answerCbQuery();
            return;
        }

        const data = ctx.callbackQuery.data;
        const userId = ctx.from?.id;
        if (!userId) return;

        // Подтверждение email
        if (data === 'confirm_email') {
            const state = registrationStates.get(userId);

            if (!state || !state.email || !state.inviteToken) {
                await ctx.answerCbQuery('❌ Сессия истекла');
                return;
            }

            try {
                const result = await completeRegistration(userId, state.email, true);

                registrationStates.delete(userId);

                let message = '✅ **Регистрация завершена!**\n\n';
                message += `📧 Email: ${state.email}\n`;
                message += `👤 Роль: Сотрудник\n\n`;

                if (result.plankaCredentials) {
                    message += '🔐 **Данные для входа в Planka:**\n';
                    message += `Email: ${result.plankaCredentials.email}\n`;
                    message += `Пароль: \`${result.plankaCredentials.password}\`\n\n`;
                    message += '⚠️ Обязательно сохраните пароль!';
                }

                message += '\n\nТеперь вы можете использовать основного бота для работы с задачами.';

                await ctx.editMessageText(message, { parse_mode: 'Markdown' });
                await ctx.answerCbQuery('✅ Регистрация завершена!');

            } catch (error: any) {
                await ctx.answerCbQuery(`❌ ${error.message}`);
            }
        }

        // Отмена регистрации
        if (data === 'cancel_registration') {
            registrationStates.delete(userId);
            await ctx.editMessageText('❌ Регистрация отменена');
            await ctx.answerCbQuery();
        }
    });
}

/**
 * Обработка токена инвайта
 */
async function handleInviteToken(ctx: any, token: string) {
    const userId = ctx.from?.id;
    const username = ctx.from?.username;
    const firstName = ctx.from?.first_name;
    const lastName = ctx.from?.last_name;
    const languageCode = ctx.from?.language_code;

    if (!userId) return;

    // Валидируем токен
    const validation = await validateInvite(token);

    if (!validation.valid) {
        await ctx.reply(`❌ ${validation.error}`);
        return;
    }

    try {
        // Регистрируем сотрудника
        const result = await registerEmployee(
            token,
            userId,
            username,
            firstName,
            lastName,
            languageCode
        );

        if (result.needsEmail) {
            // Сохраняем состояние и запрашиваем email
            registrationStates.set(userId, {
                step: 'waiting_email',
                inviteToken: token,
                createdAt: new Date(),
            });

            await ctx.reply(
                '✅ Приглашение принято!\n\n' +
                '📧 Теперь отправьте ваш email для завершения регистрации:'
            );
        } else {
            await ctx.reply(
                '✅ Регистрация завершена!\n\n' +
                'Теперь вы можете использовать основного бота для работы с задачами.'
            );
        }

        Log.info(ctx, 'Employee registered via invite', { token });

    } catch (error: any) {
        await ctx.reply(`❌ ${error.message}`);
    }
}

/**
 * Показ админского меню
 */
async function showAdminMenu(ctx: any) {
    const keyboard = {
        inline_keyboard: [
            [{ text: '🎫 Создать приглашение', callback_data: 'create_invite' }],
            [{ text: '📋 Мои приглашения', callback_data: 'my_invites' }],
            [{ text: '👥 Список пользователей', callback_data: 'users_list' }],
            [{ text: '📊 Статистика', callback_data: 'system_stats' }],
        ],
    };

    await ctx.reply(
        '👑 **Панель администратора**\n\n' +
        'Выберите действие:',
        {
            parse_mode: 'Markdown',
            reply_markup: keyboard,
        }
    );
}

/**
 * Форматирование строки пользователя
 */
function formatUserLine(user: any): string {
    let line = '  • ';

    if (user.username) {
        line += `@${user.username}`;
    } else {
        line += user.fullName || `ID: ${user.telegramId}`;
    }

    if (user.email) {
        line += ' 📧';
    }

    if (user.plankaUserId) {
        line += ' 🔗';
    }

    return line + '\n';
}