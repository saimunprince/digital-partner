import { PAGE_INSET_X, PAGE_MAX_W } from '@/app/layout-constants'
import { EmptyState } from '@/components/ui/empty-state'
import { useI18n } from '@/i18n'

// Phase B scaffold: this page gains its real content in Phase F. Kept
// minimal-but-intentional until then.
export function TasksView() {
  const { t } = useI18n()

  return (
    <div className={`h-full overflow-y-auto ${PAGE_INSET_X}`}>
      <div className={`mx-auto w-full ${PAGE_MAX_W} py-8`}>
        <h1 className="text-sm font-semibold">{t.partner.tasks.title}</h1>
        <EmptyState className="min-h-[60vh]" description={t.partner.tasks.emptyDesc} title={t.partner.tasks.emptyTitle} />
      </div>
    </div>
  )
}
