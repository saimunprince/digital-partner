import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { deleteLearningNode, editLearningNode } from '@/hermes'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { confirm } from '@/store/confirm'
import { notifyError } from '@/store/notifications'
import type { StarmapMemoryCard } from '@/types/hermes'

/**
 * One thing the assistant remembers about you, and the two things you should
 * be able to do about it.
 *
 * A partner that remembers is only useful if it can be corrected. It writes
 * these itself, from conversation, and it will sometimes write down the wrong
 * thing — a misheard word, a preference that changed. Without an edit the only
 * remedy was to open the file on disk.
 *
 * The id is derived, not carried: the graph gives cards in file order and its
 * nodes are keyed `memory:<source>:<index>` over the same list (see
 * agent/learning_graph.py). Deriving it here keeps the read path unchanged.
 */
export function MemoryCard({
  card,
  index,
  onChanged
}: {
  card: StarmapMemoryCard
  index: number
  onChanged: () => void
}) {
  const { t } = useI18n()
  const copy = t.partner.memory
  const [draft, setDraft] = useState<null | string>(null)
  const [busy, setBusy] = useState(false)

  const id = `memory:${card.source}:${index}`
  const editing = draft !== null

  const save = async () => {
    const next = (draft ?? '').trim()

    if (!next || next === card.body) {
      setDraft(null)

      return
    }

    setBusy(true)

    try {
      await editLearningNode(id, next)
      setDraft(null)
      onChanged()
    } catch (error) {
      notifyError(error, copy.saveFailed)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    // Forgetting is not undoable from here — the entry is gone from the file.
    if (!(await confirm({ destructive: true, title: copy.forgetConfirm(card.title) }))) {
      return
    }

    setBusy(true)

    try {
      await deleteLearningNode(id)
      onChanged()
    } catch (error) {
      notifyError(error, copy.forgetFailed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="group min-w-0">
      <div className="flex items-baseline gap-2">
        <span className="text-[0.8125rem] font-medium text-(--ui-text-primary)">{card.title}</span>
        <span className="text-[0.6875rem] text-(--ui-text-tertiary)">
          {card.source === 'profile' ? copy.sourceProfile : copy.sourceMemory}
        </span>

        {/* Quiet until the row is under the cursor: a page of memories should
            read as a page, not as a row of buttons. */}
        <span
          className={cn(
            'ml-auto flex shrink-0 items-center gap-1 transition-opacity focus-within:opacity-100 group-hover:opacity-100',
            editing ? 'opacity-100' : 'opacity-0'
          )}
        >
          {editing ? (
            <>
              <Button disabled={busy} onClick={() => void save()} size="xs" variant="outline">
                {t.common.save}
              </Button>
              <Button disabled={busy} onClick={() => setDraft(null)} size="xs" variant="text">
                {t.common.cancel}
              </Button>
            </>
          ) : (
            <>
              <Button disabled={busy} onClick={() => setDraft(card.body)} size="xs" variant="text">
                {copy.edit}
              </Button>
              <Button disabled={busy} onClick={() => void remove()} size="xs" variant="text">
                {copy.forget}
              </Button>
            </>
          )}
        </span>
      </div>

      {editing ? (
        <Textarea
          autoFocus
          className="mt-1.5 min-h-24 text-xs"
          onChange={event => setDraft(event.target.value)}
          value={draft}
        />
      ) : (
        <p className="whitespace-pre-wrap pt-0.5 text-xs leading-relaxed text-(--ui-text-secondary)">{card.body}</p>
      )}
    </li>
  )
}
