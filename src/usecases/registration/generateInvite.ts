import { invitesRepo, Invite } from '../../data/repo/invitesRepo';
import { usersRepo } from '../../data/repo/usersRepo';
import { User, UserRole } from '../../interfaces/user';
import { AppError, ErrorCodes } from '../../utils/errors';
import { LIMITS } from '../../config/constants';
import Log from '../../utils/log';

/**
 * Создание нового приглашения
 */
export async function generateInvite(
    createdBy: number,
    ttlHours: number = LIMITS.DEFAULT_INVITE_TTL_HOURS
): Promise<{
    invite: Invite;
    inviteLink: string;
}> {
    Log.info(
        { userId: createdBy },
        'Generating invite',
        { ttlHours }
    );

    // Проверяем права пользователя
    const user = usersRepo.getByTelegramId(createdBy);

    if (!user) {
        throw new AppError(
            ErrorCodes.UNAUTHORIZED,
            'User not found'
        );
    }

    if (user.role !== UserRole.ADMIN && user.role !== UserRole.OWNER) {
        throw new AppError(
            ErrorCodes.FORBIDDEN,
            'Only admins and owners can generate invites'
        );
    }

    // Проверяем лимит активных инвайтов
    const activeInvites = invitesRepo.getUserActiveInvites(createdBy);

    if (activeInvites.length >= LIMITS.MAX_ACTIVE_INVITES_PER_USER) {
        throw new AppError(
            ErrorCodes.RATE_LIMIT,
            `You have reached the limit of ${LIMITS.MAX_ACTIVE_INVITES_PER_USER} active invites`,
            { activeCount: activeInvites.length }
        );
    }

    // Создаём инвайт
    const invite = invitesRepo.create(createdBy, ttlHours);

    // Формируем ссылку для регистрации
    const inviteLink = formatInviteLink(invite.token);

    Log.info(
        { userId: createdBy },
        'Invite generated',
        {
            token: invite.token,
            expiresAt: invite.expiresAt,
        }
    );

    return {
        invite,
        inviteLink,
    };
}

/**
 * Получение списка инвайтов пользователя
 */
export async function getUserInvites(
    userId: number,
    onlyActive: boolean = false
): Promise<Array<{
    invite: Invite;
    link: string;
    status: 'active' | 'used' | 'expired';
}>> {
    const user = usersRepo.getByTelegramId(userId);

    if (!user) {
        throw new AppError(
            ErrorCodes.UNAUTHORIZED,
            'User not found'
        );
    }

    const invites = onlyActive
        ? invitesRepo.getUserActiveInvites(userId)
        : invitesRepo.getUserInvites(userId);

    const now = new Date();

    return invites.map(invite => {
        let status: 'active' | 'used' | 'expired';

        if (invite.usedBy) {
            status = 'used';
        } else if (invite.expiresAt < now) {
            status = 'expired';
        } else {
            status = 'active';
        }

        return {
            invite,
            link: formatInviteLink(invite.token),
            status,
        };
    });
}

/**
 * Отзыв приглашения
 */
export async function revokeInvite(
    token: string,
    revokedBy: number
): Promise<boolean> {
    const invite = invitesRepo.getByToken(token);

    if (!invite) {
        throw new AppError(
            ErrorCodes.NOT_FOUND,
            'Invite not found'
        );
    }

    // Проверяем права: только создатель или админ может отозвать
    const user = usersRepo.getByTelegramId(revokedBy);

    if (!user) {
        throw new AppError(
            ErrorCodes.UNAUTHORIZED,
            'User not found'
        );
    }

    if (invite.createdBy !== revokedBy && user.role !== UserRole.ADMIN) {
        throw new AppError(
            ErrorCodes.FORBIDDEN,
            'You can only revoke your own invites'
        );
    }

    if (invite.usedBy) {
        throw new AppError(
            ErrorCodes.INVITE_ALREADY_USED,
            'Cannot revoke used invite'
        );
    }

    const result = invitesRepo.revoke(token);

    if (result) {
        Log.info(
            { userId: revokedBy },
            'Invite revoked',
            { token }
        );
    }

    return result;
}

/**
 * Продление срока действия приглашения
 */
