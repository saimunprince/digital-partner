import { describe, expect, it } from 'vitest'

import { BRAND } from '@/brand'

import { brandedTranslations, interpolateBrand } from './brand-interpolate'
import { TRANSLATIONS } from './catalog'

describe('interpolateBrand', () => {
  it('replaces every {brand} token with the product name', () => {
    expect(interpolateBrand('{brand} is ready — open {brand}')).toBe(
      `${BRAND.productName} is ready — open ${BRAND.productName}`
    )
  })

  it('returns token-free strings unchanged', () => {
    const plain = 'Hermes background process exited.'

    expect(interpolateBrand(plain)).toBe(plain)
  })
})

describe('brandedTranslations', () => {
  it('brands nested strings, including engine-process copy', () => {
    const t = brandedTranslations('en', TRANSLATIONS.en)

    expect(t.boot.ready).toBe(`${BRAND.productName} is ready`)
    expect(t.boot.errors.backgroundExited).toBe(`${BRAND.productName} background process exited.`)
  })

  it('leaves external service names and literal paths alone', () => {
    const t = brandedTranslations('en', TRANSLATIONS.en)

    // "Hermes Cloud" is a real hosted account service and the SSH field points
    // at the actual `hermes` binary — renaming either would mislead the user.
    expect(t.settings.connections.kindCloud).toBe('Hermes Cloud')
    expect(t.settings.gateway.sshHermesPathDesc).toContain('hermes binary')
  })

  it('wraps message functions so their output is branded', () => {
    const t = brandedTranslations('en', TRANSLATIONS.en)

    expect(t.preview.largeBody('notes.txt', '2 MB')).toContain(BRAND.productName)
    expect(t.preview.largeBody('notes.txt', '2 MB')).not.toContain('{brand}')
  })

  it('memoizes per locale', () => {
    expect(brandedTranslations('en', TRANSLATIONS.en)).toBe(brandedTranslations('en', TRANSLATIONS.en))
  })
})
