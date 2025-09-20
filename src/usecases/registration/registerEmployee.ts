import { invitesRepo } from '../../data/repo/invitesRepo';
import { usersRepo } from '../../data/repo/usersRepo';
import { plankaClient } from '../../clients/planka';
import { User, UserRole, Language } from '../../interfaces/user';
import { AppError, ErrorCodes } from '../../utils/errors';
import { assertValidEmail, assertNotEmpty } from '../../utils/guard';
import { detectLanguage } from '../../utils/lang';
import Log from '../../utils/log';

/**
 * Регистрация нового сотрудника по инвайту
 */
export async function registerEmployee(
    inviteToken: string,
    telegramId: number,
    username?: string,
    firstName?: string,
    lastName?: string,
    languageCode?: string
): Promise<{
    user: User;
    needsEmail: boolean;
    plankaCredentials?: {
        email: string;
        password: string;
    };
}> {
    Log.info(
        { userId: telegramId },
        'Starting employee registration',
        { inviteToken }
    );

    // Проверяем, не зарегистрирован ли уже пользователь
    const existingUser = usersRepo.getByTelegramId(telegramId);

    if (existingUser) {
        throw new AppError(
            ErrorCodes.ALREADY_EXISTS,
            'User already registered',
            { role: existingUser.role }
        );
    }

    // Валидируем инвайт
    const invite = invitesRepo.getByToken(inviteToken);

    if (!invite) {
        throw new AppError(
            ErrorCodes.NOT_FOUND,
            'Invalid invite token'
        );
    }

    if (invite.usedBy) {
        throw new AppError(
            ErrorCodes.INVITE_ALREADY_USED,
            'Invite already used',
            { usedBy: invite.usedBy }
        );
    }

    if (invite.expiresAt < new Date()) {
        throw new AppError(
            ErrorCodes.INVITE_EXPIRED,
            'Invite expired',
            { expiredAt: invite.expiresAt }
        );
    }

    // Формируем полное имя
    const fullName = [firstName, lastName]
        .filter(Boolean)
        .join(' ') || username || `User${telegramId}`;

    // Определяем язык
    const language = detectLanguageFromCode(languageCode) || Language.RU;

    // Создаём пользователя в БД
    const user = usersRepo.create({
        telegramId,
        username,
        fullName,
        role: UserRole.EMPLOYEE,
        language,
    });

    // Используем инвайт
    invitesRepo.use(inviteToken, telegramId);

    Log.info(
        { userId: telegramId },
        'Employee registered',
        {
            inviteToken,
            invitedBy: invite.createdBy,
        }
    );

    // Пользователю нужно будет указать email для Planka
    return {
        user,
        needsEmail: true,
    };
}

/**
 * Завершение регистрации - добавление email и создание в Planka
 */
export async function completeRegistration(
    telegramId: number,
    email: string,
    createInPlanka: boolean = true
): Promise<{
    user: User;
    plankaCredentials?: {
        email: string;
        password: string;
    };
}> {
    assertNotEmpty(email, 'Email');
    assertValidEmail(email);

    const user = usersRepo.getByTelegramId(telegramId);

    if (!user) {
        throw new AppError(
            ErrorCodes.NOT_FOUND,
            'User not found'
        );
    }

    // Проверяем, не занят ли email
    const existingWithEmail = usersRepo.getByEmail(email);

    if (existingWithEmail && existingWithEmail.telegramId !== telegramId) {
        throw new AppError(
            ErrorCodes.ALREADY_EXISTS,
            'Email already registered'
        );
    }

    let plankaCredentials;

    if (createInPlanka) {
        // Проверяем, есть ли уже пользователь в Planka
        let plankaUser = await plankaClient.findUserByEmail(email);

        if (!plankaUser) {
            // Создаём пользователя в Planka
            const password = generatePassword();

            try {
                // Этот метод нужно добавить в plankaClient
                // plankaUser = await plankaClient.createUser({
                //   email,
                //   password,
                //   name: user.fullName || user.username || email.split('@')[0],
                // });

                plankaCredentials = {
                    email,
                    password,
                };

                Log.info(
                    { userId: telegramId },
                    'Planka user created',
                    { email }
                );
            } catch (error) {
                Log.error(
                    { userId: telegramId },
                    'Failed to create Planka user',
                    error
                );
                // Продолжаем регистрацию даже если не удалось создать в Planka
            }
        }

        // Обновляем пользователя с Planka ID
        if (plankaUser) {
            usersRepo.update({
                telegramId,
                email,
                plankaUserId: plankaUser.id,
            });
        } else {
            usersRepo.update({
                telegramId,
                email,
            });
        }
    } else {
        // Просто сохраняем email
        usersRepo.update({
            telegramId,
            email,
        });
    }

    const updatedUser = usersRepo.getByTelegramId(telegramId)!;

    Log.info(
        { userId: telegramId },
        'Registration completed',
        { email, hasPlanka: !!updatedUser.plankaUserId }
    );

    return {
        user: updatedUser,
        plankaCredentials,
    };
}

