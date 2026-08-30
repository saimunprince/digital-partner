import { atom } from 'nanostores'

import { Codecs, persistentAtom } from '@/lib/persisted'

const VOICE_SESSION_STORAGE_KEY = 'hermes.desktop.voiceSessionId'

/**
 * The voice command center's own conversation.
 *
 * Home and Chat are separate command centers: talking must not rewrite what
 * Chat is showing, and opening Chat must not interrupt a spoken thread. So
 * voice keeps its own stored session, persisted across launches, and submits
 * to it in the background through the session-tile delegate — the same path
 * tiled sessions use to run without touching the primary view.
 */
export const $voiceStoredSessionId = persistentAtom<null | string>(
  VOICE_SESSION_STORAGE_KEY,
  null,
  Codecs.nullableText
)

/** Live runtime id bound to that stored session, once resumed. */
export const $voiceRuntimeId = atom<null | string>(null)

/**
 * "Start the voice command center" — latched, because the request can arrive
 * (wake word, a keybind) while Home is not mounted. Home consumes it on its
 * first render after navigation, exactly as the composer consumes its own
 * start request.
 */
export const $voiceCenterStartRequest = atom(0)

let nextVoiceCenterStart = 0
let handledVoiceCenterStart = 0

export const requestVoiceCenterStart = (): void => $voiceCenterStartRequest.set(++nextVoiceCenterStart)

/** True once, for the surface that acts on this request. */
export function takeVoiceCenterStart(current: number): boolean {
  if (current <= handledVoiceCenterStart) {
    return false
  }

  handledVoiceCenterStart = current

  return true
}
