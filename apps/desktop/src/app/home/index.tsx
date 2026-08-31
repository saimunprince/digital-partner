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
import { sessionTitle } from '@/lib/chat-runtime'
import { CalendarDays, Clock } from '@/lib/icons'
import { useKeybindHint } from '@/lib/keybinds/use-keybind-hint'
import { relativeTime } from '@/lib/time'
import { cn } from '@/lib/utils'
import { $activeProfile } from '@/store/profile'
import { $sessions } from '@/store/session'
import { $workingSessionIds } from '@/store/session-states'
import type { SessionInfo } from '@/types/hermes'

import { ActivityTrail } from './activity-trail'
import { greetingKey } from './greeting'
import { type GlanceLine, OrbClock, OrbGlance } from './orb-aside'
import { Starfield } from './starfield'
import { useHomeVoice } from './use-home-voice'
import { VoiceThread } from './voice-thread'

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

  // What is WAITING, one line each — not a second copy of the panels below.
  // Only when there is something to say: a quiet day shows a short column,
  // not a list of zeroes.
  const glance: GlanceLine[] = [
    working.length > 0 ? { label: copy.activeNow, value: String(working.length) } : null,
    upcoming.length > 0 && upcoming[0].next_run_at
      ? { label: copy.automations, value: relativeTime(Date.parse(upcoming[0].next_run_at)) }
      : null
  ].filter((line): line is GlanceLine => line !== null)

  const openRecent = (session: SessionInfo) => (event: React.MouseEvent) =>
    openSession(session.id, navigate, openSessionIntentFromModifiers(event))

  return (
    <div className={cn('relative flex h-full flex-col overflow-y-auto', PAGE_INSET_X)}>
      {/* The sky the orb hangs in: behind the content, inert to the pointer.
          Positioned INSIDE this container rather than fixed to the viewport —
          a negative z-index would put it behind the surface's own background
          and paint nothing at all, which is exactly what it did. */}
      <Starfield className="pointer-events-none absolute inset-0 z-0" />

      {/* ONE composition, centred as a whole. The header used to take `flex-1`
          and the day band was pushed to the floor, so on a tall window the two
          drifted a screen apart and the page read as three unrelated strips
          rather than one surface. */}
      <div className="relative z-10 mx-auto flex w-full max-w-[64rem] flex-1 flex-col justify-center gap-16 py-10">
        {/* The assistant owns the upper half — presence, greeting, and the one
            place the conversation starts. */}
        <header
          className={cn(
            'flex flex-col items-center text-center transition-all duration-300',
            // Wider while talking: the orb's GL surface overshoots its layout
            // box (see .presence-orb__stage), and at full voice its crests
            // reached down over the status line.
            voice.active ? 'gap-14' : 'gap-6'
          )}
        >
          {/* The orb is the control: this surface is for talking. Typing has
              its own home in Chat.

              It is flanked rather than floated: a metre of nothing either side
              reads as an unfinished page. The columns are hidden while talking
              — then the orb IS the page. */}
          <div className="flex w-full items-center justify-center gap-10">
            <OrbClock className={cn('hidden w-40 lg:block', voice.active && 'invisible')} />

            <button
              aria-label={copy.talkAria}
              className="presence-orb-button shrink-0 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-4 focus-visible:ring-offset-transparent"
              onClick={voice.toggle}
              type="button"
            >
              <PresenceOrb size="hero" />
            </button>

            <OrbGlance className={cn('hidden w-40 lg:flex', voice.active && 'invisible')} lines={glance} />
          </div>

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
              // Both sides of the turn, weighted the way a conversation is
              // heard: your words as context, its answer as the thing being
              // said. Narrower than the page and LEFT-aligned — a centred
              // paragraph makes the eye hunt for the start of every line, and
              // a spoken answer can run long.
              <div className="flex w-full max-w-[34rem] flex-col items-center gap-5">
                {/* The turn SCROLLS inside a fixed band. Letting it grow pushed
                    the End control further down the page with every sentence,
                    so the one button on the surface was never twice in the same
                    place. */}
                {/* What it is doing, above what it said: the work is the news
                    while a turn is running, and the answer is the news once it
                    has finished. */}
                <ActivityTrail steps={voice.activity} />

                <VoiceThread turns={voice.turns} />

                <div className="flex flex-col items-center gap-2 text-center">
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
        <div className={cn('grid grid-cols-1 gap-x-10 gap-y-8 md:grid-cols-3', voice.active && 'hidden')}>
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
