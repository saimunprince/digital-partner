import type { ChatMessage } from '@/lib/chat-messages'
import { cn } from '@/lib/utils'

/**
 * What the assistant is DOING, on the surface where you can only hear it.
 *
 * The voice centre used to show one paragraph and nothing else. Ask it to open
 * a page and it would drive a browser, run a search, read three results and
 * come back — and the only evidence was that the answer took a while. The
 * capability was invisible, which on a surface with no transcript means it may
 * as well not exist.
 *
 * This is deliberately a TRAIL, not a log: the steps of the turn in progress,
 * a few words each, gone when the turn is. Anything durable belongs in
 * Activity.
 */

/** Steps beyond this are dropped from the top. A long turn should not turn the
 *  surface into a console. */
const MAX_STEPS = 5

const PREVIEW_MAX = 42

export interface ActivityStep {
  id: string
  label: string
  running: boolean
  target: string
}

function prettyToolName(name: string): string {
  return (
    name
      .split(/[_.]/)
      .filter(Boolean)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ') || name
  )
}

/** One short, human piece of the arguments — a path, a query, a URL. Tools
 *  name their principal argument differently, so the first of these that is a
 *  non-empty string wins. */
function targetFrom(args: unknown): string {
  if (!args || typeof args !== 'object') {
    return ''
  }

  const record = args as Record<string, unknown>

  for (const key of ['query', 'url', 'path', 'file_path', 'command', 'title', 'name', 'text']) {
    const value = record[key]

    if (typeof value === 'string' && value.trim()) {
      const line = value.trim().split('\n')[0]

      return line.length > PREVIEW_MAX ? `${line.slice(0, PREVIEW_MAX - 1)}…` : line
    }
  }

  return ''
}

/**
 * The steps of the CURRENT turn, oldest first.
 *
 * Scoped to what follows the last thing the user said: a trail that kept
 * yesterday's steps would be a log, and the point here is "what is happening
 * right now".
 */
export function turnActivity(messages: readonly ChatMessage[]): ActivityStep[] {
  const lastUser = messages.findLastIndex(message => message.role === 'user' && !message.hidden)
  const steps: ActivityStep[] = []

  for (const message of messages.slice(lastUser + 1)) {
    for (const part of message.parts) {
      if (part.type !== 'tool-call') {
        continue
      }

      steps.push({
        id: part.toolCallId || `${message.id}:${steps.length}`,
        label: prettyToolName(part.toolName),
        // No result yet means it is still going. The turn's last step is the
        // one worth animating; the rest are history within the turn.
        running: part.result === undefined,
        target: targetFrom(part.args)
      })
    }
  }

  return steps.slice(-MAX_STEPS)
}

export function ActivityTrail({ className, steps }: { className?: string; steps: ActivityStep[] }) {
  if (steps.length === 0) {
    return null
  }

  return (
    <ul aria-live="polite" className={cn('flex w-full max-w-[34rem] flex-col gap-1.5 text-left', className)}>
      {steps.map((step, index) => (
        <li
          className={cn(
            'presence-say flex items-baseline gap-2 text-[0.75rem]',
            // Older steps recede. The eye should land on what is happening
            // now, with the rest as context behind it.
            index === steps.length - 1 ? 'text-(--ui-text-secondary)' : 'text-(--ui-text-tertiary)/70'
          )}
          key={step.id}
        >
          <span
            aria-hidden="true"
            className={cn(
              'mt-[0.35rem] block size-1 shrink-0 rounded-full bg-current',
              step.running && 'presence-attend'
            )}
          />
          <span className="min-w-0 truncate">
            {step.label}
            {step.target ? <span className="text-(--ui-text-tertiary)"> · {step.target}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  )
}
