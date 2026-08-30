import { useStore } from '@nanostores/react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'

import { PAGE_INSET_X } from '@/app/layout-constants'
import { openSession, openSessionIntentFromModifiers } from '@/app/open-session'
import { CRON_ROUTE } from '@/app/routes'
import { EmptyState } from '@/components/ui/empty-state'
import { getCronJobs } from '@/hermes'
import { useI18n } from '@/i18n'
import { sessionTitle } from '@/lib/chat-runtime'
import { Clock, MessageCircle } from '@/lib/icons'
import { calendarBucket, fmtClock, sessionBucketLabel } from '@/lib/time'
import { cn } from '@/lib/utils'
import { $activeProfile } from '@/store/profile'
import { $sessions } from '@/store/session'
import type { SessionInfo } from '@/types/hermes'

interface TimelineItem {
  at: number
  detail: null | string
  id: string
  kind: 'automation' | 'conversation'
  onOpen?: (event: React.MouseEvent) => void
  title: string
}

const DAY_MS = 86_400_000

/** Day heading: the same relative buckets the session list uses ("Earlier
 *  today", "Yesterday", "Last week", month names for older runs), so the
 *  timeline reads with the rest of the app. */
function useDayLabel() {
  const { t } = useI18n()
  const labels = t.sidebar.dateDivider

  return (atMs: number) => {
    const bucket = calendarBucket(atMs / 1000)

    return sessionBucketLabel(bucket, labels)
  }
}

/** A readable account of what the assistant has been doing, composed from the
 *  data the client already has: conversations (with their tool-call counts)
 *  and automation runs. A persisted per-action event log is a backend feature
 *  (`partner.activity.*`); until it lands this stays honest about its sources
 *  rather than inventing entries. */
export function ActivityView() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const sessions = useStore($sessions)
  const activeProfile = useStore($activeProfile)
  const dayLabel = useDayLabel()

  const cron = useQuery({
    queryKey: ['activity', 'cron-jobs', activeProfile],
    queryFn: () => getCronJobs(),
    refetchInterval: 5 * 60 * 1000,
    retry: false
  })

  const openSessionAt = (session: SessionInfo) => (event: React.MouseEvent) =>
    openSession(session.id, navigate, openSessionIntentFromModifiers(event))

  const items: TimelineItem[] = [
    ...sessions.map(session => ({
      at: session.last_active * 1000,
      detail: session.tool_call_count ? t.partner.activity.toolRuns(session.tool_call_count) : null,
      id: `session:${session.id}`,
      kind: 'conversation' as const,
      onOpen: openSessionAt(session),
      title: sessionTitle(session)
    })),
    ...(cron.data ?? [])
      .filter(job => job.last_run_at)
      .map(job => ({
        at: Date.parse(String(job.last_run_at)),
        detail: job.last_error ? job.last_error : (job.schedule_display ?? null),
        id: `cron:${job.id}`,
        kind: 'automation' as const,
        onOpen: () => navigate(CRON_ROUTE),
        title: job.name || job.prompt || job.id
      }))
  ]
    .filter(item => Number.isFinite(item.at))
    .sort((a, b) => b.at - a.at)

  // Day buckets, newest first — the timeline reads as a diary, not a log file.
  const days = new Map<number, TimelineItem[]>()

  for (const item of items) {
    const day = Math.floor(item.at / DAY_MS)

    days.set(day, [...(days.get(day) ?? []), item])
  }

  return (
    <div className={cn('h-full overflow-y-auto', PAGE_INSET_X)}>
      <div className="mx-auto w-full max-w-[52rem] py-10">
        <h1 className="pb-6 text-[1.25rem] font-medium text-(--ui-text-primary)">{t.partner.activity.title}</h1>

        {items.length === 0 ? (
          <EmptyState
            className="min-h-[50vh]"
            description={t.partner.activity.emptyDesc}
            title={t.partner.activity.emptyTitle}
          />
        ) : (
          [...days.entries()].map(([day, dayItems]) => (
            <section className="pb-7" key={day}>
              <h2 className="border-b border-(--ui-stroke-tertiary) pb-1.5 text-xs font-medium text-(--ui-text-secondary)">
                {dayLabel(dayItems[0].at)}
              </h2>
              <ul className="pt-2">
                {dayItems.map(item => (
                  <li key={item.id}>
                    <button
                      className="flex w-full cursor-pointer items-baseline gap-3 rounded-md px-2 py-1.5 text-left transition-colors duration-100 hover:bg-(--chrome-action-hover)"
                      onClick={item.onOpen}
                      type="button"
                    >
                      <span className="w-14 shrink-0 font-mono text-[0.6875rem] text-(--ui-text-tertiary)">
                        {fmtClock.format(item.at)}
                      </span>
                      <span className="grid size-4 shrink-0 translate-y-0.5 place-items-center text-(--ui-text-tertiary) [&_svg]:size-3.5">
                        {item.kind === 'automation' ? <Clock /> : <MessageCircle />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.8125rem] text-(--ui-text-primary)">{item.title}</span>
                        {item.detail && (
                          <span className="block truncate text-[0.6875rem] text-(--ui-text-tertiary)">
                            {item.detail}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-[0.6875rem] text-(--ui-text-tertiary)">
                        {item.kind === 'automation' ? t.partner.activity.automation : t.partner.activity.conversation}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  )
}
