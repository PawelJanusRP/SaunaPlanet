'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

type EditItemModalProps = {
  item: {
    id: string
    title: string
    description: string | null
  }
  onClose: () => void
  onSaved: () => Promise<void>
}

export default function EditItemModal({
  item,
  onClose,
  onSaved,
}: EditItemModalProps) {
  const [title, setTitle] = useState(item.title)
  const [description, setDescription] = useState(item.description ?? '')
  const [loading, setLoading] = useState(false)

  async function handleSave() {
    if (!title.trim()) {
      toast.error('Podaj tytuł')
      return
    }

    setLoading(true)

    const { error } = await supabase.rpc('update_item_mvp', {
      item_id: item.id,
      new_title: title.trim(),
      new_description: description.trim(),
    })

    setLoading(false)

    if (error) {
      console.error('EDIT ITEM ERROR:', error)
      toast.error(error.message)
      return
    }

    await onSaved()
    toast.success('Ogłoszenie zaktualizowane')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40">
      <div className="w-80 rounded-xl bg-white p-4 shadow-xl">
        <h2 className="mb-3 text-lg font-bold">Edytuj ogłoszenie</h2>

        <input
          className="mb-2 w-full rounded border p-2"
          placeholder="Tytuł"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <textarea
          className="mb-3 h-28 w-full rounded border p-2"
          placeholder="Opis"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
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