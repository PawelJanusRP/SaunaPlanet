'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

type AddEventModalProps = {
  saunaId: string
  saunaName: string
  onClose: () => void
  onAdded: () => Promise<void> | void
}

export default function AddEventModal({
  saunaId,
  saunaName,
  onClose,
  onAdded,
}: AddEventModalProps) {
  const [title, setTitle] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [eventTime, setEventTime] = useState('')
  const [price, setPrice] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!title.trim()) {
      toast.error('Podaj nazwę wydarzenia')
      return
    }

    if (!eventDate) {
      toast.error('Podaj datę wydarzenia')
      return
    }

    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.from('sauna_events').insert({
      sauna_id: saunaId,
      title: title.trim(),
      event_date: eventDate,
      event_time: eventTime || null,
      price: price.trim() || null,
      description: description.trim() || null,
      status: 'active',
    })

    setLoading(false)

    if (error) {
      console.error(error)
      toast.error('Nie udało się dodać eventu')
      return
    }

    toast.success('Dodano event')
    await onAdded()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[12000] flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-3xl bg-white p-4 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Dodaj event saunowy</h2>
            <p className="text-sm text-gray-500">{saunaName}</p>
          </div>

          <button type="button" onClick={onClose} className="text-gray-500">
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <input
            className="w-full rounded-xl border p-3 text-sm"
            placeholder="Nazwa eventu, np. Noc saunowa"
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

          <input
            className="w-full rounded-xl border p-3 text-sm"
            placeholder="Cena, np. 120 zł / w cenie biletu"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />

          <textarea
            className="min-h-28 w-full rounded-xl border p-3 text-sm"
            placeholder="Opis wydarzenia"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-orange-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-orange-700 disabled:opacity-60"
          >
            {loading ? 'Dodawanie...' : 'Dodaj event'}
          </button>
        </div>
      </form>
    </div>
  )
}