'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/lib/i18n/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

type CertType = { id: string; name: string; category: string }

const CATEGORY_KEYS: Record<string, string> = {
  certification:   'certification',
  championship_pl: 'championship_pl',
  gladiators:      'gladiators',
  aufguss_wm:      'aufguss_wm',
  classic_cup:     'classic_cup',
  cup:             'cup',
  other:           'other',
}

const OTHER_ID_NAME = 'Inny certyfikat'

export default function AddCertificateModal({
  masterId,
  isAdmin,
}: {
  masterId: string
  isAdmin: boolean
}) {
  const t = useTranslations('masters')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [certTypes, setCertTypes] = useState<CertType[]>([])
  const [loaded, setLoaded] = useState(false)

  const [certTypeId, setCertTypeId] = useState('')
  const [customName, setCustomName] = useState('')
  const [year, setYear] = useState('')
  const [notes, setNotes] = useState('')

  const selectedType = certTypes.find((c) => c.id === certTypeId)
  const isOther = selectedType?.name === OTHER_ID_NAME

  async function handleOpen() {
    setOpen(true)
    if (!loaded) {
      const supabase = createClient()
      const { data } = await supabase
        .from('certificate_types')
        .select('id, name, category')
        .eq('is_active', true)
        .order('sort_order')
      setCertTypes(data ?? [])
      setLoaded(true)
    }
  }

  function reset() {
    setCertTypeId('')
    setCustomName('')
    setYear('')
    setNotes('')
  }

  function handleClose() {
    setOpen(false)
    reset()
  }

  async function handleSubmit() {
    if (!certTypeId) {
      toast.error(t('addCertificate.validationSelect'))
      return
    }
    if (isOther && !customName.trim()) {
      toast.error(t('addCertificate.validationCustomName'))
      return
    }

    setSaving(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('master_certificates').insert({
        master_id:           masterId,
        certificate_type_id: certTypeId,
        year:                year ? parseInt(year) : null,
        notes:               isOther ? customName.trim() : (notes.trim() || null),
        status:              isAdmin ? 'approved' : 'pending',
      })
      if (error) throw error

      toast.success(isAdmin ? t('addCertificate.successAdmin') : t('addCertificate.successUser'))
      handleClose()
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.errorSave'))
    } finally {
      setSaving(false)
    }
  }

  // Group by category
  const grouped = certTypes.reduce<Record<string, CertType[]>>((acc, ct) => {
    if (!acc[ct.category]) acc[ct.category] = []
    acc[ct.category].push(ct)
    return acc
  }, {})

  if (!open) {
    return (
      <button
        onClick={handleOpen}
        className="mt-3 w-full rounded-xl border border-yellow-400 bg-white px-3 py-2 text-sm font-semibold text-yellow-700 hover:bg-yellow-50"
      >
        {t('addCertificate.openButton')}
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold">{t('addCertificate.title')}</h2>
          <button onClick={handleClose} aria-label={t('common.close')} className="text-gray-400 hover:text-gray-700">✕</button>
        </div>

        {!isAdmin && (
          <p className="mb-3 rounded-xl bg-yellow-50 px-3 py-2 text-xs text-yellow-700">
            {t('addCertificate.moderationNote')}
          </p>
        )}

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">{t('addCertificate.certificateLabel')}</label>
            {!loaded ? (
              <div className="rounded-xl border p-2 text-sm text-gray-400">{t('addCertificate.loading')}</div>
            ) : (
              <select
                value={certTypeId}
                onChange={(e) => { setCertTypeId(e.target.value); setCustomName('') }}
                className="w-full rounded-xl border p-2 text-sm"
              >
                <option value="">{t('addCertificate.selectCertificate')}</option>
                {Object.entries(grouped).map(([cat, types]) => (
                  <optgroup key={cat} label={CATEGORY_KEYS[cat] ? t(`profile.categories.${CATEGORY_KEYS[cat]}` as never) : cat}>
                    {types.map((ct) => (
                      <option key={ct.id} value={ct.id}>{ct.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            )}
          </div>

          {isOther && (
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">{t('addCertificate.customNameLabel')}</label>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder={t('addCertificate.customNamePlaceholder')}
                className="w-full rounded-xl border p-2 text-sm"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">{t('addCertificate.yearLabel')}</label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder={t('addCertificate.yearPlaceholder')}
              min="1990"
              max={new Date().getFullYear()}
              className="w-full rounded-xl border p-2 text-sm"
            />
          </div>

          {!isOther && (
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">{t('addCertificate.notesLabel')}</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('addCertificate.notesPlaceholder')}
                className="w-full rounded-xl border p-2 text-sm"
              />
            </div>
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={saving}
          className="mt-4 w-full rounded-xl bg-yellow-600 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? t('common.saving') : isAdmin ? t('addCertificate.submitAdmin') : t('addCertificate.submitUser')}
        </button>
      </div>
    </div>
  )
}
