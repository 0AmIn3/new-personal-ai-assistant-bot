import { Task, TaskStatus } from '../../interfaces/task';
import { User } from '../../interfaces/user';
import { plankaClient } from '../../clients/planka';
import { tasksRepo } from '../../data/repo/tasksRepo';
import { usersRepo } from '../../data/repo/usersRepo';
import { AppError, ErrorCodes } from '../../utils/errors';
import Log from '../../utils/log';

/**
 * Обновление статуса задачи
 */
export async function updateTaskStatus(
    taskId: string,
    newStatus: TaskStatus,
    userId: number
): Promise<{
    task: Task;
    previousStatus: TaskStatus;
    movedBy: User;
}> {
    Log.info(
        { userId },
        'Updating task status',
        { taskId, newStatus }
    );

    // Получаем задачу из БД
    const task = tasksRepo.getByPlankaId(taskId);

    if (!task) {
        throw new AppError(
            ErrorCodes.NOT_FOUND,
            'Task not found',
            { taskId }
        );
    }

    const previousStatus = task.status;

    // Проверяем, изменился ли статус
    if (previousStatus === newStatus) {
        Log.info({ userId }, 'Status not changed', { taskId, status: newStatus });

        const user = usersRepo.getByTelegramId(userId)!;
        return {
            task,
            previousStatus,
            movedBy: user,
        };
    }

    // Валидация перехода статусов (опционально)
    validateStatusTransition(previousStatus, newStatus);

    // Получаем списки Planka для статусов
    const lists = await plankaClient.getBoardLists();
    const targetList = getListForStatus(lists, newStatus);

    if (!targetList) {
        throw new AppError(
            ErrorCodes.PLANKA_ERROR,
            'Target list not found for status',
            { newStatus }
        );
    }

    // Обновляем карточку в Planka
    await plankaClient.updateCard(task.plankaCardId!, {
        listId: targetList.id,
    });

    // Обновляем в локальной БД
    const updatedTask = tasksRepo.update(task.plankaCardId!, {
        status: newStatus,
    });

    if (!updatedTask) {
        throw new AppError(
            ErrorCodes.DB_ERROR,
            'Failed to update task in database'
        );
    }

    // Добавляем комментарий в Planka о смене статуса
    const user = usersRepo.getByTelegramId(userId)!;
    const comment = formatStatusChangeComment(previousStatus, newStatus, user);

    // Здесь можно добавить вызов API для добавления комментария
    // await plankaClient.addComment(task.plankaCardId!, comment);

    Log.info(
        { userId },
        'Task status updated',
        {
            taskId,
            previousStatus,
            newStatus,
        }
    );

    return {
        task: updatedTask,
        previousStatus,
        movedBy: user,
    };
}

/**
 * Массовое обновление статусов
 */
export async function bulkUpdateStatus(
    taskIds: string[],
    newStatus: TaskStatus,
    userId: number
): Promise<{
    updated: string[];
    failed: Array<{ taskId: string; error: string }>;
}> {
    const updated: string[] = [];
    const failed: Array<{ taskId: string; error: string }> = [];

    for (const taskId of taskIds) {
        try {
            await updateTaskStatus(taskId, newStatus, userId);
            updated.push(taskId);
        } catch (error: any) {
            failed.push({
                taskId,
                error: error.message || 'Unknown error',
            });
        }
    }

    Log.info(
        { userId },
        'Bulk status update completed',
        {
            total: taskIds.length,
            updated: updated.length,
            failed: failed.length,
        }
    );

    return { updated, failed };
}

/**
 * Валидация перехода между статусами
 */
