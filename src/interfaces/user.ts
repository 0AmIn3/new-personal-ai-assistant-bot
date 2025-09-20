/**
 * Интерфейсы для работы с пользователями
 */

export interface User {
    id: number;
    telegramId: number;
    username?: string;
    fullName?: string;
    role: UserRole;
    email?: string;
    plankaUserId?: string;
    language: Language;
    createdAt: Date;
    updatedAt: Date;
}

export enum UserRole {
    ADMIN = 'admin',
    OWNER = 'owner',
    EMPLOYEE = 'employee',
}

export enum Language {
    RU = 'ru',
    UZ = 'uz',
}

export interface CreateUserInput {
    telegramId: number;
    username?: string;
    fullName?: string;
    role?: UserRole;
    email?: string;
    language?: Language;
}

export interface UpdateUserInput {
    telegramId: number;
    username?: string;
    fullName?: string;
    role?: UserRole;
    email?: string;
    plankaUserId?: string;
    language?: Language;
}

export interface UserSession {
    userId: number;
    telegramId: number;
    chatId: number;
    state?: string;
    step?: string;
    data?: Record<string, any>;
    createdAt: Date;
    expiresAt: Date;
}

export interface UserSettings {
    userId: number;
    digestHour: number;
    digestEnabled: boolean;
    notificationsEnabled: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface UpdateSettingsInput {
    userId: number;
    digestHour?: number;
    digestEnabled?: boolean;
    notificationsEnabled?: boolean;
}

/**
 * Проверка прав пользователя
 */
export function hasPermission(user: User, permission: Permission): boolean {
    const rolePermissions: Record<UserRole, Permission[]> = {
        [UserRole.ADMIN]: [
            Permission.CREATE_TASK,
            Permission.EDIT_ANY_TASK,
            Permission.DELETE_ANY_TASK,
            Permission.MANAGE_USERS,
            Permission.VIEW_STATS,
            Permission.MANAGE_SETTINGS,
        ],
        [UserRole.OWNER]: [
            Permission.CREATE_TASK,
            Permission.EDIT_ANY_TASK,
            Permission.DELETE_ANY_TASK,
            Permission.VIEW_STATS,
            Permission.MANAGE_SETTINGS,
        ],
        [UserRole.EMPLOYEE]: [
            Permission.VIEW_OWN_TASKS,
            Permission.UPDATE_OWN_TASK_STATUS,
        ],
    };

    return rolePermissions[user.role]?.includes(permission) || false;
}

export enum Permission {
    CREATE_TASK = 'create_task',
    EDIT_ANY_TASK = 'edit_any_task',
    DELETE_ANY_TASK = 'delete_any_task',
    VIEW_OWN_TASKS = 'view_own_tasks',
    UPDATE_OWN_TASK_STATUS = 'update_own_task_status',
    MANAGE_USERS = 'manage_users',
    VIEW_STATS = 'view_stats',
    MANAGE_SETTINGS = 'manage_settings',
}