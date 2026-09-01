import { describe, expect, it, vi } from 'vitest'

import type { ChatMessage } from '@/lib/chat-messages'

import { askEngine } from './ask-engine'

const say = (id: string, role: 'assistant' | 'user', text: string, hidden = false): ChatMessage =>
  ({ hidden, id, parts: [{ text, type: 'text' }], role }) as ChatMessage

/** A fake clock, so the timeout path costs no real time. */
function clock() {
  let time = 0

  return { now: () => time, sleep: async (ms: number) => void (time += ms) }
}

describe('askEngine', () => {
  it('returns what the assistant said for this request', async () => {
    const messages = [say('a0', 'assistant', 'older answer')]
    let busy = false

    const reply = await askEngine('how many tasks', {
      ...clock(),
      busy: () => busy,
      messages: () => messages,
      submit: async () => {
        busy = true
        messages.push(say('u1', 'user', 'how many tasks'), say('a1', 'assistant', 'Four tasks.'))
        // The turn settles on the next poll.
        setTimeout(() => (busy = false), 0)
        await Promise.resolve()
      }
    })

    expect(reply).toBe('Four tasks.')
  })

  // The mark is what stops a resumed thread — hundreds of messages long —
  // from being handed back to be read aloud.
  it('ignores everything the assistant said before this request', async () => {
    const messages = [say('a0', 'assistant', 'yesterday'), say('a1', 'assistant', 'this morning')]
    let busy = false

    const reply = await askEngine('x', {
      ...clock(),
      busy: () => busy,
      messages: () => messages,
      submit: async () => {
        busy = true
        messages.push(say('a2', 'assistant', 'right now'))
        setTimeout(() => (busy = false), 0)
      }
    })

    expect(reply).toBe('right now')
  })

  it('joins a turn that answered in several parts', async () => {
    const messages: ChatMessage[] = []
    let busy = false

    const reply = await askEngine('x', {
      ...clock(),
      busy: () => busy,
      messages: () => messages,
      submit: async () => {
        busy = true
        messages.push(say('a1', 'assistant', 'Checking.'), say('a2', 'assistant', 'Four tasks.'))
        setTimeout(() => (busy = false), 0)
      }
    })

    expect(reply).toBe('Checking.\n\nFour tasks.')
  })

  it('skips hidden messages', async () => {
    const messages: ChatMessage[] = []
    let busy = false

    const reply = await askEngine('x', {
      ...clock(),
      busy: () => busy,
      messages: () => messages,
      submit: async () => {
        busy = true
        messages.push(say('a1', 'assistant', 'internal', true), say('a2', 'assistant', 'Done.'))
        setTimeout(() => (busy = false), 0)
      }
    })

    expect(reply).toBe('Done.')
  })

  // `busy` is still false for a moment after submit returns. Reading the
  // thread then would answer before the turn had even started.
  it('waits for the turn to start before reading the answer', async () => {
    const messages: ChatMessage[] = []
    let busy = false
    let polls = 0

    const reply = await askEngine('x', {
      busy: () => {
        polls += 1

        if (polls === 3) {
          busy = true
        }

        if (polls === 6) {
          busy = false
          messages.push(say('a1', 'assistant', 'Late answer.'))
        }

        return busy
      },
      messages: () => messages,
      now: () => 0,
      sleep: async () => undefined,
      submit: async () => undefined
    })

    expect(reply).toBe('Late answer.')
  })

  // An empty tool response leaves the live model guessing: it will either
  // invent an outcome or go silent. Both are worse than saying what happened.
  it('says so when the turn ran but produced nothing', async () => {
    let busy = false
    let polls = 0

    const reply = await askEngine('x', {
      ...clock(),
      busy: () => {
        polls += 1
        busy = polls < 3

        return busy
      },
      messages: () => [],
      submit: async () => undefined
    })

    expect(reply).toContain('said nothing')
  })

  it('says so when the engine never picked the request up', async () => {
    const reply = await askEngine('x', {
      ...clock(),
      busy: () => false,
      messages: () => [],
      submit: async () => undefined
    })

    expect(reply).toContain('could not be reached')
  })

  it('gives up rather than holding the conversation open forever', async () => {
    const time = clock()

    const reply = await askEngine('x', {
      ...time,
      busy: () => true,
      messages: () => [],
      submit: async () => undefined
    })

    expect(reply).toContain('said nothing')
    expect(time.now()).toBeGreaterThanOrEqual(120_000)
  })

  it('submits the request unchanged', async () => {
    const submit = vi.fn(async () => undefined)

    await askEngine('renew the domain on Friday', { ...clock(), busy: () => false, messages: () => [], submit })

    expect(submit).toHaveBeenCalledWith('renew the domain on Friday')
  })
})
