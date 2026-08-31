import { beforeEach, describe, expect, it } from 'vitest'

import {
  $nudgeState,
  inQuietHours,
  localDateKey,
  markNudged,
  minutesOfDay,
  type NudgeState,
  type NudgeWindow,
  shouldNudge,
  shouldSpeakBriefing
} from './proactive'

const at = (hour: number, minute = 0) => new Date(2026, 7, 30, hour, minute)

const WINDOW = { enabled: true, quietEnd: '07:00', quietStart: '22:00', time: '08:30' }

describe('minutesOfDay', () => {
  it('reads a 24-hour time', () => {
    expect(minutesOfDay('08:30')).toBe(510)
    expect(minutesOfDay('00:00')).toBe(0)
    expect(minutesOfDay('23:59')).toBe(1439)
  })

  it('rejects anything that is not a real time', () => {
    for (const bad of ['', 'morning', '24:00', '08:60', '8', '08:5', '-1:00']) {
      expect(minutesOfDay(bad)).toBeNull()
    }
  })
})

describe('quiet hours', () => {
  it('covers a window that wraps midnight', () => {
    // The realistic setting. A plain start <= t < end test gets every one of
    // these backwards.
    expect(inQuietHours(at(23), '22:00', '07:00')).toBe(true)
    expect(inQuietHours(at(2), '22:00', '07:00')).toBe(true)
    expect(inQuietHours(at(6, 59), '22:00', '07:00')).toBe(true)
    expect(inQuietHours(at(7), '22:00', '07:00')).toBe(false)
    expect(inQuietHours(at(12), '22:00', '07:00')).toBe(false)
    expect(inQuietHours(at(21, 59), '22:00', '07:00')).toBe(false)
  })

  it('covers a same-day window', () => {
    expect(inQuietHours(at(10), '09:00', '17:00')).toBe(true)
    expect(inQuietHours(at(18), '09:00', '17:00')).toBe(false)
  })

  it('treats equal bounds as no quiet hours, not silence all day', () => {
    expect(inQuietHours(at(3), '00:00', '00:00')).toBe(false)
  })

  it('ignores a malformed setting rather than muting everything', () => {
    expect(inQuietHours(at(3), 'nope', '07:00')).toBe(false)
  })
})

describe('the daily briefing', () => {
  it('waits until its hour', () => {
    expect(shouldSpeakBriefing(at(8, 29), null, WINDOW)).toBe(false)
    expect(shouldSpeakBriefing(at(8, 30), null, WINDOW)).toBe(true)
  })

  it('still delivers when the machine was asleep at the appointed minute', () => {
    // "At or after" — the day should not be skipped just because the laptop
    // was shut at 08:30.
    expect(shouldSpeakBriefing(at(11), null, WINDOW)).toBe(true)
  })

  it('speaks once a day', () => {
    const now = at(9)

    expect(shouldSpeakBriefing(now, localDateKey(now), WINDOW)).toBe(false)
    expect(shouldSpeakBriefing(now, '2026-08-29', WINDOW)).toBe(true)
  })

  it('stays silent while disabled', () => {
    expect(shouldSpeakBriefing(at(9), null, { ...WINDOW, enabled: false })).toBe(false)
  })

  it('yields to quiet hours', () => {
    // A briefing scheduled inside the quiet window must not talk its way out
    // of it — the whole point of the setting.
    expect(shouldSpeakBriefing(at(23), null, { ...WINDOW, time: '22:30' })).toBe(false)
  })

  it('ignores a malformed time rather than firing every tick', () => {
    expect(shouldSpeakBriefing(at(9), null, { ...WINDOW, time: 'morning' })).toBe(false)
  })
})

describe('shouldNudge', () => {
  const WINDOW: NudgeWindow = {
    dailyLimit: 4,
    enabled: true,
    idleMs: 6 * 60_000,
    quietEnd: '07:00',
    quietStart: '22:00',
    spacingMs: 25 * 60_000
  }
  const FRESH: NudgeState = { count: 0, date: null, lastAt: 0 }
  const at = (hour: number, minute = 0) => new Date(2026, 7, 31, hour, minute, 0)
  const idleFor = (now: Date, ms: number) => now.getTime() - ms

  it('offers once the surface has been silent long enough', () => {
    const now = at(14)

    expect(shouldNudge(now, idleFor(now, 6 * 60_000), FRESH, WINDOW)).toBe(true)
  })

  it('stays quiet while the gap is still short', () => {
    const now = at(14)

    expect(shouldNudge(now, idleFor(now, 5 * 60_000), FRESH, WINDOW)).toBe(false)
  })

  it('stays quiet when disabled', () => {
    const now = at(14)

    expect(shouldNudge(now, idleFor(now, 60 * 60_000), FRESH, { ...WINDOW, enabled: false })).toBe(false)
  })

  it('stays quiet inside the quiet window, however long the lull', () => {
    const now = at(23, 30)

    expect(shouldNudge(now, idleFor(now, 60 * 60_000), FRESH, WINDOW)).toBe(false)
  })

  // The point of the daily limit: a machine left open all day must not be
  // spoken to all day.
  it('stops once the day is spent', () => {
    const now = at(16)
    const spent: NudgeState = { count: 4, date: '2026-08-31', lastAt: 0 }

    expect(shouldNudge(now, idleFor(now, 60 * 60_000), spent, WINDOW)).toBe(false)
  })

  it('does not spend a whole day of offers in one quiet hour', () => {
    const now = at(16)
    const justSpoke: NudgeState = { count: 1, date: '2026-08-31', lastAt: now.getTime() - 10 * 60_000 }

    expect(shouldNudge(now, idleFor(now, 60 * 60_000), justSpoke, WINDOW)).toBe(false)
  })

  it('offers again once the spacing has passed', () => {
    const now = at(16)
    const earlier: NudgeState = { count: 1, date: '2026-08-31', lastAt: now.getTime() - 26 * 60_000 }

    expect(shouldNudge(now, idleFor(now, 60 * 60_000), earlier, WINDOW)).toBe(true)
  })

  it("treats yesterday's spent allowance as a new day", () => {
    const now = at(9)
    const yesterday: NudgeState = { count: 4, date: '2026-08-30', lastAt: now.getTime() - 20 * 60 * 60_000 }

    expect(shouldNudge(now, idleFor(now, 60 * 60_000), yesterday, WINDOW)).toBe(true)
  })

  // A surface that has seen no activity at all has no lull to speak into —
  // it has not started yet.
  it('stays quiet when there is no activity to measure from', () => {
    const now = at(14)

    expect(shouldNudge(now, 0, FRESH, WINDOW)).toBe(false)
  })

  it('stays quiet when the limit is zero', () => {
    const now = at(14)

    expect(shouldNudge(now, idleFor(now, 60 * 60_000), FRESH, { ...WINDOW, dailyLimit: 0 })).toBe(false)
  })
})

describe('markNudged', () => {
  beforeEach(() => {
    $nudgeState.set({ count: 0, date: null, lastAt: 0 })
  })

  it('counts the first offer of the day', () => {
    markNudged(new Date(2026, 7, 31, 14, 0, 0))

    expect($nudgeState.get()).toEqual({ count: 1, date: '2026-08-31', lastAt: new Date(2026, 7, 31, 14).getTime() })
  })

  it('rolls the count over at a date change rather than accumulating', () => {
    $nudgeState.set({ count: 3, date: '2026-08-30', lastAt: 1 })
    markNudged(new Date(2026, 7, 31, 9, 0, 0))

    expect($nudgeState.get().count).toBe(1)
  })
})
