import { beforeEach, describe, expect, it } from 'vitest'

import { $announcedSessionIds, $announcement, claimAnnouncement } from './proactive'

describe('announcing an automation', () => {
  beforeEach(() => {
    $announcedSessionIds.set([])
    $announcement.set(null)
  })

  it('claims a session exactly once', () => {
    // The cron list refreshes on a timer; a second pass over the same finished
    // job must not speak it again.
    expect(claimAnnouncement('cron-1')).toBe(true)
    expect(claimAnnouncement('cron-1')).toBe(false)
  })

  it('remembers across sessions, so a restart does not replay this morning', () => {
    claimAnnouncement('cron-1')
    expect($announcedSessionIds.get()).toContain('cron-1')
  })

  it('forgets the oldest rather than growing without bound', () => {
    for (let i = 0; i < 260; i++) {
      claimAnnouncement(`cron-${i}`)
    }

    const seen = $announcedSessionIds.get()

    expect(seen.length).toBe(200)
    expect(seen).toContain('cron-259')
    expect(seen).not.toContain('cron-0')
  })

  it('lets a forgotten id be claimed again — the cap is memory, not a promise', () => {
    for (let i = 0; i < 260; i++) {
      claimAnnouncement(`cron-${i}`)
    }

    expect(claimAnnouncement('cron-0')).toBe(true)
  })
})
