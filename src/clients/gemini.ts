import axios, { AxiosInstance } from 'axios';
import { config } from '../config/env';
import { AppError, ErrorCodes } from '../utils/errors';
import Log from '../utils/log';
import { GeminiAnalysis, TaskPriority, TaskCategory } from '../interfaces/task';

/**
 * Клиент для работы с Gemini AI
 * Только HTTP-вызовы к API, парсинг ответов
 */
class GeminiClient {
    private client: AxiosInstance;
    private readonly apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';

    constructor() {
        this.client = axios.create({
            timeout: config.timeouts.gemini,
            headers: {
                'Content-Type': 'application/json',
            },
        });

        // Ретрай для сетевых ошибок
        this.client.interceptors.response.use(
            (response) => response,
            async (error) => {
                const originalRequest: any = error.config;

                if (
                    !error.response &&
                    originalRequest._retryCount < config.limits.maxRetries
                ) {
                    originalRequest._retryCount = (originalRequest._retryCount || 0) + 1;
                    const delay = Math.pow(2, originalRequest._retryCount) * 1000;

                    Log.warn(
                        { service: 'gemini' },
                        `Network retry ${originalRequest._retryCount}/${config.limits.maxRetries}`,
                        { delay }
                    );

                    await new Promise(resolve => setTimeout(resolve, delay));
                    return this.client(originalRequest);
                }

                return Promise.reject(error);
            }
        );
    }

    /**
     * Анализ текста для создания задачи
     */
    async analyzeTaskMessage(
        message: string,
        userName: string,
        availableEmployees: Array<{ name: string; email: string; position?: string }>,
        availableLabels: string[]
    ): Promise<GeminiAnalysis> {
        const prompt = this.buildTaskAnalysisPrompt(
            message,
            userName,
            availableEmployees,
            availableLabels
        );

        try {
            Log.external('gemini', 'Analyzing task message', {
                messageLength: message.length
            });

            const response = await this.client.post(
                `${this.apiUrl}?key=${config.gemini.apiKey}`,
                {
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }],
                    generationConfig: {
                        temperature: 0.3,
                        maxOutputTokens: 1000,
                        topP: 0.8,
                        topK: 10
                    }
                }
            );

            const result = this.parseTaskAnalysisResponse(response.data);

            Log.external('gemini', 'Task analysis completed', {
                title: result.title
            });

