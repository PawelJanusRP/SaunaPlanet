'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Globe, Check } from 'lucide-react'
import { usePathname, useRouter } from '@/lib/i18n/navigation'
import { LOCALES, LOCALE_LABELS, type Locale } from '@/lib/i18n/locales'

/**
 * SP-047 language selector. Switches the CURRENT route to the chosen locale
 * (never returns home), preserves the entity/page path and the query string,
 * and lets next-intl persist the NEXT_LOCALE preference cookie. Keyboard
 * accessible with translated aria labels; language names (not flags) are the
 * semantic identifier.
 */
export default function LanguageSelector({
  variant = 'menu',
}: {
  variant?: 'menu' | 'compact'
}) {
  const t = useTranslations('common.language')
  const locale = useLocale() as Locale
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [])

  function switchTo(next: Locale) {
    setOpen(false)
    if (next === locale) return
    const query = searchParams.toString()
    const href = query ? `${pathname}?${query}` : pathname
    startTransition(() => {
      // Preserves the current path + query, changes only the locale segment.
      router.replace(href, { locale: next })
    })
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('choose')}
        className={
          variant === 'compact'
            ? 'flex h-9 w-9 items-center justify-center rounded-xl bg-white/90 text-gray-700 shadow hover:bg-white'
            : 'flex w-full items-center justify-between gap-2.5 rounded-xl px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100'
        }
      >
        <span className="flex items-center gap-2.5">
          <Globe className="h-4 w-4 text-gray-500" aria-hidden="true" />
          {variant === 'menu' && <span>{LOCALE_LABELS[locale]}</span>}
        </span>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={t('label')}
          className="absolute right-0 z-50 mt-1 min-w-[10rem] overflow-hidden rounded-xl border bg-white py-1 shadow-2xl"
        >
          {LOCALES.map((loc) => (
            <li key={loc} role="none">
              <button
                type="button"
                role="option"
                aria-selected={loc === locale}
                onClick={() => switchTo(loc)}
                lang={loc}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
              >
                {LOCALE_LABELS[loc]}
                {loc === locale && (
                  <Check className="h-4 w-4 text-green-600" aria-hidden="true" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
