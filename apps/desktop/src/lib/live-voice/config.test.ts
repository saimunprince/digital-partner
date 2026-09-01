import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchLiveConfig } from './config'

vi.mock('@/lib/voice-client-direct', () => ({ fetchVoiceClientConfig: vi.fn() }))

const { fetchVoiceClientConfig } = await import('@/lib/voice-client-direct')
const mocked = vi.mocked(fetchVoiceClientConfig)

const BLOCK = {
  api_key: 'gem_key',
  language: '',
  mode: 'direct',
  model: 'models/live',
  url: 'wss://example/live',
  voice: 'Charon',
  wire: 'gemini-bidi'
}

beforeEach(() => {
  mocked.mockReset()
})

describe('fetchLiveConfig', () => {
  it('reads a resolved block', async () => {
    mocked.mockResolvedValue({ live: BLOCK } as never)

    expect(await fetchLiveConfig()).toEqual({
      apiKey: 'gem_key',
      language: '',
      model: 'models/live',
      url: 'wss://example/live',
      voice: 'Charon'
    })
  })

  // Every one of these is the ordinary answer, not a failure: the feature is
  // off by default, needs a key, and an older backend has never heard of it.
  it.each([
    ['the feature is off', { live: { mode: 'off', reason: 'voice.live.enabled is false' } }],
    ['the backend has no live block', {}],
    ['there is no response at all', null],
    ['the wire is one this client cannot drive', { live: { ...BLOCK, wire: 'something-else' } }]
  ])('returns null when %s', async (_label, response) => {
    mocked.mockResolvedValue(response as never)

    expect(await fetchLiveConfig()).toBeNull()
  })

  // A half-resolved block is a backend bug. Connecting with a guessed model
  // or no key fails in a way that reads as "the feature is broken".
  it.each([['api_key'], ['model'], ['url']])('returns null when %s is missing', async field => {
    mocked.mockResolvedValue({ live: { ...BLOCK, [field]: '' } } as never)

    expect(await fetchLiveConfig()).toBeNull()
  })

  it('keeps an unset voice and language empty rather than inventing one', async () => {
    mocked.mockResolvedValue({ live: { ...BLOCK, language: undefined, voice: undefined } } as never)

    expect(await fetchLiveConfig()).toMatchObject({ language: '', voice: '' })
  })
})
