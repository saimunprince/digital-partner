import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ASK_HERMES, type LiveConfig } from './protocol'
import { startLiveSession } from './session'

const CONFIG: LiveConfig = {
  apiKey: 'k',
  language: '',
  model: 'models/live',
  url: 'wss://example/live',
  voice: ''
}

/** A WebSocket that never leaves the process: records what was sent and lets
 *  the test push server frames back. */
class FakeSocket {
  // The real constants. `send()` guards on `socket.readyState ===
  // WebSocket.OPEN`, so a stub without them compares against undefined and
  // silently sends nothing — which is exactly what these tests exist to catch.
  static readonly CLOSED = 3
  static readonly CLOSING = 2
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static last: FakeSocket | null = null
  readyState = 1
  sent: any[] = []
  private listeners: Record<string, ((event: any) => void)[]> = {}

  constructor(readonly url: string) {
    FakeSocket.last = this
  }

  addEventListener(type: string, fn: (event: any) => void) {
    ;(this.listeners[type] ??= []).push(fn)
  }

  close() {
    this.readyState = 3
  }

  emit(type: string, event: unknown = {}) {
    for (const fn of this.listeners[type] ?? []) {
      fn(event)
    }
  }

  /** Deliver a server frame the way the real socket does — as a Blob. */
  async server(frame: unknown) {
    const text = JSON.stringify(frame)

    this.emit('message', { data: { text: () => Promise.resolve(text) } })
    // Two ticks: the handler awaits the blob's text(), then dispatches.
    await Promise.resolve()
    await Promise.resolve()
  }

  send(raw: string) {
    this.sent.push(JSON.parse(raw))
  }
}

function stubAudio() {
  const context = {
    createBuffer: (_c: number, length: number, rate: number) => ({
      duration: length / rate,
      getChannelData: () => new Float32Array(length)
    }),
    createBufferSource: () => ({ buffer: null, connect: vi.fn(), onended: null, start: vi.fn(), stop: vi.fn() }),
    createGain: () => ({ connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 } }),
    createMediaStreamSource: () => ({ connect: vi.fn(), disconnect: vi.fn() }),
    createScriptProcessor: () => ({ connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: null }),
    currentTime: 0,
    destination: {},
    sampleRate: 48_000,
    state: 'running'
  }

  vi.stubGlobal('AudioContext', function AudioContextStub() {
    return context
  })
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop: vi.fn() }] }) }
  })
}

/** Bring a session to `ready` and hand back the socket driving it. */
async function connected(onAsk: (request: string) => Promise<string>) {
  const starting = startLiveSession({ config: CONFIG, instruction: 'Be brief.', onAsk })
  const socket = FakeSocket.last!

  socket.emit('open')
  await socket.server({ setupComplete: {} })

  return { session: await starting, socket }
}

beforeEach(() => {
  FakeSocket.last = null
  vi.stubGlobal('WebSocket', FakeSocket)
  stubAudio()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('startLiveSession', () => {
  it('puts the key in the URL, never in a frame', async () => {
    const { socket } = await connected(async () => 'ok')

    expect(socket.url).toContain('key=k')
    expect(JSON.stringify(socket.sent)).not.toContain('"k"')
  })

  it('opens with the setup frame', async () => {
    const { socket } = await connected(async () => 'ok')

    expect(socket.sent[0].setup.model).toBe('models/live')
  })

  // The load-bearing path of the whole design: the model asks, the engine
  // answers, the answer goes back to be spoken. If this breaks, the assistant
  // can talk but cannot do anything.
  it('runs a request through the engine and returns the answer', async () => {
    const onAsk = vi.fn(async () => 'Four tasks, sir.')
    const { socket } = await connected(onAsk)

    await socket.server({
      toolCall: { functionCalls: [{ args: { request: 'how many tasks' }, id: 'c1', name: ASK_HERMES }] }
    })
    await vi.waitFor(() => expect(socket.sent.some(frame => frame.toolResponse)).toBe(true))

    expect(onAsk).toHaveBeenCalledWith('how many tasks')
    expect(socket.sent.at(-1).toolResponse.functionResponses[0]).toEqual({
      id: 'c1',
      name: ASK_HERMES,
      response: { result: 'Four tasks, sir.' }
    })
  })

  // A failure has to reach the CONVERSATION. Reporting it only to the log
  // leaves the model waiting on a response that never comes, and the user
  // sitting in silence with no idea why.
  it('answers with the failure when the engine throws', async () => {
    const { socket } = await connected(async () => {
      throw new Error('gateway disconnected')
    })

    await socket.server({ toolCall: { functionCalls: [{ args: { request: 'x' }, id: 'c2', name: ASK_HERMES }] } })
    await vi.waitFor(() => expect(socket.sent.some(frame => frame.toolResponse)).toBe(true))

    expect(socket.sent.at(-1).toolResponse.functionResponses[0].response.result).toContain('gateway disconnected')
  })

  it('reports status through the turn', async () => {
    const status: string[] = []

    const starting = startLiveSession({
      config: CONFIG,
      instruction: 'x',
      onAsk: async () => 'done',
      onStatus: value => status.push(value)
    })

    const socket = FakeSocket.last!

    socket.emit('open')
    await socket.server({ setupComplete: {} })
    await starting
    await socket.server({ serverContent: { modelTurn: { parts: [{ inlineData: { data: 'AAAA' } }] } } })

    expect(status[0]).toBe('connecting')
    expect(status).toContain('listening')
    expect(status).toContain('speaking')
  })

  it('says a queued prompt as a completed user turn', async () => {
    const { session, socket } = await connected(async () => 'ok')

    session.say('give me my briefing')

    expect(socket.sent.at(-1).clientContent.turns[0].parts[0].text).toBe('give me my briefing')
  })

  it('closes the socket when stopped', async () => {
    const { session, socket } = await connected(async () => 'ok')

    session.stop()

    expect(socket.readyState).toBe(3)
  })

  // A session that hangs in `connecting` is worse than one that fails: the
  // surface waits forever and the user has nothing to act on.
  it('rejects when the socket closes before it is ready', async () => {
    const starting = startLiveSession({ config: CONFIG, instruction: 'x', onAsk: async () => 'ok' })

    FakeSocket.last!.emit('close')

    await expect(starting).rejects.toThrow(/closed before it was ready/)
  })

  it('rejects when the connection errors before it is ready', async () => {
    const starting = startLiveSession({ config: CONFIG, instruction: 'x', onAsk: async () => 'ok' })

    FakeSocket.last!.emit('error')

    await expect(starting).rejects.toThrow(/connection failed/)
  })
})
