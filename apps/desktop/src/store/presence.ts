import { computed } from 'nanostores'

import { $gatewayState } from '@/store/session'
import { $workingSessionIds } from '@/store/session-states'
import { $voiceConversationStatus } from '@/store/voice-conversation'
import { $voicePlayback } from '@/store/voice-playback'

export type PresenceState =
  | 'error'
  | 'executing'
  | 'idle'
  | 'listening'
  | 'speaking'
  | 'thinking'
  | 'transcribing'

/** The assistant's single coherent presence, derived client-side — the one
 *  fact every presence surface (orb, titlebar, voice overlay) renders.
 *  Priority: a broken gateway outranks everything; live voice interaction
 *  outranks background work; background work outranks rest. */
export const $presence = computed(
  [$voiceConversationStatus, $voicePlayback, $workingSessionIds, $gatewayState],
  (voice, playback, workingIds, gateway): PresenceState => {
    if (gateway === 'error') {
      return 'error'
    }

    if (voice === 'listening') {
      return 'listening'
    }

    if (voice === 'transcribing') {
      return 'transcribing'
    }

    if (voice === 'speaking' || playback.status === 'speaking') {
      return 'speaking'
    }

    if (voice === 'thinking') {
      return 'thinking'
    }

    if (workingIds.length > 0) {
      return 'executing'
    }

    return 'idle'
  }
)
