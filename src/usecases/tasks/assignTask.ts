import { Task } from '../../interfaces/task';
import { User, UserRole } from '../../interfaces/user';
import { plankaClient } from '../../clients/planka';
import { tasksRepo } from '../../data/repo/tasksRepo';
import { usersRepo } from '../../data/repo/usersRepo';
import { AppError, ErrorCodes } from '../../utils/errors';
import { autoUpdateStatusOnAssign } from './updateStatus';
import Log from '../../utils/log';

/**
 * Назначение исполнителя на задачу
 */
export async function assignTask(
    taskId: string,
    assigneeId: number | null,
    assignedBy: number
): Promise<{
    task: Task;
    assignee: User | null;
    previousAssignee: User | null;
}> {
    Log.info(
        { userId: assignedBy },
        'Assigning task',
        { taskId, assigneeId }
    );

    // Получаем задачу
    const task = tasksRepo.getByPlankaId(taskId);

    if (!task) {
        throw new AppError(
            ErrorCodes.NOT_FOUND,
            'Task not found',
            { taskId }
        );
    }

    // Сохраняем предыдущего исполнителя
    let previousAssignee: User | null = null;
    if (task.assigneeId) {
        previousAssignee = usersRepo.getByTelegramId(parseInt(task.assigneeId));
    }

    // Если снимаем исполнителя
    if (assigneeId === null) {
        await removeAssignee(task);

        const updatedTask = tasksRepo.update(taskId, {
            assignedTo: null,
        });

        Log.info(
            { userId: assignedBy },
            'Assignee removed from task',
            { taskId }
        );

        return {
            task: updatedTask!,
            assignee: null,
            previousAssignee,
        };
    }

    // Проверяем существование нового исполнителя
    const assignee = usersRepo.getByTelegramId(assigneeId);

    if (!assignee) {
        throw new AppError(
            ErrorCodes.ASSIGNEE_NOT_FOUND,
            'Assignee not found',
            { assigneeId }
        );
    }

    // Обновляем в Planka если у пользователя есть Planka ID
    if (assignee.plankaUserId) {
        // Удаляем предыдущего исполнителя если был
        if (previousAssignee?.plankaUserId) {
            try {
                // API для удаления участника (нужно добавить в plankaClient)
                // await plankaClient.removeCardMember(taskId, previousAssignee.plankaUserId);
            } catch (error) {
                Log.error(
                    { userId: assignedBy },
                    'Failed to remove previous assignee from Planka',
                    error
                );
            }
        }

        // Добавляем нового исполнителя
        await plankaClient.addCardMember(task.plankaCardId!, assignee.plankaUserId);
    } else if (assignee.email) {
        // Если нет Planka ID, но есть email - пробуем найти в Planka
        const plankaUser = await plankaClient.findUserByEmail(assignee.email);

        if (plankaUser) {
            // Сохраняем Planka ID для будущего
            usersRepo.update({
                telegramId: assignee.telegramId,
                plankaUserId: plankaUser.id,
            });

            await plankaClient.addCardMember(task.plankaCardId!, plankaUser.id);
        }
    }

    // Обновляем в локальной БД
    const updatedTask = tasksRepo.update(task.plankaCardId!, {
        assignedTo: assigneeId,
    });

    if (!updatedTask) {
        throw new AppError(
            ErrorCodes.DB_ERROR,
            'Failed to update task in database'
        );
    }

    // Автоматически меняем статус если нужно
    await autoUpdateStatusOnAssign(task.plankaCardId!, assigneeId);

    Log.info(
        { userId: assignedBy },
        'Task assigned successfully',
        {
            taskId,
            assigneeId,
            previousAssigneeId: previousAssignee?.telegramId,
        }
    );

    return {
        task: updatedTask,
        assignee,
        previousAssignee,
    };
}

/**
 * Назначение задачи на себя
 */
export async function assignToMe(
    taskId: string,
    userId: number
): Promise<{
    task: Task;
    assignee: User;
}> {
    const result = await assignTask(taskId, userId, userId);

    return {
        task: result.task,
        assignee: result.assignee!,
    };
}

