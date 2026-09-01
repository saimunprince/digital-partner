import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/client', () => ({ profileScoped: () => ({}) }))
vi.mock('@/hermes', () => ({
  getApiRequestConnection: vi.fn(() => null),
  getApiRequestProfile: vi.fn(() => null),
  hermesApi: vi.fn()
}))

const { getApiRequestProfile, hermesApi } = await import('@/hermes')
const { clearLiveConfigCache, fetchLiveConfig } = await import('./config')

const api = vi.mocked(hermesApi)
const profile = vi.mocked(getApiRequestProfile)

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
  api.mockReset()
  profile.mockReturnValue(null)
  clearLiveConfigCache()
})

describe('fetchLiveConfig', () => {
  it('reads a resolved block', async () => {
    api.mockResolvedValue({ live: BLOCK, ok: true } as never)

    expect(await fetchLiveConfig()).toEqual({
      apiKey: 'gem_key',
      language: '',
      model: 'models/live',
      url: 'wss://example/live',
      voice: 'Charon'
    })
  })

  // THE bug this file exists to prevent. It first read the block through
  // voice-client-direct's fetch, which rebuilds the response as { stt, tts } —
  // so `live` was stripped before it arrived and the feature silently never
  // turned on, with a correct backend answering correctly the whole time.
  it('asks the endpoint itself rather than a fetch that narrows the response', async () => {
    api.mockResolvedValue({ live: BLOCK, ok: true } as never)

    await fetchLiveConfig()

    expect(api).toHaveBeenCalledWith(expect.objectContaining({ path: '/api/audio/voice-config' }))
  })

  // Every one of these is the ordinary answer, not a failure.
  it.each([
    ['the feature is off', { live: { mode: 'off', reason: 'voice.live.enabled is false' }, ok: true }],
    ['the backend has no live block', { ok: true }],
    ['the backend reported failure', { live: BLOCK, ok: false }],
    ['there is no response at all', null],
    ['the wire is one this client cannot drive', { live: { ...BLOCK, wire: 'other' }, ok: true }]
  ])('returns null when %s', async (_label, response) => {
    api.mockResolvedValue(response as never)

    expect(await fetchLiveConfig()).toBeNull()
  })

  it.each([['api_key'], ['model'], ['url']])('returns null when %s is missing', async field => {
    api.mockResolvedValue({ live: { ...BLOCK, [field]: '' }, ok: true } as never)

    expect(await fetchLiveConfig()).toBeNull()
  })

  it('returns null rather than throwing when the endpoint is unreachable', async () => {
    api.mockRejectedValue(new Error('404'))

    expect(await fetchLiveConfig()).toBeNull()
  })

  it('keeps an unset voice and language empty rather than inventing one', async () => {
    api.mockResolvedValue({ live: { ...BLOCK, language: undefined, voice: undefined }, ok: true } as never)

    expect(await fetchLiveConfig()).toMatchObject({ language: '', voice: '' })
  })

  it('does not fetch again within the cache window', async () => {
    api.mockResolvedValue({ live: BLOCK, ok: true } as never)

    await fetchLiveConfig()
    await fetchLiveConfig()

    expect(api).toHaveBeenCalledTimes(1)
  })

  // Credentials are per-scope. Reusing another profile's key would talk to the
  // wrong account with the wrong key.
  it('refetches when the profile changes', async () => {
    api.mockResolvedValue({ live: BLOCK, ok: true } as never)

    await fetchLiveConfig()
    profile.mockReturnValue('work')
    await fetchLiveConfig()

    expect(api).toHaveBeenCalledTimes(2)
  })
})
