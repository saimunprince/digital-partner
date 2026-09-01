import { OUTPUT_RATE, pcm16ToFloat } from './pcm'

/**
 * Gapless playback of the model's speech, chunk by chunk as it arrives.
 *
 * Audio comes back in slices of a few tens of milliseconds. Playing each one
 * with `start()` at "now" leaves a seam between every slice — the voice
 * develops a stutter that sounds like a bad connection. So each chunk is
 * scheduled to begin exactly where the previous one ends, on the context's own
 * clock, and only falls back to "now" when the queue has actually run dry.
 */
export interface LivePlayback {
  /** Queue a base64 PCM16 chunk at OUTPUT_RATE. */
  push: (samples: Float32Array) => void
  /** Drop everything queued and stop what is sounding. */
  stop: () => void
  /** True while there is audio scheduled ahead of the clock. */
  readonly speaking: boolean
}

/** A small lead so the first chunk is not scheduled in the past by the time
 *  the graph gets to it. Below roughly this, the start is audibly clipped. */
const LEAD_SECONDS = 0.06

export function createLivePlayback(context: AudioContext, destination?: AudioNode): LivePlayback {
  const output = destination ?? context.destination
  let nextStart = 0
  let live: AudioBufferSourceNode[] = []

  const forget = (node: AudioBufferSourceNode) => {
    live = live.filter(item => item !== node)
  }

  return {
    push(samples: Float32Array) {
      if (samples.length === 0) {
        return
      }

      const buffer = context.createBuffer(1, samples.length, OUTPUT_RATE)

      // set() rather than copyToChannel(): the latter's lib.dom signature
      // pins Float32Array<ArrayBuffer>, and a Float32Array built from a
      // decoded chunk is Float32Array<ArrayBufferLike>.
      buffer.getChannelData(0).set(samples)

      const node = context.createBufferSource()

      node.buffer = buffer
      node.connect(output)
      node.onended = () => forget(node)

      // `nextStart` in the past means the queue drained while we were waiting
      // for the network — resume from now, with a lead, rather than trying to
      // play a chunk that was due a second ago.
      const start = Math.max(nextStart, context.currentTime + LEAD_SECONDS)

      node.start(start)
      nextStart = start + buffer.duration
      live.push(node)
    },
    get speaking() {
      return live.length > 0 && nextStart > context.currentTime
    },
    stop() {
      for (const node of live) {
        try {
          node.stop()
        } catch {
          // Already ended, or never started. Either way it is not sounding.
        }
      }

      live = []
      nextStart = 0
    }
  }
}

/** Decode a base64 PCM16 chunk into the samples `push` takes. */
export function decodeChunk(base64: string, decode: (value: string) => ArrayBuffer): Float32Array {
  return pcm16ToFloat(decode(base64))
}
