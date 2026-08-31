import { describe, expect, it } from 'vitest'

import type { ChatMessage } from '@/lib/chat-messages'

import { turnActivity } from './activity-trail'

function tool(id: string, toolName: string, args: unknown, result?: unknown): ChatMessage {
  return {
    id: `m-${id}`,
    parts: [{ args: args as never, result, toolCallId: id, toolName, type: 'tool-call' }],
    role: 'assistant'
  } as ChatMessage
}

function said(id: string, role: 'assistant' | 'user', text: string): ChatMessage {
  return { id, parts: [{ text, type: 'text' }], role } as ChatMessage
}

describe('the turn activity trail', () => {
  it('shows only what happened after the last thing the user said', () => {
    // A trail that kept the previous turn's steps would be a log; the point of
    // this surface is what is happening right now.
    const steps = turnActivity([
      said('u1', 'user', 'earlier'),
      tool('old', 'web_search', { query: 'yesterday' }, 'done'),
      said('u2', 'user', 'open youtube'),
      tool('new', 'browser_navigate', { url: 'https://youtube.com' })
    ])

    expect(steps.map(step => step.label)).toEqual(['Browser Navigate'])
  })

  it('marks a step with no result yet as running', () => {
    const steps = turnActivity([said('u', 'user', 'go'), tool('a', 'web_search', { query: 'x' }, 'result'), tool('b', 'read_file', { path: '/tmp/x' })])

    expect(steps.map(step => step.running)).toEqual([false, true])
  })

  it('names the tool in words, not in snake case', () => {
    const [step] = turnActivity([said('u', 'user', 'go'), tool('a', 'web_search', {})])

    expect(step.label).toBe('Web Search')
  })

  it('picks one readable argument as the target', () => {
    const [search] = turnActivity([said('u', 'user', 'go'), tool('a', 'web_search', { limit: 5, query: 'rock playlist' })])
    const [read] = turnActivity([said('u', 'user', 'go'), tool('b', 'read_file', { path: '/etc/hosts' })])

    expect(search.target).toBe('rock playlist')
    expect(read.target).toBe('/etc/hosts')
  })

  it('takes only the first line, truncated — a step is a glance, not a payload', () => {
    const [step] = turnActivity([said('u', 'user', 'go'), tool('a', 'run', { command: `${'x'.repeat(80)}\nsecond line` })])

    expect(step.target).toHaveLength(42)
    expect(step.target.endsWith('…')).toBe(true)
    expect(step.target).not.toContain('second')
  })

  it('keeps the newest steps when a turn runs long', () => {
    const messages: ChatMessage[] = [said('u', 'user', 'go')]

    for (let i = 0; i < 9; i++) {
      messages.push(tool(`t${i}`, 'step', { name: String(i) }))
    }

    const steps = turnActivity(messages)

    expect(steps).toHaveLength(5)
    expect(steps.map(step => step.target)).toEqual(['4', '5', '6', '7', '8'])
  })

  it('is empty when nothing has been used', () => {
    expect(turnActivity([said('u', 'user', 'hello'), said('a', 'assistant', 'hi')])).toEqual([])
  })
})
