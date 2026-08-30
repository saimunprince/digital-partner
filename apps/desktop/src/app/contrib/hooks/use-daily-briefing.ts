import { useEffect, useRef } from 'react'

import { getHermesConfigRecord } from '@/hermes'
import {
  $lastBriefingDate,
  $pendingVoicePrompt,
  type BriefingWindow,
  localDateKey,
  shouldSpeakBriefing
} from '@/store/proactive'
import { requestVoiceCenterStart } from '@/store/voice-session'
import { isAuxiliaryWindow } from '@/store/windows'

/** A minute is fine granularity for something scheduled to the minute, and it
 *  keeps the config read off the hot path. */
const TICK_MS = 60_000

/** What the briefing asks for. Phrased for the ear: it will be SPOKEN, so it
 *  must not come back as a wall of markdown. */
const BRIEFING_PROMPT =
  'Give me my morning briefing out loud: today’s schedule, anything urgent waiting on me, ' +
  'and what deserves my attention first. Keep it to a few short spoken sentences — no lists, ' +
  'no markdown. If a data source is not connected, skip it silently rather than explaining it.'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

/** Read `partner.briefing` out of the config record, tolerating an older
 *  backend that has never heard of the section. */
export function briefingWindowFrom(config: unknown): BriefingWindow {
  const partner = isRecord(config) && isRecord(config.partner) ? config.partner : {}
  const briefing = isRecord(partner.briefing) ? partner.briefing : {}

  return {
    enabled: briefing.enabled === true,
    quietEnd: text(briefing.quiet_end, '07:00'),
    quietStart: text(briefing.quiet_start, '22:00'),
    time: text(briefing.time, '08:30')
  }
}

/**
 * Speak first, once a day.
 *
 * The assistant opening its own mouth is the difference between a tool and a
 * partner, so this is deliberately the ONLY unprompted speech path: one
 * briefing, at an hour the user chose, never inside quiet hours, never twice
 * in a day. It goes through the voice command centre rather than playing a
 * canned line — the briefing is a real turn, and the user can answer it.
 *
 * Primary window only: three windows open must not brief three times.
 */
export function useDailyBriefing(present: () => void): void {
  const presentRef = useRef(present)

  presentRef.current = present

  useEffect(() => {
    if (isAuxiliaryWindow()) {
      return
    }

    let disposed = false

    const tick = async () => {
      if (disposed || $pendingVoicePrompt.get()) {
        return
      }

      let settings: BriefingWindow

      try {
        settings = briefingWindowFrom(await getHermesConfigRecord())
      } catch {
        // Backend not up yet. The next tick is a minute away.
        return
      }

      const now = new Date()

      if (disposed || !shouldSpeakBriefing(now, $lastBriefingDate.get(), settings)) {
        return
      }

      // Stamp the day BEFORE speaking. A crash mid-briefing costs one
      // briefing; a stamp written afterwards would replay it every minute.
      $lastBriefingDate.set(localDateKey(now))
      $pendingVoicePrompt.set(BRIEFING_PROMPT)
      // Home has to be on screen to claim the request — it owns the voice
      // machine. `present` navigates there (and brings the window forward).
      presentRef.current()
      requestVoiceCenterStart()
    }

    void tick()

    const timer = window.setInterval(() => void tick(), TICK_MS)

    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [])
}
