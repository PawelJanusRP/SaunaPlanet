'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

export default function EditSaunaMasterModal({
  masterId,
  currentName,
  currentLevel,
  currentBio,
}: {
  masterId: string
  currentName: string
  currentLevel: string | null
  currentBio: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState(currentName)
  const [level, setLevel] = useState(currentLevel ?? 'certified')
  const [bio, setBio] = useState(currentBio ?? '')

  function handleClose() {
    setOpen(false)
    setName(currentName)
    setLevel(currentLevel ?? 'certified')
    setBio(currentBio ?? '')
  }

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error('Imię i nazwisko nie może być puste')
      return
    }

    setSaving(true)

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('sauna_masters')
        .update({
          name: name.trim(),
          level,
          bio: bio.trim() || null,
        })
        .eq('id', masterId)

      if (error) throw error

      toast.success('Profil zaktualizowany')
      setOpen(false)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Błąd zapisu')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-2 rounded-xl border px-3 py-1.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-100"
      >
        ✏️ Edytuj profil
      </button>

      {open && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-bold">Edytuj profil saunamistrza</h2>
              <button onClick={handleClose} className="text-gray-400 hover:text-gray-700">
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  Imię i nazwisko *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border p-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  Poziom
                </label>
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
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  Bio
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  placeholder="Krótki opis..."
                  className="w-full rounded-xl border p-2 text-sm"
                />
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={saving}
              className="mt-4 w-full rounded-xl bg-gray-900 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? 'Zapisywanie...' : 'Zapisz zmiany'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