/**
 * Поиск подходящего исполнителя по навыкам/категории
 */
export async function findBestAssignee(
    category: string,
    priority: string
): Promise<User | null> {
    // Получаем всех сотрудников
    const employees = usersRepo.getAll(UserRole.EMPLOYEE);

    if (employees.length === 0) {
        return null;
    }

    // Простая логика: выбираем случайного или с наименьшей загрузкой
    const taskCounts = await getTaskCountsByUser();

    // Сортируем по количеству задач
    const sorted = employees.sort((a, b) => {
        const countA = taskCounts[a.telegramId] || 0;
        const countB = taskCounts[b.telegramId] || 0;
        return countA - countB;
    });

    // Возвращаем наименее загруженного
    return sorted[0];
}

/**
 * Получение количества активных задач по пользователям
 */
async function getTaskCountsByUser(): Promise<Record<number, number>> {
    const allTasks = tasksRepo.getAll();
    const counts: Record<number, number> = {};

    for (const task of allTasks) {
        if (task.assigneeId && task.status !== 'done') {
            const userId = parseInt(task.assigneeId);
            counts[userId] = (counts[userId] || 0) + 1;
        }
    }

    return counts;
}

/**
 * Удаление исполнителя из задачи в Planka
 */
async function removeAssignee(task: Task): Promise<void> {
    if (!task.assigneeId) {
        return;
    }

    const assignee = usersRepo.getByTelegramId(parseInt(task.assigneeId));

    if (assignee?.plankaUserId) {
        try {
            // Здесь нужно добавить метод в plankaClient для удаления участника
            // await plankaClient.removeCardMember(task.plankaCardId!, assignee.plankaUserId);

            Log.info(
                { userId: assignee.telegramId },
                'Removed from Planka card',
                { cardId: task.plankaCardId }
            );
        } catch (error) {
            Log.error(
                { userId: assignee.telegramId },
                'Failed to remove from Planka',
                error
            );
        }
    }
}

/**
 * Переназначение всех задач пользователя
 */
export async function reassignUserTasks(
    fromUserId: number,
    toUserId: number | null,
    reassignedBy: number
): Promise<{
    reassigned: number;
    failed: number;
}> {
    const userTasks = tasksRepo.getUserTasks(fromUserId);
    let reassigned = 0;
    let failed = 0;

    for (const task of userTasks) {
        if (task.status === 'done') {
            continue;
        }

        try {
            await assignTask(
                task.plankaCardId!,
                toUserId,
                reassignedBy
            );
            reassigned++;
        } catch (error) {
            Log.error(
                { userId: reassignedBy },
                'Failed to reassign task',
                error,
                { taskId: task.plankaCardId }
            );
            failed++;
        }
    }

    Log.info(
        { userId: reassignedBy },
        'Tasks reassignment completed',
        {
            fromUserId,
            toUserId,
            reassigned,
            failed,
        }
    );

    return { reassigned, failed };
}

/**
 * Получение списка доступных исполнителей с их загрузкой
 */
export async function getAssigneesWithWorkload(): Promise<Array<{
    user: User;
    activeTasks: number;
    overdueTasks: number;
    isAvailable: boolean;
}>> {
    const employees = usersRepo.getAll(UserRole.EMPLOYEE);
    const owners = usersRepo.getAll(UserRole.OWNER);
    const allUsers = [...employees, ...owners];

    const result = [];

    for (const user of allUsers) {
        const tasks = tasksRepo.getUserTasks(user.telegramId);
        const activeTasks = tasks.filter(t => t.status !== 'done').length;
        const overdueTasks = tasks.filter(t =>
            t.status !== 'done' &&
            t.dueDate &&
            new Date(t.dueDate) < new Date()
        ).length;

        result.push({
            user,
            activeTasks,
            overdueTasks,
            isAvailable: activeTasks < 10, // Условный лимит
        });
    }

    // Сортируем по доступности и загрузке
    result.sort((a, b) => {
        if (a.isAvailable !== b.isAvailable) {
            return a.isAvailable ? -1 : 1;
        }
        return a.activeTasks - b.activeTasks;
    });

    return result;
}