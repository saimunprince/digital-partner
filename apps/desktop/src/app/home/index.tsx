import { useStore } from '@nanostores/react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'

import { PAGE_INSET_X } from '@/app/layout-constants'
import { openSession, openSessionIntentFromModifiers } from '@/app/open-session'
import { CALENDAR_ROUTE, INTEGRATIONS_ROUTE, navigateToWorkspacePage, NEW_CHAT_ROUTE } from '@/app/routes'
import { PresenceOrb } from '@/components/presence/presence-orb'
import { Button } from '@/components/ui/button'
import { getCronJobs } from '@/hermes'
import { useI18n } from '@/i18n'
import { chatMessageText } from '@/lib/chat-messages'
import { sessionTitle } from '@/lib/chat-runtime'
import { CalendarDays, Clock } from '@/lib/icons'
import { useKeybindHint } from '@/lib/keybinds/use-keybind-hint'
import { relativeTime } from '@/lib/time'
import { cn } from '@/lib/utils'
import { $activeProfile } from '@/store/profile'
import { $sessions } from '@/store/session'
import { $workingSessionIds } from '@/store/session-states'
import type { SessionInfo } from '@/types/hermes'

import { greetingKey } from './greeting'
import { useHomeVoice } from './use-home-voice'

const RECENT_LIMIT = 4
const AUTOMATION_LIMIT = 3

/** One of the three panels in the day band. Equal weight, no nested boxes —
 *  a label, a hairline, and its content. */
function Panel({
  action,
  children,
  title
}: {
  action?: React.ReactNode
  children: React.ReactNode
  title: string
}) {
  return (
    <section className="flex min-w-0 flex-col">
      <div className="flex items-baseline justify-between gap-2 border-b border-(--ui-stroke-tertiary) pb-2">
        <h2 className="text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-(--ui-text-tertiary)">{title}</h2>
        {action}
      </div>
      <div className="pt-2.5">{children}</div>
    </section>
  )
}

function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="text-xs leading-relaxed text-(--ui-text-tertiary)">{children}</p>
}

/**
 * The landing surface. Composed as one stage that owns the frame: the assistant
 * (presence + greeting + a real place to start talking) holds the upper half,
 * and the day sits beneath it as three panels of equal weight. Every value is
 * live — sessions, running work, scheduled automations.
 */
