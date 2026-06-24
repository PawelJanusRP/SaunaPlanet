'use client'

import { useTransition } from 'react'
import { updateRegistrationStatus } from '@/app/events/actions'
import { toast } from 'sonner'

export default function RegistrationModerationActions({ registrationId }: { registrationId: string }) {
  const [isPending, startTransition] = useTransition()

  function handle(status: 'confirmed' | 'cancelled') {
    startTransition(async () => {
      try {
        await updateRegistrationStatus(registrationId, status)
        toast.success(status === 'confirmed' ? 'Potwierdzono zapis' : 'Zapis odrzucony')
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Błąd')
      }
    })
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => handle('confirmed')}
        disabled={isPending}
        className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-40"
      >
        Potwierdź
      </button>
      <button
        onClick={() => handle('cancelled')}
        disabled={isPending}
        className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
      >
        Odrzuć
      </button>
    </div>
  )
}
