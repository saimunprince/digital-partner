import { describe, expect, it, vi } from 'vitest'

import { OUTPUT_RATE } from './pcm'
import { createLivePlayback } from './playback'

/** Enough of an AudioContext to observe WHEN each chunk was scheduled. */
function fakeContext(startTime = 0) {
  const started: number[] = []
  const stopped: { stop: () => void }[] = []
  let now = startTime

  const context = {
    createBuffer: (_channels: number, length: number, rate: number) => ({
      duration: length / rate,
      getChannelData: () => new Float32Array(length)
    }),
    createBufferSource: () => {
      const node = {
        buffer: null as null | { duration: number },
        connect: vi.fn(),
        onended: null as (() => void) | null,
        start: (at: number) => started.push(at),
        stop: vi.fn()
      }

      stopped.push(node)

      return node
    },
    destination: {},
    get currentTime() {
      return now
    }
  }

  return { advance: (by: number) => (now += by), context, started, stopped }
}

const chunk = (seconds: number) => new Float32Array(Math.round(OUTPUT_RATE * seconds))

describe('createLivePlayback', () => {
  // The whole point: back-to-back chunks must abut exactly. Scheduling each at
  // "now" leaves a seam per chunk and the voice stutters.
  it('schedules each chunk where the previous one ends', () => {
    const { context, started } = fakeContext()
    const playback = createLivePlayback(context as unknown as AudioContext)

    playback.push(chunk(0.5))
    playback.push(chunk(0.5))
    playback.push(chunk(0.5))

    expect(started[1] - started[0]).toBeCloseTo(0.5, 6)
    expect(started[2] - started[1]).toBeCloseTo(0.5, 6)
  })

  it('starts slightly ahead of the clock so the first chunk is not clipped', () => {
    const { context, started } = fakeContext(10)
    const playback = createLivePlayback(context as unknown as AudioContext)

    playback.push(chunk(0.2))

    expect(started[0]).toBeGreaterThan(10)
  })

  // A network stall drains the queue. Resuming from the stale `nextStart`
  // would schedule audio in the past — silence, then a jump.
  it('resumes from now when the queue drained during a stall', () => {
    const { advance, context, started } = fakeContext()
    const playback = createLivePlayback(context as unknown as AudioContext)

    playback.push(chunk(0.1))
    advance(5)
    playback.push(chunk(0.1))

    expect(started[1]).toBeGreaterThan(5)
  })

  it('ignores an empty chunk rather than scheduling nothing at a real time', () => {
    const { context, started } = fakeContext()
    const playback = createLivePlayback(context as unknown as AudioContext)

    playback.push(new Float32Array(0))

    expect(started).toEqual([])
  })

  describe('stop', () => {
    it('stops every scheduled chunk', () => {
      const { context, stopped } = fakeContext()
      const playback = createLivePlayback(context as unknown as AudioContext)

      playback.push(chunk(0.5))
      playback.push(chunk(0.5))
      playback.stop()

      for (const node of stopped) {
        expect(node.stop).toHaveBeenCalled()
      }
    })

    // What "interrupted" means: the next thing said must start immediately,
    // not after the abandoned answer would have finished.
    it('lets the next chunk start at once rather than after the dropped queue', () => {
      const { context, started } = fakeContext()
      const playback = createLivePlayback(context as unknown as AudioContext)

      playback.push(chunk(30))
      playback.stop()
      playback.push(chunk(0.2))

      expect(started[1]).toBeLessThan(1)
    })

    it('survives a node that has already ended', () => {
      const { context, stopped } = fakeContext()
      const playback = createLivePlayback(context as unknown as AudioContext)

      playback.push(chunk(0.1))

      stopped[0].stop = () => {
        throw new Error('InvalidStateError')
      }

      expect(() => playback.stop()).not.toThrow()
    })
  })

  it('reports speaking only while audio is still ahead of the clock', () => {
    const { advance, context } = fakeContext()
    const playback = createLivePlayback(context as unknown as AudioContext)

    expect(playback.speaking).toBe(false)
    playback.push(chunk(1))
    expect(playback.speaking).toBe(true)
    advance(5)
    expect(playback.speaking).toBe(false)
  })
})
