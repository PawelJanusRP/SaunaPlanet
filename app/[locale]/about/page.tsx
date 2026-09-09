import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/lib/i18n/navigation'
import Navbar from '@/components/Navbar'
import { changelog } from '@/lib/changelog'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'metadata.about' })
  return { title: t('title'), description: t('description') }
}

export default async function AboutPage() {
  const t = await getTranslations('about')
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl p-4">
        <Link
          href="/"
          className="mb-4 inline-block rounded-xl border px-4 py-2 text-sm"
        >
          ← {t('backToMap')}
        </Link>

        <section className="rounded-3xl border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-orange-700">🌍 SaunaPlanet</h1>
          <h2 className="mt-4 text-lg font-bold">{t('heading')}</h2>
          <p className="mt-2 text-gray-700 leading-relaxed">
            {t('intro')}
          </p>
        </section>

        <section className="mt-5 rounded-3xl border bg-white p-6 shadow-sm">
          {/* Changelog entries are authored editorial content (see SP-047
              architecture doc — deferred dynamic-content extension point) and
              stay in their authored language for now. */}
          <h2 className="mb-4 text-xl font-bold">{t('recentChanges')}</h2>

          <div className="space-y-6">
            {changelog.map((release) => (
              <article key={`${release.date}-${release.title}`}>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <h3 className="text-base font-bold text-gray-900">
                    {release.title}
                  </h3>
                  <span className="text-sm text-gray-400">{release.date}</span>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {release.items.map((item) => (
                    <li
                      key={item}
                      className="flex gap-2 text-sm text-gray-700 leading-relaxed"
                    >
                      <span aria-hidden="true" className="text-orange-500">
                        •
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      </main>
    </>
  )
}
