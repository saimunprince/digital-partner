import { type ChatMessage, chatMessageText } from '@/lib/chat-messages'

/** How long to wait for a turn before telling the model it did not finish.
 *  Long, because a real request can drive a browser or read a repository —
 *  but bounded, because the live model is holding a conversation open. */
const TURN_TIMEOUT_MS = 120_000

/** How often to look. The turn's own latency dwarfs this. */
const POLL_MS = 150

export interface AskEngineDeps {
  /** True while the engine is working on a turn. */
  busy: () => boolean
  /** The thread, read LIVE — a render snapshot freezes at the first frame. */
  messages: () => ChatMessage[]
  /** Send the request down the ordinary prompt path. */
  submit: (text: string) => Promise<void>
  /** Injected so tests do not wait in real time. */
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

function lastAssistantId(messages: ChatMessage[]): null | string {
  return messages.findLast(message => message.role === 'assistant' && !message.hidden)?.id ?? null
}

/** Everything the assistant said after `since`, joined. */
function replyAfter(messages: ChatMessage[], since: null | string): string {
  const start = since ? messages.findLastIndex(message => message.id === since) : -1

  return messages
    .slice(start + 1)
    .filter(message => message.role === 'assistant' && !message.hidden)
    .map(message => chatMessageText(message).trim())
    .filter(Boolean)
    .join('\n\n')
}

/**
 * Run one request through the engine and return what it said.
 *
 * This is the bridge under `ask_hermes`: the live model holds the
 * conversation, and anything needing memory, tools or real data comes through
 * here to the agent — the SAME path a typed message takes, so the answer is
 * built from the same memory, tools and persona rather than a second,
 * divergent brain.
 *
 * The mark is taken BEFORE submitting. Without it the first reply of a resumed
 * thread is indistinguishable from the hundreds already in it, and the model
 * would be handed the whole transcript to read aloud.
 */
export async function askEngine(request: string, deps: AskEngineDeps): Promise<string> {
  const now = deps.now ?? Date.now
  const sleep = deps.sleep ?? wait
  const mark = lastAssistantId(deps.messages())

  await deps.submit(request)

  const deadline = now() + TURN_TIMEOUT_MS
  // The submit is asynchronous on the engine's side: `busy` is still false for
  // a moment after it returns, so waiting for "not busy" immediately would
  // read the answer before the turn had started.
  let started = false

  while (now() < deadline) {
    const working = deps.busy()

    if (working) {
      started = true
    } else if (started) {
      break
    }

    await sleep(POLL_MS)
  }

  const reply = replyAfter(deps.messages(), mark)

  if (reply) {
    return reply
  }

  // Say so rather than returning nothing. An empty tool response leaves the
  // live model with no idea whether the work happened, and it will either
  // invent an outcome or fall silent — both worse than the truth.
  return started
    ? 'The engine finished but said nothing. Tell the user the request did not produce an answer.'
    : 'The engine did not pick up the request. Tell the user it could not be reached.'
}
