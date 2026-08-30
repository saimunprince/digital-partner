import { useEffect, useRef } from 'react'

import { desktopSessionCreateParams } from '@/app/session/hooks/use-session-actions'
import { $gateway } from '@/store/gateway'
import {
  initQuickEntryBridge,
  QUICK_TARGET_CURRENT,
  QUICK_TARGET_NEW,
  type QuickEntrySessionOption,
  setQuickEntrySubmitHandler
} from '@/store/quick-entry'
import { $currentCwd, $gatewayState, $sessions } from '@/store/session'
import { sessionTileDelegate } from '@/store/session-states'
import { $voiceRuntimeId, $voiceStoredSessionId } from '@/store/voice-session'
import { setVoiceRuntimeResolver, setVoiceSubmitHandler } from '@/store/voice-submit'
import { isAuxiliaryWindow } from '@/store/windows'

interface QuickEntryBridgeParams {
  startFreshSessionDraft: () => void
  submitText: (text: string) => Promise<unknown> | unknown
}

// The picker is a capture aid, not a session browser — a handful of recent
// rows is the whole point.
const QUICK_ENTRY_SESSION_OPTIONS = 5

/**
 * Bind (and if necessary create) the voice command center's session.
 *
 * Kept out of the primary submit path deliberately: `createBackendSessionForSend`
 * aborts on view drift, which is correct for a chat send and wrong for a
 * background session that must survive the user navigating anywhere.
 */
async function ensureVoiceRuntime(): Promise<null | string> {
  const delegate = sessionTileDelegate()

  if (!delegate) {
    return null
  }

  const stored = $voiceStoredSessionId.get()

  if (stored) {
    try {
      const runtimeId = await delegate.resumeTile(stored)

      $voiceRuntimeId.set(runtimeId)

      return runtimeId
    } catch {
      // Deleted or unreachable — mint a fresh one below.
      $voiceStoredSessionId.set(null)
    }
  }

  const gateway = $gateway.get()

  if (!gateway) {
    return null
  }

  const params = await desktopSessionCreateParams($currentCwd.get().trim())
  const created = await gateway.request<{ stored_session_id?: null | string }>('session.create', params)
  const storedSessionId = created.stored_session_id ?? null

  if (!storedSessionId) {
    return null
  }

  $voiceStoredSessionId.set(storedSessionId)

  const runtimeId = await delegate.resumeTile(storedSessionId)

  $voiceRuntimeId.set(runtimeId)

  return runtimeId
}

function sessionOptions(): QuickEntrySessionOption[] {
  return $sessions
    .get()
    .filter(session => !session.archived)
    .slice(0, QUICK_ENTRY_SESSION_OPTIONS)
    .map(session => ({
      id: session.id,
      title: session.title?.trim() || session.preview?.trim() || session.id
    }))
}

/**
 * Wires the global-hotkey Quick Entry window back into the app, both ways:
 *
 * - **Inbound:** text captured there is routed by target and submitted through
 *   THIS window's normal prompt machinery — current chat rides `submitText`, a
 *   picked stored session rides the session-tile delegate (resume + submit,
 *   background, without touching the primary view — the same path tiled
 *   sessions use), and "new session" is a fresh draft + submit, exactly what
 *   clicking New Chat and typing does. One submit pipeline, no bespoke RPC.
 * - **Outbound:** gateway connection state + the recent-session list are pushed
 *   to the quick window (via main, which caches the latest push), so its input
 *   disables with a reconnect hint whenever the backend is unreachable.
 *
 * Handlers register ONCE through refs tracking the latest callbacks —
 * re-registering on identity churn leaves a nulled-handler window that can drop
 * a submit (the same bug shape use-pet-bridge guards). Primary window only: a
 * secondary session window must not also claim the global capture channel, or
 * one keystroke would send N prompts.
 */
export function useQuickEntryBridge({ startFreshSessionDraft, submitText }: QuickEntryBridgeParams): void {
  const submitTextRef = useRef(submitText)
  submitTextRef.current = submitText
  const startFreshRef = useRef(startFreshSessionDraft)
  startFreshRef.current = startFreshSessionDraft

  useEffect(() => {
    if (isAuxiliaryWindow()) {
      return
    }

    setQuickEntrySubmitHandler(({ target, text }) => {
      if (target === QUICK_TARGET_NEW) {
        // Same as the user clicking New Chat and typing: fresh draft, then the
        // normal submit creates the backend session.
        startFreshRef.current()
        void submitTextRef.current(text)

        return
      }

      if (target !== QUICK_TARGET_CURRENT) {
        // A picked stored session: resume + submit in the background through
        // the session-tile delegate so the primary view stays where it is.
        const delegate = sessionTileDelegate()

        if (delegate) {
          void delegate
            .resumeTile(target)
            .then(runtimeId => delegate.submitToSession(runtimeId, text))
            // A dead/undeliverable target must not swallow the prompt.
            .catch(() => void submitTextRef.current(text))

          return
        }
      }

      void submitTextRef.current(text)
    })

    // Home's voice surface owns its OWN conversation: talking must not rewrite
    // what Chat is showing, and opening Chat must not interrupt a spoken
    // thread. The turn is created once, persisted, and submitted in the
    // background through the tile delegate — never through the primary view.
    // Binding is exposed on its own so a surface can warm the thread when the
    // user opens voice, rather than discovering its history mid-turn.
    setVoiceRuntimeResolver(ensureVoiceRuntime)

    setVoiceSubmitHandler(async text => {
      const runtimeId = await ensureVoiceRuntime()

      if (!runtimeId) {
        // No delegate/gateway yet: fall back to the ordinary path rather than
        // dropping what the user just said.
        await submitTextRef.current(text)

        return
      }

      const delegate = sessionTileDelegate()

      await delegate?.submitToSession(runtimeId, text)
    })

    const dispose = initQuickEntryBridge()

    return () => {
      setQuickEntrySubmitHandler(null)
      setVoiceSubmitHandler(null)
      setVoiceRuntimeResolver(null)
      dispose()
    }
  }, [])

  // Push gateway truth into the quick window whenever it changes: connection
  // state gates its input; the recent-session list feeds its target picker.
  useEffect(() => {
    if (isAuxiliaryWindow()) {
      return
    }

    const api = window.hermesDesktop?.quickEntry

    if (!api?.pushState) {
      return
    }

    const push = () => {
      api.pushState({ connected: $gatewayState.get() === 'open', sessions: sessionOptions() })
    }

    push()

    const offGateway = $gatewayState.listen(push)
    const offSessions = $sessions.listen(push)

    return () => {
      offGateway()
      offSessions()
    }
  }, [])
}
