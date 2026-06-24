'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { removeEventMaster } from '@/app/events/actions'

export default function RemoveEventMasterButton({
  eventId,
  masterId,
  masterName,
}: {
  eventId: string
  masterId: string
  masterName: string
}) {
  const [isPending, startTransition] = useTransition()

  function handleRemove() {
    startTransition(async () => {
      try {
        await removeEventMaster(eventId, masterId)
        toast.success(`${masterName} usunięty z wydarzenia`)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Błąd usuwania')
      }
    })
  }

  return (
    <button
      onClick={handleRemove}
      disabled={isPending}
      title="Usuń z wydarzenia"
      className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-xs text-red-600 hover:bg-red-200 disabled:opacity-50"
    >
      {isPending ? '…' : '×'}
    </button>
  )
}
