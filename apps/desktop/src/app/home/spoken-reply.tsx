import { cn } from '@/lib/utils'
import { notifyError } from '@/store/notifications'

/** Bare URLs, so a link the assistant read out can be opened rather than
 *  retyped. Trailing punctuation is excluded — a sentence ending in a link
 *  should not swallow its own full stop into the href. */
const URL_PATTERN = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g

function openExternal(url: string) {
  return async (event: React.MouseEvent) => {
    event.preventDefault()

    try {
      // Through the main process, never the renderer: a page navigating itself
      // to an arbitrary URL replaces the app.
      await window.hermesDesktop?.openExternal?.(url)
    } catch (error) {
      notifyError(error, url)
    }
  }
}

/** Prose with its links made clickable. */
function Linked({ text }: { text: string }) {
  const parts = text.split(URL_PATTERN)

  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <a
            className="break-all text-(--ui-accent) underline decoration-(--ui-accent)/40 underline-offset-2 hover:decoration-(--ui-accent)"
            href={part}
            key={index}
            onClick={openExternal(part)}
          >
            {part}
          </a>
        ) : (
          part
        )
      )}
    </>
  )
}

/**
 * The assistant's answer as it appears on the voice surface.
 *
 * A spoken reply is written to be HEARD, so what lands on screen is plain
 * prose with the occasional dashed list — no headings, no code, none of the
 * markdown the chat transcript renders. Reaching for the full renderer here
 * would drag its whole visual language onto a surface built for one voice and
 * one paragraph. This does the two things that actually occur: keep the
 * paragraph breaks the model wrote, and set a list as a list rather than as
 * lines beginning with a hyphen.
 */
export function SpokenReply({ className, text }: { className?: string; text: string }) {
  const blocks = text
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(Boolean)

  return (
    <div className={cn('presence-say flex shrink-0 flex-col gap-3.5', className)}>
      {blocks.map((block, index) => {
        const lines = block.split('\n').map(line => line.trim())
        const bullets = lines.filter(line => /^[-•*]\s+/.test(line))

        // A block counts as a list only when every line is one; a stray dash
        // mid-sentence must not turn the paragraph into bullets.
        if (bullets.length > 0 && bullets.length === lines.length) {
          return (
            <ul className="flex flex-col gap-1.5 pl-1" key={index}>
              {bullets.map((line, bullet) => (
                <li className="flex gap-2.5 text-[1.0625rem] leading-[1.65] text-(--ui-text-primary)" key={bullet}>
                  <span aria-hidden="true" className="select-none pt-2 text-(--ui-text-tertiary)">
                    <span className="block size-1 rounded-full bg-current" />
                  </span>
                  <span className="min-w-0">
                    <Linked text={line.replace(/^[-•*]\s+/, '')} />
                  </span>
                </li>
              ))}
            </ul>
          )
        }

        return (
          <p className="text-[1.0625rem] leading-[1.75] text-(--ui-text-primary)" key={index}>
            <Linked text={block} />
          </p>
        )
      })}
    </div>
  )
}
