import type { PartnerTranslations } from './types'

/**
 * The product's own strings — a file upstream does not have, so it never
 * conflicts. See partner/types.ts.
 */
export const partnerEn: PartnerTranslations = {
  voicePicker: {
    title: 'Voice',
    search: 'Search voices',
    allLanguages: 'All languages',
    allGenders: 'All',
    male: 'Male',
    female: 'Female',
    preview: 'Preview',
    playing: 'Playing…',
    previewFailed: 'Could not play that voice.',
    use: 'Use',
    selected: 'In use',
    loadFailed: 'Could not load the voice list.'
  },
  surfaces: {
    heading: 'Go to',
    automations: 'Automations',
    channels: 'Channels',
    webhooks: 'Webhooks',
    artifacts: 'Artifacts',
    commandCenter: 'Command Center',
    profiles: 'Profiles',
    agents: 'Spawn tree',
    memoryGraph: 'Memory graph'
  },
  nav: {
    home: 'Home',
    chat: 'Chat',
    tasks: 'Tasks',
    calendar: 'Calendar',
    memory: 'Memory',
    skills: 'Skills',
    activity: 'Activity',
    integrations: 'Integrations',
    settings: 'Settings'
  },
  home: {
    title: 'Home',
    emptyTitle: 'Your day, at a glance.',
    emptyDesc: 'Priorities, schedule, and active work will gather here.',
    greetingMorning: 'Good morning.',
    greetingAfternoon: 'Good afternoon.',
    greetingEvening: 'Good evening.',
    subtitle: 'What would you like to get done?',
    talk: 'Talk',
    newConversation: 'New conversation',
    activeNow: 'Active now',
    nothingActive: 'Nothing running right now.',
    recent: 'Pick up where you left off',
    automations: 'Automations',
    noAutomations: 'No automations scheduled.',
    nextRun: when => `Next run ${when}`,
    schedule: 'Today',
    scheduleConnect: 'Connect your calendar to see your day here.',
    scheduleConnectCta: 'Open integrations',
    askPlaceholder: 'Ask me anything, or tell me what to do',
    askHint: 'Press Enter to start',
    talkHint: 'Tap the orb and just talk',
    talkAria: 'Start talking',
    openChat: 'Type instead',
    endVoice: 'End',
    interruptHint: 'Just speak to interrupt',
    voiceStatus: {
      idle: 'Ready when you are',
      listening: 'Listening',
      transcribing: 'Getting that down',
      thinking: 'Thinking',
      speaking: 'Speaking'
    }
  },
  tasks: {
    title: 'Tasks',
    addPlaceholder: 'What needs doing?',
    add: 'Add',
    addFailed: 'Could not add that task.',
    loadFailed: 'Could not load the board.',
    done: 'Done',
    reopen: 'Reopen',
    complete: 'Mark done',
    remove: 'Delete',
    groups: {
      now: 'Now',
      next: 'Next',
      waiting: 'Waiting',
      done: 'Done'
    },
    emptyTitle: 'Nothing on your plate yet.',
    emptyDesc: 'Ask {brand} to create a task, or add one here.'
  },
  calendar: {
    title: 'Calendar',
    emptyTitle: 'No schedule connected.',
    emptyDesc: 'Connect a calendar in Integrations to see your agenda.'
  },
  memory: {
    title: 'Memory',
    emptyTitle: 'Nothing remembered yet.',
    emptyDesc: 'What {brand} learns about your work and preferences lives here — always yours to edit.',
    remembered: 'What I remember about you',
    learned: 'Skills and knowledge',
    graphView: 'Open graph view',
    filesTitle: 'Memory files',
    filesDesc: (memory, user) => `Notes ${memory} · About you ${user}`,
    provider: name => `Provider: ${name}`,
    sourceMemory: 'Note',
    sourceProfile: 'About you'
  },
  activity: {
    title: 'Activity',
    emptyTitle: 'No activity yet.',
    emptyDesc: 'Actions {brand} takes on your behalf appear here as a timeline.',
    conversation: 'Conversation',
    automation: 'Automation',
    toolRuns: count => `${count} tool ${count === 1 ? 'run' : 'runs'}`
  },
  integrations: {
    title: 'Integrations',
    emptyTitle: 'Connect your world.',
    emptyDesc: 'Channels, connectors, and accounts will be managed here.',
    channels: 'Channels',
    channelsDesc: 'Reach {brand} from Telegram, Slack, Discord, email, and more.',
    connectors: 'Connectors',
    connectorsDesc: 'MCP servers and skills that give {brand} new abilities.',
    accounts: 'Accounts',
    accountsDesc: 'Model providers and API keys.',
    automation: 'Automation',
    automationDesc: 'Scheduled jobs and webhooks that run on your behalf.',
    open: 'Open'
  }
}
