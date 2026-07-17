'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { deleteEvent } from '@/app/events/actions'

export default function DeleteEventButton({
  eventId,
  eventTitle,
}: {
  eventId: string
  eventTitle: string
}) {
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteEvent(eventId)
        toast.success(`Usunięto wydarzenie „${eventTitle}"`)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Błąd usuwania')
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
        🗑️ Usuń
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
        {isPending ? 'Usuwanie...' : 'Na pewno usuń'}
      </button>
      <button
        onClick={() => setConfirming(false)}
        disabled={isPending}
        className="rounded-xl border px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
      >
        Anuluj
      </button>
    </span>
  )
}
