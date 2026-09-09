'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/lib/i18n/navigation'
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
  const t = useTranslations('masters')
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
          toast.error(t('addToSauna.validationName'))
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
          toast.error(t('addToSauna.validationMaster'))
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
            ? t('addToSauna.successNewAndAssigned')
            : t('addToSauna.successProfileCreated')
          : t('addToSauna.successAssigned')

      toast.success(msg)
      handleClose()
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.errorSave'))
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
        {t('addToSauna.openButton')}
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold">{t('addToSauna.title')}</h2>
          <button onClick={handleClose} aria-label={t('common.close')} className="text-gray-400 hover:text-gray-700">✕</button>
        </div>

        <div className="mb-4 flex overflow-hidden rounded-xl border text-sm font-semibold">
          <button
            onClick={() => setMode('existing')}
            className={`flex-1 py-2 transition ${mode === 'existing' ? 'bg-yellow-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            {t('addToSauna.tabExisting')}
          </button>
          <button
            onClick={() => setMode('new')}
            className={`flex-1 py-2 transition ${mode === 'new' ? 'bg-yellow-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            {t('addToSauna.tabNew')}
          </button>
        </div>

        {mode === 'existing' ? (
          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">{t('addToSauna.masterLabel')}</label>
            <select
              value={masterId}
              onChange={(e) => setMasterId(e.target.value)}
              className="w-full rounded-xl border p-2 text-sm"
            >
              <option value="">{t('addToSauna.selectMaster')}</option>
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
              <label className="mb-1 block text-sm font-semibold text-gray-700">{t('common.nameLabel')}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('common.namePlaceholder')}
                className="w-full rounded-xl border p-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">{t('common.levelLabel')}</label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="w-full rounded-xl border p-2 text-sm"
              >
                <option value="master">{t('levels.master')}</option>
                <option value="senior">{t('levels.senior')}</option>
                <option value="certified">{t('levels.certified')}</option>
                <option value="guest">{t('levels.guest')}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">{t('common.bioLabel')}</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={2}
                placeholder={t('common.bioPlaceholder')}
                className="w-full rounded-xl border p-2 text-sm"
              />
            </div>
          </div>
        )}

        {existingEvents.length > 0 ? (
          <div className="mt-4 space-y-3 border-t pt-4">
            <div className="text-sm font-semibold text-gray-700">{t('addToSauna.assignSection')}</div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">{t('addToSauna.eventLabel')}</label>
              <select
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                className="w-full rounded-xl border p-2 text-sm"
              >
                <option value="">{t('addToSauna.noEventAssignment')}</option>
                {existingEvents.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title} ({e.event_date.substring(0, 10)})
                  </option>
                ))}
              </select>
            </div>
            {eventId && (
              <div>
                <label className="mb-1 block text-xs text-gray-500">{t('addToSauna.roleLabel')}</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full rounded-xl border p-2 text-sm"
                >
                  <option value="lead">{t('eventRoles.lead')}</option>
                  <option value="assistant">{t('eventRoles.assistant')}</option>
                  <option value="guest">{t('eventRoles.guest')}</option>
                </select>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-3 text-xs text-gray-400">
            {t('addToSauna.noUpcomingEvents')}
          </p>
        )}

        <button
          onClick={handleSubmit}
          disabled={saving}
          className="mt-4 w-full rounded-xl bg-yellow-600 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? t('common.saving') : t('addToSauna.submit')}
        </button>
      </div>
    </div>
  )
}
