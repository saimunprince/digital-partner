import { useStore } from '@nanostores/react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { useVoiceConversation } from '@/app/chat/composer/hooks/use-voice-conversation'
import { blobToDataUrl } from '@/app/session/hooks/use-prompt-actions/utils'
import { BRAND } from '@/brand'
import { transcribeAudio } from '@/hermes'
import { useI18n } from '@/i18n'
import { collectUnspokenTurnSpeech } from '@/lib/chat-messages'
import { fetchLiveConfig } from '@/lib/live-voice/config'
import { liveInstruction } from '@/lib/live-voice/instruction'
import { type LiveSession, type LiveStatus, startLiveSession } from '@/lib/live-voice/session'
import { playSpeechText, stopVoicePlayback } from '@/lib/voice-playback'
import { createWakeHandover } from '@/lib/wake-handover'
import { notifyError } from '@/store/notifications'
import {
  $announcement,
  $pendingVoicePrompt,
  clearVoiceActivity,
  isNudgePass,
  markVoiceActivity
} from '@/store/proactive'
import { $sessionStates } from '@/store/session-states'
import {
  $voiceCenterStartRequest,
  $voiceCenterWoken,
  $voiceRuntimeId,
  takeVoiceCenterStart
} from '@/store/voice-session'
import { canSubmitVoiceText, ensureVoiceRuntimeReady, submitVoiceText } from '@/store/voice-submit'

import { turnActivity } from './activity-trail'
import { askEngine } from './ask-engine'
import { greetingKey } from './greeting'

/** A live session's states in the surface's own vocabulary. `working` is the
 *  engine running a turn — the orb should not read "listening" through it. */
