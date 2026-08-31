import { useStore } from '@nanostores/react'
import type { ComponentType } from 'react'
import { useLocation, useNavigate } from 'react-router'

import { Codicon } from '@/components/ui/codicon'
import { Tip } from '@/components/ui/tooltip'
import { useContributions } from '@/contrib/react/use-contributions'
import { useI18n } from '@/i18n'
import {
  Activity,
  Brain,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Command,
  Home,
  Layers3,
  ListChecks,
  MessageCircle,
  MessageSquareText,
  Network,
  Package,
  Plug,
  Settings,
  Starmap,
  Users
} from '@/lib/icons'
import { cn } from '@/lib/utils'
import { $navRailCollapsed, toggleNavRailCollapsed } from '@/store/layout'

import {
  ACTIVITY_ROUTE,
  AGENTS_ROUTE,
  type AppView,
  appViewForPath,
  ARTIFACTS_ROUTE,
  CALENDAR_ROUTE,
  COMMAND_CENTER_ROUTE,
  CRON_ROUTE,
  HOME_ROUTE,
  INTEGRATIONS_ROUTE,
  MEMORY_ROUTE,
  MESSAGING_ROUTE,
  navigateToWorkspacePage,
  NEW_CHAT_ROUTE,
  PROFILES_ROUTE,
  SETTINGS_ROUTE,
  SIDEBAR_NAV_AREA,
  type SidebarNavContribution,
  SKILLS_ROUTE,
  STARMAP_ROUTE,
  TASKS_ROUTE,
  WEBHOOKS_ROUTE
} from '../routes'

interface RailItem {
  id: string
  route: string
  view: AppView
  icon: ComponentType<{ className?: string }>
  keybindActionId: string
}

// The product's primary areas, in day-flow order. Chat activates for every
// session route (view 'chat'), so it stays lit while a conversation is open.
const RAIL_ITEMS: readonly RailItem[] = [
  { id: 'home', route: HOME_ROUTE, view: 'home', icon: Home, keybindActionId: 'nav.home' },
  { id: 'chat', route: NEW_CHAT_ROUTE, view: 'chat', icon: MessageCircle, keybindActionId: 'session.new' },
  { id: 'tasks', route: TASKS_ROUTE, view: 'tasks', icon: ListChecks, keybindActionId: 'nav.tasks' },
  { id: 'calendar', route: CALENDAR_ROUTE, view: 'calendar', icon: CalendarDays, keybindActionId: 'nav.calendar' },
  { id: 'memory', route: MEMORY_ROUTE, view: 'memory', icon: Brain, keybindActionId: 'nav.memory' },
  { id: 'skills', route: SKILLS_ROUTE, view: 'skills', icon: Layers3, keybindActionId: 'nav.skills' },
  { id: 'activity', route: ACTIVITY_ROUTE, view: 'activity', icon: Activity, keybindActionId: 'nav.activity' },
  {
    id: 'integrations',
    route: INTEGRATIONS_ROUTE,
    view: 'integrations',
    icon: Plug,
    keybindActionId: 'nav.integrations'
  }
]

// The rest of the app. These surfaces all work, and until now the only way to
// reach one was to type its URL or already know it was in the command palette
// — which means most of the product was reachable only by people who already
// knew it was there. They live below a rule rather than mixed in: the group
// above is the day's work, this is everything else.
const MORE_ITEMS: readonly RailItem[] = [
  { id: 'automations', route: CRON_ROUTE, view: 'cron', icon: Clock, keybindActionId: 'nav.cron' },
  { id: 'channels', route: MESSAGING_ROUTE, view: 'messaging', icon: MessageSquareText, keybindActionId: 'nav.messaging' },
  { id: 'webhooks', route: WEBHOOKS_ROUTE, view: 'webhooks', icon: Network, keybindActionId: 'nav.webhooks' },
  { id: 'artifacts', route: ARTIFACTS_ROUTE, view: 'artifacts', icon: Package, keybindActionId: 'nav.artifacts' },
  { id: 'memoryGraph', route: STARMAP_ROUTE, view: 'starmap', icon: Starmap, keybindActionId: 'nav.starmap' },
  {
    id: 'commandCenter',
    route: COMMAND_CENTER_ROUTE,
    view: 'command-center',
    icon: Command,
    keybindActionId: 'nav.commandCenter'
  },
  { id: 'profiles', route: PROFILES_ROUTE, view: 'profiles', icon: Users, keybindActionId: 'nav.profiles' },
  { id: 'agents', route: AGENTS_ROUTE, view: 'agents', icon: Users, keybindActionId: 'nav.agents' }
]

