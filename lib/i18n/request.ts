// SP-047 — next-intl per-request configuration (Server Components).
//
// Registered via createNextIntlPlugin('./lib/i18n/request.ts') in next.config.

import { getRequestConfig } from 'next-intl/server'
import { hasLocale } from 'next-intl'
import { routing } from './routing'
import { loadMessages } from './messages'
import type { Locale } from './locales'

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale: Locale = hasLocale(routing.locales, requested)
    ? (requested as Locale)
    : routing.defaultLocale

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
