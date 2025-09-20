/**
 * Интерфейсы для работы с Planka API
 */

export interface PlankaBoard {
    id: string;
    projectId: string;
    position: number;
    name: string;
    createdAt: string;
    updatedAt: string;
}

export interface PlankaList {
    id: string;
    boardId: string;
    position: number;
    name: string;
    createdAt: string;
    updatedAt: string;
}

export interface PlankaCard {
    id: string;
    boardId: string;
    listId: string;
    creatorUserId: string;
    coverAttachmentId?: string;
    position: number;
    name: string;
    description?: string;
    dueDate?: string;
    timer?: {
        startedAt?: string;
        total: number;
    };
    isSubscribed: boolean;
    isCompleted: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface PlankaUser {
    id: string;
    email: string;
    isAdmin: boolean;
    name?: string;
    username?: string;
    phone?: string;
    organization?: string;
    avatarUrl?: string;
    language?: string;
    subscribeToOwnCards: boolean;
    deletedAt?: string;
    createdAt: string;
    updatedAt: string;
}

export interface PlankaMember {
    id: string;
    cardId: string;
    userId: string;
    createdAt: string;
    updatedAt: string;
}

export interface PlankaLabel {
    id: string;
    boardId: string;
    name: string;
    color: string;
    position: number;
    createdAt: string;
    updatedAt: string;
}

export interface PlankaAttachment {
    id: string;
    cardId: string;
    creatorUserId: string;
    dirname: string;
    filename: string;
    name: string;
    size: number;
    createdAt: string;
    updatedAt: string;
}

export interface PlankaComment {
    id: string;
    cardId: string;
    userId: string;
    data: {
        text: string;
    };
    type: 'commentCreate' | 'commentUpdate' | 'commentDelete';
    createdAt: string;
    updatedAt: string;
}

export interface PlankaProject {
    id: string;
    name: string;
    background?: {
        type: string;
        name?: string;
    };
    backgroundImage?: {
        url: string;
        coverUrl: string;
    };
    createdAt: string;
    updatedAt: string;
}

export interface PlankaWebhook {
    id: string;
    url: string;
    projectId?: string;
    enabled: boolean;
    types: string[];
    createdAt: string;
    updatedAt: string;
}

/**
 * Типы для ответов API
 */
export interface PlankaApiResponse<T> {
    item: T;
    included?: {
        users?: PlankaUser[];
        projects?: PlankaProject[];
        boards?: PlankaBoard[];
        lists?: PlankaList[];
        cards?: PlankaCard[];
        cardMemberships?: PlankaMember[];
        cardLabels?: PlankaLabel[];
    };
}

export interface PlankaApiListResponse<T> {
    items: T[];
    included?: {
        users?: PlankaUser[];
        projects?: PlankaProject[];
        boards?: PlankaBoard[];
        lists?: PlankaList[];
        cards?: PlankaCard[];
    };
}

/**
 * Типы для входных данных
 */
export interface CreateCardInput {
    boardId: string;
    listId: string;
    name: string;
    description?: string;
    position?: number;
    dueDate?: string;
}

export interface UpdateCardInput {
    name?: string;
    description?: string;
    listId?: string;
    position?: number;
    dueDate?: string | null;
}

export interface CreateUserInput {
    email: string;
    password: string;
    name: string;
    username?: string;
    organization?: string;
}

export interface CreateLabelInput {
    boardId: string;
    name: string;
    color: string;
    position?: number;
}