const LIVE_STATUS = {
  connecting: 'thinking',
  listening: 'listening',
  speaking: 'speaking',
  working: 'thinking'
} as const

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
  // The wake detector and this conversation share one microphone. Without the
  // handover the detector is stopped on wake and never re-armed, so the wake
  // phrase works exactly once per launch.
  const wakeRef = useRef(createWakeHandover())
  // The speech-to-speech session, when the backend offers one. While it holds
  // the conversation the four-stage machine below stays switched off — two
  // things listening on one microphone is two things fighting over it.
  const liveRef = useRef<LiveSession | null>(null)
  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null)
  const live = liveStatus !== null

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
      // Straight to listening when the wake phrase called it: the chime has
      // already answered, and a greeting on top of it is one acknowledgement
      // too many. Clicking the orb still gets the spoken one.
      const next = $voiceCenterWoken.get() ? 'live' : 'greeting'

      setPhase(current => (current === 'idle' ? next : current))
    }
  }, [startRequest])

  // An announcement REPLACES the greeting. "Good evening. Ready when you are.
  // Your build finished." is two openings for one moment; the thing worth
  // saying is the opening line.
  const announcement = useStore($announcement)
  const welcome = announcement ?? `${copy[greetingKey(new Date().getHours())]} ${copy.voiceStatus.idle}`

  // Take the mic for the whole conversation, and give it back when it ends.
  // Warm the thread here too: resuming a long transcript takes a moment, and
  // a wake goes straight to listening without the greeting to hide it behind.
  useEffect(() => {
    const wake = wakeRef.current

    if (active) {
      wake.pause()
      void ensureVoiceRuntimeReady().catch(() => {})

      return () => wake.resume()
    }

    wake.resume()

    return undefined
  }, [active])

  useEffect(() => {
    if (phase !== 'greeting') {
      return
    }

    let cancelled = false

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
    // Awaited right before the mic opens, so the detector has finished
    // releasing the device — opening ours while it still holds it makes
    // getUserMedia fail, and the surface just never starts listening.
    beforeMicOpen: () => wakeRef.current.barrier(),
    // Off while a live session is running, and off while one is still being
    // negotiated: opening the mic for the old path and then handing it to the
    // new one loses the first thing said.
    enabled: phase === 'live' && !live,
    onFatalError: () => setPhase('idle'),
    onStopWord: () => setPhase('idle'),
    onSubmit: submit,
    onTranscribeAudio: async (audio: Blob) => {
      const dataUrl = await blobToDataUrl(audio)
      const result = await transcribeAudio(dataUrl, audio.type)

      return result.transcript ?? ''
    },
    pendingResponse: () => {
      if (!spokeThisSessionRef.current) {
        return null
      }

      const speech = collectUnspokenTurnSpeech(voiceMessages(), lastSpokenIdRef.current)

      // A lull offer that found nothing worth raising answers with a sentinel.
      // Swallow it — and mark it spoken, or every later turn would re-collect
      // it and try again.
      if (speech && !speech.pending && isNudgePass(speech.text)) {
        lastSpokenIdRef.current = speech.id

        return null
      }

      return speech
    }
  })

  // Speech-to-speech, when the backend offers it.
  //
  // Claims the surface BEFORE asking whether it is available: `live` gates the
  // four-stage machine, and letting that machine open the microphone during
  // the (cached, fast) negotiation would lose whatever was said first. If no
  // live session is configured, this clears and the old path takes over —
  // which is not a degraded mode, it is the mode this product shipped with.
  //
  // The ref holds an imperative handle CREATED here — a socket and an audio
  // graph that must be torn down on the way out — not a reactive value copied
  // from somewhere else, which is what the rule below exists to stop.
  // eslint-disable-next-line no-restricted-syntax
  useEffect(() => {
    if (phase !== 'live') {
      return
    }

    let cancelled = false

    setLiveStatus('connecting')

    void (async () => {
      let config

      try {
        config = await fetchLiveConfig()
      } catch {
        config = null
      }

      if (cancelled) {
        return
      }

      if (!config) {
        setLiveStatus(null)

        return
      }

      try {
        // The detector and this session share one microphone, exactly as the
        // four-stage path does.
        await wakeRef.current.barrier()

        const session = await startLiveSession({
          config,
          instruction: liveInstruction(BRAND.productName),
          onAsk: request =>
            askEngine(request, {
              busy: () => Boolean($sessionStates.get()[$voiceRuntimeId.get() ?? '']?.busy),
              messages: voiceMessages,
              submit
            }),
          onError: error => notifyError(error, copy.talkAria),
          onStatus: status => {
            if (!cancelled) {
              setLiveStatus(status)
            }
          }
        })

        if (cancelled) {
          session.stop()

          return
        }

        liveRef.current = session
      } catch (error) {
        // Fall back rather than stranding the surface: the old path still
        // works, and a preview model that refuses a connection must not take
        // the ability to talk down with it.
        notifyError(error, copy.talkAria)
        setLiveStatus(null)
      }
    })()

    return () => {
      cancelled = true
      liveRef.current?.stop()
      liveRef.current = null
      setLiveStatus(null)
    }
    // Phase ONLY. `submit` is rebuilt whenever the locale object changes, and
    // depending on it would tear down a live conversation and reconnect it
    // mid-sentence for a reason the user cannot see.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // A prompt queued by something other than the user's own voice — the daily
  // briefing, an idle offer, a reminder later. It rides the SAME submit path a
  // spoken turn takes, so the reply is spoken exactly like any other answer.
  //
  // SUBSCRIBED, not read once: the briefing queues its prompt before the
  // centre is live, but a lull offer is queued while it already is, and a
  // plain read on [phase] would never see that one.
  useEffect(() => {
    if (phase !== 'live') {
      return
    }

    const take = (prompt: null | string) => {
      if (!prompt) {
        return
      }

      $pendingVoicePrompt.set(null)

      // Through the live session when one is holding the conversation: the
      // model then SPEAKS the answer as part of the exchange it is already in.
      // Submitting straight to the engine instead would produce a reply with
      // nothing to say it.
      if (liveRef.current) {
        liveRef.current.say(prompt)

        return
      }

      void submit(prompt)
    }

    // nanostores' subscribe fires immediately with the current value, so this
    // covers the already-queued case too — calling take() separately first
    // would submit a briefing twice.
    return $pendingVoicePrompt.subscribe(take)
  }, [phase, submit])

  const messages = sessionState?.messages ?? []

  // Publish when the centre last did anything, so the lull detector can tell a
  // pause from a dead room. Every state change counts as activity: the surface
  // sits in `listening` for as long as nobody talks, so the transition INTO it
  // is the moment the silence starts.
  useEffect(() => {
    if (phase === 'idle') {
      clearVoiceActivity()

      return
    }

    markVoiceActivity()
  }, [phase, conversation.status, messages.length])

  const stop = () => {
    $announcement.set(null)
    $pendingVoicePrompt.set(null)
    stopVoicePlayback()
    setPhase('idle')
  }

  return {
    active,
    /** What it is DOING this turn — tools, in order. See ActivityTrail. */
    activity: turnActivity(messages),
    start: () => setPhase('greeting'),
    // The greeting is the assistant speaking, and the orb and the readout
    // should say so before the machine itself is running.
    status: phase === 'greeting' ? ('speaking' as const) : (liveStatus ? LIVE_STATUS[liveStatus] : conversation.status),
    stop,
    toggle: () => (phase === 'idle' ? setPhase('greeting') : stop())
  }
}
