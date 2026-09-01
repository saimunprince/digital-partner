import { describe, expect, it } from 'vitest'

import {
  ASK_HERMES,
  buildAudioChunk,
  buildSetup,
  buildTextTurn,
  buildToolResponse,
  type LiveConfig,
  parseServerMessage
} from './protocol'

const CONFIG: LiveConfig = {
  apiKey: 'secret',
  language: '',
  model: 'models/live',
  url: 'wss://example/live',
  voice: ''
}

const setup = (config: Partial<LiveConfig> = {}) =>
  buildSetup({ config: { ...CONFIG, ...config }, instruction: 'Be brief.' }).setup as Record<string, any>

describe('buildSetup', () => {
  it('asks for audio out and declares the one tool', () => {
    const frame = setup()

    expect(frame.generationConfig.responseModalities).toEqual(['AUDIO'])
    expect(frame.tools[0].functionDeclarations[0].name).toBe(ASK_HERMES)
    expect(frame.systemInstruction.parts[0].text).toBe('Be brief.')
  })

  // Both transcriptions are what leaves a record of the conversation. Without
  // them a live turn happens and nothing remains of it anywhere.
  it('turns on transcription of both sides', () => {
    const frame = setup()

    expect(frame.inputAudioTranscription).toEqual({})
    expect(frame.outputAudioTranscription).toEqual({})
  })

  it('names a voice only when one was chosen', () => {
    expect(setup().generationConfig.speechConfig).toBeUndefined()
    expect(setup({ voice: 'Charon' }).generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe(
      'Charon'
    )
  })

  // Pinning a language is wrong for someone who switches mid-sentence: every
  // sentence in the other language becomes a mistranscription.
  it('pins a language only when one was chosen', () => {
    expect(setup().generationConfig.languageCode).toBeUndefined()
    expect(setup({ language: 'bn-BD' }).generationConfig.languageCode).toBe('bn-BD')
  })

  it('never puts the key in the frame — it belongs in the URL', () => {
    expect(JSON.stringify(setup())).not.toContain('secret')
  })
})

describe('frames', () => {
  it('labels captured audio with the rate the provider expects', () => {
    const frame = buildAudioChunk('AAAA') as any

    expect(frame.realtimeInput.audio.mimeType).toBe('audio/pcm;rate=16000')
    expect(frame.realtimeInput.audio.data).toBe('AAAA')
  })

  it('sends a queued prompt as a completed user turn', () => {
    const frame = buildTextTurn('brief me') as any

    expect(frame.clientContent.turnComplete).toBe(true)
    expect(frame.clientContent.turns[0].parts[0].text).toBe('brief me')
  })

  it('returns the engine’s answer against the call it answers', () => {
    const frame = buildToolResponse('call-1', ASK_HERMES, 'Four tasks.') as any

    expect(frame.toolResponse.functionResponses[0]).toEqual({
      id: 'call-1',
      name: ASK_HERMES,
      response: { result: 'Four tasks.' }
    })
  })
})

describe('parseServerMessage', () => {
  it('reads the handshake', () => {
    expect(parseServerMessage({ setupComplete: {} })).toEqual([{ type: 'ready' }])
  })

  it('reads a request for the engine', () => {
    const events = parseServerMessage({
      toolCall: { functionCalls: [{ args: { request: 'how many tasks' }, id: 'c1', name: ASK_HERMES }] }
    })

    expect(events).toEqual([{ id: 'c1', request: 'how many tasks', type: 'ask' }])
  })

  it('ignores a call for a function this session never declared', () => {
    expect(parseServerMessage({ toolCall: { functionCalls: [{ args: {}, name: 'rm_rf' }] } })).toEqual([])
  })

  it('reads audio, transcripts and the end of a turn from one frame', () => {
    const events = parseServerMessage({
      serverContent: {
        inputTranscription: { text: 'hello' },
        modelTurn: { parts: [{ inlineData: { data: 'QUJD', mimeType: 'audio/pcm' } }] },
        outputTranscription: { text: 'Good evening.' },
        turnComplete: true
      }
    })

    expect(events).toEqual([
      { audio: 'QUJD', type: 'audio' },
      { text: 'hello', type: 'input-transcript' },
      { text: 'Good evening.', type: 'output-transcript' },
      { type: 'turn-complete' }
    ])
  })

  // Interruption has to arrive BEFORE the audio in the same frame, or the
  // session drops the new speech and keeps the stale speech.
  it('reports an interruption ahead of anything else in the frame', () => {
    const events = parseServerMessage({
      serverContent: { interrupted: true, modelTurn: { parts: [{ inlineData: { data: 'QQ==' } }] } }
    })

    expect(events[0]).toEqual({ type: 'interrupted' })
  })

  it('skips a part with no audio in it', () => {
    expect(parseServerMessage({ serverContent: { modelTurn: { parts: [{ text: 'hi' }, {}] } } })).toEqual([])
  })

  // The protocol is a preview and will grow fields. A session that throws on
  // an unknown one dies the day the provider ships it.
  it('yields nothing for a frame it does not recognise', () => {
    expect(parseServerMessage({ somethingNew: { nested: [1, 2] } })).toEqual([])
    expect(parseServerMessage(null)).toEqual([])
    expect(parseServerMessage('nonsense')).toEqual([])
  })
})
