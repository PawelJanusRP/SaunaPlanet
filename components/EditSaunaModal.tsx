'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

type EditSaunaModalProps = {
  item: {
    id: string
    name: string
    description: string | null
    category: string
    city: string | null
    website: string | null
  }
  onClose: () => void
  onSaved: () => Promise<void>
}

export default function EditItemModal({
  item,
  onClose,
  onSaved,
}: EditSaunaModalProps) {
  const [name, setName] = useState(item.name)
  const [description, setDescription] = useState(item.description ?? '')
  const [category, setCategory] = useState(item.category)
  const [city, setCity] = useState(item.city ?? '')
  const [website, setWebsite] = useState(item.website ?? '')
  const [loading, setLoading] = useState(false)

  async function handleSave() {
    if (!name.trim()) {
      toast.error('Podaj nazwę sauny')
      return
    }

    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase
      .from('saunas')
      .update({
        name: name.trim(),
        description: description.trim(),
        category,
        city: city.trim() || null,
        website: website.trim() || null,
      })
      .eq('id', item.id)

    setLoading(false)

    if (error) {
      console.error('EDIT SAUNA ERROR:', error)
      toast.error(error.message)
      return
    }

    await onSaved()
    toast.success('Sauna zaktualizowana')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40">
      <div className="w-80 rounded-xl bg-white p-4 shadow-xl">
        <h2 className="mb-3 text-lg font-bold">Edytuj saunę</h2>

        <input
          className="mb-2 w-full rounded border p-2"
          placeholder="Nazwa sauny"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <textarea
          className="mb-2 h-28 w-full rounded border p-2"
          placeholder="Opis"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <select
          className="mb-2 w-full rounded border p-2"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="public_sauna">🧖 Sauna publiczna</option>
          <option value="spa">♨️ SPA / wellness</option>
          <option value="hotel">🏨 Sauna hotelowa</option>
          <option value="outdoor">🌲 Sauna plenerowa</option>
          <option value="event">🔥 Event saunowy</option>
        </select>

        <input
          className="mb-2 w-full rounded border p-2"
          placeholder="Miasto (opcjonalnie)"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />

        <input
          className="mb-3 w-full rounded border p-2"
          placeholder="Strona www (opcjonalnie)"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded bg-gray-200 p-2 text-sm font-semibold"
            disabled={loading}
          >
            Anuluj
          </button>

          <button
            onClick={handleSave}
            className="flex-1 rounded bg-black p-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={loading}
          >
            {loading ? 'Zapisuję...' : 'Zapisz'}
          </button>
        </div>
      </div>
    </div>
  )
}