import { Telegraf } from 'telegraf';
import { InlineKeyboardMarkup } from 'telegraf/types';
import { config } from '../config/env';
import { AppError, ErrorCodes } from '../utils/errors';
import Log from '../utils/log';

/**
 * Клиент для отправки сообщений через Telegram API
 * Используется в jobs и уведомлениях
 */
class TelegramClient {
    private workBot: Telegraf;
    private regBot: Telegraf;

    constructor() {
        this.workBot = new Telegraf(config.telegram.workBotToken);
        this.regBot = new Telegraf(config.telegram.regBotToken);
    }

    /**
     * Отправка сообщения через рабочий бот
     */
    async sendMessage(
        chatId: number | string,
        text: string,
        options?: {
            parse_mode?: 'Markdown' | 'HTML';
            reply_markup?: InlineKeyboardMarkup;
            disable_notification?: boolean;
        }
    ): Promise<any> {
        try {
            const result = await this.workBot.telegram.sendMessage(
                chatId,
                text,
                options
            );

            Log.external('telegram', 'Message sent', {
                chatId,
                messageId: result.message_id,
            });

            return result;
        } catch (error: any) {
            Log.error(
                { chatId },
                'Failed to send message',
                error
            );

            if (error.response?.error_code === 403) {
                throw new AppError(
                    ErrorCodes.TELEGRAM_ERROR,
                    'Bot was blocked by user'
                );
            }

            throw new AppError(
                ErrorCodes.TELEGRAM_ERROR,
                'Failed to send message'
            );
        }
    }

    /**
     * Отправка сообщения через регистрационный бот
     */
    async sendRegistrationMessage(
        chatId: number | string,
        text: string,
        options?: {
            parse_mode?: 'Markdown' | 'HTML';
            reply_markup?: InlineKeyboardMarkup;
        }
    ): Promise<any> {
        try {
            const result = await this.regBot.telegram.sendMessage(
                chatId,
                text,
                options
            );

            Log.external('telegram', 'Registration message sent', {
                chatId,
                messageId: result.message_id,
            });

            return result;
        } catch (error) {
            Log.error(
                { chatId },
                'Failed to send registration message',
                error
            );

            throw new AppError(
                ErrorCodes.TELEGRAM_ERROR,
                'Failed to send registration message'
            );
        }
    }

    /**
     * Редактирование сообщения
     */
    async editMessage(
        chatId: number | string,
        messageId: number,
        text: string,
        options?: {
            parse_mode?: 'Markdown' | 'HTML';
            reply_markup?: InlineKeyboardMarkup;
        }
    ): Promise<any> {
        try {
            const result = await this.workBot.telegram.editMessageText(
                chatId,
                messageId,
                undefined,
                text,
                options
            );

            Log.external('telegram', 'Message edited', {
                chatId,
                messageId,
            });

            return result;
        } catch (error: any) {
            // Игнорируем ошибку если сообщение не изменилось
            if (error.response?.description?.includes('message is not modified')) {
                return null;
            }

            Log.error(
                { chatId, messageId },
                'Failed to edit message',
                error
            );

            throw new AppError(
                ErrorCodes.TELEGRAM_ERROR,
                'Failed to edit message'
            );
        }
    }

    /**
     * Удаление сообщения
     */
    async deleteMessage(
        chatId: number | string,
        messageId: number
    ): Promise<boolean> {
        try {
            await this.workBot.telegram.deleteMessage(chatId, messageId);

            Log.external('telegram', 'Message deleted', {
                chatId,
                messageId,
            });

            return true;
        } catch (error) {
            Log.error(
                { chatId, messageId },
                'Failed to delete message',
                error
            );

            return false;
        }
    }

    /**
     * Отправка файла
     */
    async sendDocument(
        chatId: number | string,
        document: string | Buffer,
        options?: {
            caption?: string;
            parse_mode?: 'Markdown' | 'HTML';
            filename?: string;
        }
    ): Promise<any> {
        try {
            const result = await this.workBot.telegram.sendDocument(
                chatId,
                document,
                {
                    caption: options?.caption,
                    parse_mode: options?.parse_mode,
                    ...(options?.filename && {
                        filename: options.filename,
                    }),
                }
            );

            Log.external('telegram', 'Document sent', {
                chatId,
                documentId: result.document?.file_id,
            });

            return result;
        } catch (error) {
            Log.error(
                { chatId },
                'Failed to send document',
                error
            );

            throw new AppError(
                ErrorCodes.TELEGRAM_ERROR,
                'Failed to send document'
            );
        }
    }

