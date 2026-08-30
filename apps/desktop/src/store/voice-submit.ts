/**
 * The seam a non-composer surface uses to send a prompt.
 *
 * Home is the voice command center: what you say there must ride the app's
 * ordinary prompt pipeline — fresh draft when there is no session, backend
 * session created on send, messages streamed into the usual stores — rather
 * than a bespoke `prompt.submit` that would drift from it (profile handshake,
 * model selection, cwd, attachment sync all live in that path).
 *
 * The wiring registers the handler; surfaces call `submitVoiceText`. Mirrors
 * the Quick Entry bridge, which solved the same problem for its own window.
 */

let handler: ((text: string) => Promise<unknown> | unknown) | null = null
let resolver: (() => Promise<null | string>) | null = null

/** Registered by the wiring, which owns the real submit machinery. */
export function setVoiceSubmitHandler(fn: ((text: string) => Promise<unknown> | unknown) | null): void {
  handler = fn
}

/** Registered alongside the submit handler: binds (creating if needed) the
 *  voice session WITHOUT sending anything. */
export function setVoiceRuntimeResolver(fn: (() => Promise<null | string>) | null): void {
  resolver = fn
}

/**
 * Bind the voice session before the first thing is said.
 *
 * The spoken thread is persisted, so binding it replays a transcript that can
 * be hundreds of turns long. A surface must be able to see that history — and
 * mark it as already spoken — BEFORE it submits, or the first reply of the
 * session is indistinguishable from every old one still sitting in the thread.
 */
export async function ensureVoiceRuntimeReady(): Promise<null | string> {
  return resolver ? await resolver() : null
}

/** True once a surface can actually send — before this, voice has nowhere to go. */
export function canSubmitVoiceText(): boolean {
  return handler !== null
}

/** Send spoken text through the app's normal prompt path. */
export async function submitVoiceText(text: string): Promise<void> {
  const trimmed = text.trim()

  if (!trimmed || !handler) {
    return
  }

  await handler(trimmed)
}
