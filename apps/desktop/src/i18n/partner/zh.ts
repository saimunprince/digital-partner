import type { PartnerTranslations } from './types'

/**
 * The product's own strings — a file upstream does not have, so it never
 * conflicts. See partner/types.ts.
 */
export const partnerZh: PartnerTranslations = {
  voicePicker: {
    title: '语音',
    search: '搜索语音',
    allLanguages: '所有语言',
    allGenders: '全部',
    male: '男声',
    female: '女声',
    preview: '试听',
    playing: '播放中…',
    previewFailed: '无法播放该语音。',
    use: '使用',
    selected: '使用中',
    loadFailed: '无法加载语音列表。'
  },
  surfaces: {
    heading: '前往',
    automations: '自动化',
    channels: '频道',
    webhooks: 'Webhook',
    artifacts: '产物',
    commandCenter: '命令中心',
    profiles: '配置文件',
    agents: '生成树',
    memoryGraph: '记忆图谱'
  },
  nav: {
    home: '主页',
    chat: '聊天',
    tasks: '任务',
    calendar: '日历',
    memory: '记忆',
    skills: '技能',
    activity: '动态',
    integrations: '集成',
    settings: '设置'
  },
  home: {
    title: '主页',
    emptyTitle: '一览你的一天。',
    emptyDesc: '优先事项、日程和进行中的工作将汇集于此。',
    greetingMorning: '早上好。',
    greetingAfternoon: '下午好。',
    greetingEvening: '晚上好。',
    subtitle: '今天想完成什么？',
    talk: '语音',
    newConversation: '新对话',
    activeNow: '进行中',
    nothingActive: '当前没有正在运行的任务。',
    recent: '继续之前的对话',
    automations: '自动化',
    noAutomations: '暂无计划中的自动化。',
    nextRun: (when: string) => `下次运行 ${when}`,
    schedule: '今天',
    scheduleConnect: '连接日历后可在此查看今日安排。',
    scheduleConnectCta: '打开集成',
    askPlaceholder: '问我任何事，或告诉我要做什么',
    askHint: '按 Enter 开始',
    talkHint: '点击光球，直接说话',
    talkAria: '开始说话',
    openChat: '改用文字',
    endVoice: '结束',
    interruptHint: '直接说话即可打断',
    voiceStatus: {
      idle: '就绪',
      listening: '正在聆听',
      transcribing: '正在转写',
      thinking: '正在思考',
      speaking: '正在说话'
    }
  },
  tasks: {
    title: '任务',
    addPlaceholder: '需要做什么？',
    add: '添加',
    addFailed: '无法添加该任务。',
    loadFailed: '无法加载看板。',
    done: '已完成',
    reopen: '重新打开',
    complete: '标记完成',
    remove: '删除',
    groups: {
      now: '进行中',
      next: '接下来',
      waiting: '等待中',
      done: '已完成'
    },
    emptyTitle: '暂无任务。',
    emptyDesc: '让 {brand} 创建任务，或在此添加。'
  },
  calendar: {
    title: '日历',
    emptyTitle: '尚未连接日历。',
    emptyDesc: '在“集成”中连接日历即可查看日程。'
  },
  memory: {
    edit: '编辑',
    forget: '忘记',
    forgetConfirm: title => `忘记“${title}”？`,
    forgetFailed: '无法忘记该条目。',
    saveFailed: '无法保存该更改。',
    title: '记忆',
    emptyTitle: '还没有记忆内容。',
    emptyDesc: '{brand} 了解到的工作与偏好保存在这里，随时可以编辑。',
    remembered: '关于你的记忆',
    learned: '技能与知识',
    graphView: '打开图谱视图',
    filesTitle: '记忆文件',
    filesDesc: (memory: string, user: string) => `笔记 ${memory} · 关于你 ${user}`,
    provider: (name: string) => `提供方：${name}`,
    sourceMemory: '笔记',
    sourceProfile: '关于你'
  },
  activity: {
    title: '动态',
    emptyTitle: '暂无动态。',
    emptyDesc: '{brand} 代你执行的操作会以时间线形式展示。',
    conversation: '对话',
    automation: '自动化',
    toolRuns: (count: number) => `${count} 次工具调用`
  },
  mcp: {
    unfinished: (names: string) =>
      `保存前请填写占位路径：${names}。仍为 /path/to/dir 的服务器无法启动，并会每隔几秒无限重试。`
  },
  integrations: {
    title: '集成',
    emptyTitle: '连接你的世界。',
    emptyDesc: '在这里管理渠道、连接器和账号。',
    channels: '渠道',
    channelsDesc: '通过 Telegram、Slack、Discord、邮件等联系 {brand}。',
    connectors: '连接器',
    connectorsDesc: '为 {brand} 提供新能力的 MCP 服务器与技能。',
    accounts: '账号',
    accountsDesc: '模型提供方与 API 密钥。',
    automation: '自动化',
    automationDesc: '代你运行的定时任务与 Webhook。',
    open: '打开'
  }
}
