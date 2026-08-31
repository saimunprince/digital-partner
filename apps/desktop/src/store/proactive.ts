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

/**
 * `Date.now()` of the last thing that happened in the voice command centre —
 * either side of the conversation — or 0 when it is not running.
 *
 * The lull detector's only input. It is a timestamp rather than a boolean
 * because "quiet" is not a state the surface is ever in: it is listening, and
 * has been for a while.
 */
export const $voiceActivityAt = atom(0)

export function markVoiceActivity(): void {
  $voiceActivityAt.set(Date.now())
}

/** The centre is no longer running: there is no room to speak into. */
export function clearVoiceActivity(): void {
  $voiceActivityAt.set(0)
}

/**
 * Something the assistant has to SAY, unprompted — an automation that just
 * finished, a reminder that came due.
 *
 * Not a prompt: this text is already the answer. The voice command centre
 * speaks it in place of its greeting and then listens, so the announcement is
 * the opening line of a conversation the user can reply to rather than a
 * notification that talks at them.
 */
export const $announcement = atom<null | string>(null)

const ANNOUNCED_STORAGE_KEY = 'hermes.desktop.announcedSessionIds'

/** How many ids to remember. Enough that a day of automations never repeats
 *  itself; small enough that this never becomes a growing store. */
const ANNOUNCED_LIMIT = 200

/** Sessions already spoken. Persisted: a restart must not replay this
 *  morning's briefing at lunch. */
export const $announcedSessionIds = persistentAtom<string[]>(
  ANNOUNCED_STORAGE_KEY,
  [],
  Codecs.stringArray
)

/** True the first time an id is seen; false ever after. */
export function claimAnnouncement(id: string): boolean {
  const seen = $announcedSessionIds.get()

  if (seen.includes(id)) {
    return false
  }

  $announcedSessionIds.set([...seen, id].slice(-ANNOUNCED_LIMIT))

  return true
}

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

/** How the partner is allowed to speak into a lull. Mirrors `partner.nudge`. */
export interface NudgeWindow {
  dailyLimit: number
  enabled: boolean
  idleMs: number
  /** Reused from the briefing: one quiet window governs everything spoken. */
  quietEnd: string
  quietStart: string
  spacingMs: number
}

/** What has already been offered today. */
export interface NudgeState {
  /** Offers made on `date`. */
  count: number
  /** Local YYYY-MM-DD the count belongs to. */
  date: null | string
  /** `Date.now()` of the last offer, or 0. */
  lastAt: number
}

const NUDGE_STORAGE_KEY = 'hermes.desktop.nudgeState'

/**
 * Persisted, for the same reason the briefing date is: a restart must not hand
 * the assistant a fresh allowance. Someone who reopens the app four times in an
 * afternoon should not be spoken to four extra times for it.
 */
export const $nudgeState = persistentAtom<NudgeState>(
  NUDGE_STORAGE_KEY,
  { count: 0, date: null, lastAt: 0 },
  // Sanitized: a hand-edited or half-written record must not be able to hand
  // the assistant an unbounded allowance. A lost count costs one extra offer.
  Codecs.json<NudgeState>(parsed => {
    const value = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Partial<NudgeState>

    return {
      count: typeof value.count === 'number' && value.count >= 0 ? value.count : 0,
      date: typeof value.date === 'string' ? value.date : null,
      lastAt: typeof value.lastAt === 'number' && value.lastAt >= 0 ? value.lastAt : 0
    }
  })
)

/**
 * May the partner say something unprompted right now?
 *
 * Every clause here exists to make the answer "no" more often than "yes". The
 * failure mode of speaking first is not that it is unhelpful — it is that it is
 * unwelcome, and an assistant that interrupts once too often gets switched off
 * for good. `idleSince` is when the surface last saw ANY activity, the user's
 * or the assistant's, so an offer can only land in a genuine gap.
 */
export function shouldNudge(now: Date, idleSince: number, state: NudgeState, window: NudgeWindow): boolean {
  if (!window.enabled || window.dailyLimit <= 0) {
    return false
  }

  if (inQuietHours(now, window.quietStart, window.quietEnd)) {
    return false
  }

  const today = localDateKey(now)
  // A stale date is a fresh day, not a fresh allowance mid-day: only an actual
  // date change resets the count.
  const spentToday = state.date === today ? state.count : 0

  if (spentToday >= window.dailyLimit) {
    return false
  }

  const millis = now.getTime()

  if (state.lastAt > 0 && millis - state.lastAt < window.spacingMs) {
    return false
  }

  return idleSince > 0 && millis - idleSince >= window.idleMs
}

/**
 * What the daily briefing asks for. Phrased for the ear: it will be SPOKEN, so
 * it must not come back as a wall of markdown.
 */
export const BRIEFING_PROMPT =
  'Give me my morning briefing out loud: today\u2019s schedule, anything urgent waiting on me, ' +
  'and what deserves my attention first. Keep it to a few short spoken sentences \u2014 no lists, ' +
  'no markdown. If a data source is not connected, skip it silently rather than explaining it.'

/**
 * What the partner offers into a silence.
 *
 * Written to make saying nothing the easy path. A model asked to "be
 * proactive" will always find something to say, and something-to-say every six
 * minutes is what makes an assistant unbearable \u2014 so the instruction is mostly
 * about the bar, and the sentinel gives it a way to decline that costs it
 * nothing.
 */
export const NUDGE_PROMPT =
  'We have been quiet for a few minutes. If \u2014 and only if \u2014 there is something genuinely worth ' +
  'raising right now (something waiting on me, a deadline approaching, a loose end from what we ' +
  'were just doing, or something you remember about me that is relevant this minute), say it in ' +
  'one or two short spoken sentences, and make it something I can answer. Do not summarise, do ' +
  'not offer help in general, do not ask what I am working on. If there is nothing that clears ' +
  'that bar, reply with exactly: PASS'

/** The one-word reply a lull offer makes when it has nothing worth saying.
 *  Given to the model so declining is cheap; never spoken, never shown. */
export const NUDGE_PASS = 'PASS'

/**
 * Is this assistant reply the "nothing worth raising" sentinel?
 *
 * Tolerant of the trailing punctuation and casing a model adds unbidden: a
 * sentinel that fails to match is SPOKEN, and being told "PASS" out loud is
 * worse than any offer it was meant to suppress.
 */
export function isNudgePass(text: string): boolean {
  return text.trim().replace(/[\s.!]+$/, '').toUpperCase() === NUDGE_PASS
}

/** Record an offer against today's allowance. */
export function markNudged(now: Date): void {
  const today = localDateKey(now)
  const previous = $nudgeState.get()

  $nudgeState.set({
    count: previous.date === today ? previous.count + 1 : 1,
    date: today,
    lastAt: now.getTime()
  })
}
