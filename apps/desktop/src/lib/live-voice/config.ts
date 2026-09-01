import { fetchVoiceClientConfig } from '@/lib/voice-client-direct'

import type { LiveConfig } from './protocol'

/**
 * The live session's credentials, from the same endpoint and the same cache
 * the direct STT/TTS path already uses.
 *
 * `/api/audio/voice-config` now returns a third block beside `stt` and `tts`.
 * `voice-client-direct.ts` is upstream's file and its `VoiceClientConfig` does
 * not declare it — reading the field through a local shape here keeps that
 * file byte-identical to upstream (see docs/UPSTREAM.md) while still reusing
 * its scoped, TTL'd fetch instead of opening a second one.
 */
interface LiveBlock {
  api_key?: unknown
  language?: unknown
  mode?: unknown
  model?: unknown
  reason?: unknown
  url?: unknown
  voice?: unknown
  wire?: unknown
}

/** The one wire shape this client speaks. Anything else is not ours to drive. */
const GEMINI_BIDI = 'gemini-bidi'

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * The live config, or null when speech-to-speech is not available.
 *
 * Null is the ordinary answer, not a failure: the feature is off by default,
 * needs a key, and rides a preview model. Every caller falls back to the
 * four-stage path, which is the mode this product shipped with.
 */
export async function fetchLiveConfig(): Promise<LiveConfig | null> {
  const config = (await fetchVoiceClientConfig()) as (Record<string, unknown> & { live?: LiveBlock }) | null
  const live = config?.live

  if (!live || live.mode !== 'direct' || live.wire !== GEMINI_BIDI) {
    return null
  }

  const apiKey = text(live.api_key)
  const model = text(live.model)
  const url = text(live.url)

  // A half-resolved block is a backend bug, not something to paper over with
  // defaults invented on this side — connecting with a guessed model or no
  // key fails in a way that looks like the feature is broken.
  if (!apiKey || !model || !url) {
    return null
  }

  return { apiKey, language: text(live.language), model, url, voice: text(live.voice) }
}
