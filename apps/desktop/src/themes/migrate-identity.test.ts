import { beforeEach, describe, expect, it } from 'vitest'

import { migrateAppearanceIdentity } from './migrate-identity'
import { DEFAULT_SKIN_NAME } from './presets'

const MIGRATION_KEY = 'hermes-desktop-appearance-identity-v1'
const SKIN_KEY = 'hermes-desktop-theme-v2'
const PROFILE_SKINS_KEY = 'hermes-desktop-profile-themes-v1'
const BACKDROP_KEY = 'hermes.desktop.backdrop.v1'

describe('migrateAppearanceIdentity', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('moves an install still on the previous default onto the product identity', () => {
    window.localStorage.setItem(SKIN_KEY, 'nous')

    migrateAppearanceIdentity()

    expect(window.localStorage.getItem(SKIN_KEY)).toBe(DEFAULT_SKIN_NAME)
    expect(window.localStorage.getItem(MIGRATION_KEY)).toBe('1')
  })

  it('leaves a deliberately chosen skin alone', () => {
    window.localStorage.setItem(SKIN_KEY, 'midnight')

    migrateAppearanceIdentity()

    expect(window.localStorage.getItem(SKIN_KEY)).toBe('midnight')
  })

  it('migrates per-profile skins too, keeping non-default choices', () => {
    window.localStorage.setItem(PROFILE_SKINS_KEY, JSON.stringify({ work: 'nous', play: 'ember' }))

    migrateAppearanceIdentity()

    expect(JSON.parse(window.localStorage.getItem(PROFILE_SKINS_KEY) ?? '{}')).toEqual({
      work: DEFAULT_SKIN_NAME,
      play: 'ember'
    })
  })

  it('clears the stored chat watermark so the flat ground applies', () => {
    window.localStorage.setItem(BACKDROP_KEY, 'true')

    migrateAppearanceIdentity()

    expect(window.localStorage.getItem(BACKDROP_KEY)).toBeNull()
  })

  it('runs once — a later switch back is never overridden', () => {
    window.localStorage.setItem(SKIN_KEY, 'nous')
    migrateAppearanceIdentity()

    window.localStorage.setItem(SKIN_KEY, 'nous')
    migrateAppearanceIdentity()

    expect(window.localStorage.getItem(SKIN_KEY)).toBe('nous')
  })
})