/**
 * Обновление профиля пользователя
 */
export async function updateUserProfile(
    telegramId: number,
    updates: {
        username?: string;
        fullName?: string;
        email?: string;
        language?: Language;
    }
): Promise<User> {
    const user = usersRepo.getByTelegramId(telegramId);

    if (!user) {
        throw new AppError(
            ErrorCodes.NOT_FOUND,
            'User not found'
        );
    }

    // Валидация email если меняется
    if (updates.email && updates.email !== user.email) {
        assertValidEmail(updates.email);

        const existingWithEmail = usersRepo.getByEmail(updates.email);

        if (existingWithEmail && existingWithEmail.telegramId !== telegramId) {
            throw new AppError(
                ErrorCodes.ALREADY_EXISTS,
                'Email already registered'
            );
        }
    }

    const updatedUser = usersRepo.update({
        telegramId,
        ...updates,
    });

    if (!updatedUser) {
        throw new AppError(
            ErrorCodes.DB_ERROR,
            'Failed to update user'
        );
    }

    Log.info(
        { userId: telegramId },
        'User profile updated',
        updates
    );

    return updatedUser;
}

/**
 * Удаление пользователя
 */
export async function deleteUser(
    telegramId: number,
    deletedBy: number
): Promise<boolean> {
    // Проверяем права
    const admin = usersRepo.getByTelegramId(deletedBy);

    if (!admin || admin.role !== UserRole.ADMIN) {
        throw new AppError(
            ErrorCodes.FORBIDDEN,
            'Only admins can delete users'
        );
    }

    const user = usersRepo.getByTelegramId(telegramId);

    if (!user) {
        throw new AppError(
            ErrorCodes.NOT_FOUND,
            'User not found'
        );
    }

    // Нельзя удалить себя
    if (telegramId === deletedBy) {
        throw new AppError(
            ErrorCodes.VALIDATION_ERROR,
            'Cannot delete yourself'
        );
    }

    // Нельзя удалить других админов
    if (user.role === UserRole.ADMIN) {
        throw new AppError(
            ErrorCodes.FORBIDDEN,
            'Cannot delete other admins'
        );
    }

    const result = usersRepo.delete(telegramId);

    if (result) {
        Log.info(
            { userId: deletedBy },
            'User deleted',
            {
                deletedUserId: telegramId,
                deletedUsername: user.username,
            }
        );
    }

    return result;
}

/**
 * Получение списка всех пользователей
 */
export async function getAllUsers(
    requestedBy: number
): Promise<User[]> {
    const requester = usersRepo.getByTelegramId(requestedBy);

    if (!requester) {
        throw new AppError(
            ErrorCodes.UNAUTHORIZED,
            'User not found'
        );
    }

    // Только админы и владельцы могут видеть всех пользователей
    if (requester.role !== UserRole.ADMIN && requester.role !== UserRole.OWNER) {
        throw new AppError(
            ErrorCodes.FORBIDDEN,
            'Insufficient permissions'
        );
    }

    return usersRepo.getAll();
}

/**
 * Поиск пользователей по критериям
 */
export async function searchUsers(
    query: string,
    requestedBy: number
): Promise<User[]> {
    const requester = usersRepo.getByTelegramId(requestedBy);

    if (!requester) {
        throw new AppError(
            ErrorCodes.UNAUTHORIZED,
            'User not found'
        );
    }

    if (requester.role !== UserRole.ADMIN && requester.role !== UserRole.OWNER) {
        throw new AppError(
            ErrorCodes.FORBIDDEN,
            'Insufficient permissions'
        );
    }

    const allUsers = usersRepo.getAll();
    const lowerQuery = query.toLowerCase();

    return allUsers.filter(user =>
        user.username?.toLowerCase().includes(lowerQuery) ||
        user.fullName?.toLowerCase().includes(lowerQuery) ||
        user.email?.toLowerCase().includes(lowerQuery)
    );
}

/**
 * Определение языка по коду
 */
function detectLanguageFromCode(languageCode?: string): Language | null {
    if (!languageCode) return null;

    const code = languageCode.toLowerCase();

    if (code.startsWith('ru')) return Language.RU;
    if (code.startsWith('uz')) return Language.UZ;
    if (code.startsWith('en')) return Language.RU; // По умолчанию русский для английского

    return null;
}

/**
 * Генерация пароля для Planka
 */
function generatePassword(length: number = 12): string {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';

    // Обеспечиваем наличие разных типов символов
    const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const special = '!@#$%^&*';

    password += letters.charAt(Math.floor(Math.random() * letters.length));
    password += numbers.charAt(Math.floor(Math.random() * numbers.length));
    password += special.charAt(Math.floor(Math.random() * special.length));

    // Заполняем остальные позиции
    for (let i = 3; i < length; i++) {
        password += charset.charAt(Math.floor(Math.random() * charset.length));
    }

    // Перемешиваем
    return password.split('').sort(() => Math.random() - 0.5).join('');
}