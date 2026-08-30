import { describe, expect, it } from 'vitest'

import { briefingWindowFrom } from './use-daily-briefing'

describe('reading the briefing window from config', () => {
  it('takes the configured values', () => {
    expect(
      briefingWindowFrom({
        partner: { briefing: { enabled: true, quiet_end: '06:30', quiet_start: '23:00', time: '07:15' } }
      })
    ).toEqual({ enabled: true, quietEnd: '06:30', quietStart: '23:00', time: '07:15' })
  })

  it('stays silent against a backend that has never heard of the section', () => {
    // Unprompted speech is opt-in: an older backend, a missing key, or a
    // truncated config must all mean "do not talk", never "talk by default".
    for (const config of [{}, null, { partner: {} }, { partner: { briefing: {} } }, 'nonsense']) {
      expect(briefingWindowFrom(config).enabled).toBe(false)
    }
  })

  it('only accepts a literal true for enabled', () => {
    for (const enabled of ['true', 1, 'yes', {}]) {
      expect(briefingWindowFrom({ partner: { briefing: { enabled } } }).enabled).toBe(false)
    }
  })

  it('falls back to sane hours when a value is blank or the wrong type', () => {
    const window = briefingWindowFrom({
      partner: { briefing: { enabled: true, quiet_end: 7, quiet_start: '   ', time: '' } }
    })

    expect(window).toEqual({ enabled: true, quietEnd: '07:00', quietStart: '22:00', time: '08:30' })
  })
})