    /**
     * Получение информации о чате
     */
    async getChat(chatId: number | string): Promise<any> {
        try {
            const chat = await this.workBot.telegram.getChat(chatId);

            Log.external('telegram', 'Chat info retrieved', {
                chatId,
                type: chat.type,
            });

            return chat;
        } catch (error) {
            Log.error(
                { chatId },
                'Failed to get chat info',
                error
            );

            throw new AppError(
                ErrorCodes.TELEGRAM_ERROR,
                'Failed to get chat info'
            );
        }
    }

    /**
     * Получение информации о пользователе
     */
    async getChatMember(
        chatId: number | string,
        userId: number
    ): Promise<any> {
        try {
            const member = await this.workBot.telegram.getChatMember(chatId, userId);

            Log.external('telegram', 'Chat member info retrieved', {
                chatId,
                userId,
                status: member.status,
            });

            return member;
        } catch (error) {
            Log.error(
                { chatId, userId },
                'Failed to get chat member',
                error
            );

            throw new AppError(
                ErrorCodes.TELEGRAM_ERROR,
                'Failed to get chat member info'
            );
        }
    }

    /**
     * Массовая рассылка сообщений
     */
    async broadcast(
        chatIds: Array<number | string>,
        text: string,
        options?: {
            parse_mode?: 'Markdown' | 'HTML';
            reply_markup?: InlineKeyboardMarkup;
        }
    ): Promise<{
        sent: number;
        failed: number;
        blocked: number;
    }> {
        let sent = 0;
        let failed = 0;
        let blocked = 0;

        for (const chatId of chatIds) {
            try {
                await this.sendMessage(chatId, text, {
                    ...options,
                    disable_notification: true,
                });
                sent++;

                // Небольшая задержка чтобы не превысить лимиты
                await new Promise(resolve => setTimeout(resolve, 50));
            } catch (error: any) {
                if (error.code === ErrorCodes.TELEGRAM_ERROR &&
                    error.message.includes('blocked')) {
                    blocked++;
                } else {
                    failed++;
                }
            }
        }

        Log.info(
            {},
            'Broadcast completed',
            { sent, failed, blocked, total: chatIds.length }
        );

        return { sent, failed, blocked };
    }

    /**
     * Отправка уведомления с кнопками действий
     */
    async sendNotification(
        userId: number,
        title: string,
        message: string,
        actions?: Array<{
            text: string;
            callback_data: string;
        }>
    ): Promise<any> {
        const text = `🔔 **${title}**\n\n${message}`;

        const options: any = {
            parse_mode: 'Markdown' as const,
        };

        if (actions && actions.length > 0) {
            options.reply_markup = {
                inline_keyboard: actions.map(action => [{
                    text: action.text,
                    callback_data: action.callback_data,
                }]),
            };
        }

        return this.sendMessage(userId, text, options);
    }

    /**
     * Проверка доступности бота для пользователя
     */
    async canSendToUser(userId: number): Promise<boolean> {
        try {
            // Пробуем отправить тестовое действие
            await this.workBot.telegram.sendChatAction(userId, 'typing');
            return true;
        } catch (error: any) {
            if (error.response?.error_code === 403) {
                return false;
            }

            // Для других ошибок считаем что можем отправить
            return true;
        }
    }

    /**
     * Получение ссылки на чат
     */
    async getChatInviteLink(chatId: number | string): Promise<string | null> {
        try {
            const result = await this.workBot.telegram.exportChatInviteLink(chatId);

            Log.external('telegram', 'Chat invite link exported', { chatId });

            return result;
        } catch (error) {
            Log.error({ chatId }, 'Failed to export chat invite link', error);
            return null;
        }
    }

    /**
     * Установка команд бота
     */
    async setMyCommands(
        commands: Array<{
            command: string;
            description: string;
        }>,
        botType: 'work' | 'reg' = 'work'
    ): Promise<boolean> {
        try {
            const bot = botType === 'work' ? this.workBot : this.regBot;

            await bot.telegram.setMyCommands(commands);

            Log.external('telegram', 'Bot commands updated', {
                botType,
                commandsCount: commands.length,
            });

            return true;
        } catch (error) {
            Log.error({}, 'Failed to set bot commands', error);
            return false;
        }
    }
}

// Экспортируем синглтон
export const telegramClient = new TelegramClient();