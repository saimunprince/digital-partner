import { profileScoped } from '@/api/client'
import { getApiRequestConnection, getApiRequestProfile, hermesApi } from '@/hermes'

import type { LiveConfig } from './protocol'

/**
 * The live session's credentials, from `/api/audio/voice-config`.
 *
 * Fetched here rather than through `voice-client-direct.ts`, which calls the
 * same endpoint: that file rebuilds the response as `{ stt, tts }` before
 * returning it, so the third block never survives the trip. It is upstream's
 * file — widening its shape would put a conflict in every future pull (see
 * docs/UPSTREAM.md) — so this pays for one extra request instead.
 *
 * Scoped and cached the same way: keyed by (connection, profile) so switching
 * either never reuses another scope's key, and TTL'd so a config change on the
 * gateway lands within a minute without a fetch per conversation.
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

const CACHE_TTL_MS = 60_000

let cached: { at: number; config: LiveConfig | null; key: string } | null = null

function scopeKey(): string {
  return `${getApiRequestConnection() ?? 'local'}::${getApiRequestProfile() ?? 'default'}`
}

/** Drop the cached credentials. Used by tests; scope changes rotate the key. */
export function clearLiveConfigCache(): void {
  cached = null
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readLive(live: LiveBlock | undefined): LiveConfig | null {
  if (!live || live.mode !== 'direct' || live.wire !== GEMINI_BIDI) {
    return null
  }

  const apiKey = text(live.api_key)
  const model = text(live.model)
  const url = text(live.url)

  // A half-resolved block is a backend bug, not something to paper over with
  // defaults invented on this side — connecting with a guessed model or no key
  // fails in a way that looks like the feature is broken.
  if (!apiKey || !model || !url) {
    return null
  }

  return { apiKey, language: text(live.language), model, url, voice: text(live.voice) }
}

/**
 * The live config, or null when speech-to-speech is not available.
 *
 * Null is the ordinary answer, not a failure: the feature is off by default,
 * needs a key, and rides a preview model. Every caller falls back to the
 * four-stage path, which is the mode this product shipped with.
 */
export async function fetchLiveConfig(): Promise<LiveConfig | null> {
  const key = scopeKey()

  if (cached && cached.key === key && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.config
  }

  let config: LiveConfig | null = null

  try {
    const response = await hermesApi<{ live?: LiveBlock; ok: boolean }>({
      ...profileScoped(),
      path: '/api/audio/voice-config'
    })

    config = response?.ok ? readLive(response.live) : null
  } catch {
    // An older backend has never heard of the endpoint, and a transient
    // failure is not worth taking the ability to talk down with it.
    config = null
  }

  cached = { at: Date.now(), config, key }

  return config
}
