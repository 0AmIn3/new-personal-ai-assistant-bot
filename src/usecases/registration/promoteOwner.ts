import { usersRepo } from '../../data/repo/usersRepo';
import { User, UserRole } from '../../interfaces/user';
import { AppError, ErrorCodes } from '../../utils/errors';
import Log from '../../utils/log';

/**
 * Повышение пользователя до владельца
 */
export async function promoteToOwner(
    targetUserId: number,
    promotedBy: number
): Promise<User> {
    Log.info(
        { userId: promotedBy },
        'Promoting user to owner',
        { targetUserId }
    );

    // Проверяем права того, кто повышает
    const promoter = usersRepo.getByTelegramId(promotedBy);

    if (!promoter) {
        throw new AppError(
            ErrorCodes.UNAUTHORIZED,
            'Promoter not found'
        );
    }

    if (promoter.role !== UserRole.ADMIN) {
        throw new AppError(
            ErrorCodes.FORBIDDEN,
            'Only admins can promote to owner'
        );
    }

    // Получаем целевого пользователя
    const targetUser = usersRepo.getByTelegramId(targetUserId);

    if (!targetUser) {
        throw new AppError(
            ErrorCodes.NOT_FOUND,
            'Target user not found'
        );
    }

    // Проверяем текущую роль
    if (targetUser.role === UserRole.OWNER) {
        throw new AppError(
            ErrorCodes.VALIDATION_ERROR,
            'User is already an owner'
        );
    }

    if (targetUser.role === UserRole.ADMIN) {
        throw new AppError(
            ErrorCodes.VALIDATION_ERROR,
            'Cannot change admin role'
        );
    }

    // Обновляем роль
    const updatedUser = usersRepo.update({
        telegramId: targetUserId,
        role: UserRole.OWNER,
    });

    if (!updatedUser) {
        throw new AppError(
            ErrorCodes.DB_ERROR,
            'Failed to update user role'
        );
    }

    Log.info(
        { userId: promotedBy },
        'User promoted to owner',
        {
            targetUserId,
            previousRole: targetUser.role,
        }
    );

    return updatedUser;
}

/**
 * Понижение владельца до сотрудника
 */
export async function demoteFromOwner(
    targetUserId: number,
    demotedBy: number
): Promise<User> {
    Log.info(
        { userId: demotedBy },
        'Demoting owner to employee',
        { targetUserId }
    );

    // Проверяем права
    const demoter = usersRepo.getByTelegramId(demotedBy);

    if (!demoter) {
        throw new AppError(
            ErrorCodes.UNAUTHORIZED,
            'Demoter not found'
        );
    }

    if (demoter.role !== UserRole.ADMIN) {
        throw new AppError(
            ErrorCodes.FORBIDDEN,
            'Only admins can demote owners'
        );
    }

    // Получаем целевого пользователя
    const targetUser = usersRepo.getByTelegramId(targetUserId);

    if (!targetUser) {
        throw new AppError(
            ErrorCodes.NOT_FOUND,
            'Target user not found'
        );
    }

    // Проверяем текущую роль
    if (targetUser.role !== UserRole.OWNER) {
        throw new AppError(
            ErrorCodes.VALIDATION_ERROR,
            'User is not an owner'
        );
    }

    // Проверяем, останется ли хотя бы один владелец
    const allOwners = usersRepo.getOwners();

    if (allOwners.length <= 1) {
        throw new AppError(
            ErrorCodes.VALIDATION_ERROR,
            'Cannot demote the last owner'
        );
    }

    // Обновляем роль
    const updatedUser = usersRepo.update({
        telegramId: targetUserId,
        role: UserRole.EMPLOYEE,
    });

    if (!updatedUser) {
        throw new AppError(
            ErrorCodes.DB_ERROR,
            'Failed to update user role'
        );
    }

    Log.info(
        { userId: demotedBy },
        'Owner demoted to employee',
        { targetUserId }
    );

    return updatedUser;
}

/**
 * Назначение администратора (только для суперадмина)
 */
