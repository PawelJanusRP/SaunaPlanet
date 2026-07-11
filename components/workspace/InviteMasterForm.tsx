'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { inviteMaster } from '@/app/(main)/studio/actions'

type MasterOption = { id: string; name: string }

/**
 * Facility-side start of the affiliation handshake (W-16), scoped to one
 * concrete facility from the Owner Workspace context. The invited master
 * must accept — nobody joins a team without consent.
 */
export default function InviteMasterForm({
  saunaId,
  saunaName,
  masters,
}: {
  saunaId: string
  saunaName: string
  masters: MasterOption[]
}) {
  const [masterId, setMasterId] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!masterId) {
      toast.error('Wybierz saunamistrza')
      return
    }
    startTransition(async () => {
      try {
        await inviteMaster(saunaId, masterId)
        toast.success(`Zaproszenie wysłane — saunamistrz musi je przyjąć (${saunaName})`)
        setMasterId('')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Błąd wysyłania zaproszenia')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
      <select
        value={masterId}
        onChange={(e) => setMasterId(e.target.value)}
        className="flex-1 rounded-xl border bg-white p-2.5 text-sm"
        aria-label="Saunamistrz do zaproszenia"
      >
        <option value="">— Wybierz saunamistrza —</option>
        {masters.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-orange-700 disabled:opacity-60"
      >
        {isPending ? 'Wysyłanie...' : 'Zaproś'}
      </button>
    </form>
  )
}
