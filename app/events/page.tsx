import EventsPageClient from '@/components/events/EventsPageClient'
import CalendarView from '@/components/events/CalendarView'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default async function EventsPage() {
  const { data: events } = await supabase.rpc('get_upcoming_events')
  const currentDate = new Date()
  
  return (
    <main className="mx-auto max-w-5xl p-4">
      <Link href="/" className="mb-4 inline-block rounded-xl border px-4 py-2">
        ← Powrót do mapy
      </Link>

      <h1 className="mb-6 text-3xl font-bold">
        🔥 Nadchodzące wydarzenia saunowe
      </h1>

	  <div className="mb-8">
	  <EventsPageClient events={events ?? []} />
	  </div>
	  
      {!events || events.length === 0 ? (
        <div className="rounded-2xl border p-6 text-gray-600">
          Brak nadchodzących wydarzeń.
        </div>
      ) : (
        <div className="space-y-4">
          {events.map((event) => (
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
                  {event.price.includes('zł')
                    ? event.price
                    : `${event.price} zł`}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}