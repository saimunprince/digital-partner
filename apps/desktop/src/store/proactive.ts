import { atom } from 'nanostores'

import { Codecs, persistentAtom } from '@/lib/persisted'

const LAST_BRIEFING_STORAGE_KEY = 'hermes.desktop.lastBriefingDate'

/**
 * The last local date (YYYY-MM-DD) the daily briefing was spoken.
 *
 * Persisted, so a restart — or three restarts while debugging — cannot make the
 * assistant deliver the same briefing twice.
 */
export const $lastBriefingDate = persistentAtom<null | string>(
  LAST_BRIEFING_STORAGE_KEY,
  null,
  Codecs.nullableText
)

/** A prompt the voice command centre should send once it is live. */
export const $pendingVoicePrompt = atom<null | string>(null)

export interface BriefingWindow {
  enabled: boolean
  /** Local 24h "HH:MM". */
  quietEnd: string
  quietStart: string
  time: string
}

/** Minutes since local midnight, or null when the value is not "HH:MM". */
export function minutesOfDay(value: string): null | number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())

  if (!match) {
    return null
  }

  const hours = Number(match[1])
  const minutes = Number(match[2])

  if (hours > 23 || minutes > 59) {
    return null
  }

  return hours * 60 + minutes
}

/** Local YYYY-MM-DD — the day the user is living in, not UTC's. */
export function localDateKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/**
 * Is `now` inside the quiet window?
 *
 * The window normally WRAPS midnight (22:00 → 07:00), so a plain `start <= t <
 * end` comparison is wrong for every realistic setting. Equal bounds mean no
 * quiet hours at all rather than a 24-hour silence.
 */
export function inQuietHours(now: Date, quietStart: string, quietEnd: string): boolean {
  const start = minutesOfDay(quietStart)
  const end = minutesOfDay(quietEnd)

  if (start === null || end === null || start === end) {
    return false
  }

  const minutes = now.getHours() * 60 + now.getMinutes()

  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end
}

/**
 * Should the briefing be spoken on this tick?
 *
 * Deliberately "at or after", not "at": a machine asleep or shut at 08:30 must
 * still be briefed when it wakes rather than silently skipping the day. The
 * once-a-day guard is the stored date, so a late delivery cannot double up.
 */
export function shouldSpeakBriefing(now: Date, lastDate: null | string, window: BriefingWindow): boolean {
  if (!window.enabled) {
    return false
  }

  const due = minutesOfDay(window.time)

  if (due === null) {
    return false
  }

  if (localDateKey(now) === lastDate) {
    return false
  }

  if (inQuietHours(now, window.quietStart, window.quietEnd)) {
    return false
  }

  return now.getHours() * 60 + now.getMinutes() >= due
}
