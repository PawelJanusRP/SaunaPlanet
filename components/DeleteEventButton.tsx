'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { deleteEvent } from '@/app/[locale]/events/actions'

export default function DeleteEventButton({
  eventId,
  eventTitle,
}: {
  eventId: string
  eventTitle: string
}) {
  const t = useTranslations('events')
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteEvent(eventId)
        toast.success(t('deleteEvent.success', { title: eventTitle }))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('deleteEvent.error'))
      } finally {
        setConfirming(false)
      }
    })
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="rounded-xl border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-500 hover:bg-red-50"
      >
        {t('deleteEvent.delete')}
      </button>
    )
  }

  return (
    <span className="flex items-center gap-2">
      <button
        onClick={handleDelete}
        disabled={isPending}
        className="rounded-xl bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
      >
        {isPending ? t('deleteEvent.deleting') : t('deleteEvent.confirm')}
      </button>
      <button
        onClick={() => setConfirming(false)}
        disabled={isPending}
        className="rounded-xl border px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
      >
        {t('deleteEvent.cancel')}
      </button>
    </span>
  )
}
