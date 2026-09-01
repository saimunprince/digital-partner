import { getAudioContext } from '@/lib/audio-context'

import { base64ToBytes, bytesToBase64, downsampleTo16k, floatToPcm16, pcm16ToFloat } from './pcm'
import { createLivePlayback, type LivePlayback } from './playback'
import {
  ASK_HERMES,
  buildAudioChunk,
  buildSetup,
  buildTextTurn,
  buildToolResponse,
  type LiveConfig,
  type LiveEvent,
  parseServerMessage
} from './protocol'

export type LiveStatus = 'connecting' | 'listening' | 'speaking' | 'working'

export interface LiveSessionOptions {
  config: LiveConfig
  /** The persona and standing instructions. */
  instruction: string
  /** Run a request through the engine and return a line to say aloud. */
  onAsk: (request: string) => Promise<string>
  onError?: (error: Error) => void
  /** Transcripts, so the surface can show the conversation. */
  onEvent?: (event: LiveEvent) => void
  onStatus?: (status: LiveStatus) => void
}

export interface LiveSession {
  /** Send a prompt as if the user had said it — a briefing, a lull offer. */
  say: (text: string) => void
  stop: () => void
}

/** How much captured audio to batch before sending. Small enough that the
 *  model's own turn detection is not starved, large enough not to make a
 *  frame per animation tick. */
const SEND_INTERVAL_MS = 120

/** Opened while the socket is being set up. A session that cannot start
 *  must fail rather than hang the surface in `connecting` forever. */
const SETUP_TIMEOUT_MS = 15_000

/**
 * A speech-to-speech conversation, with the engine behind it.
 *
 * The live model owns the conversation: it hears continuously, decides for
 * itself when a turn ended, answers in its own voice, and stops when
 * interrupted. None of that round-trips through the four-stage pipeline, which
 * is where its ~0.7s to first word comes from against that path's ~3.2s.
 *
 * The engine owns the work. One declared function hands a request to the
 * agent — memory, board, files, browser, all of it — and its answer comes back
 * to be spoken. So this adds a way of TALKING to the assistant without
 * changing what the assistant is.
 */
export async function startLiveSession(options: LiveSessionOptions): Promise<LiveSession> {
  const { config, instruction, onAsk, onError, onEvent, onStatus } = options

  if (typeof WebSocket === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Live voice needs a browser with WebSocket and microphone access')
  }

  const context = getAudioContext()

  if (!context) {
    throw new Error('Live voice needs WebAudio')
  }

  onStatus?.('connecting')

  const socket = new WebSocket(`${config.url}?key=${encodeURIComponent(config.apiKey)}`)
  let playback: LivePlayback | null = null
  let stream: MediaStream | null = null
  let node: ScriptProcessorNode | null = null
  let source: MediaStreamAudioSourceNode | null = null
  let timer: number | null = null
  let stopped = false
  let ready = false

  const fail = (error: Error) => {
    if (!stopped) {
      onError?.(error)
    }
  }

  const teardown = () => {
    if (stopped) {
      return
    }

    stopped = true

    if (timer !== null) {
      window.clearInterval(timer)
    }

    playback?.stop()
    node?.disconnect()
    source?.disconnect()
    stream?.getTracks().forEach(track => track.stop())

    try {
      socket.close()
    } catch {
      // Already closing. Nothing left to release.
    }
  }

  const send = (frame: Record<string, unknown>) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(frame))
    }
  }

  const handle = async (event: LiveEvent) => {
    switch (event.type) {
      case 'ask': {
        // The model has stopped talking and is waiting on the engine. Say so:
        // an agent turn can take seconds, and a surface that still reads
        // "listening" through it looks broken.
        onStatus?.('working')

        try {
          send(buildToolResponse(event.id, ASK_HERMES, await onAsk(event.request)))
        } catch (error) {
          // Report the failure INTO the conversation rather than only to the
          // log — the model can then tell the user something went wrong,
          // which is the whole reason it asked.
          send(
            buildToolResponse(
              event.id,
              ASK_HERMES,
              `The engine could not complete that: ${error instanceof Error ? error.message : String(error)}`
            )
          )
        }

        break
      }

      case 'audio': {
        playback?.push(pcm16ToFloat(base64ToBytes(event.audio)))
        onStatus?.('speaking')

        break
      }

      case 'interrupted': {
        // The user started talking over the answer. Everything queued is
        // stale; playing it now would be talking over them back.
        playback?.stop()
        onStatus?.('listening')

        break
      }

      case 'ready': {
        ready = true
        onStatus?.('listening')

        break
      }

      case 'turn-complete': {
        onStatus?.('listening')

        break
      }

      default: {
        break
      }
    }

    onEvent?.(event)
  }

  const startCapture = async () => {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { autoGainControl: true, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      video: false
    })

    source = context.createMediaStreamSource(stream)
    // ScriptProcessor is deprecated but universally available, and the app
    // already uses it for wake capture. A worklet would need its own module
    // file served at runtime for no benefit at this buffer size.
    node = context.createScriptProcessor(4096, 1, 1)

    let pending: Float32Array[] = []

    node.onaudioprocess = frame => {
      if (stopped || !ready) {
        return
      }

      pending.push(downsampleTo16k(new Float32Array(frame.inputBuffer.getChannelData(0)), context.sampleRate))
    }

    // Muted sink: a ScriptProcessor does not run unless it is connected to
    // the destination, and connecting it unmuted plays the microphone back
    // through the speakers.
    const mute = context.createGain()

    mute.gain.value = 0
    source.connect(node)
    node.connect(mute)
    mute.connect(context.destination)

    timer = window.setInterval(() => {
      if (stopped || pending.length === 0) {
        return
      }

      const total = pending.reduce((sum, part) => sum + part.length, 0)
      const merged = new Float32Array(total)
      let offset = 0

      for (const part of pending) {
        merged.set(part, offset)
        offset += part.length
      }

      pending = []
      send(buildAudioChunk(bytesToBase64(floatToPcm16(merged))))
    }, SEND_INTERVAL_MS)
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      teardown()
      reject(new Error('Live voice session did not start'))
    }, SETUP_TIMEOUT_MS)

    socket.addEventListener('message', message => {
      // The socket delivers JSON as a Blob; text() is async, so events are
      // handled in arrival order only because each handler awaits its own
      // parse before dispatching.
      const asText =
        typeof message.data === 'string' ? Promise.resolve(message.data) : (message.data as Blob).text()

      void asText
        .then(raw => {
          let parsed: unknown

          try {
            parsed = JSON.parse(raw)
          } catch {
            return
          }

          for (const event of parseServerMessage(parsed)) {
            void handle(event)

            if (event.type === 'ready') {
              window.clearTimeout(timeout)
              playback = createLivePlayback(context)
              startCapture().then(resolve, error => {
                teardown()
                reject(error instanceof Error ? error : new Error(String(error)))
              })
            }
          }
        })
        .catch(() => undefined)
    })

    socket.addEventListener('open', () => send(buildSetup({ config, instruction })))

    socket.addEventListener('error', () => {
      window.clearTimeout(timeout)

      const error = new Error('Live voice connection failed')

      if (ready) {
        fail(error)
      } else {
        teardown()
        reject(error)
      }
    })

    socket.addEventListener('close', () => {
      window.clearTimeout(timeout)

      if (!ready) {
        teardown()
        reject(new Error('Live voice connection closed before it was ready'))

        return
      }

      teardown()
    })
  })

  return {
    say: (text: string) => send(buildTextTurn(text)),
    stop: teardown
  }
}
