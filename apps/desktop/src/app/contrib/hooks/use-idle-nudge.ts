import { useEffect } from 'react'

import { getHermesConfigRecord } from '@/hermes'
import {
  $nudgeState,
  $pendingVoicePrompt,
  $voiceActivityAt,
  markNudged,
  NUDGE_PROMPT,
  type NudgeWindow,
  shouldNudge
} from '@/store/proactive'
import { isAuxiliaryWindow } from '@/store/windows'

import { briefingWindowFrom } from './use-daily-briefing'

/** The lull is measured in minutes; a minute is fine enough to detect one. */
const TICK_MS = 60_000

function number(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Read `partner.nudge` out of the config record, tolerating an older backend
 *  that has never heard of the section. Quiet hours come from the briefing:
 *  one window governs everything the assistant says unprompted. */
export function nudgeWindowFrom(config: unknown): NudgeWindow {
  const partner = isRecord(config) && isRecord(config.partner) ? config.partner : {}
  const nudge = isRecord(partner.nudge) ? partner.nudge : {}
  const briefing = briefingWindowFrom(config)

  return {
    dailyLimit: number(nudge.daily_limit, 4),
    enabled: nudge.enabled === true,
    idleMs: number(nudge.idle_minutes, 6) * 60_000,
    quietEnd: briefing.quietEnd,
    quietStart: briefing.quietStart,
    spacingMs: number(nudge.spacing_minutes, 25) * 60_000
  }
}

/**
 * Speak into a lull.
 *
 * The briefing is the assistant keeping an appointment; this is it noticing.
 * It only ever fires while the command centre is already open and listening —
 * it will not start a conversation with a room that left — and it goes through
 * the same queued-prompt seam the briefing uses, so the offer is a real turn
 * the user can answer rather than a notification talking at them.
 *
 * Primary window only: three windows open must not offer three times.
 */
export function useIdleNudge(): void {
  useEffect(() => {
    if (isAuxiliaryWindow()) {
      return
    }

    let disposed = false

    const tick = async () => {
      // Something is already queued to say. Adding a second would make the
      // assistant deliver two unprompted turns back to back.
      if (disposed || $pendingVoicePrompt.get()) {
        return
      }

      const idleSince = $voiceActivityAt.get()

      // Not running. Read the config only when there is a lull to judge.
      if (idleSince === 0) {
        return
      }

      let settings: NudgeWindow

      try {
        settings = nudgeWindowFrom(await getHermesConfigRecord())
      } catch {
        // Backend not up yet. The next tick is a minute away.
        return
      }

      const now = new Date()

      if (disposed || !shouldNudge(now, idleSince, $nudgeState.get(), settings)) {
        return
      }

      // Spend the allowance BEFORE queueing. A crash mid-offer costs one
      // offer; counting afterwards would re-offer on the very next tick.
      markNudged(now)
      $pendingVoicePrompt.set(NUDGE_PROMPT)
    }

    const timer = window.setInterval(() => void tick(), TICK_MS)

    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [])
}
