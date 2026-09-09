import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { notFound } from 'next/navigation'
import { Toaster } from 'sonner'
import { NextIntlClientProvider, hasLocale } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { AuthProvider } from '@/components/AuthProvider'
import { routing } from '@/lib/i18n/routing'
import { HTML_LANG, type Locale } from '@/lib/i18n/locales'
import '../globals.css'

// The app is dynamic (Supabase auth cookies on nearly every request, map/query
// deep links). We render locale segments on demand (SSR) rather than statically
// prerendering all variants — SSR still emits correct <html lang>, localized
// metadata and hreflang, so SEO is unaffected. Hence no generateStaticParams.

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

type LayoutProps = {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'metadata' })
  return {
    title: {
      default: t('site.title'),
      template: `%s · ${t('site.name')}`,
    },
    description: t('site.description'),
  }
}

export const viewport = {
  themeColor: '#ffffff',
}

export default async function LocaleLayout({ children, params }: LayoutProps) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }

  return (
    <html
      lang={HTML_LANG[locale as Locale]}
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#000000" />
      </head>
      <body>
        <NextIntlClientProvider>
          <AuthProvider>
            {children}
            <Toaster position="top-center" richColors closeButton />
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
