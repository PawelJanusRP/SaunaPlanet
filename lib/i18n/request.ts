// SP-047 — next-intl per-request configuration (Server Components).
//
// Registered via createNextIntlPlugin('./lib/i18n/request.ts') in next.config.

import { cookies } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'
import { hasLocale } from 'next-intl'
import { routing, LOCALE_COOKIE } from './routing'
import { loadMessages } from './messages'
import type { Locale } from './locales'

export default getRequestConfig(async ({ requestLocale }) => {
  // In Server Components rendered under /[locale], the segment provides the
  // locale. In Server Actions / route-scoped contexts there is no [locale]
  // segment, so requestLocale is undefined — fall back to the NEXT_LOCALE
  // cookie, which next-intl keeps in sync with the canonical URL locale on every
  // navigation. This makes getTranslations() in Server Actions locale-correct.
  const requested = await requestLocale
  let locale: Locale = routing.defaultLocale
  if (hasLocale(routing.locales, requested)) {
    locale = requested as Locale
  } else {
    const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value
    if (hasLocale(routing.locales, cookieLocale)) {
      locale = cookieLocale as Locale
    }
  }

  return {
    locale,
    messages: await loadMessages(locale),
    // Event times are authored/stored in Poland's zone; formatting only, never
    // a change to stored timestamps or event semantics (SP-047 §18).
    timeZone: 'Europe/Warsaw',
    formats: {
      dateTime: {
        short: { day: 'numeric', month: 'long', year: 'numeric' },
        withTime: {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        },
      },
    },
    getMessageFallback({ namespace, key }) {
      // Never surface raw dotted keys to production users; mark them loudly in
      // development so a missing translation is caught before release.
      const path = [namespace, key].filter(Boolean).join('.')
      return process.env.NODE_ENV === 'production' ? '' : `⟦${path}⟧`
    },
  }
})
