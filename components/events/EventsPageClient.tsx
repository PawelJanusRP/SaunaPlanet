'use client'

import { useState } from 'react'
import Link from 'next/link'
import CalendarView from '@/components/events/CalendarView'

type UpcomingEvent = {
  event_id: string
  title: string
  event_date: string
  event_time: string | null
  price: string | null
  sauna_id: string
  sauna_name: string
  city: string | null
}

export default function EventsPageClient({
  events,
}: {
  events: UpcomingEvent[]
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const currentDate = new Date()

  const selectedEvents = selectedDate
    ? events.filter(
        (event) => event.event_date.substring(0, 10) === selectedDate
      )
    : []

  return (
    <>
      <div className="mb-8">
        <CalendarView
          currentDate={currentDate}
          events={events}
          onDayClick={setSelectedDate}
        />
      </div>

      {selectedDate && (
        <section className="mb-8 rounded-2xl border bg-orange-50 p-4">
          <h2 className="mb-3 text-xl font-bold text-orange-700">
            📅 {selectedDate}
          </h2>

          {selectedEvents.length === 0 ? (
            <div className="text-sm text-gray-600">
              Brak wydarzeń tego dnia.
            </div>
          ) : (
            <div className="space-y-3">
              {selectedEvents.map((event) => (
                <Link
                  key={event.event_id}
                  href={`/events/${event.event_id}`}
                  className="block rounded-xl bg-white p-3 shadow-sm hover:bg-orange-100"
                >
                  <div className="font-bold text-orange-700">
                    🔥 {event.title}
                  </div>

                  <div className="text-sm font-semibold">
                    {event.sauna_name}
                    {event.city ? ` · ${event.city}` : ''}
                  </div>

                  <div className="text-sm text-gray-500">
                    {event.event_time
                      ? event.event_time.substring(0, 5)
                      : 'Godzina niepodana'}
                  </div>

                  {event.price && (
                    <div className="mt-1 text-sm font-semibold text-orange-700">
                      {event.price.includes('zł')
                        ? event.price
                        : `${event.price} zł`}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  )
}