'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { requestAffiliation } from '@/app/(main)/studio/actions'
import FacilityCombobox, { type FacilityOption } from '@/components/FacilityCombobox'

type SaunaOption = FacilityOption

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
      <div className="flex-1">
        <FacilityCombobox
          saunas={saunas}
          value={saunaId || null}
          onChange={(id) => setSaunaId(id ?? '')}
          ariaLabel="Obiekt do afiliacji"
        />
      </div>
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
