import { describe, expect, it } from 'vitest'

import type { ChatMessage } from '@/lib/chat-messages'

import { voiceTurns } from './turns'

const say = (id: string, role: 'assistant' | 'user', text: string, hidden = false): ChatMessage =>
  ({ hidden, id, parts: [{ text, type: 'text' }], role }) as ChatMessage

describe('the spoken thread as exchanges', () => {
  it('pairs what was said with what was answered', () => {
    const turns = voiceTurns([say('u1', 'user', 'what is on today?'), say('a1', 'assistant', 'Two meetings.')])

    expect(turns).toEqual([{ id: 'u1', reply: 'Two meetings.', said: 'what is on today?' }])
  })

  it('joins several assistant messages into one reply', () => {
    // A turn narrates and then answers. Both are one reply as far as this
    // surface is concerned.
    const turns = voiceTurns([
      say('u1', 'user', 'open it'),
      say('a1', 'assistant', 'Looking now.'),
      say('a2', 'assistant', 'Opened.')
    ])

    expect(turns).toHaveLength(1)
    expect(turns[0].reply).toBe('Looking now.\n\nOpened.')
  })

  it('shows a turn that has no answer yet', () => {
    // Hiding it until the answer lands is how the surface looks frozen while
    // the assistant is working.
    expect(voiceTurns([say('u1', 'user', 'think about it')])).toEqual([
      { id: 'u1', reply: '', said: 'think about it' }
    ])
  })

  it('keeps an answer that opened the conversation on its own', () => {
    // A briefing or an announcement speaks first; it is still an exchange.
    expect(voiceTurns([say('a1', 'assistant', 'Good morning. Three things today.')])).toEqual([
      { id: 'a1', reply: 'Good morning. Three things today.', said: '' }
    ])
  })

  it('skips hidden messages and empty text', () => {
    const turns = voiceTurns([
      say('h', 'user', 'internal', true),
      say('u1', 'user', 'hello'),
      say('blank', 'assistant', '   '),
      say('a1', 'assistant', 'Hello, sir.')
    ])

    expect(turns).toEqual([{ id: 'u1', reply: 'Hello, sir.', said: 'hello' }])
  })

  it('remembers only the recent exchanges', () => {
    // The thread is persisted and runs to hundreds of messages; the whole of
    // it belongs in Chat, not on a voice surface.
    const messages: ChatMessage[] = []

    for (let i = 0; i < 12; i++) {
      messages.push(say(`u${i}`, 'user', `ask ${i}`), say(`a${i}`, 'assistant', `answer ${i}`))
    }

    const turns = voiceTurns(messages)

    expect(turns).toHaveLength(8)
    expect(turns[0].said).toBe('ask 4')
    expect(turns.at(-1)?.said).toBe('ask 11')
  })
})
