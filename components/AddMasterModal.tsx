'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

type Sauna = { id: string; name: string }

export default function AddMasterModal({ saunas }: { saunas: Sauna[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [level, setLevel] = useState('certified')
  const [bio, setBio] = useState('')
  const [homeSaunaId, setHomeSaunaId] = useState('')

  function reset() {
    setName('')
    setLevel('certified')
    setBio('')
    setHomeSaunaId('')
  }

  function handleClose() {
    setOpen(false)
    reset()
  }

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error('Podaj imię i nazwisko')
      return
    }
    setSaving(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('sauna_masters').insert({
        name: name.trim(),
        level,
        bio: bio.trim() || null,
        home_sauna_id: homeSaunaId || null,
        status: 'approved',
      })
      if (error) throw error
      toast.success('Saunamistrz dodany')
      handleClose()
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Błąd zapisu')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
      >
        ➕ Dodaj saunamistrza
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold">Nowy saunamistrz</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-700">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">Imię i nazwisko *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="np. Jan Kowalski"
              className="w-full rounded-xl border p-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">Poziom</label>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="w-full rounded-xl border p-2 text-sm"
            >
              <option value="master">Master</option>
              <option value="senior">Senior</option>
              <option value="certified">Certified</option>
              <option value="guest">Guest</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={2}
              placeholder="Krótki opis (opcjonalnie)..."
              className="w-full rounded-xl border p-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">Sauna macierzysta</label>
            <select
              value={homeSaunaId}
              onChange={(e) => setHomeSaunaId(e.target.value)}
              className="w-full rounded-xl border p-2 text-sm"
            >
              <option value="">Brak przypisania</option>
              {saunas.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={saving}
          className="mt-4 w-full rounded-xl bg-orange-600 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Zapisywanie...' : 'Dodaj saunamistrza'}
        </button>
      </div>
    </div>
  )
}
