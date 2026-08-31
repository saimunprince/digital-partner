import type { PartnerTranslations } from './types'

/**
 * The product's own strings — a file upstream does not have, so it never
 * conflicts. See partner/types.ts.
 */
export const partnerAr: PartnerTranslations = {
  voicePicker: {
    title: 'الصوت',
    search: 'ابحث عن صوت',
    allLanguages: 'كل اللغات',
    allGenders: 'الكل',
    male: 'ذكر',
    female: 'أنثى',
    preview: 'استماع',
    playing: 'قيد التشغيل…',
    previewFailed: 'تعذّر تشغيل هذا الصوت.',
    use: 'استخدام',
    selected: 'قيد الاستخدام',
    loadFailed: 'تعذّر تحميل قائمة الأصوات.'
  },
  surfaces: {
    heading: 'الانتقال إلى',
    automations: 'الأتمتة',
    channels: 'القنوات',
    webhooks: 'Webhooks',
    artifacts: 'المخرجات',
    commandCenter: 'مركز الأوامر',
    profiles: 'الملفات الشخصية',
    agents: 'شجرة التفريع',
    memoryGraph: 'خريطة الذاكرة'
  },
  nav: {
    home: 'الرئيسية',
    chat: 'المحادثة',
    tasks: 'المهام',
    calendar: 'التقويم',
    memory: 'الذاكرة',
    skills: 'المهارات',
    activity: 'النشاط',
    integrations: 'التكاملات',
    settings: 'الإعدادات'
  },
  home: {
    title: 'الرئيسية',
    emptyTitle: 'يومك في لمحة.',
    emptyDesc: 'ستتجمع هنا الأولويات والجدول والأعمال الجارية.',
    greetingMorning: 'صباح الخير.',
    greetingAfternoon: 'مساء الخير.',
    greetingEvening: 'مساء الخير.',
    subtitle: 'ماذا تود أن تنجز اليوم؟',
    talk: 'تحدث',
    newConversation: 'محادثة جديدة',
    activeNow: 'قيد التنفيذ',
    nothingActive: 'لا شيء قيد التشغيل الآن.',
    recent: 'تابع من حيث توقفت',
    automations: 'الأتمتة',
    noAutomations: 'لا أتمتة مجدولة.',
    nextRun: (when: string) => `التشغيل القادم ${when}`,
    schedule: 'اليوم',
    scheduleConnect: 'اربط تقويمك لعرض يومك هنا.',
    scheduleConnectCta: 'فتح التكاملات',
    askPlaceholder: 'اسألني أي شيء، أو أخبرني بما تريد إنجازه',
    askHint: 'اضغط Enter للبدء',
    talkHint: 'انقر الكرة وتحدث مباشرة',
    talkAria: 'ابدأ التحدث',
    openChat: 'الكتابة بدلاً من ذلك',
    endVoice: 'إنهاء',
    interruptHint: 'تحدث لتقاطع',
    voiceStatus: {
      idle: 'جاهز',
      listening: 'أستمع',
      transcribing: 'أدوّن ما قلته',
      thinking: 'أفكر',
      speaking: 'أتحدث'
    }
  },
  tasks: {
    title: 'المهام',
    addPlaceholder: 'ما الذي يجب إنجازه؟',
    add: 'إضافة',
    addFailed: 'تعذّرت إضافة المهمة.',
    loadFailed: 'تعذّر تحميل اللوحة.',
    done: 'مكتمل',
    reopen: 'إعادة فتح',
    complete: 'وضع علامة اكتمال',
    remove: 'حذف',
    groups: {
      now: 'الآن',
      next: 'التالي',
      waiting: 'قيد الانتظار',
      done: 'مكتمل'
    },
    emptyTitle: 'لا مهام بعد.',
    emptyDesc: 'اطلب من {brand} إنشاء مهمة، أو أضفها هنا.'
  },
  calendar: {
    title: 'التقويم',
    emptyTitle: 'لا تقويم متصل.',
    emptyDesc: 'اربط تقويماً من التكاملات لعرض جدولك.'
  },
  memory: {
    title: 'الذاكرة',
    emptyTitle: 'لا شيء محفوظ بعد.',
    emptyDesc: 'ما يتعلمه {brand} عن عملك وتفضيلاتك يُحفظ هنا — ويمكنك تعديله دائماً.',
    remembered: 'ما أتذكره عنك',
    learned: 'المهارات والمعرفة',
    graphView: 'فتح عرض الرسم البياني',
    filesTitle: 'ملفات الذاكرة',
    filesDesc: (memory: string, user: string) => `ملاحظات ${memory} · عنك ${user}`,
    provider: (name: string) => `المزود: ${name}`,
    sourceMemory: 'ملاحظة',
    sourceProfile: 'عنك'
  },
  activity: {
    title: 'النشاط',
    emptyTitle: 'لا نشاط بعد.',
    emptyDesc: 'تظهر هنا الإجراءات التي ينفذها {brand} نيابة عنك كخط زمني.',
    conversation: 'محادثة',
    automation: 'أتمتة',
    toolRuns: (count: number) => `${count} تشغيل أداة`
  },
  integrations: {
    title: 'التكاملات',
    emptyTitle: 'اربط عالمك.',
    emptyDesc: 'تُدار هنا القنوات والموصلات والحسابات.',
    channels: 'القنوات',
    channelsDesc: 'تواصل مع {brand} عبر تيليجرام وسلاك وديسكورد والبريد وغيرها.',
    connectors: 'الموصلات',
    connectorsDesc: 'خوادم MCP والمهارات التي تمنح {brand} قدرات جديدة.',
    accounts: 'الحسابات',
    accountsDesc: 'مزودو النماذج ومفاتيح API.',
    automation: 'الأتمتة',
    automationDesc: 'المهام المجدولة وخطافات الويب التي تعمل نيابة عنك.',
    open: 'فتح'
  }
}
