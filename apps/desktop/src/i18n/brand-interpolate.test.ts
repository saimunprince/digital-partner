import { describe, expect, it } from 'vitest'

import { BRAND } from '@/brand'

import { brandedTranslations, interpolateBrand } from './brand-interpolate'
import { TRANSLATIONS } from './catalog'

const NAME = BRAND.productName

describe('naming the product', () => {
  it('replaces the token form', () => {
    expect(interpolateBrand('{brand} is ready — open {brand}')).toBe(`${NAME} is ready — open ${NAME}`)
  })

  it('replaces the bare word, so a string upstream adds is branded too', () => {
    // The reason this is a deny-list. The previous design listed the keys to
    // brand, and every string upstream added afterwards was missing from it —
    // "Let Hermes walk you through the app" shipped with the engine's name in
    // it for exactly that reason.
    expect(interpolateBrand('Let Hermes walk you through the app.')).toBe(
      `Let ${NAME} walk you through the app.`
    )
    expect(interpolateBrand('Hermes Desktop is ready')).toBe(`${NAME} is ready`)
  })

  it('leaves the engine its own name', () => {
    // These are what a user would type, search for, or read in a log. Renaming
    // them sends someone looking for a backend that does not exist.
    for (const phrase of ['Managed by Hermes Cloud', 'Hermes path (optional)', 'Install the Hermes CLI']) {
      expect(interpolateBrand(phrase)).toBe(phrase)
    }
  })

  it('brands the product describing its own parts', () => {
    // "Hermes backend" is not engine truth on this surface — it is the product
    // naming its own half, and telling the user their "Hermes backend" is out
    // of date shows them the name the product exists to replace.
    expect(interpolateBrand('Reconnecting to the remote Hermes backend…')).toBe(
      `Reconnecting to the remote ${NAME} backend…`
    )
  })

  it('brands the product and spares the engine in one string', () => {
    expect(interpolateBrand('Restart Hermes — sign in to Hermes Cloud')).toBe(
      `Restart ${NAME} — sign in to Hermes Cloud`
    )
  })

  it('touches nothing that does not name either', () => {
    const plain = 'Nothing to see here.'

    expect(interpolateBrand(plain)).toBe(plain)
  })
})

describe('the branded catalogue', () => {
  it('leaves no token unresolved in any locale', () => {
    const leaks: string[] = []

    const walk = (node: unknown, path: string) => {
      if (typeof node === 'string' && node.includes('{brand}')) {
        leaks.push(path)
      } else if (node && typeof node === 'object') {
        for (const [key, child] of Object.entries(node)) {
          walk(child, `${path}.${key}`)
        }
      }
    }

    for (const locale of Object.keys(TRANSLATIONS) as (keyof typeof TRANSLATIONS)[]) {
      walk(brandedTranslations(locale, TRANSLATIONS[locale]), locale)
    }

    expect(leaks).toEqual([])
  })

  it('brands the product strings a user actually reads', () => {
    const t = brandedTranslations('en', TRANSLATIONS.en)

    expect(t.boot.ready).toContain(NAME)
    expect(t.boot.ready).not.toContain('Hermes')
  })
})
