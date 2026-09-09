'use client'

import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
} from 'date-fns'

import { pl } from 'date-fns/locale'
import { useTranslations } from 'next-intl'

type EventItem = {
  event_id: string
  title: string
  event_date: string
}

export default function CalendarView({
  currentDate,
  events,
  onDayClick,
}: {
  currentDate: Date
  events: EventItem[]
  onDayClick?: (date: string) => void
})
 {
  const t = useTranslations('events')
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)

  const calendarDays = eachDayOfInterval({
    start: startOfWeek(monthStart, { weekStartsOn: 1 }),
    end: endOfWeek(monthEnd, { weekStartsOn: 1 }),
  })

  return (
    <div>
      <div className="mb-4 text-2xl font-bold">
        {format(currentDate, 'LLLL yyyy', { locale: pl })}
      </div>

      <div className="mb-2 grid grid-cols-7 gap-2 text-center text-sm font-bold">
        <div>{t('calendar.weekday.mon')}</div>
        <div>{t('calendar.weekday.tue')}</div>
        <div>{t('calendar.weekday.wed')}</div>
        <div>{t('calendar.weekday.thu')}</div>
        <div>{t('calendar.weekday.fri')}</div>
        <div>{t('calendar.weekday.sat')}</div>
        <div>{t('calendar.weekday.sun')}</div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {calendarDays.map((day) => {
          const dayString = format(day, 'yyyy-MM-dd')

          const dayEvents = events.filter(
            (event) =>
              event.event_date.substring(0, 10) === dayString
          )

          return (
            <div
			  key={dayString}
			  onClick={() => onDayClick?.(dayString)}
			  className={`
				cursor-pointer
                min-h-[90px]
                rounded-xl
                border
                p-2
                text-sm
                ${
                  isSameMonth(day, currentDate)
                    ? 'bg-white'
                    : 'bg-gray-100 text-gray-400'
                }
              `}
            >
              <div className="font-bold">
                {format(day, 'd')}
              </div>

              {dayEvents.length > 0 && (
                <div className="mt-2 rounded-lg bg-orange-100 p-1 text-xs font-semibold text-orange-700">
                  🔥 {dayEvents.length}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}