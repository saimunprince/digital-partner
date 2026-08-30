/**
 * Main-process brand configuration — mirrors src/brand.ts for surfaces the
 * renderer can't reach (app name, native dialogs, tray, About panel).
 *
 * `HERMES_DESKTOP_APP_NAME` still wins so packaging/tests can override, but
 * the default identity now comes from here. Engine-truth copy (backend,
 * Hermes Cloud, install/update flows) intentionally keeps the Hermes name.
 */

export interface MainBrandConfig {
  productName: string
  tagline: string
}

export const MAIN_BRAND: MainBrandConfig = {
  productName: process.env.HERMES_DESKTOP_BRAND_NAME || 'Partner',
  tagline: 'Your digital partner'
}
