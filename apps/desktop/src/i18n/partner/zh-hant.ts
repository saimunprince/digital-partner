import type { PartnerTranslations } from './types'

/**
 * The product's own strings — a file upstream does not have, so it never
 * conflicts. See partner/types.ts.
 */
export const partnerZhHant: PartnerTranslations = {
  voicePicker: {
    title: '語音',
    search: '搜尋語音',
    allLanguages: '所有語言',
    allGenders: '全部',
    male: '男聲',
    female: '女聲',
    preview: '試聽',
    playing: '播放中…',
    previewFailed: '無法播放該語音。',
    use: '使用',
    selected: '使用中',
    loadFailed: '無法載入語音清單。'
  },
  surfaces: {
    heading: '前往',
    automations: '自動化',
    channels: '頻道',
    webhooks: 'Webhook',
    artifacts: '產物',
    commandCenter: '命令中心',
    profiles: '設定檔',
    agents: '生成樹',
    memoryGraph: '記憶圖譜'
  },
  nav: {
    home: '主頁',
    chat: '聊天',
    tasks: '任務',
    calendar: '日曆',
    memory: '記憶',
    skills: '技能',
    activity: '動態',
    integrations: '整合',
    settings: '設定'
  },
  home: {
    title: '主頁',
    emptyTitle: '一覽你的一天。',
    emptyDesc: '優先事項、日程與進行中的工作將匯集於此。',
    greetingMorning: '早安。',
    greetingAfternoon: '午安。',
    greetingEvening: '晚安。',
    subtitle: '今天想完成什麼？',
    talk: '語音',
    newConversation: '新對話',
    activeNow: '進行中',
    nothingActive: '目前沒有正在執行的工作。',
    recent: '接續上次的對話',
    automations: '自動化',
    noAutomations: '暫無排程中的自動化。',
    nextRun: (when: string) => `下次執行 ${when}`,
    schedule: '今天',
    scheduleConnect: '連接日曆後可在此查看今日安排。',
    scheduleConnectCta: '開啟整合',
    askPlaceholder: '問我任何事，或告訴我要做什麼',
    askHint: '按 Enter 開始',
    talkHint: '點擊光球，直接說話',
    talkAria: '開始說話',
    openChat: '改用文字',
    endVoice: '結束',
    interruptHint: '直接說話即可打斷',
    voiceStatus: {
      idle: '就緒',
      listening: '正在聆聽',
      transcribing: '正在轉寫',
      thinking: '正在思考',
      speaking: '正在說話'
    }
  },
  tasks: {
    title: '任務',
    addPlaceholder: '需要做什麼？',
    add: '新增',
    addFailed: '無法新增該任務。',
    loadFailed: '無法載入看板。',
    done: '已完成',
    reopen: '重新開啟',
    complete: '標記完成',
    remove: '刪除',
    groups: {
      now: '進行中',
      next: '接下來',
      waiting: '等待中',
      done: '已完成'
    },
    emptyTitle: '暫無任務。',
    emptyDesc: '請 {brand} 建立任務，或在此新增。'
  },
  calendar: {
    title: '日曆',
    emptyTitle: '尚未連接日曆。',
    emptyDesc: '在「整合」中連接日曆即可查看日程。'
  },
  memory: {
    edit: '編輯',
    forget: '忘記',
    forgetConfirm: title => `忘記「${title}」？`,
    forgetFailed: '無法忘記該項目。',
    saveFailed: '無法儲存該變更。',
    title: '記憶',
    emptyTitle: '還沒有記憶內容。',
    emptyDesc: '{brand} 了解到的工作與偏好保存在這裡，隨時可以編輯。',
    remembered: '關於你的記憶',
    learned: '技能與知識',
    graphView: '開啟圖譜檢視',
    filesTitle: '記憶檔案',
    filesDesc: (memory: string, user: string) => `筆記 ${memory} · 關於你 ${user}`,
    provider: (name: string) => `提供者：${name}`,
    sourceMemory: '筆記',
    sourceProfile: '關於你'
  },
  activity: {
    title: '動態',
    emptyTitle: '暫無動態。',
    emptyDesc: '{brand} 代你執行的操作會以時間線形式展示。',
    conversation: '對話',
    automation: '自動化',
    toolRuns: (count: number) => `${count} 次工具呼叫`
  },
  mcp: {
    unfinished: (names: string) =>
      `儲存前請填寫佔位路徑：${names}。仍為 /path/to/dir 的伺服器無法啟動，並會每隔幾秒無限重試。`
  },
  integrations: {
    title: '整合',
    emptyTitle: '連接你的世界。',
    emptyDesc: '在這裡管理渠道、連接器與帳號。',
    channels: '渠道',
    channelsDesc: '透過 Telegram、Slack、Discord、電子郵件等聯繫 {brand}。',
    connectors: '連接器',
    connectorsDesc: '為 {brand} 提供新能力的 MCP 伺服器與技能。',
    accounts: '帳號',
    accountsDesc: '模型提供者與 API 金鑰。',
    automation: '自動化',
    automationDesc: '代你執行的排程工作與 Webhook。',
    open: '開啟'
  }
}
