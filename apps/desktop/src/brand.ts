/**
 * Brand configuration — the single source of product identity.
 *
 * The final product name is intentionally undecided; every user-facing surface
 * reads from here (directly, or via the `{brand}` i18n token interpolated in
 * `src/i18n/brand-interpolate.ts`) so the identity can change without a code
 * sweep. Do not hardcode a product name anywhere else.
 *
 * Engine-truth strings ("Hermes background process exited", "Hermes Cloud",
 * install/update copy) intentionally keep the Hermes name — the engine is
 * still Hermes; only the product identity is branded.
 */

export interface BrandConfig {
  /** Product name shown in window titles, notifications, about. */
  productName: string
  /** Name the assistant goes by in conversational/voice copy. */
  assistantName: string
  /** Short tagline for onboarding/about surfaces. */
  tagline: string
  /** Brand mark asset path (renderer-relative) used by BrandMark. */
  markAsset: null | string
}

const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {}

const DEFAULTS: BrandConfig = {
  productName: 'Partner',
  assistantName: 'Partner',
  tagline: 'Your digital partner',
  markAsset: null
}

export const BRAND: BrandConfig = {
  productName: env.VITE_BRAND_NAME || DEFAULTS.productName,
  assistantName: env.VITE_BRAND_ASSISTANT_NAME || env.VITE_BRAND_NAME || DEFAULTS.assistantName,
  tagline: env.VITE_BRAND_TAGLINE || DEFAULTS.tagline,
  markAsset: env.VITE_BRAND_MARK_ASSET || DEFAULTS.markAsset
}