            return result;
        } catch (error) {
            Log.error({ service: 'gemini' }, 'Failed to analyze message', error);
            throw new AppError(
                ErrorCodes.GEMINI_ERROR,
                'Failed to analyze message with AI'
            );
        }
    }

    /**
     * Транскрибация голосового сообщения
     */
    async transcribeVoice(audioBase64: string): Promise<string> {
        try {
            Log.external('gemini', 'Transcribing voice message');

            const response = await this.client.post(
                `${this.apiUrl}?key=${config.gemini.apiKey}`,
                {
                    contents: [{
                        parts: [{
                            inline_data: {
                                mime_type: 'audio/ogg',
                                data: audioBase64
                            }
                        }]
                    }],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 500
                    }
                }
            );

            const text = this.extractTextFromResponse(response.data);

            Log.external('gemini', 'Voice transcription completed', {
                textLength: text.length
            });

            return text;
        } catch (error) {
            Log.error({ service: 'gemini' }, 'Failed to transcribe voice', error);
            throw new AppError(
                ErrorCodes.GEMINI_ERROR,
                'Failed to transcribe voice message'
            );
        }
    }

    /**
     * Построение промпта для анализа задачи
     */
    private buildTaskAnalysisPrompt(
        message: string,
        userName: string,
        employees: Array<{ name: string; email: string; position?: string }>,
        labels: string[]
    ): string {
        const employeeList = employees
            .map(emp => `- ${emp.name} (${emp.position || 'должность не указана'}, email: ${emp.email})`)
            .join('\n');

        const labelsList = labels.join('\n');
        const currentDate = new Date().toLocaleString('ru-RU', {
            timeZone: 'Asia/Tashkent',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            weekday: 'long'
        });

        return `
Анализируй это сообщение для создания задачи в канбан-доске.
Сообщение от пользователя ${userName}: "${message}"

ТЕКУЩАЯ ДАТА И ВРЕМЯ: ${currentDate} (Ташкент, UTC+5)

ДОСТУПНЫЕ СОТРУДНИКИ:
${employeeList || 'Нет зарегистрированных сотрудников'}

ДОСТУПНЫЕ ПРИОРИТЕТЫ (ЛЕЙБЛЫ):
${labelsList || 'Нет доступных лейблов'}

Определи:
1. Название задачи (краткое, до 50 символов)
2. Описание задачи (подробное)
3. Приоритет (выбери из списка доступных лейблов)
4. Категория работы (разработка/дизайн/тестирование/документация/другое)
5. Исполнитель (ТОЛЬКО из списка выше)
6. Срок выполнения (если упомянут)

ПРАВИЛА:
- Если в сообщении есть слова "срочно", "критично", "важно" - высокий приоритет
- Если есть слова "не спешить", "когда будет время" - низкий приоритет
- В остальных случаях - средний приоритет
- Определи язык сообщения (ru/uz) и отвечай на том же языке
- ИГНОРИРУЙ упоминания людей, которых НЕТ в списке сотрудников

Верни ответ СТРОГО в формате JSON:
{
  "title": "название задачи",
  "description": "описание задачи",
  "priority": "приоритет из списка",
  "category": "категория",
  "assignee": "имя исполнителя или null",
  "dueDate": "YYYY-MM-DD или null",
  "language": "ru или uz"
}`;
    }

    /**
     * Парсинг ответа Gemini для анализа задачи
     */
    private parseTaskAnalysisResponse(data: any): GeminiAnalysis {
        try {
            const text = this.extractTextFromResponse(data);

            // Извлекаем JSON из ответа
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }

            const parsed = JSON.parse(jsonMatch[0]);

            // Мапим приоритеты
            const priorityMap: Record<string, TaskPriority> = {
                'низкий': TaskPriority.LOW,
                'средний': TaskPriority.MEDIUM,
                'высокий': TaskPriority.HIGH,
                'критический': TaskPriority.CRITICAL,
                'low': TaskPriority.LOW,
                'medium': TaskPriority.MEDIUM,
                'high': TaskPriority.HIGH,
                'critical': TaskPriority.CRITICAL,
            };

            // Мапим категории
            const categoryMap: Record<string, TaskCategory> = {
                'разработка': TaskCategory.DEVELOPMENT,
                'дизайн': TaskCategory.DESIGN,
                'тестирование': TaskCategory.TESTING,
                'документация': TaskCategory.DOCUMENTATION,
                'другое': TaskCategory.OTHER,
                'development': TaskCategory.DEVELOPMENT,
                'design': TaskCategory.DESIGN,
                'testing': TaskCategory.TESTING,
                'documentation': TaskCategory.DOCUMENTATION,
                'other': TaskCategory.OTHER,
            };

            return {
                title: parsed.title || 'Новая задача',
                description: parsed.description || '',
                priority: priorityMap[parsed.priority?.toLowerCase()] || TaskPriority.MEDIUM,
                category: categoryMap[parsed.category?.toLowerCase()] || TaskCategory.OTHER,
                assigneeName: parsed.assignee || undefined,
                dueDate: parsed.dueDate ? new Date(parsed.dueDate) : undefined,
                language: parsed.language === 'uz' ? 'uz' : 'ru',
            };
        } catch (error) {
            Log.error({ service: 'gemini' }, 'Failed to parse response', error);

            // Возвращаем дефолтные значения
            return {
                title: 'Новая задача',
                description: '',
                priority: TaskPriority.MEDIUM,
                category: TaskCategory.OTHER,
                language: 'ru',
            };
        }
    }

    /**
     * Извлечение текста из ответа Gemini
     */
    private extractTextFromResponse(data: any): string {
        try {
            return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        } catch {
            return '';
        }
    }
}

// Экспортируем синглтон
export const geminiClient = new GeminiClient();