import { BRAND } from '@/brand'

import type { AppTranslations } from './partner/types'
import type { Locale } from './types'

/**
 * Phrases that name the ENGINE, not the product.
 *
 * The hosted service, the pip package, the CLI and the path to the binary keep
 * their real names: they are what the user would type, search for, install, or
 * read in a log, and a renamed one sends someone looking for something that
 * does not exist.
 *
 * Deliberately SHORT. "Hermes backend", "Hermes gateway" and "Hermes runtime"
 * are not on it: those are the product describing its own parts, and a user
 * who is told their "Hermes backend" is out of date has just been shown the
 * name the product exists to replace.
 *
 * Longest first — `Hermes Cloud` must be recognised before bare `Hermes`.
 */
const ENGINE_PHRASES = [
  'Hermes Cloud',
  'Hermes Agent',
  'Hermes CLI',
  'Hermes path'
] as const

/** Where the product's own name goes. Longest first, same reason. */
const PRODUCT_PHRASES = ['Hermes Desktop', 'Hermes'] as const

/** Stand-in for a hidden engine phrase. A private-use codepoint: no catalogue
 *  string contains one, so it cannot collide with real copy. */
const GUARD = String.fromCodePoint(0xf0000)

/**
 * Put the product's name where the interface names the product.
 *
 * A DENY-list, deliberately. An allow-list of keys is what this used to be —
 * and every string upstream added afterwards was missing from it, so "Hermes"
 * leaked into the product until someone noticed. Getting this list wrong now
 * over-brands one string; getting an allow-list wrong leaks the engine's name
 * into the user's face.
 */
export function interpolateBrand(value: string): string {
  if (!value.includes('Hermes') && !value.includes('{brand}')) {
    return value
  }

  // Hide the engine phrases behind a character the catalogue never contains,
  // rewrite what is left, then put them back.
  let out = value

  ENGINE_PHRASES.forEach((phrase, index) => {
    out = out.replaceAll(phrase, `${GUARD}${index}${GUARD}`)
  })

  for (const phrase of PRODUCT_PHRASES) {
    out = out.replaceAll(phrase, BRAND.productName)
  }

  // The token form is still honoured: the product's own strings use it, and it
  // says "this names the product" more plainly than a bare word does.
  out = out.replaceAll('{brand}', BRAND.productName)

  ENGINE_PHRASES.forEach((phrase, index) => {
    out = out.replaceAll(`${GUARD}${index}${GUARD}`, phrase)
  })

  return out
}

type MessageTree = Record<string, unknown>

function isRecord(value: unknown): value is MessageTree {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function brandNode(value: unknown): unknown {
  if (typeof value === 'string') {
    return interpolateBrand(value)
  }

  if (typeof value === 'function') {
    const fn = value as (...args: unknown[]) => string

    return (...args: unknown[]) => interpolateBrand(fn(...args))
  }

  if (Array.isArray(value)) {
    return value.map(brandNode)
  }

  if (isRecord(value)) {
    const out: MessageTree = {}

    for (const [key, child] of Object.entries(value)) {
      out[key] = brandNode(child)
    }

    return out
  }

  return value
}

const cache = new Map<Locale, AppTranslations>()

/** A locale's message tree with the product named — memoized per locale.
 *  BRAND is build-time static, so the cache never needs invalidation. */
export function brandedTranslations(locale: Locale, source: AppTranslations): AppTranslations {
  const cached = cache.get(locale)

  if (cached) {
    return cached
  }

  const branded = brandNode(source) as AppTranslations

  cache.set(locale, branded)

  return branded
}