export async function promoteToAdmin(
    targetUserId: number,
    promotedBy: number
): Promise<User> {
    // Проверяем, что это суперадмин
    const promoter = usersRepo.getByTelegramId(promotedBy);

    if (!promoter || promoter.role !== UserRole.ADMIN) {
        throw new AppError(
            ErrorCodes.FORBIDDEN,
            'Only admins can promote other admins'
        );
    }

    // Дополнительная проверка для суперадмина (например, по username)
    const superAdminUsername = process.env.SUPER_ADMIN_USERNAME;

    if (promoter.username !== superAdminUsername) {
        throw new AppError(
            ErrorCodes.FORBIDDEN,
            'Only super admin can promote to admin'
        );
    }

    const targetUser = usersRepo.getByTelegramId(targetUserId);

    if (!targetUser) {
        throw new AppError(
            ErrorCodes.NOT_FOUND,
            'Target user not found'
        );
    }

    if (targetUser.role === UserRole.ADMIN) {
        throw new AppError(
            ErrorCodes.VALIDATION_ERROR,
            'User is already an admin'
        );
    }

    const updatedUser = usersRepo.update({
        telegramId: targetUserId,
        role: UserRole.ADMIN,
    });

    if (!updatedUser) {
        throw new AppError(
            ErrorCodes.DB_ERROR,
            'Failed to update user role'
        );
    }

    Log.info(
        { userId: promotedBy },
        'User promoted to admin',
        {
            targetUserId,
            previousRole: targetUser.role,
        }
    );

    return updatedUser;
}

/**
 * Получение списка владельцев
 */
export async function getOwners(): Promise<User[]> {
    return usersRepo.getOwners();
}

/**
 * Получение списка сотрудников
 */
export async function getEmployees(): Promise<User[]> {
    return usersRepo.getEmployees();
}

/**
 * Проверка, может ли пользователь управлять ролями
 */
export async function canManageRoles(userId: number): Promise<boolean> {
    const user = usersRepo.getByTelegramId(userId);

    if (!user) {
        return false;
    }

    return user.role === UserRole.ADMIN;
}

/**
 * Массовое изменение ролей
 */
export async function bulkUpdateRoles(
    updates: Array<{ userId: number; role: UserRole }>,
    updatedBy: number
): Promise<{
    updated: number[];
    failed: Array<{ userId: number; error: string }>;
}> {
    // Проверяем права
    const updater = usersRepo.getByTelegramId(updatedBy);

    if (!updater || updater.role !== UserRole.ADMIN) {
        throw new AppError(
            ErrorCodes.FORBIDDEN,
            'Only admins can bulk update roles'
        );
    }

    const updated: number[] = [];
    const failed: Array<{ userId: number; error: string }> = [];

    for (const { userId, role } of updates) {
        try {
            // Нельзя изменить роль админа
            const user = usersRepo.getByTelegramId(userId);

            if (!user) {
                failed.push({
                    userId,
                    error: 'User not found',
                });
                continue;
            }

            if (user.role === UserRole.ADMIN) {
                failed.push({
                    userId,
                    error: 'Cannot change admin role',
                });
                continue;
            }

            // Нельзя назначить роль админа через массовое обновление
            if (role === UserRole.ADMIN) {
                failed.push({
                    userId,
                    error: 'Cannot promote to admin in bulk',
                });
                continue;
            }

            usersRepo.update({
                telegramId: userId,
                role,
            });

            updated.push(userId);
        } catch (error: any) {
            failed.push({
                userId,
                error: error.message || 'Unknown error',
            });
        }
    }

    Log.info(
        { userId: updatedBy },
        'Bulk role update completed',
        {
            updated: updated.length,
            failed: failed.length,
        }
    );

    return { updated, failed };
}

/**
 * Получение статистики по ролям
 */
export async function getRolesStats(): Promise<{
    total: number;
    byRole: Record<UserRole, number>;
    withEmail: number;
    withPlanka: number;
}> {
    const allUsers = usersRepo.getAll();

    const stats = {
        total: allUsers.length,
        byRole: {
            [UserRole.ADMIN]: 0,
            [UserRole.OWNER]: 0,
            [UserRole.EMPLOYEE]: 0,
        },
        withEmail: 0,
        withPlanka: 0,
    };

    for (const user of allUsers) {
        stats.byRole[user.role]++;

        if (user.email) {
            stats.withEmail++;
        }

        if (user.plankaUserId) {
            stats.withPlanka++;
        }
    }

    return stats;
}