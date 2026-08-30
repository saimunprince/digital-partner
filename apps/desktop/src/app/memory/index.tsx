import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'

import { PAGE_INSET_X } from '@/app/layout-constants'
import { STARMAP_ROUTE } from '@/app/routes'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Loader } from '@/components/ui/loader'
import { getMemoryStatus, getStarmapGraph } from '@/hermes'
import { useI18n } from '@/i18n'
import { Starmap } from '@/lib/icons'
import { cn } from '@/lib/utils'

function formatBytes(bytes: number): string {
  if (!bytes) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB']
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))

  return `${(bytes / 1024 ** exponent).toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

function Section({ action, children, title }: { action?: React.ReactNode; children: React.ReactNode; title: string }) {
  return (
    <section className="min-w-0 pb-8">
      <div className="flex items-center justify-between gap-3 border-b border-(--ui-stroke-tertiary) pb-1.5">
        <h2 className="text-xs font-medium text-(--ui-text-secondary)">{title}</h2>
        {action}
      </div>
      <div className="pt-3">{children}</div>
    </section>
  )
}

/** The personal knowledge layer: what the assistant remembers about you, and
 *  the skills/knowledge it has built. Content comes from the learning graph
 *  (`/api/learning/graph`) and the memory-file status endpoint — both already
 *  served by the backend. Structural editing of individual entries needs a
 *  memory-content RPC that does not exist yet, so this view stays read-first. */
export function MemoryView() {
  const { t } = useI18n()
  const navigate = useNavigate()

  const graph = useQuery({ queryKey: ['memory', 'graph'], queryFn: () => getStarmapGraph(), retry: false })
  const status = useQuery({ queryKey: ['memory', 'status'], queryFn: () => getMemoryStatus(), retry: false })

  const cards = graph.data?.memory ?? []
  const skills = (graph.data?.nodes ?? []).filter(node => node.kind === 'skill')

  return (
    <div className={cn('h-full overflow-y-auto', PAGE_INSET_X)}>
      <div className="mx-auto w-full max-w-[52rem] py-10">
        <h1 className="pb-6 text-[1.25rem] font-medium text-(--ui-text-primary)">{t.partner.memory.title}</h1>

        {graph.isPending ? (
          <Loader />
        ) : cards.length === 0 && skills.length === 0 ? (
          <EmptyState
            className="min-h-56"
            description={t.partner.memory.emptyDesc}
            title={t.partner.memory.emptyTitle}
          />
        ) : (
          <>
            <Section title={t.partner.memory.remembered}>
              {cards.length === 0 ? (
                <p className="text-xs text-(--ui-text-tertiary)">{t.partner.memory.emptyDesc}</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {cards.map((card, index) => (
                    <li className="min-w-0" key={`${card.title}-${index}`}>
                      <div className="flex items-baseline gap-2">
                        <span className="text-[0.8125rem] font-medium text-(--ui-text-primary)">{card.title}</span>
                        <span className="text-[0.6875rem] text-(--ui-text-tertiary)">
                          {card.source === 'profile' ? t.partner.memory.sourceProfile : t.partner.memory.sourceMemory}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap pt-0.5 text-xs leading-relaxed text-(--ui-text-secondary)">
                        {card.body}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section
              action={
                <Button onClick={() => navigate(STARMAP_ROUTE)} size="xs" variant="text">
                  <Starmap />
                  {t.partner.memory.graphView}
                </Button>
              }
              title={t.partner.memory.learned}
            >
              <ul className="flex flex-wrap gap-1.5">
                {skills.map(node => (
                  <li
                    className="rounded-md bg-(--ui-bg-quaternary) px-2 py-1 text-[0.6875rem] text-(--ui-text-secondary)"
                    key={node.id}
                  >
                    {node.label}
                  </li>
                ))}
              </ul>
            </Section>
          </>
        )}

        {status.data && (
          <Section title={t.partner.memory.filesTitle}>
            <p className="text-xs text-(--ui-text-secondary)">
              {t.partner.memory.filesDesc(
                formatBytes(status.data.builtin_files.memory),
                formatBytes(status.data.builtin_files.user)
              )}
            </p>
            {status.data.active && (
              <p className="pt-1 text-[0.6875rem] text-(--ui-text-tertiary)">
                {t.partner.memory.provider(status.data.active)}
              </p>
            )}
          </Section>
        )}
      </div>
    </div>
  )
}
