import type { Translations } from '../types'

/**
 * The product's own strings.
 *
 * Kept OUT of the shared `Translations` interface on purpose. Upstream owns
 * that file and edits it constantly; every key of ours living inside it is a
 * line that conflicts on every merge for no design reason. `Translations`
 * carries a single reference to this instead.
 */
export interface PartnerTranslations {
  nav: {
    home: string
    chat: string
    tasks: string
    calendar: string
    memory: string
    skills: string
    activity: string
    integrations: string
    settings: string
  }
  home: {
    title: string
    emptyTitle: string
    emptyDesc: string
    greetingMorning: string
    greetingAfternoon: string
    greetingEvening: string
    subtitle: string
    talk: string
    newConversation: string
    activeNow: string
    nothingActive: string
    recent: string
    automations: string
    noAutomations: string
    nextRun: (when: string) => string
    schedule: string
    scheduleConnect: string
    scheduleConnectCta: string
    askPlaceholder: string
    askHint: string
    talkHint: string
    talkAria: string
    openChat: string
    endVoice: string
    interruptHint: string
    voiceStatus: Record<'idle' | 'listening' | 'speaking' | 'thinking' | 'transcribing', string>
  }
  tasks: {
    title: string
    addPlaceholder: string
    add: string
    addFailed: string
    loadFailed: string
    done: string
    reopen: string
    complete: string
    remove: string
    groups: {
      now: string
      next: string
      waiting: string
      done: string
    }
    emptyTitle: string
    emptyDesc: string
  }
  calendar: {
    title: string
    emptyTitle: string
    emptyDesc: string
  }
  memory: {
      edit: string
      forget: string
      forgetConfirm: (title: string) => string
      forgetFailed: string
      saveFailed: string
    title: string
    emptyTitle: string
    emptyDesc: string
    remembered: string
    learned: string
    graphView: string
    filesTitle: string
    filesDesc: (memory: string, user: string) => string
    provider: (name: string) => string
    sourceMemory: string
    sourceProfile: string
  }
  activity: {
    title: string
    emptyTitle: string
    emptyDesc: string
    conversation: string
    automation: string
    toolRuns: (count: number) => string
  }
  mcp: {
    /** Named servers still holding the starter placeholder. */
    unfinished: (names: string) => string
  }
  integrations: {
    title: string
    emptyTitle: string
    emptyDesc: string
    channels: string
    channelsDesc: string
    connectors: string
    connectorsDesc: string
    accounts: string
    accountsDesc: string
    automation: string
    automationDesc: string
    open: string
  }

  voicePicker: {
    title: string
    search: string
    allLanguages: string
    allGenders: string
    male: string
    female: string
    preview: string
    playing: string
    previewFailed: string
    use: string
    selected: string
    loadFailed: string
  }

  surfaces: {
    heading: string
    automations: string
    channels: string
    webhooks: string
    artifacts: string
    commandCenter: string
    profiles: string
    agents: string
    memoryGraph: string
  }
}

/**
 * What the app actually reads: upstream's catalogue plus ours.
 *
 * Composed rather than merged into `Translations`, so that interface stays
 * byte-identical to upstream and never conflicts on a pull.
 */
export type AppTranslations = { partner: PartnerTranslations } & Translations
