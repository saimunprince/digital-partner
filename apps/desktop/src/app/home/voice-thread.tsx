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
 *
 * Rendered even with nothing in it: the band claims its space the moment voice
 * opens, so the orb above it is already in its final position when the first
 * reply arrives rather than being shoved up by it.
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

  return (
    <div
      className={cn('voice-transcript flex w-full min-h-0 flex-1 flex-col gap-7 overflow-y-auto text-left', className)}
      onScroll={event => {
        const band = event.currentTarget
        // A few pixels of slack: a band scrolled to the end by the browser can
        // sit a fraction short of its own height.
        pinnedRef.current = band.scrollHeight - band.scrollTop - band.clientHeight < 24
      }}
      ref={ref}
    >
      {turns.map((turn, index) => {
        const latest = index === turns.length - 1

        return (
          <div className="flex shrink-0 flex-col gap-3" key={turn.id}>
            {turn.said && (
              // The two sides are set differently on purpose. A voice
              // transcript read back as one column of prose gives no way to
              // tell a question from its answer — and half of it is a machine
              // transcription of your own words, which you already know. So
              // yours sits right, contained and quiet; the reply runs left and
              // full-width, where the eye starts.
              <div className="flex justify-end">
                <p
                  className="line-clamp-3 max-w-[76%] rounded-2xl rounded-br-sm border border-(--ui-stroke-tertiary) bg-(--ui-bg-quaternary)/60 px-3.5 py-2 text-[0.875rem] leading-relaxed text-(--ui-text-secondary)"
                  title={turn.said}
                >
                  {turn.said}
                </p>
              </div>
            )}

            {turn.reply && (
              <div className="flex gap-3.5">
                {/* Not a label. A rail says "this side is the assistant" at a
                    glance and takes no vertical space to do it, where "EDITH:"
                    on every turn would be noise on a surface with one voice. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    'w-px shrink-0 self-stretch rounded-full bg-gradient-to-b from-(--ui-accent)/60 via-(--ui-accent)/25 to-transparent',
                    latest ? '' : 'opacity-40'
                  )}
                />
                <SpokenReply
                  className={cn(
                    'min-w-0 flex-1',
                    // Earlier exchanges recede. They are there to be read back,
                    // not to compete with what was just said.
                    latest ? '' : 'opacity-55'
                  )}
                  text={turn.reply}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
