import { useEffect, useRef } from 'react'

import { cn } from '@/lib/utils'

import { SpokenReply } from './spoken-reply'
import type { VoiceTurn } from './turns'

/**
 * The spoken thread.
 *
 * Scrolls inside a fixed band rather than growing: letting it push the page
 * moved the one control on the surface further down with every sentence, so
 * End was never twice in the same place.
 *
 * Pinned to the bottom, and only while it is already there — scrolling back to
 * re-read something must not be yanked away the moment the assistant speaks
 * again.
 */
export function VoiceThread({ className, turns }: { className?: string; turns: VoiceTurn[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)
  const lastId = turns.at(-1)?.id
  const lastReply = turns.at(-1)?.reply.length ?? 0

  useEffect(() => {
    const band = ref.current

    if (band && pinnedRef.current) {
      band.scrollTop = band.scrollHeight
    }
  }, [lastId, lastReply, turns.length])

  if (turns.length === 0) {
    return null
  }

  return (
    <div
      className={cn('voice-transcript flex max-h-[38vh] w-full flex-col gap-6 overflow-y-auto text-left', className)}
      onScroll={event => {
        const band = event.currentTarget
        // A few pixels of slack: a band scrolled to the end by the browser can
        // sit a fraction short of its own height.
        pinnedRef.current = band.scrollHeight - band.scrollTop - band.clientHeight < 24
      }}
      ref={ref}
    >
      {turns.map((turn, index) => (
        <div className="flex shrink-0 flex-col gap-3" key={turn.id}>
          {turn.said && (
            // Marked with a rule rather than a label: it is obvious whose words
            // these are, and "You:" on a voice surface is clutter.
            //
            // Clamped. Transcription of a long or noisy utterance can run a
            // paragraph, and your own half-heard words must not crowd out the
            // answer to them.
            <p
              className="line-clamp-2 border-l border-(--ui-stroke-secondary) pl-3 text-[0.8125rem] leading-relaxed text-(--ui-text-tertiary)"
              title={turn.said}
            >
              {turn.said}
            </p>
          )}

          {turn.reply && (
            <SpokenReply
              className={cn(
                // Earlier exchanges recede. They are there to be read back,
                // not to compete with what was just said.
                index === turns.length - 1 ? '' : 'opacity-55'
              )}
              text={turn.reply}
            />
          )}
        </div>
      ))}
    </div>
  )
}