function validateStatusTransition(
    from: TaskStatus,
    to: TaskStatus
): void {
    // Определяем разрешённые переходы
    const allowedTransitions: Record<TaskStatus, TaskStatus[]> = {
        [TaskStatus.TODO]: [
            TaskStatus.IN_PROGRESS,
            TaskStatus.DONE,
        ],
        [TaskStatus.IN_PROGRESS]: [
            TaskStatus.TODO,
            TaskStatus.IN_REVIEW,
            TaskStatus.DONE,
        ],
        [TaskStatus.IN_REVIEW]: [
            TaskStatus.IN_PROGRESS,
            TaskStatus.DONE,
        ],
        [TaskStatus.DONE]: [
            TaskStatus.TODO,
            TaskStatus.IN_PROGRESS,
        ],
    };

    const allowed = allowedTransitions[from] || [];

    if (!allowed.includes(to)) {
        throw new AppError(
            ErrorCodes.INVALID_STATUS_TRANSITION,
            `Cannot transition from ${from} to ${to}`
        );
    }
}

/**
 * Получение списка Planka для статуса
 */
function getListForStatus(
    lists: Array<{ id: string; name: string }>,
    status: TaskStatus
): { id: string; name: string } | undefined {
    // Маппинг статусов на названия списков
    const statusToListName: Record<TaskStatus, string[]> = {
        [TaskStatus.TODO]: ['todo', 'новые', 'новая', 'backlog', 'к выполнению'],
        [TaskStatus.IN_PROGRESS]: ['in progress', 'в работе', 'doing', 'выполняется'],
        [TaskStatus.IN_REVIEW]: ['review', 'проверка', 'на проверке', 'testing'],
        [TaskStatus.DONE]: ['done', 'готово', 'выполнено', 'completed', 'finished'],
    };

    const possibleNames = statusToListName[status] || [];

    // Ищем список по возможным названиям
    for (const name of possibleNames) {
        const list = lists.find(l =>
            l.name.toLowerCase().includes(name.toLowerCase())
        );

        if (list) {
            return list;
        }
    }

    // Если не нашли по названию, используем индексы
    const statusToIndex: Record<TaskStatus, number> = {
        [TaskStatus.TODO]: 0,
        [TaskStatus.IN_PROGRESS]: 1,
        [TaskStatus.IN_REVIEW]: 2,
        [TaskStatus.DONE]: lists.length - 1,
    };

    const index = statusToIndex[status];
    return lists[index];
}

/**
 * Форматирование комментария о смене статуса
 */
function formatStatusChangeComment(
    from: TaskStatus,
    to: TaskStatus,
    user: User
): string {
    const statusNames = {
        [TaskStatus.TODO]: 'К выполнению',
        [TaskStatus.IN_PROGRESS]: 'В работе',
        [TaskStatus.IN_REVIEW]: 'На проверке',
        [TaskStatus.DONE]: 'Выполнено',
    };

    return `📊 Статус изменён: ${statusNames[from]} → ${statusNames[to]}
👤 ${user.fullName || user.username || 'Пользователь'}
🕐 ${new Date().toLocaleString('ru-RU')}`;
}

/**
 * Автоматическое изменение статуса при назначении
 */
export async function autoUpdateStatusOnAssign(
    taskId: string,
    assigneeId: number
): Promise<Task | null> {
    const task = tasksRepo.getByPlankaId(taskId);

    if (!task) {
        return null;
    }

    // Если задача в TODO и назначен исполнитель, переводим в IN_PROGRESS
    if (task.status === TaskStatus.TODO && assigneeId) {
        const result = await updateTaskStatus(
            taskId,
            TaskStatus.IN_PROGRESS,
            assigneeId
        );

        return result.task;
    }

    return task;
}

/**
 * Получение истории изменений статуса (если будет реализовано логирование)
 */
export async function getStatusHistory(
    taskId: string
): Promise<Array<{
    from: TaskStatus;
    to: TaskStatus;
    changedBy: number;
    changedAt: Date;
}>> {
    // Заглушка для будущей реализации
    // Можно добавить таблицу task_history в БД
    Log.info({}, 'Status history not implemented yet', { taskId });
    return [];
}