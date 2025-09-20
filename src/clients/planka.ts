import axios, { AxiosInstance, AxiosError } from 'axios';
import FormData from 'form-data';
import { config } from '../config/env';
import { AppError, ErrorCodes } from '../utils/errors';
import Log from '../utils/log';
import { PlankaCard, PlankaList, PlankaUser, PlankaMember, PlankaLabel } from '../interfaces/planka';

/**
 * Клиент для работы с Planka API
 * Только HTTP-вызовы, без бизнес-логики!
 */
class PlankaClient {
    private client: AxiosInstance;
    private token: string | null = null;
    private tokenExpiry: Date | null = null;

    constructor() {
        this.client = axios.create({
            baseURL: config.planka.baseUrl,
            timeout: config.timeouts.planka,
            headers: {
                'Content-Type': 'application/json',
            },
        });

        // Перехватчик для добавления токена
        this.client.interceptors.request.use(
            (cfg) => {
                if (this.token && cfg.headers) {
                    cfg.headers['Authorization'] = `Bearer ${this.token}`;
                }
                return cfg;
            },
            (error) => Promise.reject(error)
        );

        // Перехватчик для обработки ошибок и ретраев
        this.client.interceptors.response.use(
            (response) => response,
            async (error: AxiosError) => {
                const originalRequest: any = error.config;

                // Если 401 и не повтор - пробуем обновить токен
                if (error.response?.status === 401 && !originalRequest._retry) {
                    originalRequest._retry = true;
                    await this.authenticate();
                    return this.client(originalRequest);
                }

                // Для 5xx ошибок - ретрай с экспоненциальной задержкой
                if (
                    error.response?.status &&
                    error.response.status >= 500 &&
                    originalRequest._retryCount < config.limits.maxRetries
                ) {
                    originalRequest._retryCount = (originalRequest._retryCount || 0) + 1;
                    const delay = Math.pow(2, originalRequest._retryCount) * 1000;

                    Log.warn(
                        { service: 'planka' },
                        `Retry ${originalRequest._retryCount}/${config.limits.maxRetries}`,
                        { status: error.response.status, delay }
                    );

                    await new Promise(resolve => setTimeout(resolve, delay));
                    return this.client(originalRequest);
                }

                return Promise.reject(error);
            }
        );
    }

    /**
     * Аутентификация в Planka
     */
    async authenticate(): Promise<void> {
        try {
            Log.external('planka', 'Authenticating...');

            const response = await this.client.post('/access-tokens', {
                emailOrUsername: config.planka.username,
                password: config.planka.password,
            });

            this.token = response.data.item;
            // Токен живёт 1 год, но обновляем каждые 30 дней
            this.tokenExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

            Log.external('planka', 'Authentication successful');
        } catch (error) {
            Log.error({ service: 'planka' }, 'Authentication failed', error);
            throw new AppError(
                ErrorCodes.PLANKA_ERROR,
                'Failed to authenticate with Planka'
            );
        }
    }

    /**
     * Проверка и обновление токена при необходимости
     */
    private async ensureAuthenticated(): Promise<void> {
        if (!this.token || !this.tokenExpiry || this.tokenExpiry < new Date()) {
            await this.authenticate();
        }
    }

    /**
     * Получение списков доски
     */
    async getBoardLists(boardId?: string): Promise<PlankaList[]> {
        await this.ensureAuthenticated();

        const id = boardId || config.planka.boardId;

        try {
            const response = await this.client.get(`/boards/${id}/lists`);
            return response.data.items;
        } catch (error) {
            Log.error({ service: 'planka' }, 'Failed to get board lists', error);
            throw new AppError(
                ErrorCodes.PLANKA_ERROR,
                'Failed to get board lists'
            );
        }
    }

    /**
     * Получение лейблов доски
     */
    async getBoardLabels(boardId?: string): Promise<PlankaLabel[]> {
        await this.ensureAuthenticated();

        const id = boardId || config.planka.boardId;

        try {
            const response = await this.client.get(`/boards/${id}/labels`);
            return response.data.items;
        } catch (error) {
            Log.error({ service: 'planka' }, 'Failed to get board labels', error);
            throw new AppError(
                ErrorCodes.PLANKA_ERROR,
                'Failed to get board labels'
            );
        }
    }

    /**
     * Создание карточки задачи
     */
    async createCard(data: {
        boardId: string;
        listId: string;
        name: string;
        description?: string;
        position?: number;
    }): Promise<PlankaCard> {
        await this.ensureAuthenticated();

        try {
            const response = await this.client.post('/cards', {
                boardId: data.boardId || config.planka.boardId,
                listId: data.listId,
                name: data.name,
                description: data.description,
                position: data.position || 0,
            });

            Log.external('planka', 'Card created', {
                cardId: response.data.item.id,
                name: data.name,
            });

            return response.data.item;
        } catch (error) {
            Log.error({ service: 'planka' }, 'Failed to create card', error);
            throw new AppError(
                ErrorCodes.PLANKA_ERROR,
                'Failed to create card in Planka'
            );
        }
    }

