'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

export default function BecomeMasterForm() {
  const [open, setOpen] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [level, setLevel] = useState('certified')
  const [bio, setBio] = useState('')

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error('Podaj swoje imię i nazwisko')
      return
    }
    setSaving(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('sauna_masters').insert({
        name: name.trim(),
        level,
        bio: bio.trim() || null,
        status: 'pending',
      })
      if (error) throw error
      setSubmitted(true)
      setOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Błąd wysyłania zgłoszenia')
    } finally {
      setSaving(false)
    }
  }

  if (submitted) {
    return (
      <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-4">
        <p className="font-semibold text-green-700">✓ Zgłoszenie wysłane!</p>
        <p className="mt-1 text-sm text-green-600">Administrator zweryfikuje Twój profil i doda go do listy.</p>
      </div>
    )
  }

  if (!open) {
    return (
      <div className="mb-6 rounded-2xl border border-orange-200 bg-orange-50 p-4">
        <p className="font-semibold text-orange-800">Jesteś saunamistrzem?</p>
        <p className="mt-1 text-sm text-gray-600">Zgłoś swój profil — administrator zatwierdzi go i pojawi się na liście.</p>
        <button
          onClick={() => setOpen(true)}
          className="mt-3 rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
        >
          Zgłoś się jako saunamistrz
        </button>
      </div>
    )
  }

  return (
    <div className="mb-6 rounded-2xl border border-orange-200 bg-orange-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-semibold text-orange-800">Zgłoszenie profilu saunamistrza</p>
        <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-semibold text-gray-700">Imię i nazwisko *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="np. Anna Kowalska"
            className="w-full rounded-xl border bg-white p-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold text-gray-700">Poziom</label>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="w-full rounded-xl border bg-white p-2 text-sm"
          >
            <option value="master">Master</option>
            <option value="senior">Senior</option>
            <option value="certified">Certified</option>
            <option value="guest">Guest</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold text-gray-700">O sobie</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            placeholder="Krótki opis doświadczenia, specjalizacji..."
            className="w-full rounded-xl border bg-white p-2 text-sm"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={saving}
          className="w-full rounded-xl bg-orange-600 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Wysyłanie...' : 'Wyślij zgłoszenie'}
        </button>
      </div>
    </div>
  )
}
