import { useEffect, useState } from 'react'

import { cn } from '@/lib/utils'

/**
 * The quiet columns either side of the orb.
 *
 * The orb needs air around it, but air is not the same as emptiness — a metre
 * of nothing on both sides reads as an unfinished page. These fill it with the
 * two things worth knowing at a glance and nothing else: what time it is, and
 * what is waiting. Tertiary ink, no boxes, no borders — they must never
 * compete with the one living element on the surface.
 *
 * Hidden while talking: during a conversation the orb is the whole page.
 */

function useNow(): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    // Tick on the MINUTE, not every second: a seconds display on a calm
    // surface is a flicker in the corner of the eye, and a 1s timer to render
    // a value that changes every 60s is 59 wasted renders.
    const align = (60 - new Date().getSeconds()) * 1000
    let interval: number | undefined

    const start = window.setTimeout(() => {
      setNow(new Date())
      interval = window.setInterval(() => setNow(new Date()), 60_000)
    }, align)

    return () => {
      window.clearTimeout(start)

      if (interval) {
        window.clearInterval(interval)
      }
    }
  }, [])

  return now
}

export function OrbClock({ className }: { className?: string }) {
  const now = useNow()

  return (
    <div className={cn('presence-aside select-none text-right', className)}>
      <div className="text-voice text-[2rem] leading-none text-(--ui-text-secondary) tabular-nums">
        {now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
      </div>
      <div className="pt-1.5 text-[0.6875rem] uppercase tracking-[0.16em] text-(--ui-text-tertiary)">
        {now.toLocaleDateString(undefined, { weekday: 'long' })}
      </div>
      <div className="text-[0.6875rem] text-(--ui-text-tertiary)">
        {now.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}
      </div>
    </div>
  )
}

export interface GlanceLine {
  label: string
  value: string
}

/** Whatever is worth one line each. Empty lines are dropped by the caller, so
 *  a quiet day shows a short column rather than a list of zeroes. */
export function OrbGlance({ className, lines }: { className?: string; lines: GlanceLine[] }) {
  if (lines.length === 0) {
    return <div className={className} />
  }

  return (
    <ul className={cn('presence-aside flex select-none flex-col gap-2.5', className)}>
      {lines.map(line => (
        <li key={line.label}>
          <div className="text-[0.6875rem] uppercase tracking-[0.16em] text-(--ui-text-tertiary)">{line.label}</div>
          <div className="text-[0.8125rem] text-(--ui-text-secondary)">{line.value}</div>
        </li>
      ))}
    </ul>
  )
}
