import { type ChatMessage, chatMessageText } from '@/lib/chat-messages'
import { isNudgePass, isQueuedPrompt } from '@/store/proactive'

/** How far back the surface remembers. The spoken thread is persisted and can
 *  run to hundreds of messages; a voice surface is for the conversation you
 *  are having, and the whole thread lives in Chat. */
const MAX_TURNS = 8

export interface VoiceTurn {
  id: string
  reply: string
  said: string
}

/**
 * The spoken thread as exchanges, oldest first.
 *
 * Grouped rather than listed: what makes a conversation readable is seeing
 * what you asked next to what it answered. A flat run of messages on a surface
 * with no avatars or bubbles reads as one long monologue.
 *
 * A turn with no reply yet still appears — that is the turn in progress, and
 * hiding it until the answer lands is how the surface looks frozen while the
 * assistant works.
 */
export function voiceTurns(messages: readonly ChatMessage[]): VoiceTurn[] {
  const turns: VoiceTurn[] = []

  for (const message of messages) {
    if (message.hidden) {
      continue
    }

    const text = chatMessageText(message).trim()

    if (message.role === 'user') {
      // A briefing or lull prompt rides the ordinary submit path, so it lands
      // here as a user message. The user did not say it, and showing it back
      // to them as their own words is a lie the transcript should not tell.
      if (!isQueuedPrompt(text)) {
        turns.push({ id: message.id, reply: '', said: text })
      }

      continue
    }

    // A lull offer that found nothing worth raising. It was never spoken; it
    // should not be read either.
    if (message.role !== 'assistant' || !text || isNudgePass(text)) {
      continue
    }

    const current = turns.at(-1)

    if (current) {
      // A turn can produce several assistant messages — narration, then the
      // answer. They are one reply as far as this surface is concerned.
      current.reply = current.reply ? `${current.reply}\n\n${text}` : text
    } else {
      // An answer with nothing before it: an announcement, or a briefing that
      // opened the conversation on its own.
      turns.push({ id: message.id, reply: text, said: '' })
    }
  }

  return turns.filter(turn => turn.said || turn.reply).slice(-MAX_TURNS)
}
