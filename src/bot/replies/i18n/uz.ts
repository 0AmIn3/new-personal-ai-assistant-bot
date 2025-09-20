/**
 * Узбекские тексты и фразы для бота
 */
export const uz = {
    // Umumiy
    common: {
        error: '❌ Xatolik yuz berdi. Keyinroq urinib koʻring.',
        notFound: '❌ Topilmadi',
        success: '✅ Muvaffaqiyatli',
        cancelled: '❌ Bekor qilindi',
        loading: '⏳ Yuklanmoqda...',
        yes: 'Ha',
        no: 'Yoʻq',
        back: '⬅️ Orqaga',
        cancel: '❌ Bekor qilish',
        done: '✅ Tayyor',
        skip: '⏭ Oʻtkazib yuborish',
    },

    // Avtorizatsiya
    auth: {
        notRegistered: '❌ Siz tizimda roʻyxatdan oʻtmagansiz.\nTaklifnoma olish uchun administratorga murojaat qiling.',
        noPermission: '❌ Bu amalni bajarish uchun sizning huquqlaringiz yetarli emas.',
        ownerOnly: '❌ Bu buyruq faqat egalar uchun mavjud.',
        adminOnly: '❌ Bu buyruq faqat administratorlar uchun mavjud.',
        privateOnly: '❌ Bu buyruq faqat bot bilan shaxsiy xabarlarda mavjud.',
    },

    // Xush kelibsiz
    welcome: {
        start: `👋 Vazifalarni boshqarish tizimiga xush kelibsiz!

Men sizga yordam beraman:
• Vazifalar yaratish va boshqarish
• Muddatlarni kuzatish
• Ijrochilarni tayinlash
• Bildirishnomalar olish

Mavjud buyruqlarni koʻrish uchun /help dan foydalaning.`,

        registered: (name: string) => `✅ Xush kelibsiz, ${name}!
Siz tizimda muvaffaqiyatli roʻyxatdan oʻtdingiz.

Mavjud buyruqlar:
/my_tasks - sizning vazifalaringiz
/help - yordam`,
    },

    // Vazifalar
    tasks: {
        // Yaratish
        create: {
            start: '📝 Yaratmoqchi boʻlgan vazifa tavsifini yozing.\nMen sizning xabaringizni tahlil qilib, vazifa yaratishni taklif qilaman.',
            analyzing: '🤔 Vazifani tahlil qilmoqda...',
            preview: '📋 **Vazifani koʻrib chiqish:**',
            selectList: 'Vazifa uchun roʻyxatni tanlang:',
            selectAssignee: '👤 Ijrochini tanlang:',
            addFiles: '📎 Vazifaga fayllar biriktirmoqchimisiz?',
            waitingFiles: '📎 Vazifaga biriktirish uchun fayllarni yuborish.\n\nBarcha fayllar yuklangandan soʻng "Tayyor" tugmasini bosing',
            fileAdded: (name: string, count: number) => `✅ "${name}" fayli qoʻshildi!\nNavbatdagi fayllar: ${count}`,

            success: (title: string, list: string, assignee?: string) => {
                let message = `✅ **Vazifa yaratildi!**\n\n📌 ${title}\n📋 Roʻyxat: ${list}`;
                if (assignee) {
                    message += `\n👤 Ijrochi: ${assignee}`;
                }
                return message;
            },

            failed: '❌ Vazifani yaratib boʻlmadi. Keyinroq urinib koʻring.',
            alreadyCreating: '⚠️ Siz allaqachon vazifa yaratyapsiz.\nYangisini boshlashdan oldin uni tugating yoki "Bekor qilish" tugmasini bosing.',
        },

        // Koʻrish
        view: {
            title: (title: string) => `📌 **${title}**`,
            description: (desc: string) => `📝 **Tavsif:**\n${desc}`,
            priority: (priority: string) => {
                const emoji = {
                    'past': '🟢',
                    'oʻrta': '🟡',
                    'yuqori': '🟠',
                    'kritik': '🔴',
                }[priority] || '⚪';
                return `${emoji} **Ustuvorlik:** ${priority}`;
            },
            assignee: (name: string) => `👤 **Ijrochi:** ${name}`,
            status: (status: string) => {
                const emoji = {
                    'todo': '📋',
                    'in_progress': '⚡',
                    'in_review': '👀',
                    'done': '✅',
                }[status] || '📋';
                const name = {
                    'todo': 'Bajarilishi kerak',
                    'in_progress': 'Jarayonda',
                    'in_review': 'Tekshiruvda',
                    'done': 'Bajarildi',
                }[status] || status;
                return `${emoji} **Holat:** ${name}`;
            },
            dueDate: (date: Date) => `📅 **Muddat:** ${date.toLocaleDateString('uz-UZ')}`,
            overdue: '🔴 **MUDDATI OʻTGAN!**',
            attachments: (count: number) => `📎 **Fayllar:** ${count}`,
            noTasks: 'Sizda hali tayinlangan vazifalar yoʻq.',
        },

        // Tahrirlash
        edit: {
            selectField: 'Nimani oʻzgartirmoqchisiz?',
            enterName: '✏️ Vazifaning yangi nomini kiriting:',
            enterDescription: '📝 Vazifaning yangi tavsifini kiriting:',
            selectPriority: '🎯 Yangi ustuvorlikni tanlang:',
            selectStatus: '📊 Yangi holatni tanlang:',
            selectAssignee: '👤 Yangi ijrochini tanlang:',
            enterDueDate: '📅 Yangi muddat sanasini kiriting (KK.OO.YYYY):',

            success: '✅ Vazifa yangilandi!',
            failed: '❌ Vazifani yangilab boʻlmadi.',
        },

        // Qidiruv
        search: {
            prompt: '🔍 Vazifalarni qidirish uchun soʻrov kiriting (nom, tavsif yoki ID):',
            searching: '🔍 Vazifalarni qidirmoqda...',
            found: (count: number) => `📋 Topilgan vazifalar: ${count}`,
            notFound: '❌ Vazifalar topilmadi.',
            tooMany: 'Juda koʻp vazifalar topildi. Soʻrovni aniqlang.',
        },

        // Statistika
        stats: {
            title: '📊 **Vazifalar statistikasi**',
            total: (count: number) => `📋 Jami vazifalar: ${count}`,
            byStatus: '**Holat boʻyicha:**',
            byPriority: '**Ustuvorlik boʻyicha:**',
            overdue: (count: number) => `🔴 Muddati oʻtgan: ${count}`,
            dueToday: (count: number) => `📅 Bugun: ${count}`,
            dueThisWeek: (count: number) => `📆 Bu hafta: ${count}`,
        },

        // Muddatlar
        deadlines: {
            title: '📅 **Yaqinlashayotgan muddatlar**',
            today: '📌 **Bugun:**',
            tomorrow: '📌 **Ertaga:**',
            thisWeek: '📌 **Bu hafta:**',
            overdue: '🔴 **Muddati oʻtgan:**',
            noDeadlines: '✅ Yaqinlashayotgan muddatlar yoʻq.',
        },
    },

    // Bildirishnomalar
    notifications: {
        newTask: (title: string) => `📋 **Yangi vazifa:** ${title}`,
        taskAssigned: (title: string) => `👤 Sizga vazifa tayinlandi: ${title}`,

        reminder: {
            title: '⏰ **Muddat haqida eslatma!**',
            in24h: (title: string) => `📋 "${title}"\n⏰ Muddatga 24 soat qoldi!`,
            in6h: (title: string) => `📋 "${title}"\n⏰ Muddatga 6 soat qoldi!`,
            in2h: (title: string) => `📋 "${title}"\n🔴 Muddatga 2 soat qoldi!`,
            overdue: (title: string) => `🔴 "${title}"\n❌ Muddat tugadi!`,
        },

        digest: {
            morning: '☀️ **Xayrli tong! Bugungi vazifalaringiz:**',
            evening: '🌙 **Xayrli kech! Kun yakunlari:**',
            tasksToday: (count: number) => `📋 Bugungi vazifalar: ${count}`,
            tasksOverdue: (count: number) => `🔴 Muddati oʻtgan: ${count}`,
            tasksCompleted: (count: number) => `✅ Bugun bajarildi: ${count}`,
        },
    },

    // Tugmalar
    buttons: {
        // Vazifalar
        viewTask: '👁 Vazifani koʻrish',
        editTask: '✏️ Vazifani tahrirlash',
        deleteTask: '🗑 Vazifani oʻchirish',
        refreshTask: '🔄 Yangilash',
        moveToInProgress: '⚡ Ishga kirishish',
        moveToReview: '👀 Tekshiruvga',
        moveToDone: '✅ Bajarildi',
        assignToMe: '🙋‍♂️ Menga tayinlash',

        // Fayllar
        addFiles: '📎 Fayllarni biriktirish',
        skipFiles: '⏭ Fayllarni oʻtkazib yuborish',

        // Navigatsiya
        back: '⬅️ Orqaga',
        cancel: '❌ Bekor qilish',
        confirm: '✅ Tasdiqlash',
        yes: '✅ Ha',
        no: '❌ Yoʻq',
    },

    // Help buyruqlari
    help: {
        title: '🤖 **Mavjud buyruqlar:**',

        common: `📋 /my_tasks - sizning vazifalaringizni koʻrish
❓ /help - ushbu yordam`,

        owner: `🔧 **Egalar uchun buyruqlar:**
📝 /create_task - vazifa yaratish
📊 /stats - vazifalar statistikasi
📅 /deadlines - muddatlarni koʻrib chiqish
🔍 /search_tasks - vazifalarni qidirish va tahrirlash`,

        admin: `👑 **Administrator buyruqlari:**
👥 /users - foydalanuvchilarni boshqarish
🎫 /invite - taklifnoma yaratish
📊 /stats - tizim statistikasi`,

        usage: `**Foydalanish:**
• Vazifalar yaratish uchun shaxsiy xabarlarda /create_task dan foydalaning
• Vazifalarni ovozli xabarlar orqali yaratish mumkin
• Vazifalarni boshqarish uchun inline tugmalardan foydalaning`,
    },

    // Xatolar
    errors: {
        general: '❌ Xatolik yuz berdi. Keyinroq urinib koʻring.',
        notFound: '❌ Topilmadi.',
        invalidInput: '❌ Notoʻgʻri maʼlumotlar.',
        timeout: '❌ Kutish vaqti tugadi.',
        networkError: '❌ Tarmoq xatosi. Ulanishni tekshiring.',

        planka: '❌ Planka bilan ishlashda xatolik.',
        gemini: '❌ Matnni tahlil qilishda xatolik.',
        database: '❌ Maʼlumotlar bazasi xatosi.',
    },
};