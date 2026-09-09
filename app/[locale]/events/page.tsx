import type { Metadata } from 'next'
import EventsPageClient from '@/components/events/EventsPageClient'
import { createClient } from '@supabase/supabase-js'
import { Link } from '@/lib/i18n/navigation'
import { getTranslations, getFormatter } from 'next-intl/server'
import { formatEventPrice } from '@/lib/i18n/formatPrice'
import { localizedAlternates } from '@/lib/i18n/seo'
import type { Locale } from '@/lib/i18n/locales'
import Navbar from '@/components/Navbar'
import type { UpcomingEventRow } from '@/lib/types'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'nav' })
  return { title: t('events'), alternates: localizedAlternates(locale as Locale, '/events') }
}

export default async function EventsPage() {
  const t = await getTranslations('events')
  const format = await getFormatter()
  const { data: events } = await supabase.rpc('get_upcoming_events')

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-5xl p-4">
      <Link href="/" className="mb-4 inline-block rounded-xl border px-4 py-2">
        {t('backToMap')}
      </Link>

      <h1 className="mb-6 text-3xl font-bold">
        {t('list.title')}
      </h1>

	  <div className="mb-8">
	  <EventsPageClient events={events ?? []} />
	  </div>
	  
      {!events || events.length === 0 ? (
        <div className="rounded-2xl border p-6 text-gray-600">
          {t('list.empty')}
        </div>
      ) : (
        <div className="space-y-4">
          {events.map((event: UpcomingEventRow) => (
            <Link
              key={event.event_id}
              href={`/sauna/${event.sauna_id}`}
              className="block rounded-2xl border bg-white p-4 shadow-sm transition hover:bg-orange-50"
            >
              <div className="mb-1 text-xl font-bold text-orange-700">
                🔥 {event.title}
              </div>

              <div className="mb-2 text-sm font-semibold text-gray-800">
                {event.sauna_name}
                {event.city ? ` · ${event.city}` : ''}
              </div>

              <div className="text-sm text-gray-500">
                {event.event_date?.substring(0, 10)}
                {event.event_time
                  ? ` ${event.event_time.substring(0, 5)}`
                  : ''}
              </div>

              {event.price && (
                <div className="mt-2 text-sm font-semibold text-orange-700">
                  {formatEventPrice(format, event.price)}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </main>
    </>
  )
}