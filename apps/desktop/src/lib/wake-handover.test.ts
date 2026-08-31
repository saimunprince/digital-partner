import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  request: vi.fn(async () => ({})),
  resumeWakeAfterVoice: vi.fn()
}))

vi.mock('@/store/gateway', () => ({ $gateway: { get: () => ({ request: mocks.request }) } }))
vi.mock('@/store/wake-word', () => ({ resumeWakeAfterVoice: mocks.resumeWakeAfterVoice }))

const { createWakeHandover } = await import('./wake-handover')

describe('the wake/voice mic handover', () => {
  beforeEach(() => vi.clearAllMocks())

  it('pauses the detector and re-arms it afterwards', () => {
    // The half that was missing on the Home surface: without the resume, the
    // wake phrase works exactly once per launch.
    const wake = createWakeHandover()

    wake.pause()
    expect(mocks.request).toHaveBeenCalledWith('wake.pause', {})

    wake.resume()
    expect(mocks.resumeWakeAfterVoice).toHaveBeenCalledTimes(1)
  })

  it('never resumes a detector it did not pause', () => {
    // Two surfaces share one detector; resuming someone else's is how a live
    // conversation loses its microphone.
    createWakeHandover().resume()

    expect(mocks.resumeWakeAfterVoice).not.toHaveBeenCalled()
  })

  it('resumes once, however many times it is asked', () => {
    const wake = createWakeHandover()

    wake.pause()
    wake.resume()
    wake.resume()

    expect(mocks.resumeWakeAfterVoice).toHaveBeenCalledTimes(1)
  })

  it('hands out a barrier to await before the mic opens', async () => {
    const wake = createWakeHandover()

    expect(wake.barrier()).toBeUndefined()

    wake.pause()
    await expect(wake.barrier()).resolves.toBeUndefined()
  })

  it('survives a backend with no wake support', async () => {
    // An older backend rejects wake.pause. The conversation must still open.
    mocks.request.mockRejectedValueOnce(new Error('unknown method'))

    const wake = createWakeHandover()

    await expect(wake.pause()).resolves.toBeUndefined()
  })
})
