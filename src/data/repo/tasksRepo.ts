import { getDb } from '../db';
import { Task, TaskStatus, TaskPriority, TaskCategory } from '../../interfaces/task';
import { AppError, ErrorCodes } from '../../utils/errors';
import Log from '../../utils/log';

/**
 * Репозиторий для работы с задачами
 * Только SQL-запросы для связки с Planka
 */
export const tasksRepo = {
    /**
     * Создание записи о задаче
     */
    create(data: {
        plankaCardId: string;
        title: string;
        description?: string;
        priority: TaskPriority;
        category: TaskCategory;
        status: TaskStatus;
        createdBy: number;
        assignedTo?: number;
        chatId: number;
        dueDate?: Date;
    }): Task {
        const db = getDb();

        try {
            const stmt = db.prepare(`
        INSERT INTO tasks (
          planka_card_id, title, description, priority, category,
          status, created_by, assigned_to, chat_id, due_date
        ) VALUES (
          @plankaCardId, @title, @description, @priority, @category,
          @status, @createdBy, @assignedTo, @chatId, @dueDate
        )
      `);

            const info = stmt.run({
                plankaCardId: data.plankaCardId,
                title: data.title,
                description: data.description || null,
                priority: data.priority,
                category: data.category,
                status: data.status,
                createdBy: data.createdBy,
                assignedTo: data.assignedTo || null,
                chatId: data.chatId,
                dueDate: data.dueDate ? data.dueDate.toISOString() : null,
            });

            Log.info({ chatId: data.chatId }, 'Task created', {
                id: info.lastInsertRowid,
                plankaCardId: data.plankaCardId,
            });

            return this.getByPlankaId(data.plankaCardId)!;
        } catch (error: any) {
            if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                throw new AppError(
                    ErrorCodes.ALREADY_EXISTS,
                    'Task already exists',
                    { plankaCardId: data.plankaCardId }
                );
            }
            throw error;
        }
    },

    /**
     * Получение задачи по Planka Card ID
     */
    getByPlankaId(plankaCardId: string): Task | null {
        const db = getDb();

        const stmt = db.prepare(`
      SELECT t.*, 
        u1.username as creator_username,
        u2.username as assignee_username,
        u2.email as assignee_email,
        u2.full_name as assignee_name
      FROM tasks t
      LEFT JOIN users u1 ON t.created_by = u1.telegram_id
      LEFT JOIN users u2 ON t.assigned_to = u2.telegram_id
      WHERE t.planka_card_id = ?
    `);

        const row = stmt.get(plankaCardId);

        if (!row) {
            return null;
        }

        return this.mapRowToTask(row);
    },

    /**
     * Получение задач пользователя
     */
    getUserTasks(telegramId: number, status?: TaskStatus): Task[] {
        const db = getDb();

        const query = status
            ? `SELECT t.*, 
           u1.username as creator_username,
           u2.username as assignee_username,
           u2.email as assignee_email,
           u2.full_name as assignee_name
         FROM tasks t
         LEFT JOIN users u1 ON t.created_by = u1.telegram_id
         LEFT JOIN users u2 ON t.assigned_to = u2.telegram_id
         WHERE t.assigned_to = ? AND t.status = ?
         ORDER BY t.due_date ASC, t.created_at DESC`
            : `SELECT t.*, 
           u1.username as creator_username,
           u2.username as assignee_username,
           u2.email as assignee_email,
           u2.full_name as assignee_name
         FROM tasks t
         LEFT JOIN users u1 ON t.created_by = u1.telegram_id
         LEFT JOIN users u2 ON t.assigned_to = u2.telegram_id
         WHERE t.assigned_to = ?
         ORDER BY t.due_date ASC, t.created_at DESC`;

        const stmt = db.prepare(query);
        const rows = status ? stmt.all(telegramId, status) : stmt.all(telegramId);

        return rows.map(row => this.mapRowToTask(row));
    },

    /**
     * Получение задач с приближающимися дедлайнами
     */
    getUpcomingDeadlines(hoursAhead: number): Task[] {
        const db = getDb();

        const deadline = new Date();
        deadline.setHours(deadline.getHours() + hoursAhead);

        const stmt = db.prepare(`
      SELECT t.*, 
        u1.username as creator_username,
        u2.username as assignee_username,
        u2.email as assignee_email,
        u2.full_name as assignee_name
      FROM tasks t
      LEFT JOIN users u1 ON t.created_by = u1.telegram_id
      LEFT JOIN users u2 ON t.assigned_to = u2.telegram_id
      WHERE t.due_date <= ? 
        AND t.due_date >= CURRENT_TIMESTAMP
        AND t.status != ?
      ORDER BY t.due_date ASC
    `);

        const rows = stmt.all(deadline.toISOString(), TaskStatus.DONE);

        return rows.map(row => this.mapRowToTask(row));
    },

    /**
     * Получение просроченных задач
     */
    getOverdueTasks(): Task[] {
        const db = getDb();

        const stmt = db.prepare(`
      SELECT t.*, 
        u1.username as creator_username,
        u2.username as assignee_username,
        u2.email as assignee_email,
        u2.full_name as assignee_name
      FROM tasks t
      LEFT JOIN users u1 ON t.created_by = u1.telegram_id
      LEFT JOIN users u2 ON t.assigned_to = u2.telegram_id
      WHERE t.due_date < CURRENT_TIMESTAMP
        AND t.status != ?
      ORDER BY t.due_date DESC
    `);

        const rows = stmt.all(TaskStatus.DONE);

        return rows.map(row => this.mapRowToTask(row));
    },

    /**
     * Поиск задач по тексту
     */
    search(query: string, chatId?: number): Task[] {
        const db = getDb();

        const searchPattern = `%${query}%`;

        const baseQuery = `
      SELECT t.*, 
        u1.username as creator_username,
        u2.username as assignee_username,
        u2.email as assignee_email,
        u2.full_name as assignee_name
      FROM tasks t
      LEFT JOIN users u1 ON t.created_by = u1.telegram_id
      LEFT JOIN users u2 ON t.assigned_to = u2.telegram_id
      WHERE (
        t.title LIKE ? OR
        t.description LIKE ? OR
        t.planka_card_id = ?
      )
    `;

        const fullQuery = chatId
            ? `${baseQuery} AND t.chat_id = ? ORDER BY t.created_at DESC LIMIT 20`
            : `${baseQuery} ORDER BY t.created_at DESC LIMIT 20`;

        const stmt = db.prepare(fullQuery);
        const rows = chatId
            ? stmt.all(searchPattern, searchPattern, query, chatId)
            : stmt.all(searchPattern, searchPattern, query);

        return rows.map(row => this.mapRowToTask(row));
    },

    /**
     * Обновление задачи
     */
    update(plankaCardId: string, data: {
        title?: string;
        description?: string;
        priority?: TaskPriority;
        status?: TaskStatus;
        assignedTo?: number | null;
        dueDate?: Date | null;
    }): Task | null {
        const db = getDb();

        const updates: string[] = [];
        const params: any = { plankaCardId };

        if (data.title !== undefined) {
            updates.push('title = @title');
            params.title = data.title;
        }

        if (data.description !== undefined) {
            updates.push('description = @description');
            params.description = data.description;
        }

        if (data.priority !== undefined) {
            updates.push('priority = @priority');
            params.priority = data.priority;
        }

        if (data.status !== undefined) {
            updates.push('status = @status');
            params.status = data.status;
        }

        if (data.assignedTo !== undefined) {
            updates.push('assigned_to = @assignedTo');
            params.assignedTo = data.assignedTo;
        }

        if (data.dueDate !== undefined) {
            updates.push('due_date = @dueDate');
            params.dueDate = data.dueDate ? data.dueDate.toISOString() : null;
        }

        if (updates.length === 0) {
            return this.getByPlankaId(plankaCardId);
        }

        updates.push('updated_at = CURRENT_TIMESTAMP');

        const stmt = db.prepare(`
      UPDATE tasks 
      SET ${updates.join(', ')}
      WHERE planka_card_id = @plankaCardId
    `);

        const info = stmt.run(params);

        if (info.changes === 0) {
            return null;
        }

        Log.info({}, 'Task updated', { plankaCardId, ...params });

        return this.getByPlankaId(plankaCardId);
    },

    /**
     * Удаление задачи
     */
    delete(plankaCardId: string): boolean {
        const db = getDb();

        const stmt = db.prepare('DELETE FROM tasks WHERE planka_card_id = ?');
        const info = stmt.run(plankaCardId);

        if (info.changes > 0) {
            Log.info({}, 'Task deleted', { plankaCardId });
            return true;
        }

        return false;
    },

    /**
     * Получение статистики по задачам
     */
    getStats(chatId?: number): {
        total: number;
        byStatus: Record<string, number>;
        byPriority: Record<string, number>;
        overdue: number;
    } {
        const db = getDb();

        const whereClause = chatId ? 'WHERE chat_id = ?' : '';
        const params = chatId ? [chatId] : [];

        // Общее количество
        const totalStmt = db.prepare(`SELECT COUNT(*) as count FROM tasks ${whereClause}`);
        const total = totalStmt.get(...params) as { count: number };

        // По статусам
        const statusStmt = db.prepare(`
      SELECT status, COUNT(*) as count 
      FROM tasks ${whereClause}
      GROUP BY status
    `);
        const statusRows = statusStmt.all(...params) as Array<{ status: string; count: number }>;

        // По приоритетам
        const priorityStmt = db.prepare(`
      SELECT priority, COUNT(*) as count 
      FROM tasks ${whereClause}
      GROUP BY priority
    `);
        const priorityRows = priorityStmt.all(...params) as Array<{ priority: string; count: number }>;

        // Просроченные
        const overdueStmt = db.prepare(`
      SELECT COUNT(*) as count 
      FROM tasks 
      WHERE due_date < CURRENT_TIMESTAMP 
        AND status != ?
        ${chatId ? 'AND chat_id = ?' : ''}
    `);
        const overdueParams = chatId ? [TaskStatus.DONE, chatId] : [TaskStatus.DONE];
        const overdue = overdueStmt.get(...overdueParams) as { count: number };

        return {
            total: total.count,
            byStatus: Object.fromEntries(statusRows.map(r => [r.status, r.count])),
            byPriority: Object.fromEntries(priorityRows.map(r => [r.priority, r.count])),
            overdue: overdue.count,
        };
    },

    /**
     * Маппинг строки БД в объект Task
     */
    mapRowToTask(row: any): Task {
        return {
            id: row.planka_card_id,
            title: row.title,
            description: row.description,
            priority: row.priority as TaskPriority,
            category: row.category as TaskCategory,
            assigneeId: row.assigned_to ? String(row.assigned_to) : undefined,
            assigneeName: row.assignee_name,
            assigneeEmail: row.assignee_email,
            dueDate: row.due_date ? new Date(row.due_date) : undefined,
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at),
            createdBy: String(row.created_by),
            status: row.status as TaskStatus,
            plankaCardId: row.planka_card_id,
            chatId: row.chat_id,
        };
    },
};