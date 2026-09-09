'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  formatReservationTimeLeft,
  isReservationExpired,
} from '@/lib/reservationTime'

type ReservationBadgeProps = {
  status: string
  reservedUntil: string | null
}

export default function ReservationBadge({
  status,
  reservedUntil,
}: ReservationBadgeProps) {
  const t = useTranslations('events')
  const [, setTick] = useState(0)

  useEffect(() => {
    if (status !== 'reserved' || !reservedUntil) return

    const interval = setInterval(() => {
      setTick((value) => value + 1)
    }, 1000)

    return () => clearInterval(interval)
  }, [status, reservedUntil])

  if (status === 'taken') {
    return (
      <span className="rounded-full bg-gray-200 px-2 py-1 text-xs font-semibold text-gray-700">
        {t('reservationBadge.taken')}
      </span>
    )
  }

  if (status === 'reserved') {
    const expired = isReservationExpired(reservedUntil)

    return (
      <span
        className={`rounded-full px-2 py-1 text-xs font-semibold ${
          expired
            ? 'bg-green-100 text-green-700'
            : 'bg-yellow-100 text-yellow-800'
        }`}
      >
        {expired
          ? t('reservationBadge.expired')
          : t('reservationBadge.reservedFor', {
              timeLeft: formatReservationTimeLeft(reservedUntil),
            })}
      </span>
    )
  }

  return (
    <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">
      {t('reservationBadge.available')}
    </span>
  )
}