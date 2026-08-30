/**
 * One-time appearance migration onto the product identity.
 *
 * Appearance is persisted, so simply changing `DEFAULT_SKIN_NAME` only reaches
 * fresh installs — every existing install keeps whatever the previous default
 * wrote, and the new identity never appears. This moves those installs across
 * exactly once.
 *
 * It is deliberately narrow: only installs still sitting on the PREVIOUS
 * default are moved. Anyone who had actively chosen another skin keeps it, and
 * once the flag is set a later switch back is never overridden.
 */

import { persistString, persistStringRecord, storedString, storedStringRecord } from '@/lib/storage'

import { DEFAULT_SKIN_NAME } from './presets'

const MIGRATION_KEY = 'hermes-desktop-appearance-identity-v1'
const SKIN_KEY = 'hermes-desktop-theme-v2'
const PROFILE_SKINS_KEY = 'hermes-desktop-profile-themes-v1'
const MODE_KEY = 'hermes-desktop-mode-v1'
const PROFILE_MODES_KEY = 'hermes-desktop-profile-modes-v1'
const BACKDROP_KEY = 'hermes.desktop.backdrop.v1'

/** The defaults before the product identity landed. */
const PREVIOUS_DEFAULT_SKIN = 'nous'
const PREVIOUS_DEFAULT_MODE = 'light'
const PRODUCT_MODE = 'dark'

export function migrateAppearanceIdentity(): void {
  if (typeof window === 'undefined' || storedString(MIGRATION_KEY)) {
    return
  }

  // Claim the migration first: a failure below must not retry forever.
  persistString(MIGRATION_KEY, '1')

  if (storedString(SKIN_KEY) === PREVIOUS_DEFAULT_SKIN) {
    persistString(SKIN_KEY, DEFAULT_SKIN_NAME)
  }

  if (storedString(MODE_KEY) === PREVIOUS_DEFAULT_MODE) {
    persistString(MODE_KEY, PRODUCT_MODE)
  }

  const perProfileModes = storedStringRecord(PROFILE_MODES_KEY)

  if (Object.keys(perProfileModes).length > 0) {
    persistStringRecord(
      PROFILE_MODES_KEY,
      Object.fromEntries(
        Object.entries(perProfileModes).map(([profile, mode]) => [
          profile,
          mode === PREVIOUS_DEFAULT_MODE ? PRODUCT_MODE : mode
        ])
      )
    )
  }

  const perProfile = storedStringRecord(PROFILE_SKINS_KEY)

  const migrated = Object.fromEntries(
    Object.entries(perProfile).map(([profile, skin]) => [
      profile,
      skin === PREVIOUS_DEFAULT_SKIN ? DEFAULT_SKIN_NAME : skin
    ])
  )

  if (Object.keys(migrated).length > 0) {
    persistStringRecord(PROFILE_SKINS_KEY, migrated)
  }

  // The chat watermark predates the flat ground; drop the stored preference so
  // the new default (off) applies. Anyone who wants it back can re-enable it.
  window.localStorage.removeItem(BACKDROP_KEY)
}
