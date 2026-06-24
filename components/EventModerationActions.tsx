'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { updateEventStatusAdmin, deleteEventAdmin } from '@/app/(main)/admin/actions'

export default function EventModerationActions({
  eventId,
  status,
}: {
  eventId: string
  status: string
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleStatus(newStatus: 'active' | 'rejected') {
    startTransition(async () => {
      try {
        await updateEventStatusAdmin(eventId, newStatus)
        toast.success(newStatus === 'active' ? 'Event aktywowany' : 'Event odrzucony')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Błąd')
      }
    })
  }

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteEventAdmin(eventId)
        toast.success('Event usunięty')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Błąd usuwania')
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status !== 'active' && (
        <button
          onClick={() => handleStatus('active')}
          disabled={isPending}
          className="rounded-lg bg-green-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
        >
          Aktywuj
        </button>
      )}
      {status !== 'rejected' && (
        <button
          onClick={() => handleStatus('rejected')}
          disabled={isPending}
          className="rounded-lg bg-orange-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          Odrzuć
        </button>
      )}

      {!confirmDelete ? (
        <button
          onClick={() => setConfirmDelete(true)}
          disabled={isPending}
          className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Usuń
        </button>
      ) : (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-red-600">Na pewno?</span>
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            Tak
          </button>
          <button
            onClick={() => setConfirmDelete(false)}
            disabled={isPending}
            className="rounded-lg border px-2.5 py-1 text-xs text-gray-600 disabled:opacity-50"
          >
            Nie
          </button>
        </div>
      )}
    </div>
  )
}
