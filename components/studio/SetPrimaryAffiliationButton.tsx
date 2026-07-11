'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { setPrimaryAffiliation } from '@/app/(main)/studio/actions'

/** Marks an approved affiliation as the master's primary one. */
export default function SetPrimaryAffiliationButton({ affiliationId }: { affiliationId: string }) {
  const [isPending, startTransition] = useTransition()

  function handleSet() {
    startTransition(async () => {
      try {
        await setPrimaryAffiliation(affiliationId)
        toast.success('Ustawiono afiliację główną')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Błąd zapisu')
      }
    })
  }

  return (
    <button
      onClick={handleSet}
      disabled={isPending}
      className="rounded-xl border px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
    >
      {isPending ? '...' : '⭐ Ustaw jako główną'}
    </button>
  )
}
