import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createClientSessionState } from '@/lib/chat-runtime'
import { $sessionStates, clearAllSessionStates, publishSessionState } from '@/store/session-states'
import { $voiceRuntimeId, $voiceStoredSessionId } from '@/store/voice-session'
import { setVoiceRuntimeResolver, setVoiceSubmitHandler } from '@/store/voice-submit'

import { useHomeVoice } from './use-home-voice'

const RUNTIME = 'voice-runtime'

// The conversation machine is the thing under test's COLLABORATOR: capture the
// callbacks it is handed so the test can poll them the way the machine's
// speech timer does.
const captured = vi.hoisted(() => ({ options: null as any }))

vi.mock('@/app/chat/composer/hooks/use-voice-conversation', () => ({
  useVoiceConversation: (options: unknown) => {
    captured.options = options

    return { end: vi.fn(), level: 0, muted: false, start: vi.fn(), status: 'idle', stopTurn: vi.fn(), toggleMute: vi.fn() }
  }
}))

vi.mock('@/hermes', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  transcribeAudio: vi.fn()
}))

function assistant(id: string, text: string) {
  return { id, parts: [{ text, type: 'text' as const }], role: 'assistant' as const }
}

function publish(messages: ReturnType<typeof assistant>[], busy = false) {
  publishSessionState(RUNTIME, { ...createClientSessionState('voice-stored'), busy, messages })
}

describe('the voice command center reads its reply live', () => {
  beforeEach(() => {
    clearAllSessionStates()
    $voiceRuntimeId.set(RUNTIME)
    $voiceStoredSessionId.set('voice-stored')
    setVoiceSubmitHandler(vi.fn())
    setVoiceRuntimeResolver(async () => RUNTIME)
  })

  afterEach(() => {
    cleanup()
    clearAllSessionStates()
    $voiceRuntimeId.set(null)
    setVoiceSubmitHandler(null)
    setVoiceRuntimeResolver(null)
  })

  it('keeps the resumed history out of the first spoken turn', () => {
    publish([assistant('old-1', 'Something said days ago.')])
    renderHook(() => useHomeVoice())

    // Nothing has been said on this surface yet, so there is no reply to speak
    // — otherwise launching the app would read the whole persisted thread out.
    expect(captured.options.pendingResponse()).toBeNull()
  })

  it('follows the reply as it streams instead of freezing at the first frame', async () => {
    publish([assistant('old-1', 'History.')])
    renderHook(() => useHomeVoice())

    await act(async () => {
      await captured.options.onSubmit('what is on today?')
    })

    // openLiveSpeech captures this ONCE and a 150ms timer polls that same
    // closure for the rest of the turn. Hold the same reference the timer
    // holds — re-reading `captured.options` every time would silently pick up
    // a fresh render's closure and hide the freeze.
    act(() => publish([assistant('old-1', 'History.'), assistant('new-1', 'Two meetings')], true))

    const polled = captured.options.pendingResponse

    expect(polled()?.text).toBe('Two meetings')

    act(() => publish([assistant('old-1', 'History.'), assistant('new-1', 'Two meetings, then a review.')], true))
    expect(polled()?.text).toBe('Two meetings, then a review.')
  })

  it('stops offering a reply once it has been spoken', async () => {
    publish([])
    renderHook(() => useHomeVoice())

    await act(async () => {
      await captured.options.onSubmit('hello')
    })

    act(() => publish([assistant('new-1', 'Good morning, sir.')]))
    expect(captured.options.pendingResponse()?.id).toBe('new-1')

    act(() => captured.options.consumePendingResponse())
    expect(captured.options.pendingResponse()).toBeNull()
  })

  it('holds the thread so a settled turn keeps the words it still has to say', async () => {
    publish([])
    renderHook(() => useHomeVoice())

    await act(async () => {
      await captured.options.onSubmit('hello')
    })

    // busy → idle is exactly when an unreferenced session's transcript is
    // released; the reply must survive that to reach the speech stream.
    act(() => publish([assistant('new-1', 'Good morning, sir.')], true))
    act(() => publish([assistant('new-1', 'Good morning, sir.')], false))

    expect($sessionStates.get()[RUNTIME]?.messages).toHaveLength(1)
    expect(captured.options.pendingResponse()?.text).toBe('Good morning, sir.')
  })
})
