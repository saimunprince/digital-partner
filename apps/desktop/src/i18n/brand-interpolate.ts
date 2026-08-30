import { BRAND } from '@/brand'

import type { Locale, Translations } from './types'

/** Replace brand tokens in a translated string. Idempotent and cheap. */
export function interpolateBrand(value: string): string {
  return value.includes('{brand}') ? value.replaceAll('{brand}', BRAND.productName) : value
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

const cache = new Map<Locale, Translations>()

/** A locale's message tree with `{brand}` resolved — memoized per locale.
 *  BRAND is build-time static, so the cache never needs invalidation. */
export function brandedTranslations(locale: Locale, source: Translations): Translations {
  const cached = cache.get(locale)

  if (cached) {
    return cached
  }

  const branded = brandNode(source) as Translations

  cache.set(locale, branded)

  return branded
}
