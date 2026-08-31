import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { PAGE_INSET_X } from '@/app/layout-constants'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Loader } from '@/components/ui/loader'
import { createPartnerTask, deletePartnerTask, listPartnerTasks, type PartnerTask, setPartnerTaskStatus } from '@/hermes'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { notifyError } from '@/store/notifications'

const TASKS_KEY = ['partner', 'tasks'] as const

/** A human-added task waits for you, it does not start an agent. `triage` is
 *  the board's holding column; `running` is claimed by the dispatcher. */
const HELD = 'triage'
const DONE = 'done'

/** Board statuses are worker vocabulary. These are the four states a person
 *  actually thinks in, in the order a day moves through them. */
const GROUPS = [
  { id: 'now', statuses: ['running'] },
  { id: 'next', statuses: ['triage', 'todo', 'ready', 'scheduled'] },
  { id: 'waiting', statuses: ['blocked', 'review'] },
  { id: 'done', statuses: ['done'] }
] as const

function groupTasks(columns: { name: string; tasks: PartnerTask[] }[]) {
  const all = columns.flatMap(column => column.tasks)

  return GROUPS.map(group => ({
    id: group.id,
    tasks: all.filter(task => (group.statuses as readonly string[]).includes(task.status))
  })).filter(group => group.tasks.length > 0)
}

export function TasksView() {
  const { t } = useI18n()
  const copy = t.partner.tasks
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState('')

  const board = useQuery({ queryKey: TASKS_KEY, queryFn: listPartnerTasks, retry: false })
  const refresh = () => queryClient.invalidateQueries({ queryKey: TASKS_KEY })

  const add = useMutation({
    mutationFn: (title: string) => createPartnerTask(title),
    onError: (error: unknown) => notifyError(error, copy.addFailed),
    onSuccess: () => {
      setDraft('')
      void refresh()
    }
  })

  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => setPartnerTaskStatus(id, status),
    onError: (error: unknown) => notifyError(error, copy.loadFailed),
    onSuccess: () => void refresh()
  })

  const remove = useMutation({
    mutationFn: (id: string) => deletePartnerTask(id),
    onError: (error: unknown) => notifyError(error, copy.loadFailed),
    onSuccess: () => void refresh()
  })

  const groups = board.data ? groupTasks(board.data.columns) : []

  const submit = (event: React.FormEvent) => {
    event.preventDefault()

    const title = draft.trim()

    if (title && !add.isPending) {
      add.mutate(title)
    }
  }

  return (
    <div className={cn('h-full overflow-y-auto', PAGE_INSET_X)}>
      <div className="mx-auto w-full max-w-[46rem] py-10">
        <h1 className="pb-6 text-[1.25rem] font-medium text-(--ui-text-primary)">{copy.title}</h1>

        {/* Capture first: the page opens on the thing you came here to do. */}
        <form className="flex items-center gap-2 pb-8" onSubmit={submit}>
          <input
            className="min-w-0 flex-1 border-b border-(--ui-stroke-tertiary) bg-transparent pb-1.5 text-sm text-(--ui-text-primary) outline-none placeholder:text-(--ui-text-tertiary) focus:border-(--ui-stroke-secondary)"
            onChange={event => setDraft(event.target.value)}
            placeholder={copy.addPlaceholder}
            value={draft}
          />
          <Button disabled={!draft.trim() || add.isPending} size="xs" type="submit" variant="outline">
            {copy.add}
          </Button>
        </form>

        {board.isPending ? (
          <Loader />
        ) : board.isError ? (
          <ErrorState title={copy.loadFailed}>
            <Button onClick={() => void board.refetch()} size="xs" variant="outline">
              {t.common.retry}
            </Button>
          </ErrorState>
        ) : groups.length === 0 ? (
          <EmptyState className="min-h-56" description={copy.emptyDesc} title={copy.emptyTitle} />
        ) : (
          groups.map(group => (
            <section className="pb-8" key={group.id}>
              <h2 className="border-b border-(--ui-stroke-tertiary) pb-1.5 text-xs font-medium text-(--ui-text-secondary)">
                {copy.groups[group.id]}
              </h2>
              <ul className="flex flex-col">
                {group.tasks.map(task => {
                  const isDone = task.status === DONE

                  return (
                    <li
                      className="group flex items-baseline gap-3 border-b border-(--ui-stroke-tertiary)/50 py-2"
                      key={task.id}
                    >
                      <span
                        className={cn(
                          'min-w-0 flex-1 text-[0.8125rem] text-(--ui-text-primary)',
                          isDone && 'text-(--ui-text-tertiary) line-through'
                        )}
                      >
                        {task.title}
                      </span>

                      {/* Actions stay quiet until the row is under the cursor —
                          a list of twenty tasks should read as a list. */}
                      <span className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        <Button
                          disabled={move.isPending}
                          onClick={() => move.mutate({ id: task.id, status: isDone ? HELD : DONE })}
                          size="xs"
                          variant="text"
                        >
                          {isDone ? copy.reopen : copy.complete}
                        </Button>
                        <Button
                          disabled={remove.isPending}
                          onClick={() => remove.mutate(task.id)}
                          size="xs"
                          variant="text"
                        >
                          {copy.remove}
                        </Button>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  )
}
