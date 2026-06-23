'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

type Event = {
  id: string
  title: string
  event_date: string
}

type Mode = 'existing' | 'new'

export default function AddMasterToSaunaModal({
  existingEvents,
}: {
  existingEvents: Event[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('existing')
  const [saving, setSaving] = useState(false)

  const [allMasters, setAllMasters] = useState<{ id: string; name: string; level: string | null }[]>([])
  const [mastersLoaded, setMastersLoaded] = useState(false)

  const [masterId, setMasterId] = useState('')
  const [name, setName] = useState('')
  const [level, setLevel] = useState('certified')
  const [bio, setBio] = useState('')
  const [eventId, setEventId] = useState(existingEvents[0]?.id ?? '')
  const [role, setRole] = useState('lead')

  async function handleOpen() {
    setOpen(true)
    if (!mastersLoaded) {
      const supabase = createClient()
      const { data } = await supabase
        .from('sauna_masters')
        .select('id, name, level')
        .order('name')
      setAllMasters(data ?? [])
      setMastersLoaded(true)
    }
  }

  function reset() {
    setMode('existing')
    setMasterId('')
    setName('')
    setLevel('certified')
    setBio('')
    setEventId(existingEvents[0]?.id ?? '')
    setRole('lead')
  }

  function handleClose() {
    setOpen(false)
    reset()
  }

  async function handleSubmit() {
    setSaving(true)

    try {
      const supabase = createClient()
      let resolvedMasterId = masterId

      if (mode === 'new') {
        if (!name.trim()) {
          toast.error('Podaj imię i nazwisko saunamistrza')
          return
        }

        const { data, error } = await supabase
          .from('sauna_masters')
          .insert({ name: name.trim(), level, bio: bio.trim() || null })
          .select('id')
          .single()

        if (error) throw error
        resolvedMasterId = data.id
      } else {
        if (!masterId) {
          toast.error('Wybierz saunamistrza')
          return
        }
      }

      if (eventId) {
        const { error } = await supabase
          .from('sauna_event_masters')
          .insert({ event_id: eventId, master_id: resolvedMasterId, role, status: 'approved' })

        if (error) throw error
      }

      const msg =
        mode === 'new'
          ? eventId
            ? 'Saunamistrz dodany i przypisany do wydarzenia'
            : 'Profil saunamistrza utworzony'
          : 'Saunamistrz przypisany do wydarzenia'

      toast.success(msg)
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
        onClick={handleOpen}
        className="mt-3 w-full rounded-xl border border-yellow-400 bg-white px-3 py-2 text-sm font-semibold text-yellow-700 transition hover:bg-yellow-50"
      >
        ➕ Dodaj saunamistrza
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold">Dodaj saunamistrza</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-700">✕</button>
        </div>

        <div className="mb-4 flex overflow-hidden rounded-xl border text-sm font-semibold">
          <button
            onClick={() => setMode('existing')}
            className={`flex-1 py-2 transition ${mode === 'existing' ? 'bg-yellow-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            Istniejący
          </button>
          <button
            onClick={() => setMode('new')}
            className={`flex-1 py-2 transition ${mode === 'new' ? 'bg-yellow-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            Nowy profil
          </button>
        </div>

        {mode === 'existing' ? (
          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">Saunamistrz</label>
            <select
              value={masterId}
              onChange={(e) => setMasterId(e.target.value)}
              className="w-full rounded-xl border p-2 text-sm"
            >
              <option value="">Wybierz saunamistrza</option>
              {allMasters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}{m.level ? ` (${m.level})` : ''}
                </option>
              ))}
            </select>
          </div>
        ) : (
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
          </div>
        )}

        {existingEvents.length > 0 ? (
          <div className="mt-4 space-y-3 border-t pt-4">
            <div className="text-sm font-semibold text-gray-700">Przypisz do wydarzenia</div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Wydarzenie</label>
              <select
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                className="w-full rounded-xl border p-2 text-sm"
              >
                <option value="">Bez przypisania</option>
                {existingEvents.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title} ({e.event_date.substring(0, 10)})
                  </option>
                ))}
              </select>
            </div>
            {eventId && (
              <div>
                <label className="mb-1 block text-xs text-gray-500">Rola</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full rounded-xl border p-2 text-sm"
                >
                  <option value="lead">Prowadzący</option>
                  <option value="assistant">Asystent</option>
                  <option value="guest">Gość</option>
                </select>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-3 text-xs text-gray-400">
            Brak nadchodzących wydarzeń — po dodaniu saunamistrza przypisz go do wydarzenia.
          </p>
        )}

        <button
          onClick={handleSubmit}
          disabled={saving}
          className="mt-4 w-full rounded-xl bg-yellow-600 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Zapisywanie...' : 'Zapisz'}
        </button>
      </div>
    </div>
  )
}
