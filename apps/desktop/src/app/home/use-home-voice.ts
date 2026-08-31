import { useStore } from '@nanostores/react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { useVoiceConversation } from '@/app/chat/composer/hooks/use-voice-conversation'
import { blobToDataUrl } from '@/app/session/hooks/use-prompt-actions/utils'
import { transcribeAudio } from '@/hermes'
import { useI18n } from '@/i18n'
import { collectUnspokenTurnSpeech } from '@/lib/chat-messages'
import { playSpeechText, stopVoicePlayback } from '@/lib/voice-playback'
import { notifyError } from '@/store/notifications'
import { $announcement, $pendingVoicePrompt } from '@/store/proactive'
import { $sessionStates } from '@/store/session-states'
import { $voiceCenterStartRequest, $voiceRuntimeId, takeVoiceCenterStart } from '@/store/voice-session'
import { canSubmitVoiceText, ensureVoiceRuntimeReady, submitVoiceText } from '@/store/voice-submit'

import { greetingKey } from './greeting'

/**
 * The Home surface's voice conversation.
 *
 * Home is the voice command center: talking to the orb must run the whole loop
 * here — listen, transcribe, submit, speak — without navigating to Chat, which
 * is the separate place for typed conversation.
 *
 * It reuses the composer's conversation state machine (mic, VAD, barge-in,
 * stop words) and supplies its own three seams: submit through the shared
 * voice-submit seam, read replies from the VOICE session's message state, and
 * transcribe through the same endpoint the composer uses.
 *
 * Home and Chat are separate command centers, so the spoken thread lives in its
 * own session: talking never rewrites what Chat is showing, and opening Chat
 * never interrupts a spoken conversation.
 */
