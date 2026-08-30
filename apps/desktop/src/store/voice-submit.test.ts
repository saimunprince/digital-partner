import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  canSubmitVoiceText,
  ensureVoiceRuntimeReady,
  setVoiceRuntimeResolver,
  setVoiceSubmitHandler,
  submitVoiceText
} from './voice-submit'

describe('voice submit seam', () => {
  beforeEach(() => {
    setVoiceSubmitHandler(null)
    setVoiceRuntimeResolver(null)
  })

  it('reports when no surface can send yet', () => {
    expect(canSubmitVoiceText()).toBe(false)
  })

  it('routes trimmed text to the registered handler', async () => {
    const handler = vi.fn()

    setVoiceSubmitHandler(handler)

    expect(canSubmitVoiceText()).toBe(true)

    await submitVoiceText('  open my inbox  ')

    expect(handler).toHaveBeenCalledWith('open my inbox')
  })

  it('drops empty utterances rather than sending a blank turn', async () => {
    const handler = vi.fn()

    setVoiceSubmitHandler(handler)
    await submitVoiceText('   ')

    expect(handler).not.toHaveBeenCalled()
  })

  it('does nothing when no handler is registered', async () => {
    await expect(submitVoiceText('hello')).resolves.toBeUndefined()
  })
})

describe('voice runtime binding', () => {
  beforeEach(() => setVoiceRuntimeResolver(null))

  it('binds the thread without sending anything', async () => {
    const submit = vi.fn()
    const resolve = vi.fn(async () => 'runtime-1')

    setVoiceSubmitHandler(submit)
    setVoiceRuntimeResolver(resolve)

    await expect(ensureVoiceRuntimeReady()).resolves.toBe('runtime-1')
    expect(submit).not.toHaveBeenCalled()
  })

  it('reports no runtime rather than throwing before the wiring registers', async () => {
    await expect(ensureVoiceRuntimeReady()).resolves.toBeNull()
  })
})
