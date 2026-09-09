import { cookies } from 'next/headers'
import { Geist, Geist_Mono } from 'next/font/google'
import { Toaster } from 'sonner'
import { NextIntlClientProvider } from 'next-intl'
import { AuthProvider } from '@/components/AuthProvider'
import { LOCALE_COOKIE } from '@/lib/i18n/routing'
import { loadMessages } from '@/lib/i18n/messages'
import { DEFAULT_LOCALE, HTML_LANG, isLocale, type Locale } from '@/lib/i18n/locales'
import '../../globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const viewport = {
  themeColor: '#ffffff',
}

/**
 * Claim routes stay UNPREFIXED (outside /[locale]) so invitation links already
 * sent during SP-039P — and their referrer/no-index headers — keep working
 * exactly. The token in the URL path is untouched. Locale is resolved AFTER the
 * user arrives, from the preference cookie (falling back to Polish, the
 * historical language of these links). This is a preference, not URL authority.
 */
export default async function ClaimRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value
  const locale: Locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE
  const messages = await loadMessages(locale)

  return (
    <html
      lang={HTML_LANG[locale]}
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#000000" />
      </head>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AuthProvider>
            {children}
            <Toaster position="top-center" richColors closeButton />
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