export function useHomeVoice() {
  const { t } = useI18n()
  const copy = t.partner.home
  // The voice command center reads its OWN session, never the chat's: what is
  // said here belongs to a separate thread (see store/voice-session).
  const voiceRuntimeId = useStore($voiceRuntimeId)
  const sessionStates = useStore($sessionStates)
  // Opening voice does not go straight to listening: the assistant greets
  // first, then the mic opens. Two reasons — a command centre that answers the
  // moment you open it is the whole point of speaking to it, and the greeting
  // must not be recorded as the user's own first utterance.
  const [phase, setPhase] = useState<'greeting' | 'idle' | 'live'>('idle')
  const active = phase !== 'idle'
  const lastSpokenIdRef = useRef<string | null>(null)
  // The spoken thread is PERSISTED, so binding it replays a transcript that may
  // be hundreds of turns long. None of it is a reply to the thing just said —
  // speaking only starts once this session has actually sent something.
  const spokeThisSessionRef = useRef(false)

  const sessionState = voiceRuntimeId ? sessionStates[voiceRuntimeId] : undefined
  const busy = Boolean(sessionState?.busy)

  /** The spoken thread's transcript, read LIVE.
   *
   *  Not `sessionState.messages`: the conversation machine captures these
   *  callbacks when a speech session opens and then polls them on a timer, so a
   *  render-time snapshot would freeze the reply at whatever had streamed in by
   *  the first frame — the rest of the sentence is generated but never spoken.
   *  The composer reads `$messages` for exactly this reason. */
  const voiceMessages = () => $sessionStates.get()[$voiceRuntimeId.get() ?? '']?.messages ?? []

  // Sends through the app's ordinary prompt pipeline (see store/voice-submit):
  // with no session yet that starts a fresh draft and creates the backend
  // session on send, exactly as typing the first message in a new chat does.
  const submit = useCallback(
    async (text: string) => {
      if (!canSubmitVoiceText()) {
        notifyError(new Error(t.assistant.approval.gatewayDisconnected), t.partner.home.talkAria)

        return
      }

      try {
        // Bind the thread FIRST. Until it is bound there is no transcript to
        // read, and a mark taken from an empty one would leave every old reply
        // in the resumed history looking unspoken — the whole thread would be
        // read aloud on the first turn after launch.
        await ensureVoiceRuntimeReady()

        // Everything already in the thread is history from here on; only what
        // the assistant says NEXT is this turn's reply.
        const lastAssistant = voiceMessages().findLast(message => message.role === 'assistant' && !message.hidden)

        lastSpokenIdRef.current = lastAssistant?.id ?? null
        spokeThisSessionRef.current = true

        await submitVoiceText(text)
      } catch (error) {
        notifyError(error, t.partner.home.talkAria)
      }
    },
    [t]
  )

  // Wake word (and anything else that asks to talk) opens the command centre
  // here rather than in Chat. Latched, because the request is made a beat
  // before Home mounts.
  const startRequest = useStore($voiceCenterStartRequest)

  useEffect(() => {
    if (startRequest > 0 && takeVoiceCenterStart(startRequest)) {
      setPhase(current => (current === 'idle' ? 'greeting' : current))
    }
  }, [startRequest])

  // An announcement REPLACES the greeting. "Good evening. Ready when you are.
  // Your build finished." is two openings for one moment; the thing worth
  // saying is the opening line.
  const announcement = useStore($announcement)
  const welcome = announcement ?? `${copy[greetingKey(new Date().getHours())]} ${copy.voiceStatus.idle}`

  useEffect(() => {
    if (phase !== 'greeting') {
      return
    }

    let cancelled = false

    // Warm the thread while the greeting plays: resuming a long transcript
    // takes a moment and the user is about to speak into it.
    void ensureVoiceRuntimeReady().catch(() => {})

    // Consumed as it is spoken: a re-render mid-playback must not queue it a
    // second time, and ending the conversation must not bring it back.
    $announcement.set(null)

    // Fail OPEN. A greeting that cannot be spoken (no TTS provider, offline)
    // must not lock the user out of the conversation it introduces.
    void playSpeechText(welcome, { source: 'voice-conversation' })
      .catch(() => false)
      .finally(() => {
        if (!cancelled) {
          setPhase(current => (current === 'greeting' ? 'live' : current))
        }
      })

    return () => {
      cancelled = true
    }
  }, [phase, welcome])

  const conversation = useVoiceConversation({
    busy,
    consumePendingResponse: () => {
      const last = voiceMessages().findLast(message => message.role === 'assistant' && !message.hidden)

      if (last) {
        lastSpokenIdRef.current = last.id
      }
    },
    enabled: phase === 'live',
    onFatalError: () => setPhase('idle'),
    onStopWord: () => setPhase('idle'),
    onSubmit: submit,
    onTranscribeAudio: async (audio: Blob) => {
      const dataUrl = await blobToDataUrl(audio)
      const result = await transcribeAudio(dataUrl, audio.type)

      return result.transcript ?? ''
    },
    pendingResponse: () =>
      spokeThisSessionRef.current ? collectUnspokenTurnSpeech(voiceMessages(), lastSpokenIdRef.current) : null
  })

  // A prompt queued by something other than the user's own voice — the daily
  // briefing today, a reminder later. It rides the SAME submit path a spoken
  // turn takes, so the reply is spoken exactly like any other answer.
  useEffect(() => {
    if (phase !== 'live') {
      return
    }

    const prompt = $pendingVoicePrompt.get()

    if (prompt) {
      $pendingVoicePrompt.set(null)
      void submit(prompt)
    }
  }, [phase, submit])

  const messages = sessionState?.messages ?? []

  const stop = () => {
    $announcement.set(null)
    $pendingVoicePrompt.set(null)
    stopVoicePlayback()
    setPhase('idle')
  }

  return {
    active,
    /** The last thing the assistant said, for the on-screen readout. */
    reply: messages.findLast(message => message.role === 'assistant' && !message.hidden),
    start: () => setPhase('greeting'),
    // The greeting is the assistant speaking, and the orb and the readout
    // should say so before the machine itself is running.
    status: phase === 'greeting' ? ('speaking' as const) : conversation.status,
    stop,
    toggle: () => (phase === 'idle' ? setPhase('greeting') : stop()),
    /** What the user last said — a voice surface should show both sides. */
    utterance: messages.findLast(message => message.role === 'user' && !message.hidden)
  }
}
