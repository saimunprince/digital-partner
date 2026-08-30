import { describe, expect, it } from 'vitest'

import { inQuietHours, localDateKey, minutesOfDay, shouldSpeakBriefing } from './proactive'

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