function RailRow({
  active,
  collapsed,
  icon,
  label,
  onSelect
}: {
  active: boolean
  collapsed: boolean
  icon: React.ReactNode
  label: string
  onSelect: () => void
}) {
  const row = (
    <button
      aria-current={active ? 'page' : undefined}
      aria-label={label}
      className={cn(
        'flex h-8 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 text-xs outline-none transition-colors duration-100',
        'focus-visible:ring-[0.1875rem] focus-visible:ring-ring/50',
        active
          ? 'bg-(--ui-row-active) font-medium text-(--ui-text-primary)'
          : 'text-(--ui-text-secondary) hover:bg-(--chrome-action-hover) hover:text-(--ui-text-primary)',
        collapsed && 'justify-center px-0'
      )}
      onClick={onSelect}
      type="button"
    >
      <span className="grid size-[18px] shrink-0 place-items-center [&_svg]:size-[18px]">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  )

  // Collapsed rows lose their visible label, so hover teaches the destination.
  return collapsed ? (
    <Tip label={label} side="right">
      {row}
    </Tip>
  ) : (
    row
  )
}

/** The product navigation rail — the leftmost column of the shell. Labeled
 *  rows expanded (15rem), icon-only collapsed (3.25rem); state persists via
 *  `$navRailCollapsed`. Plugin `sidebar.nav` contributions render in their own
 *  cluster below the core areas. */
export function NavRail() {
  const { t } = useI18n()
  const location = useLocation()
  const navigate = useNavigate()
  const collapsed = useStore($navRailCollapsed)
  const navContributions = useContributions(SIDEBAR_NAV_AREA)

  const view = appViewForPath(location.pathname)

  const labels: Record<string, string> = {
    home: t.partner.nav.home,
    chat: t.partner.nav.chat,
    tasks: t.partner.nav.tasks,
    calendar: t.partner.nav.calendar,
    memory: t.partner.nav.memory,
    skills: t.partner.nav.skills,
    activity: t.partner.nav.activity,
    integrations: t.partner.nav.integrations,
    ...t.partner.surfaces
  }

  return (
    <nav
      aria-label={t.partner.nav.home}
      className={cn(
        'flex h-full shrink-0 flex-col gap-0.5 border-e border-(--ui-stroke-tertiary) bg-(--ui-sidebar-surface-background) p-2',
        collapsed ? 'w-[3.25rem]' : 'w-60'
      )}
    >
      {RAIL_ITEMS.map(item => (
        <RailRow
          active={view === item.view}
          collapsed={collapsed}
          icon={<item.icon />}
          key={item.id}
          label={labels[item.id] ?? item.id}
          onSelect={() => navigateToWorkspacePage(navigate, item.route)}
        />
      ))}

      <div className="mx-2 my-1.5 border-t border-(--ui-stroke-tertiary)" />

      {MORE_ITEMS.map(item => (
        <RailRow
          active={view === item.view}
          collapsed={collapsed}
          icon={<item.icon />}
          key={item.id}
          label={labels[item.id] ?? item.id}
          onSelect={() => navigateToWorkspacePage(navigate, item.route)}
        />
      ))}

      {navContributions.length > 0 && (
        <>
          <div className="mx-2 my-1.5 border-t border-(--ui-stroke-tertiary)" />
          {navContributions.map(c => {
            const data = c.data as SidebarNavContribution | undefined

            if (!data?.path) {
              return null
            }

            return (
              <RailRow
                active={location.pathname === data.path}
                collapsed={collapsed}
                icon={<Codicon name={data.codicon} />}
                key={`${c.source ?? 'core'}:${c.id}`}
                label={data.label}
                onSelect={() => navigateToWorkspacePage(navigate, data.path)}
              />
            )
          })}
        </>
      )}

      <div className="flex-1" />

      <RailRow
        active={view === 'settings'}
        collapsed={collapsed}
        icon={<Settings />}
        label={t.partner.nav.settings}
        onSelect={() => navigate(SETTINGS_ROUTE)}
      />
      <button
        aria-label={t.ui.sidebar.toggle(collapsed)}
        className="flex h-7 cursor-pointer items-center justify-center rounded-lg text-(--ui-text-tertiary) transition-colors duration-100 hover:bg-(--chrome-action-hover) hover:text-(--ui-text-primary)"
        onClick={toggleNavRailCollapsed}
        type="button"
      >
        {collapsed ? <ChevronRight className="size-3.5 rtl:hidden" /> : <ChevronLeft className="size-3.5 rtl:hidden" />}
        {collapsed ? <ChevronLeft className="hidden size-3.5 rtl:block" /> : <ChevronRight className="hidden size-3.5 rtl:block" />}
      </button>
    </nav>
  )
}
