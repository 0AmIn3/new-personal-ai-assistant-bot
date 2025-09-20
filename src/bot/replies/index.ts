import { Markup } from 'telegraf';
import { InlineKeyboardButton, ReplyKeyboardMarkup } from 'telegraf/types';
import { Language } from '../../interfaces/user';
import { TaskStatus } from '../../interfaces/task';
import { ru } from './i18n/ru';
import { uz } from './i18n/uz';

/**
 * Получение текстов по языку
 */
export function getText(lang: Language = Language.RU) {
    return lang === Language.UZ ? uz : ru;
}

/**
 * Клавиатуры для различных действий
 */
export const keyboards = {
    /**
     * Клавиатура подтверждения
     */
    confirm(lang: Language = Language.RU) {
        const t = getText(lang);
        return Markup.inlineKeyboard([
            [
                Markup.button.callback(t.buttons.yes, 'confirm_yes'),
                Markup.button.callback(t.buttons.no, 'confirm_no'),
            ],
        ]);
    },

    /**
     * Клавиатура отмены
     */
    cancel(lang: Language = Language.RU) {
        const t = getText(lang);
        return Markup.inlineKeyboard([
            [Markup.button.callback(t.buttons.cancel, 'cancel')],
        ]);
    },

    /**
     * Клавиатура для просмотра задачи
     */
    taskView(cardId: string, isOwner: boolean, lang: Language = Language.RU) {
        const t = getText(lang);
        const buttons: InlineKeyboardButton[][] = [];

        if (isOwner) {
            buttons.push([
                Markup.button.callback(t.buttons.editTask, `edit_task_${cardId}`),
            ]);
        }

        buttons.push([
            Markup.button.callback(t.buttons.refreshTask, `refresh_task_${cardId}`),
        ]);

        buttons.push([
            Markup.button.callback(t.buttons.back, 'back_to_tasks'),
        ]);

        return Markup.inlineKeyboard(buttons);
    },

    /**
     * Клавиатура для редактирования задачи
     */
    taskEdit(cardId: string, lang: Language = Language.RU) {
        const t = getText(lang);
        return Markup.inlineKeyboard([
            [
                Markup.button.callback('📝 Название', `edit_name_${cardId}`),
                Markup.button.callback('📋 Описание', `edit_desc_${cardId}`),
            ],
            [
                Markup.button.callback('🎯 Приоритет', `edit_priority_${cardId}`),
                Markup.button.callback('📊 Статус', `edit_status_${cardId}`),
            ],
            [
                Markup.button.callback('👤 Исполнитель', `edit_assignee_${cardId}`),
                Markup.button.callback('📅 Срок', `edit_due_${cardId}`),
            ],
            [
                Markup.button.callback(t.buttons.back, `view_task_${cardId}`),
            ],
        ]);
    },

    /**
     * Клавиатура выбора статуса
     */
    statusSelect(cardId: string, currentStatus: TaskStatus, lang: Language = Language.RU) {
        const t = getText(lang);
        const buttons: InlineKeyboardButton[][] = [];

        const statuses = [
            { key: TaskStatus.TODO, emoji: '📋', text: 'К выполнению' },
            { key: TaskStatus.IN_PROGRESS, emoji: '⚡', text: 'В работе' },
            { key: TaskStatus.IN_REVIEW, emoji: '👀', text: 'На проверке' },
            { key: TaskStatus.DONE, emoji: '✅', text: 'Выполнено' },
        ];

        for (const status of statuses) {
            if (status.key !== currentStatus) {
                buttons.push([
                    Markup.button.callback(
                        `${status.emoji} ${status.text}`,
                        `set_status_${cardId}_${status.key}`
                    ),
                ]);
            }
        }

        buttons.push([
            Markup.button.callback(t.buttons.cancel, `edit_task_${cardId}`),
        ]);

        return Markup.inlineKeyboard(buttons);
    },

    /**
     * Клавиатура создания задачи - шаг с файлами
     */
    taskCreateFiles(sessionId: string, lang: Language = Language.RU) {
        const t = getText(lang);
        return Markup.inlineKeyboard([
            [Markup.button.callback(t.buttons.addFiles, 'add_files')],
            [Markup.button.callback('✅ Нет, создать задачу', 'create_task_now')],
            [Markup.button.callback(t.buttons.cancel, 'cancel_task')],
        ]);
    },

    /**
     * Клавиатура выбора исполнителя
     */
    assigneeSelect(
        sessionId: string,
        assignees: Array<{ id: string; name: string }>,
        lang: Language = Language.RU
    ) {
        const t = getText(lang);
        const buttons: InlineKeyboardButton[][] = [];

        // Группируем по 2 кнопки в ряд
        for (let i = 0; i < assignees.length; i += 2) {
            const row: InlineKeyboardButton[] = [];

            row.push(
                Markup.button.callback(
                    assignees[i].name,
                    `assign_${sessionId}_${assignees[i].id}`
                )
            );

            if (i + 1 < assignees.length) {
                row.push(
                    Markup.button.callback(
                        assignees[i + 1].name,
                        `assign_${sessionId}_${assignees[i + 1].id}`
                    )
                );
            }

            buttons.push(row);
        }

        // Опция "Без исполнителя"
        buttons.push([
            Markup.button.callback('➖ Без исполнителя', `assign_${sessionId}_none`),
        ]);

        buttons.push([
            Markup.button.callback(t.buttons.cancel, 'cancel_task'),
        ]);

        return Markup.inlineKeyboard(buttons);
    },

    /**
     * Клавиатура выбора списка (группы)
     */
    listSelect(
        sessionId: string,
        lists: Array<{ id: string; name: string }>,
        lang: Language = Language.RU
    ) {
        const t = getText(lang);
        const buttons: InlineKeyboardButton[][] = [];

        for (const list of lists) {
            buttons.push([
                Markup.button.callback(list.name, `select_list_${sessionId}_${list.id}`),
            ]);
        }

        buttons.push([
            Markup.button.callback(t.buttons.cancel, 'cancel_task'),
        ]);

        return Markup.inlineKeyboard(buttons);
    },

    /**
     * Клавиатура для списка задач
     */
    tasksList(
        tasks: Array<{ id: string; title: string; status: string }>,
        isOwner: boolean,
        lang: Language = Language.RU
    ) {
        const t = getText(lang);
        const buttons: InlineKeyboardButton[][] = [];

        for (const task of tasks) {
            const emoji = {
                'todo': '📋',
                'in_progress': '⚡',
                'in_review': '👀',
                'done': '✅',
            }[task.status] || '📋';

            const buttonText = `${emoji} ${task.title}`;
            const action = isOwner ? `edit_task_${task.id}` : `view_task_${task.id}`;

            buttons.push([
                Markup.button.callback(buttonText, action),
            ]);
        }

        if (buttons.length === 0) {
            return null;
        }

        return Markup.inlineKeyboard(buttons);
    },

    /**
     * Клавиатура выбора языка
     */
    languageSelect() {
        return Markup.inlineKeyboard([
            [
                Markup.button.callback('🇷🇺 Русский', 'lang_ru'),
                Markup.button.callback('🇺🇿 Oʻzbek', 'lang_uz'),
            ],
        ]);
    },

    /**
     * Главное меню (reply keyboard)
     */
    mainMenu(isOwner: boolean, lang: Language = Language.RU): ReplyKeyboardMarkup {
        const t = getText(lang);
        const buttons = [
            ['📋 Мои задачи', '❓ Помощь'],
        ];

        if (isOwner) {
            buttons.unshift(['📝 Создать задачу']);
            buttons.push(['📊 Статистика', '📅 Дедлайны']);
        }

        return {
            keyboard: buttons,
            resize_keyboard: true,
            persistent: true,
        };
    },
};

/**
 * Форматирование даты по языку
 */
export function formatDate(date: Date, lang: Language = Language.RU): string {
    const locale = lang === Language.UZ ? 'uz-UZ' : 'ru-RU';
    return date.toLocaleDateString(locale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
}

/**
 * Форматирование времени по языку
 */
export function formatTime(date: Date, lang: Language = Language.RU): string {
    const locale = lang === Language.UZ ? 'uz-UZ' : 'ru-RU';
    return date.toLocaleTimeString(locale, {
        hour: '2-digit',
        minute: '2-digit',
    });
}

/**
 * Форматирование даты и времени
 */
export function formatDateTime(date: Date, lang: Language = Language.RU): string {
    return `${formatDate(date, lang)} ${formatTime(date, lang)}`;
}