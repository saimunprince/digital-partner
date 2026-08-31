import { useEffect, useRef } from 'react'

import { chatMessageText } from '@/lib/chat-messages'
import { $announcement, claimAnnouncement } from '@/store/proactive'
import { $cronSessions } from '@/store/session'
import { $sessionStates, releaseSessionTranscript, sessionTileDelegate } from '@/store/session-states'
import { requestVoiceCenterStart } from '@/store/voice-session'
import { isAuxiliaryWindow } from '@/store/windows'
import type { SessionInfo } from '@/types/hermes'

/** How long to wait for a resumed transcript to arrive before giving up. */
const TRANSCRIPT_TIMEOUT_MS = 15_000
const TRANSCRIPT_POLL_MS = 250

/** Nothing longer than this is spoken. A briefing is a few sentences; an
 *  automation that dumped a wall of output should not be read aloud. */
const MAX_SPOKEN_CHARS = 1200

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

/** The last thing the assistant said in a resumed session, once it lands. */
async function finalReply(runtimeId: string): Promise<null | string> {
  const deadline = Date.now() + TRANSCRIPT_TIMEOUT_MS

  while (Date.now() < deadline) {
    const messages = $sessionStates.get()[runtimeId]?.messages ?? []
    const last = messages.findLast(message => message.role === 'assistant' && !message.hidden)
    const text = last ? chatMessageText(last).trim() : ''

    if (text) {
      return text
    }

    await sleep(TRANSCRIPT_POLL_MS)
  }

  return null
}

/**
 * Say what the automations produced.
 *
 * A scheduled job — a reminder, the daily brief, anything on the cron board —
 * finishes in its own session and, until now, sat there unread. A partner
 * tells you. The finished reply becomes the opening line of the voice command
 * centre, so the user can answer it instead of being talked at.
 *
 * Only runs that finish while this window is OPEN are spoken. Launching the
 * app is not an invitation to read out everything that happened overnight.
 */
export function useCronAnnouncements(present: () => void): void {
  const presentRef = useRef(present)

  presentRef.current = present

  useEffect(() => {
    if (isAuxiliaryWindow()) {
      return
    }

    // Subscribed, not rendered: this hook has no output, and the cron list
    // refreshes on a timer whether or not anything on screen cares.
    const since = Date.now() / 1000
    let busy = false

    const check = (sessions: readonly SessionInfo[]) => {
      if (busy) {
        return
      }

      const fresh = sessions.find(session => (session.last_active ?? 0) > since && !session.archived)

      if (!fresh) {
        return
      }

      // Claim BEFORE the await: this runs on every session refresh, and two
      // passes over the same finished job would speak it twice.
      if (!claimAnnouncement(fresh.id)) {
        return
      }

      busy = true

      void (async () => {
        let runtimeId: null | string = null

        try {
          const delegate = sessionTileDelegate()

          if (!delegate) {
            return
          }

          // The transcript is the only place the reply exists — session lists
          // carry a first-message preview, which for a cron run is the prompt
          // that started it, not its answer.
          runtimeId = await delegate.resumeTile(fresh.id)

          const reply = await finalReply(runtimeId)

          if (reply) {
            $announcement.set(reply.slice(0, MAX_SPOKEN_CHARS))
            presentRef.current()
            requestVoiceCenterStart()
          }
        } catch {
          // A job whose session cannot be resumed simply goes unspoken.
        } finally {
          if (runtimeId) {
            // Nothing holds this session; keep the status, drop the transcript.
            releaseSessionTranscript(runtimeId)
          }

          busy = false
        }
      })()
    }

    check($cronSessions.get())

    return $cronSessions.listen(check)
  }, [])
}