export function HomeView() {
  const { t } = useI18n()
  const copy = t.partner.home
  const navigate = useNavigate()
  const sessions = useStore($sessions)
  const workingSessionIds = useStore($workingSessionIds)
  const activeProfile = useStore($activeProfile)
  const voiceHint = useKeybindHint('composer.voice')
  const voice = useHomeVoice()

  const cronJobs = useQuery({
    queryKey: ['home', 'cron-jobs', activeProfile],
    queryFn: () => getCronJobs(),
    refetchInterval: 5 * 60 * 1000,
    retry: false
  })

  const sessionsById = new Map(sessions.map(session => [session.id, session]))
  const working = workingSessionIds.map(id => sessionsById.get(id)).filter((s): s is SessionInfo => Boolean(s))

  const recent = sessions
    .filter(session => !session.archived)
    .slice()
    .sort((a, b) => b.last_active - a.last_active)
    .slice(0, RECENT_LIMIT)

  const upcoming = (cronJobs.data ?? [])
    .filter(job => job.enabled && job.next_run_at)
    .sort((a, b) => String(a.next_run_at).localeCompare(String(b.next_run_at)))
    .slice(0, AUTOMATION_LIMIT)

  const openRecent = (session: SessionInfo) => (event: React.MouseEvent) =>
    openSession(session.id, navigate, openSessionIntentFromModifiers(event))

  return (
    <div className={cn('flex h-full flex-col overflow-y-auto', PAGE_INSET_X)}>
      <div className="mx-auto flex w-full max-w-[64rem] flex-1 flex-col">
        {/* The assistant owns the upper half — presence, greeting, and the one
            place the conversation starts. */}
        <header
          className={cn(
            'flex flex-1 flex-col items-center justify-center text-center transition-all duration-300',
            voice.active ? 'gap-8 py-10' : 'gap-7 py-14'
          )}
        >
          {/* The orb is the control: this surface is for talking. Typing has
              its own home in Chat. */}
          <button
            aria-label={copy.talkAria}
            className="presence-orb-button cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-4 focus-visible:ring-offset-transparent"
            onClick={voice.toggle}
            type="button"
          >
            <PresenceOrb size="hero" />
          </button>

          {voice.active && (
            // Keyed on the status so each change re-runs the entrance: the
            // label reads as the assistant changing state, not as text swapping.
            <p
              className={cn(
                'presence-say -mt-4 text-[0.6875rem] uppercase tracking-[0.18em] text-(--ui-text-tertiary)',
                voice.status === 'listening' && 'presence-attend'
              )}
              key={voice.status}
            >
              {copy.voiceStatus[voice.status]}
            </p>
          )}

          {!voice.active && (
            <div>
              <h1 className="text-voice text-[2.5rem] leading-[1.1] text-(--ui-text-primary)">
                {copy[greetingKey(new Date().getHours())]}
              </h1>
              <p className="pt-2 text-sm text-(--ui-text-secondary)">{copy.subtitle}</p>
            </div>
          )}

          <div className="flex min-h-[3.5rem] flex-col items-center gap-2">
            {voice.active ? (
              <div className="flex w-full max-w-[40rem] flex-col items-center gap-5">
                {/* Both sides, weighted the way a conversation is heard: your
                    words as context, its answer as the thing being said. */}
                {voice.utterance && (
                  <p
                    className="presence-say text-center text-[0.8125rem] leading-relaxed text-(--ui-text-tertiary)"
                    key={voice.utterance.id}
                  >
                    {chatMessageText(voice.utterance)}
                  </p>
                )}
                {voice.reply && (
                  <p
                    className="presence-say text-center text-[1.0625rem] leading-[1.7] text-(--ui-text-primary)"
                    key={voice.reply.id}
                  >
                    {chatMessageText(voice.reply)}
                  </p>
                )}

                <div className="flex flex-col items-center gap-2 pt-2">
                  <Button onClick={voice.stop} size="sm" variant="secondary">
                    {copy.endVoice}
                  </Button>
                  <span className="text-[0.6875rem] text-(--ui-text-tertiary)">{copy.interruptHint}</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <p className="text-xs text-(--ui-text-tertiary)">
                  {copy.talkHint}
                  {voiceHint ? ` · ${voiceHint}` : ''}
                </p>
                <Button onClick={() => navigateToWorkspacePage(navigate, NEW_CHAT_ROUTE)} size="xs" variant="text">
                  {copy.openChat}
                </Button>
              </div>
            )}
          </div>
        </header>

        {/* The day: three panels of equal weight across the frame. */}
        {/* Hidden outright while talking, not just faded: an invisible band
            still holds its space, which pushed the conversation off centre. */}
        <div className={cn('grid grid-cols-1 gap-x-10 gap-y-8 pb-12 md:grid-cols-3', voice.active && 'hidden')}>
          <Panel title={copy.schedule}>
            <Quiet>{copy.scheduleConnect}</Quiet>
            <Button
              className="mt-2"
              onClick={() => navigateToWorkspacePage(navigate, INTEGRATIONS_ROUTE)}
              size="xs"
              variant="outline"
            >
              <CalendarDays />
              {copy.scheduleConnectCta}
            </Button>
          </Panel>

          <Panel title={working.length > 0 ? copy.activeNow : copy.recent}>
            {(working.length > 0 ? working : recent).length === 0 ? (
              <Quiet>{copy.nothingActive}</Quiet>
            ) : (
              <ul className="flex flex-col">
                {(working.length > 0 ? working : recent).map(session => (
                  <li key={session.id}>
                    <button
                      className="flex w-full cursor-pointer items-baseline gap-3 rounded-md py-1 text-left transition-colors duration-100 hover:bg-(--chrome-action-hover)"
                      onClick={openRecent(session)}
                      type="button"
                    >
                      <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-(--ui-text-primary)">
                        {sessionTitle(session)}
                      </span>
                      <span className="shrink-0 font-mono text-[0.625rem] text-(--ui-text-tertiary)">
                        {relativeTime(session.last_active * 1000)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            action={
              <Button onClick={() => navigate(CALENDAR_ROUTE)} size="inline" variant="text">
                {copy.scheduleConnectCta}
              </Button>
            }
            title={copy.automations}
          >
            {upcoming.length === 0 ? (
              <Quiet>{copy.noAutomations}</Quiet>
            ) : (
              <ul className="flex flex-col">
                {upcoming.map(job => (
                  <li className="flex items-baseline gap-2 py-1" key={job.id}>
                    <Clock className="size-3 shrink-0 translate-y-0.5 text-(--ui-text-tertiary)" />
                    <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-(--ui-text-primary)">
                      {job.name || job.prompt || job.id}
                    </span>
                    <span className="shrink-0 font-mono text-[0.625rem] text-(--ui-text-tertiary)">
                      {job.next_run_at ? relativeTime(Date.parse(job.next_run_at)) : (job.schedule_display ?? '')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
