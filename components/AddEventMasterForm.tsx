'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

type Master = {
  id: string
  name: string
  level: string | null
}

export default function AddEventMasterForm({
  eventId,
}: {
  eventId: string
}) {
  const router = useRouter()
  const [masters, setMasters] = useState<Master[]>([])
  const [masterId, setMasterId] = useState('')
  const [role, setRole] = useState('lead')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadMasters()
  }, [])

  async function loadMasters() {
    const { data, error } = await supabase
      .from('sauna_masters')
      .select('id, name, level')
      .order('name')

    if (error) {
      console.error(error)
      toast.error('Nie udało się pobrać saunamistrzów')
      return
    }

    setMasters(data ?? [])
  }

  async function assignMaster() {
    if (!masterId) {
      toast.error('Wybierz saunamistrza')
      return
    }

    setSaving(true)

    const { error } = await supabase
      .from('sauna_event_masters')
      .insert({
        event_id: eventId,
        master_id: masterId,
        role,
        status: 'approved',
      })

    setSaving(false)

    if (error) {
      console.error(error)
      toast.error('Nie udało się przypisać saunamistrza')
      return
    }

    toast.success('Saunamistrz przypisany')
    setMasterId('')
    router.refresh()
  }

  return (
    <div className="mt-3 rounded-xl border bg-white p-3">
      <div className="mb-2 text-sm font-bold">
        ➕ Przypisz saunamistrza
      </div>

      <select
        value={masterId}
        onChange={(e) => setMasterId(e.target.value)}
        className="mb-2 w-full rounded-xl border p-2 text-sm"
      >
        <option value="">Wybierz saunamistrza</option>

        {masters.map((master) => (
          <option key={master.id} value={master.id}>
            {master.name} {master.level ? `(${master.level})` : ''}
          </option>
        ))}
      </select>

      <select
        value={role}
        onChange={(e) => setRole(e.target.value)}
        className="mb-2 w-full rounded-xl border p-2 text-sm"
      >
        <option value="lead">Prowadzący</option>
        <option value="assistant">Asystent</option>
        <option value="guest">Gość</option>
      </select>

      <button
        onClick={assignMaster}
        disabled={saving}
        className="w-full rounded-xl bg-orange-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {saving ? 'Przypisywanie...' : 'Przypisz'}
      </button>
    </div>
  )
}