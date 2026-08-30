import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createClientSessionState } from '@/lib/chat-runtime'

import { $sessionStates, clearAllSessionStates, publishSessionState } from './session-states'
import { $voiceCenterStartRequest, $voiceRuntimeId, requestVoiceCenterStart, takeVoiceCenterStart } from './voice-session'

const VOICE_RUNTIME = 'voice-runtime-1'

function settledWithReply() {
  return {
    ...createClientSessionState('voice-stored-1'),
    busy: false,
    messages: [{ id: 'a1', parts: [{ text: 'Your calendar is clear, sir.', type: 'text' as const }], role: 'assistant' as const }]
  }
}

describe('the voice command center session', () => {
  beforeEach(() => {
    clearAllSessionStates()
    $voiceRuntimeId.set(null)
  })

  afterEach(() => {
    clearAllSessionStates()
    $voiceRuntimeId.set(null)
  })

  it('keeps its transcript once the spoken turn settles', () => {
    // A first publish always lands in full; the turn then settles.
    publishSessionState(VOICE_RUNTIME, { ...settledWithReply(), busy: true })
    $voiceRuntimeId.set(VOICE_RUNTIME)
    publishSessionState(VOICE_RUNTIME, settledWithReply())

    // Home reads the reply from here to speak it. An emptied transcript is
    // silence: there is nothing left to hand the speech stream.
    expect($sessionStates.get()[VOICE_RUNTIME]?.messages).toHaveLength(1)
  })
})

describe('the request to open the voice command center', () => {
  it('is claimed exactly once, so a remount does not re-open it', () => {
    requestVoiceCenterStart()

    const request = $voiceCenterStartRequest.get()

    expect(takeVoiceCenterStart(request)).toBe(true)
    expect(takeVoiceCenterStart(request)).toBe(false)
  })

  it('latches, so it survives the navigation that mounts Home', () => {
    // Wake fires before Home exists: the request must still be waiting when it
    // renders, which is why this is a counter and not an event.
    requestVoiceCenterStart()
    const first = $voiceCenterStartRequest.get()

    requestVoiceCenterStart()
    const second = $voiceCenterStartRequest.get()

    expect(second).toBeGreaterThan(first)
    expect(takeVoiceCenterStart(second)).toBe(true)
  })
})