    /**
     * Обновление карточки
     */
    async updateCard(cardId: string, data: {
        name?: string;
        description?: string;
        listId?: string;
        position?: number;
    }): Promise<PlankaCard> {
        await this.ensureAuthenticated();

        try {
            const response = await this.client.patch(`/cards/${cardId}`, data);

            Log.external('planka', 'Card updated', { cardId });

            return response.data.item;
        } catch (error) {
            Log.error({ service: 'planka' }, 'Failed to update card', error);
            throw new AppError(
                ErrorCodes.PLANKA_ERROR,
                'Failed to update card'
            );
        }
    }

    /**
     * Получение карточки
     */
    async getCard(cardId: string): Promise<PlankaCard | null> {
        await this.ensureAuthenticated();

        try {
            const response = await this.client.get(`/cards/${cardId}`);
            return response.data.item;
        } catch (error: any) {
            if (error.response?.status === 404) {
                return null;
            }

            Log.error({ service: 'planka' }, 'Failed to get card', error);
            throw new AppError(
                ErrorCodes.PLANKA_ERROR,
                'Failed to get card'
            );
        }
    }

    /**
     * Поиск карточек
     */
    async searchCards(query: string, boardId?: string): Promise<PlankaCard[]> {
        await this.ensureAuthenticated();

        const id = boardId || config.planka.boardId;

        try {
            // Получаем все карточки доски
            const response = await this.client.get(`/boards/${id}/cards`);
            const cards: PlankaCard[] = response.data.items;

            // Фильтруем по запросу
            const lowerQuery = query.toLowerCase();
            return cards.filter(card =>
                card.name.toLowerCase().includes(lowerQuery) ||
                card.description?.toLowerCase().includes(lowerQuery) ||
                card.id === query
            );
        } catch (error) {
            Log.error({ service: 'planka' }, 'Failed to search cards', error);
            throw new AppError(
                ErrorCodes.PLANKA_ERROR,
                'Failed to search cards'
            );
        }
    }

    /**
     * Добавление участника к карточке
     */
    async addCardMember(cardId: string, userId: string): Promise<void> {
        await this.ensureAuthenticated();

        try {
            await this.client.post(`/cards/${cardId}/memberships`, { userId });

            Log.external('planka', 'Member added to card', { cardId, userId });
        } catch (error) {
            Log.error({ service: 'planka' }, 'Failed to add card member', error);
            throw new AppError(
                ErrorCodes.PLANKA_ERROR,
                'Failed to add member to card'
            );
        }
    }

    /**
     * Добавление лейбла к карточке
     */
    async addCardLabel(cardId: string, labelId: string): Promise<void> {
        await this.ensureAuthenticated();

        try {
            await this.client.post(`/cards/${cardId}/labels`, { labelId });

            Log.external('planka', 'Label added to card', { cardId, labelId });
        } catch (error) {
            Log.error({ service: 'planka' }, 'Failed to add card label', error);
            throw new AppError(
                ErrorCodes.PLANKA_ERROR,
                'Failed to add label to card'
            );
        }
    }

    /**
     * Поиск пользователя по email
     */
    async findUserByEmail(email: string): Promise<PlankaUser | null> {
        await this.ensureAuthenticated();

        try {
            const response = await this.client.get('/users', {
                params: { limit: 100 },
            });

            const users: PlankaUser[] = response.data.items;
            return users.find(u =>
                u.email?.toLowerCase() === email.toLowerCase()
            ) || null;
        } catch (error) {
            Log.error({ service: 'planka' }, 'Failed to find user', error);
            throw new AppError(
                ErrorCodes.PLANKA_ERROR,
                'Failed to find user'
            );
        }
    }

    /**
     * Загрузка файла к карточке
     */
    async uploadAttachment(cardId: string, file: {
        buffer: Buffer;
        filename: string;
        mimetype: string;
    }): Promise<void> {
        await this.ensureAuthenticated();

        try {
            const form = new FormData();
            form.append('file', file.buffer, {
                filename: file.filename,
                contentType: file.mimetype,
            });

            await this.client.post(
                `/cards/${cardId}/attachments`,
                form,
                {
                    headers: {
                        ...form.getHeaders(),
                        'Authorization': `Bearer ${this.token}`,
                    },
                }
            );

            Log.external('planka', 'Attachment uploaded', {
                cardId,
                filename: file.filename,
            });
        } catch (error) {
            Log.error({ service: 'planka' }, 'Failed to upload attachment', error);
            throw new AppError(
                ErrorCodes.PLANKA_ERROR,
                'Failed to upload attachment'
            );
        }
    }
}

// Экспортируем синглтон
export const plankaClient = new PlankaClient();