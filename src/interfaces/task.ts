/**
 * Интерфейсы для работы с задачами
 */

export interface Task {
    id: string;
    title: string;
    description?: string;
    priority: TaskPriority;
    category: TaskCategory;
    assigneeId?: string;
    assigneeName?: string;
    assigneeEmail?: string;
    dueDate?: Date;
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
    status: TaskStatus;
    plankaCardId?: string;
    chatId: number;
}

export enum TaskPriority {
    LOW = 'низкий',
    MEDIUM = 'средний',
    HIGH = 'высокий',
    CRITICAL = 'критический',
}

export enum TaskCategory {
    DEVELOPMENT = 'разработка',
    DESIGN = 'дизайн',
    TESTING = 'тестирование',
    DOCUMENTATION = 'документация',
    OTHER = 'другое',
}

export enum TaskStatus {
    TODO = 'todo',
    IN_PROGRESS = 'in_progress',
    IN_REVIEW = 'in_review',
    DONE = 'done',
}

export interface CreateTaskInput {
    title: string;
    description?: string;
    priority?: TaskPriority;
    category?: TaskCategory;
    assigneeId?: string;
    dueDate?: Date;
    chatId: number;
    userId: number;
    username: string;
    attachments?: TaskAttachment[];
}

export interface UpdateTaskInput {
    taskId: string;
    title?: string;
    description?: string;
    priority?: TaskPriority;
    status?: TaskStatus;
    assigneeId?: string;
    dueDate?: Date;
}

export interface TaskAttachment {
    name: string;
    url: string;
    size: number;
    type?: string;
}

export interface TaskSearchResult {
    tasks: Task[];
    total: number;
    page: number;
    pageSize: number;
}

export interface TaskStats {
    total: number;
    byStatus: Record<TaskStatus, number>;
    byPriority: Record<TaskPriority, number>;
    overdue: number;
    dueToday: number;
    dueThisWeek: number;
}

export interface GeminiAnalysis {
    title: string;
    description: string;
    priority: TaskPriority;
    category: TaskCategory;
    assigneeName?: string;
    dueDate?: Date;
    language: 'ru' | 'uz';
}