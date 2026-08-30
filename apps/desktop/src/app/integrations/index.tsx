import { useNavigate } from 'react-router'

import { PAGE_INSET_X } from '@/app/layout-constants'
import {
  CRON_ROUTE,
  MESSAGING_ROUTE,
  navigateToWorkspacePage,
  SETTINGS_ROUTE,
  SKILLS_ROUTE,
  WEBHOOKS_ROUTE
} from '@/app/routes'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import { ArrowUpRight, Clock, KeyRound, MessageCircle, Package } from '@/lib/icons'
import { cn } from '@/lib/utils'

/** Integrations is a composition page: it routes to the surfaces that already
 *  own each connection type rather than duplicating their panels. Adding a
 *  fifth kind of connection means adding a row here, not a new manager. */
export function IntegrationsView() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const copy = t.partner.integrations

  const rows = [
    {
      desc: copy.channelsDesc,
      icon: <MessageCircle />,
      id: 'channels',
      onOpen: () => navigateToWorkspacePage(navigate, MESSAGING_ROUTE),
      title: copy.channels
    },
    {
      desc: copy.connectorsDesc,
      icon: <Package />,
      id: 'connectors',
      onOpen: () => navigateToWorkspacePage(navigate, `${SKILLS_ROUTE}?tab=mcp`),
      title: copy.connectors
    },
    {
      desc: copy.accountsDesc,
      icon: <KeyRound />,
      id: 'accounts',
      onOpen: () => navigate(`${SETTINGS_ROUTE}?tab=providers`),
      title: copy.accounts
    },
    {
      desc: copy.automationDesc,
      icon: <Clock />,
      id: 'automation',
      onOpen: () => navigate(CRON_ROUTE),
      secondary: () => navigate(WEBHOOKS_ROUTE),
      title: copy.automation
    }
  ]

  return (
    <div className={cn('h-full overflow-y-auto', PAGE_INSET_X)}>
      <div className="mx-auto w-full max-w-[52rem] py-10">
        <h1 className="text-[1.25rem] font-medium text-(--ui-text-primary)">{copy.title}</h1>
        <p className="pb-6 pt-1 text-sm text-(--ui-text-secondary)">{copy.emptyDesc}</p>

        <ul className="flex flex-col">
          {rows.map(row => (
            <li className="border-b border-(--ui-stroke-tertiary) last:border-b-0" key={row.id}>
              <button
                className="flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-3 text-left transition-colors duration-100 hover:bg-(--chrome-action-hover)"
                onClick={row.onOpen}
                type="button"
              >
                <span className="grid size-5 shrink-0 place-items-center text-(--ui-text-tertiary) [&_svg]:size-4">
                  {row.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.8125rem] font-medium text-(--ui-text-primary)">{row.title}</span>
                  <span className="block text-xs text-(--ui-text-secondary)">{row.desc}</span>
                </span>
                <Button asChild size="xs" variant="text">
                  <span>
                    {copy.open}
                    <ArrowUpRight />
                  </span>
                </Button>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