export async function extendInvite(
    token: string,
    additionalHours: number,
    extendedBy: number
): Promise<Invite | null> {
    const invite = invitesRepo.getByToken(token);

    if (!invite) {
        throw new AppError(
            ErrorCodes.NOT_FOUND,
            'Invite not found'
        );
    }

    // Проверяем права
    if (invite.createdBy !== extendedBy) {
        const user = usersRepo.getByTelegramId(extendedBy);

        if (!user || user.role !== UserRole.ADMIN) {
            throw new AppError(
                ErrorCodes.FORBIDDEN,
                'You can only extend your own invites'
            );
        }
    }

    if (invite.usedBy) {
        throw new AppError(
            ErrorCodes.INVITE_ALREADY_USED,
            'Cannot extend used invite'
        );
    }

    const result = invitesRepo.extend(token, additionalHours);

    if (result) {
        Log.info(
            { userId: extendedBy },
            'Invite extended',
            {
                token,
                newExpiresAt: result.expiresAt,
            }
        );
    }

    return result;
}

/**
 * Массовое создание приглашений
 */
export async function bulkGenerateInvites(
    count: number,
    createdBy: number,
    ttlHours: number = LIMITS.DEFAULT_INVITE_TTL_HOURS
): Promise<Array<{
    invite: Invite;
    link: string;
}>> {
    // Проверяем права
    const user = usersRepo.getByTelegramId(createdBy);

    if (!user || user.role !== UserRole.ADMIN) {
        throw new AppError(
            ErrorCodes.FORBIDDEN,
            'Only admins can generate bulk invites'
        );
    }

    if (count > 10) {
        throw new AppError(
            ErrorCodes.VALIDATION_ERROR,
            'Cannot generate more than 10 invites at once'
        );
    }

    const invites = [];

    for (let i = 0; i < count; i++) {
        const invite = invitesRepo.create(createdBy, ttlHours);
        invites.push({
            invite,
            link: formatInviteLink(invite.token),
        });
    }

    Log.info(
        { userId: createdBy },
        'Bulk invites generated',
        { count }
    );

    return invites;
}

/**
 * Получение статистики по инвайтам
 */
export async function getInvitesStats(): Promise<{
    total: number;
    active: number;
    used: number;
    expired: number;
    byUser: Record<number, {
        created: number;
        active: number;
        used: number;
    }>;
}> {
    const stats = invitesRepo.getStats();

    // Получаем статистику по пользователям
    const byUser: Record<number, any> = {};

    const allUsers = usersRepo.getAll();

    for (const user of allUsers) {
        if (user.role === UserRole.ADMIN || user.role === UserRole.OWNER) {
            const userInvites = invitesRepo.getUserInvites(user.telegramId);
            const activeCount = userInvites.filter(i =>
                !i.usedBy && i.expiresAt > new Date()
            ).length;
            const usedCount = userInvites.filter(i => i.usedBy).length;

            byUser[user.telegramId] = {
                created: userInvites.length,
                active: activeCount,
                used: usedCount,
            };
        }
    }

    return {
        ...stats,
        byUser,
    };
}

/**
 * Форматирование ссылки для приглашения
 */
function formatInviteLink(token: string): string {
    // Используем username регистрационного бота из конфигурации
    const botUsername = process.env.TELEGRAM_REG_BOT_USERNAME || 'reg_bot';
    return `https://t.me/${botUsername}?start=${token}`;
}

/**
 * Валидация и получение информации об инвайте
 */
export async function validateInvite(token: string): Promise<{
    valid: boolean;
    invite?: Invite;
    createdBy?: User;
    error?: string;
}> {
    const invite = invitesRepo.getByToken(token);

    if (!invite) {
        return {
            valid: false,
            error: 'Приглашение не найдено',
        };
    }

    if (invite.usedBy) {
        return {
            valid: false,
            invite,
            error: 'Приглашение уже использовано',
        };
    }

    if (invite.expiresAt < new Date()) {
        return {
            valid: false,
            invite,
            error: 'Срок действия приглашения истёк',
        };
    }

    const createdBy = usersRepo.getByTelegramId(invite.createdBy);

    return {
        valid: true,
        invite,
        createdBy: createdBy || undefined,
    };
}