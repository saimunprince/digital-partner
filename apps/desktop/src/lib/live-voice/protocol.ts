/**
 * The wire shape of a Gemini live session, as pure data.
 *
 * Kept apart from the socket and the audio graph on purpose: this is the part
 * with rules in it — which frame means the model started speaking, which means
 * it was interrupted, which is a request for the engine — and it is the part
 * worth testing without a microphone.
 */

import { INPUT_RATE } from './pcm'

/** The one function the live model may call. See `ASK_HERMES_DESCRIPTION`. */
export const ASK_HERMES = 'ask_hermes'

/**
 * What the live model is told about itself.
 *
 * The division of labour is the whole design: the live model owns the
 * CONVERSATION — hearing, answering, being interrupted — and the engine owns
 * the WORK. Everything the engine can do (memory, the board, the web, files,
 * the calendar) it reaches through one function rather than by holding sixty
 * kilobytes of tool schema in a session where latency is the product.
 */
export const ASK_HERMES_DESCRIPTION =
  'Hand a request to the assistant engine, which has the user’s memory, task board, files, ' +
  'calendar, browser and the rest of the tools. Use it for anything that needs real data or ' +
  'real action, not for ordinary conversation. Returns a short answer to say aloud.'

export interface LiveConfig {
  apiKey: string
  language: string
  model: string
  url: string
  voice: string
}

export interface LiveSetupOptions {
  config: LiveConfig
  /** The persona and standing instructions, from the app's own copy. */
  instruction: string
}

/** The opening frame. Nothing is sent before this and nothing works until the
 *  server answers `setupComplete`. */
export function buildSetup({ config, instruction }: LiveSetupOptions): Record<string, unknown> {
  const speechConfig = config.voice
    ? { speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: config.voice } } } }
    : {}

  // A language is pinned only when asked for. Left empty the model follows
  // whichever language it just heard, which is the behaviour a bilingual
  // speaker needs — pinning one makes every sentence in the other wrong.
  const languageCode = config.language ? { languageCode: config.language } : {}

  return {
    setup: {
      generationConfig: {
        responseModalities: ['AUDIO'],
        ...speechConfig,
        ...languageCode
      },
      model: config.model,
      // Both transcriptions on: the surface shows what was said and what was
      // answered, and the spoken thread is the record of the conversation.
      // Without these a live turn leaves nothing behind at all.
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      systemInstruction: { parts: [{ text: instruction }] },
      tools: [
        {
          functionDeclarations: [
            {
              description: ASK_HERMES_DESCRIPTION,
              name: ASK_HERMES,
              parameters: {
                properties: {
                  request: {
                    description: 'The request, in full, phrased as the user would type it.',
                    type: 'STRING'
                  }
                },
                required: ['request'],
                type: 'OBJECT'
              }
            }
          ]
        }
      ]
    }
  }
}

/** A chunk of captured microphone audio, on its way up. */
export function buildAudioChunk(base64: string): Record<string, unknown> {
  return {
    realtimeInput: {
      audio: { data: base64, mimeType: `audio/pcm;rate=${INPUT_RATE}` }
    }
  }
}

/** A queued prompt — the briefing, a lull offer — spoken as if typed. */
export function buildTextTurn(text: string): Record<string, unknown> {
  return {
    clientContent: { turnComplete: true, turns: [{ parts: [{ text }], role: 'user' }] }
  }
}

/** The engine's answer, going back so the model can say it. */
export function buildToolResponse(id: string | undefined, name: string, result: string): Record<string, unknown> {
  return {
    toolResponse: { functionResponses: [{ id, name, response: { result } }] }
  }
}

export type LiveEvent =
  /** A slice of the model's speech, base64 PCM at OUTPUT_RATE. */
  | { audio: string; type: 'audio' }
  /** The model stopped because the user started talking. Drop queued audio. */
  | { type: 'interrupted' }
  /** What the model said, as text. */
  | { text: string; type: 'output-transcript' }
  /** The setup was accepted; the session is usable from here. */
  | { type: 'ready' }
  /** The model wants the engine to do something. */
  | { id: string | undefined; request: string; type: 'ask' }
  /** The model finished its turn. */
  | { type: 'turn-complete' }
  /** What the user said, as text. */
  | { text: string; type: 'input-transcript' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Read one server frame into the events the session acts on.
 *
 * A frame carries several of these at once — audio and a transcript and the
 * end of a turn — so this returns a list rather than one verdict. Anything
 * unrecognised yields nothing: the protocol is a preview and will grow fields,
 * and a session that throws on an unknown key is a session that dies the day
 * the provider ships one.
 */
export function parseServerMessage(raw: unknown): LiveEvent[] {
  if (!isRecord(raw)) {
    return []
  }

  const events: LiveEvent[] = []

  if (isRecord(raw.setupComplete) || raw.setupComplete === null) {
    events.push({ type: 'ready' })
  }

  const toolCall = raw.toolCall

  if (isRecord(toolCall) && Array.isArray(toolCall.functionCalls)) {
    for (const call of toolCall.functionCalls) {
      if (!isRecord(call) || call.name !== ASK_HERMES) {
        continue
      }

      const args = isRecord(call.args) ? call.args : {}

      events.push({
        id: typeof call.id === 'string' ? call.id : undefined,
        request: text(args.request),
        type: 'ask'
      })
    }
  }

  const server = raw.serverContent

  if (!isRecord(server)) {
    return events
  }

  // Interruption first: everything already queued for playback is now stale,
  // and playing it over the user is the single rudest thing this surface can
  // do.
  if (server.interrupted === true) {
    events.push({ type: 'interrupted' })
  }

  const turn = server.modelTurn

  if (isRecord(turn) && Array.isArray(turn.parts)) {
    for (const part of turn.parts) {
      if (!isRecord(part)) {
        continue
      }

      const inline = part.inlineData

      if (isRecord(inline) && typeof inline.data === 'string' && inline.data) {
        events.push({ audio: inline.data, type: 'audio' })
      }
    }
  }

  const input = server.inputTranscription

  if (isRecord(input) && text(input.text)) {
    events.push({ text: text(input.text), type: 'input-transcript' })
  }

  const output = server.outputTranscription

  if (isRecord(output) && text(output.text)) {
    events.push({ text: text(output.text), type: 'output-transcript' })
  }

  if (server.turnComplete === true) {
    events.push({ type: 'turn-complete' })
  }

  return events
}
