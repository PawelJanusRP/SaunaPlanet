'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

export default function BecomeMasterForm() {
  const t = useTranslations('masters')
  const [open, setOpen] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error(t('becomeMaster.validationName'))
      return
    }
    setSaving(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('sauna_masters').insert({
        name: name.trim(),
        // Self-registration must not self-assign a level: level implies a
        // moderated/certified status (USER_MODEL §2.4). Submit the least
        // privileged existing level ('guest'); moderation sets the real level
        // at approval. The DB guard (SP-035 SQL §2d) enforces this independently.
        level: 'guest',
        bio: bio.trim() || null,
        status: 'pending',
        user_id: user?.id ?? null,
      })
      if (error) {
        // unique index on sauna_masters.user_id (SP-035): one profile per account
        if (error.code === '23505' || error.message.includes('sauna_masters_user_id_unique')) {
          throw new Error(t('becomeMaster.alreadyHasProfile'))
        }
        throw error
      }
      setSubmitted(true)
      setOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('becomeMaster.errorSend'))
    } finally {
      setSaving(false)
    }
  }

  if (submitted) {
    return (
      <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-4">
        <p className="font-semibold text-green-700">{t('becomeMaster.submittedTitle')}</p>
        <p className="mt-1 text-sm text-green-600">{t('becomeMaster.submittedBody')}</p>
      </div>
    )
  }

  if (!open) {
    return (
      <div className="mb-6 rounded-2xl border border-orange-200 bg-orange-50 p-4">
        <p className="font-semibold text-orange-800">{t('becomeMaster.promptTitle')}</p>
        <p className="mt-1 text-sm text-gray-600">{t('becomeMaster.promptBody')}</p>
        <button
          onClick={() => setOpen(true)}
          className="mt-3 rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
        >
          {t('becomeMaster.promptButton')}
        </button>
      </div>
    )
  }

  return (
    <div className="mb-6 rounded-2xl border border-orange-200 bg-orange-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-semibold text-orange-800">{t('becomeMaster.formTitle')}</p>
        <button onClick={() => setOpen(false)} aria-label={t('common.close')} className="text-gray-400 hover:text-gray-600">✕</button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-semibold text-gray-700">{t('becomeMaster.nameLabel')}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('becomeMaster.namePlaceholder')}
            className="w-full rounded-xl border bg-white p-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold text-gray-700">{t('becomeMaster.aboutLabel')}</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            placeholder={t('becomeMaster.aboutPlaceholder')}
            className="w-full rounded-xl border bg-white p-2 text-sm"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={saving}
          className="w-full rounded-xl bg-orange-600 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? t('becomeMaster.sending') : t('becomeMaster.submit')}
        </button>
      </div>
    </div>
  )
}
