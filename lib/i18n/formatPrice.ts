// SP-047E3 — locale-aware event-price presentation.
//
// Event `price` is a free-text field (users may enter "50", "50 zł", "wstęp
// wolny", "50-80", …). We localize ONLY the clean-numeric case as PLN via the
// next-intl formatter (Polish source currency, no conversion); any other value
// is user content and is shown verbatim.

import type { useFormatter } from 'next-intl'

/** Minimal shape of the next-intl formatter's `number` method. */
type NumberFormatter = Pick<ReturnType<typeof useFormatter>, 'number'>

export function formatEventPrice(
  format: NumberFormatter,
  price: string | null | undefined,
): string | null {
  if (price == null) return null
  const trimmed = price.trim()
  if (trimmed === '') return null
  // Clean number (optional single decimal separator) -> locale-aware PLN.
  if (/^\d+([.,]\d{1,2})?$/.test(trimmed)) {
    const n = Number(trimmed.replace(',', '.'))
    if (Number.isFinite(n)) {
      return format.number(n, { style: 'currency', currency: 'PLN' })
    }
  }
  // Free-text price (UGC) — shown as authored, never reformatted.
  return trimmed
}
