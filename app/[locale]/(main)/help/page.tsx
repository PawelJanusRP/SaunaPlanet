import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { CircleHelp, ChevronRight } from 'lucide-react'
import { Link } from '@/lib/i18n/navigation'
import { localizedAlternates } from '@/lib/i18n/seo'
import type { Locale } from '@/lib/i18n/locales'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'help.hub' })
  return {
    title: t('title'),
    alternates: localizedAlternates(locale as Locale, '/help'),
  }
}

/**
 * SP-047E2 — global Help hub. Deliberately lightweight: today it points to the
 * existing Sauna Master help. Future user/owner help, FAQ and contact
 * (SP-042) will be added here — no placeholder links to non-existent pages.
 */
export default async function HelpHubPage() {
  const t = await getTranslations('help.hub')
  return (
    <main className="mx-auto max-w-2xl p-4">
      <h1 className="mb-4 flex items-center gap-2 text-2xl font-bold">
        <CircleHelp className="h-6 w-6 text-orange-600" aria-hidden="true" />
        {t('title')}
      </h1>

      <Link
        href="/help/saunamaster"
        className="flex items-center justify-between gap-3 rounded-2xl border bg-white p-4 shadow-sm transition-colors hover:bg-gray-50"
      >
        <span className="min-w-0">
          <span className="block font-semibold text-gray-900">{t('mastersTitle')}</span>
          <span className="mt-0.5 block text-sm text-gray-500">{t('mastersDescription')}</span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
      </Link>
    </main>
  )
}
