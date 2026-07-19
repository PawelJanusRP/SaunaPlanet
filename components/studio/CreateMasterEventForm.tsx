'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createMasterEvent } from '@/app/events/participationActions'
import FacilityCombobox, { type FacilityOption } from '@/components/FacilityCombobox'

type SaunaOption = FacilityOption

/**
 * SP-037B slice 2: master-created events. The client never decides the
 * managed/unmanaged routing — it always calls the trusted
 * create_master_event RPC (via the server action) and presents ONLY the
 * statuses the database returned.
 */
export default function CreateMasterEventForm({ saunas }: { saunas: SaunaOption[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saunaId, setSaunaId] = useState('')
  const [title, setTitle] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [eventTime, setEventTime] = useState('')
  const [price, setPrice] = useState('')
  const [maxParticipants, setMaxParticipants] = useState('')
  const [description, setDescription] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!saunaId) {
      toast.error('Wybierz obiekt')
      return
    }
    if (!title.trim()) {
      toast.error('Podaj nazwę wydarzenia')
      return
    }
    if (!eventDate) {
      toast.error('Podaj datę wydarzenia')
      return
    }

    setSaving(true)
    const result = await createMasterEvent({
      saunaId,
      title: title.trim(),
      eventDate,
      eventTime: eventTime || null,
      price: price.trim() || null,
      description: description.trim() || null,
      maxParticipants: maxParticipants ? Number(maxParticipants) : null,
    })
    setSaving(false)

    if (result.error) {
      toast.error(result.error)
      return
    }

    // Routing feedback strictly from the RPC result (source of truth)
    if (result.eventStatus === 'active') {
      toast.success(
        'Wydarzenie opublikowane! Jesteś organizatorem (rola: lead) — obiekt nie ma managera, więc publikacja jest natychmiastowa.'
      )
    } else {
      toast.success(
        'Propozycja wysłana — obiekt ma managera, więc wydarzenie i Twój udział czekają na jego akceptację.'
      )
    }

    setOpen(false)
    // Defect-1 fix: force the dashboard lists to re-render immediately —
    // revalidatePath alone left the open route visually stale.
    router.refresh()
    setSaunaId('')
    setTitle('')
    setEventDate('')
    setEventTime('')
    setPrice('')
    setMaxParticipants('')
    setDescription('')
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
      >
        🔥 Utwórz wydarzenie
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-[12000] flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <form
        onSubmit={handleSubmit}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-4 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Utwórz wydarzenie</h2>
            <p className="text-sm text-gray-500">
              O tym, czy wydarzenie publikuje się od razu, czy trafia do
              akceptacji managera, decyduje stan obiektu — dowiesz się po
              wysłaniu.
            </p>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="text-gray-500">
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <FacilityCombobox
            saunas={saunas}
            value={saunaId || null}
            onChange={(id) => setSaunaId(id ?? '')}
          />

          <input
            className="w-full rounded-xl border p-3 text-sm"
            placeholder="Nazwa wydarzenia, np. Noc saunowa"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              className="w-full rounded-xl border p-3 text-sm"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
            />
            <input
              type="time"
              className="w-full rounded-xl border p-3 text-sm"
              value={eventTime}
              onChange={(e) => setEventTime(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              className="w-full rounded-xl border p-3 text-sm"
              placeholder="Cena, np. 120 zł"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
            <input
              type="number"
              min={1}
              className="w-full rounded-xl border p-3 text-sm"
              placeholder="Limit miejsc"
              value={maxParticipants}
              onChange={(e) => setMaxParticipants(e.target.value)}
            />
          </div>

          <textarea
            className="min-h-24 w-full rounded-xl border p-3 text-sm"
            placeholder="Opis wydarzenia"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-orange-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-orange-700 disabled:opacity-60"
          >
            {saving ? 'Wysyłanie...' : 'Utwórz wydarzenie'}
          </button>
        </div>
      </form>
    </div>
  )
}
