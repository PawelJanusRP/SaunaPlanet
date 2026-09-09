'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useRouter } from '@/lib/i18n/navigation'

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
  const t = useTranslations('events')
  const router = useRouter()
  const [masters, setMasters] = useState<Master[]>([])
  const [masterId, setMasterId] = useState('')
  const [role, setRole] = useState('lead')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadMasters() {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('sauna_masters')
        .select('id, name, level')
        .order('name')

      if (error) {
        console.error(error)
        toast.error(t('eventMaster.loadError'))
        return
      }

      if (!cancelled) setMasters(data ?? [])
    }

    void loadMasters()

    return () => {
      cancelled = true
    }
  }, [t])

  async function assignMaster() {
    if (!masterId) {
      toast.error(t('eventMaster.selectValidation'))
      return
    }

    setSaving(true)

    const supabase = createClient()
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
      toast.error(t('eventMaster.assignError'))
      return
    }

    toast.success(t('eventMaster.assignSuccess'))
    setMasterId('')
    router.refresh()
  }

  return (
    <div className="mt-3 rounded-xl border bg-white p-3">
      <div className="mb-2 text-sm font-bold">
        {t('eventMaster.heading')}
      </div>

      <select
        value={masterId}
        onChange={(e) => setMasterId(e.target.value)}
        className="mb-2 w-full rounded-xl border p-2 text-sm"
      >
        <option value="">{t('eventMaster.selectPlaceholder')}</option>

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
        <option value="lead">{t('eventMaster.roleLead')}</option>
        <option value="assistant">{t('eventMaster.roleAssistant')}</option>
        <option value="guest">{t('eventMaster.roleGuest')}</option>
      </select>

      <button
        onClick={assignMaster}
        disabled={saving}
        className="w-full rounded-xl bg-orange-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {saving ? t('eventMaster.assigning') : t('eventMaster.assign')}
      </button>
    </div>
  )
}