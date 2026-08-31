import { ar } from './ar'
import { en } from './en'
import { ja } from './ja'
import { partnerAr } from './partner/ar'
import { partnerEn } from './partner/en'
import { partnerJa } from './partner/ja'
import type { AppTranslations } from './partner/types'
import { partnerZh } from './partner/zh'
import { partnerZhHant } from './partner/zh-hant'
import type { Locale } from './types'
import { zh } from './zh'
import { zhHant } from './zh-hant'

/**
 * Upstream's catalogue plus the product's own strings.
 *
 * Composed at this seam rather than written into the locale files, so those
 * files stay upstream's to edit. Every key of ours living in them was a line
 * that conflicted on every merge for no design reason.
 */
export const TRANSLATIONS: Record<Locale, AppTranslations> = {
  en: { ...en, partner: partnerEn },
  zh: { ...zh, partner: partnerZh },
  'zh-hant': { ...zhHant, partner: partnerZhHant },
  ja: { ...ja, partner: partnerJa },
  ar: { ...ar, partner: partnerAr }
}
