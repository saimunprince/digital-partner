import type { PartnerTranslations } from './types'

/**
 * The product's own strings — a file upstream does not have, so it never
 * conflicts. See partner/types.ts.
 */
export const partnerJa: PartnerTranslations = {
  voicePicker: {
    title: '音声',
    search: '音声を検索',
    allLanguages: 'すべての言語',
    allGenders: 'すべて',
    male: '男性',
    female: '女性',
    preview: '試聴',
    playing: '再生中…',
    previewFailed: 'その音声を再生できませんでした。',
    use: '使う',
    selected: '使用中',
    loadFailed: '音声一覧を読み込めませんでした。'
  },
  surfaces: {
    heading: '移動',
    automations: '自動化',
    channels: 'チャンネル',
    webhooks: 'Webhook',
    artifacts: '成果物',
    commandCenter: 'コマンドセンター',
    profiles: 'プロファイル',
    agents: '生成ツリー',
    memoryGraph: 'メモリグラフ'
  },
  nav: {
    home: 'ホーム',
    chat: 'チャット',
    tasks: 'タスク',
    calendar: 'カレンダー',
    memory: 'メモリー',
    skills: 'スキル',
    activity: 'アクティビティ',
    integrations: '連携',
    settings: '設定'
  },
  home: {
    title: 'ホーム',
    emptyTitle: '今日の全体像。',
    emptyDesc: '優先事項・予定・進行中の作業がここに集まります。',
    greetingMorning: 'おはようございます。',
    greetingAfternoon: 'こんにちは。',
    greetingEvening: 'こんばんは。',
    subtitle: '今日は何をしましょうか？',
    talk: '話す',
    newConversation: '新しい会話',
    activeNow: '実行中',
    nothingActive: '現在実行中の作業はありません。',
    recent: '前回の続きから',
    automations: '自動化',
    noAutomations: '予定された自動化はありません。',
    nextRun: (when: string) => `次回実行 ${when}`,
    schedule: '今日',
    scheduleConnect: 'カレンダーを接続すると今日の予定が表示されます。',
    scheduleConnectCta: '連携を開く',
    askPlaceholder: '何でも聞いてください。やることを伝えても大丈夫です',
    askHint: 'Enter で開始',
    talkHint: 'オーブをタップして話しかけてください',
    talkAria: '話しはじめる',
    openChat: '文字で入力する',
    endVoice: '終了',
    interruptHint: '話しかければ割り込めます',
    voiceStatus: {
      idle: '待機中',
      listening: '聞いています',
      transcribing: '文字起こし中',
      thinking: '考えています',
      speaking: '話しています'
    }
  },
  tasks: {
    title: 'タスク',
    addPlaceholder: '何をしますか？',
    add: '追加',
    addFailed: 'タスクを追加できませんでした。',
    loadFailed: 'ボードを読み込めませんでした。',
    done: '完了',
    reopen: '再開',
    complete: '完了にする',
    remove: '削除',
    groups: {
      now: '進行中',
      next: '次に',
      waiting: '待機中',
      done: '完了'
    },
    emptyTitle: 'タスクはまだありません。',
    emptyDesc: '{brand} にタスク作成を頼むか、ここで追加できます。'
  },
  calendar: {
    title: 'カレンダー',
    emptyTitle: 'カレンダー未接続。',
    emptyDesc: '連携でカレンダーを接続すると予定が表示されます。'
  },
  memory: {
    edit: '編集',
    forget: '忘れる',
    forgetConfirm: title => `「${title}」を忘れますか？`,
    forgetFailed: '忘れられませんでした。',
    saveFailed: '変更を保存できませんでした。',
    title: 'メモリー',
    emptyTitle: 'まだ何も記憶していません。',
    emptyDesc: '{brand} が学んだ内容はここに保存され、いつでも編集できます。',
    remembered: 'あなたについて覚えていること',
    learned: 'スキルと知識',
    graphView: 'グラフ表示を開く',
    filesTitle: 'メモリーファイル',
    filesDesc: (memory: string, user: string) => `ノート ${memory} · あなたについて ${user}`,
    provider: (name: string) => `プロバイダー: ${name}`,
    sourceMemory: 'ノート',
    sourceProfile: 'あなたについて'
  },
  activity: {
    title: 'アクティビティ',
    emptyTitle: 'アクティビティはまだありません。',
    emptyDesc: '{brand} が行った操作がタイムラインとして表示されます。',
    conversation: '会話',
    automation: '自動化',
    toolRuns: (count: number) => `ツール実行 ${count} 件`
  },
  mcp: {
    unfinished: (names: string) =>
      `保存する前にプレースホルダーのパスを入力してください: ${names}。/path/to/dir のままのサーバーは起動できず、数秒ごとに再試行し続けます。`
  },
  integrations: {
    title: '連携',
    emptyTitle: 'あなたの世界とつなぐ。',
    emptyDesc: 'チャンネル・コネクタ・アカウントをここで管理します。',
    channels: 'チャンネル',
    channelsDesc: 'Telegram・Slack・Discord・メールなどから {brand} に届きます。',
    connectors: 'コネクタ',
    connectorsDesc: '{brand} に新しい能力を与える MCP サーバーとスキル。',
    accounts: 'アカウント',
    accountsDesc: 'モデルプロバイダーと API キー。',
    automation: '自動化',
    automationDesc: 'あなたの代わりに動く定期ジョブと Webhook。',
    open: '開く'
  }
}
