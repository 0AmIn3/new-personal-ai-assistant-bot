import * as cron from 'node-cron';
import { JOB_INTERVALS, REMINDER_WINDOWS } from '../config/constants';
import { sendReminders } from './reminders';
import { cleanupExpired } from './cleanup';
import { sendDailyDigest } from './digest';
import Log from '../utils/log';

/**
 * Активные задачи cron
 */
const scheduledJobs: Map<string, cron.ScheduledTask> = new Map();

/**
 * Настройка и запуск планировщика задач
 */
export function setupScheduledJobs(): void {
    Log.job('scheduler', 'Setting up scheduled jobs...');

    // Напоминания о дедлайнах - каждые 5 минут
    const remindersJob = cron.schedule(JOB_INTERVALS.REMINDERS, async () => {
        try {
            await sendReminders();
        } catch (error) {
            Log.error({ job: 'reminders' }, 'Reminders job failed', error);
        }
    });
    scheduledJobs.set('reminders', remindersJob);

    // Утренний дайджест - в 9:00
    const morningDigestJob = cron.schedule(JOB_INTERVALS.DIGEST_MORNING, async () => {
        try {
            await sendDailyDigest('morning');
        } catch (error) {
            Log.error({ job: 'morning_digest' }, 'Morning digest job failed', error);
        }
    });
    scheduledJobs.set('morning_digest', morningDigestJob);

    // Вечерний дайджест - в 18:00
    const eveningDigestJob = cron.schedule(JOB_INTERVALS.DIGEST_EVENING, async () => {
        try {
            await sendDailyDigest('evening');
        } catch (error) {
            Log.error({ job: 'evening_digest' }, 'Evening digest job failed', error);
        }
    });
    scheduledJobs.set('evening_digest', eveningDigestJob);

    // Очистка мусора - каждый день в 3:00
    const cleanupJob = cron.schedule(JOB_INTERVALS.CLEANUP, async () => {
        try {
            await cleanupExpired();
        } catch (error) {
            Log.error({ job: 'cleanup' }, 'Cleanup job failed', error);
        }
    });
    scheduledJobs.set('cleanup', cleanupJob);

    Log.job('scheduler', 'Scheduled jobs started', {
        jobs: Array.from(scheduledJobs.keys()),
    });
}

/**
 * Остановка всех задач
 */
export function stopScheduledJobs(): void {
    Log.job('scheduler', 'Stopping scheduled jobs...');

    for (const [name, job] of scheduledJobs.entries()) {
        job.stop();
        Log.job('scheduler', `Job ${name} stopped`);
    }

    scheduledJobs.clear();
}

/**
 * Перезапуск конкретной задачи
 */
export function restartJob(jobName: string): void {
    const job = scheduledJobs.get(jobName);

    if (job) {
        job.stop();
        job.start();
        Log.job('scheduler', `Job ${jobName} restarted`);
    } else {
        Log.warn({ job: jobName }, 'Job not found for restart');
    }
}

/**
 * Получение статуса задач
 */
export function getJobsStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {};

    for (const [name, job] of scheduledJobs.entries()) {
        // @ts-ignore - свойство running существует в ScheduledTask
        status[name] = job.running || false;
    }

    return status;
}