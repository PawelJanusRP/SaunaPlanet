'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { requestAffiliation } from '@/app/(main)/studio/actions'

type SaunaOption = { id: string; name: string; city: string | null }

/** Master-side start of the affiliation handshake (W-16). */
export default function RequestAffiliationForm({ saunas }: { saunas: SaunaOption[] }) {
  const [saunaId, setSaunaId] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!saunaId) {
      toast.error('Wybierz obiekt')
      return
    }
    startTransition(async () => {
      try {
        await requestAffiliation(saunaId)
        toast.success('Zgłoszenie wysłane — obiekt musi je zatwierdzić')
        setSaunaId('')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Błąd wysyłania zgłoszenia')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
      <select
        value={saunaId}
        onChange={(e) => setSaunaId(e.target.value)}
        className="flex-1 rounded-xl border bg-white p-2.5 text-sm"
        aria-label="Obiekt do afiliacji"
      >
        <option value="">— Wybierz obiekt —</option>
        {saunas.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}{s.city ? ` · ${s.city}` : ''}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-orange-700 disabled:opacity-60"
      >
        {isPending ? 'Wysyłanie...' : 'Poproś o afiliację'}
      </button>
    </form>
  )
}
