import { useAuiState } from '@assistant-ui/react'

import { PresenceOrb } from '@/components/presence/presence-orb'
import { cn } from '@/lib/utils'

/**
 * The assistant's presence, once the conversation has started.
 *
 * The intro carries the orb at full size; the moment the first message lands
 * the intro is gone and, until now, so was the orb — Chat became a surface
 * with no sign of who you were talking to. It settles into the corner instead,
 * where it goes on reporting: thinking, running something, speaking.
 *
 * It ARRIVES rather than appears, from the centre it just left, so the two
 * read as one object moving instead of one vanishing and another popping in.
 */
export function ChatPresence({ className }: { className?: string }) {
  const hasMessages = useAuiState(state => state.thread.messages.length > 0)

  if (!hasMessages) {
    return null
  }

  return (
    <div
      aria-hidden="true"
      className={cn(
        'chat-presence pointer-events-none absolute right-4 top-4 z-20 grid size-[8.25rem] place-items-center',
        className
      )}
    >
      <PresenceOrb size="mini" />
    </div>
  )
}
