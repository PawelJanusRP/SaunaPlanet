'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

export default function ChangePasswordForm() {
  const t = useTranslations('profile')
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (password.length < 6) {
      toast.error(t('changePassword.errorTooShort'))
      return
    }

    if (password !== confirm) {
      toast.error(t('changePassword.errorMismatch'))
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      toast.error(error.message)
    } else {
      toast.success(t('changePassword.success'))
      setPassword('')
      setConfirm('')
      setOpen(false)
    }

    setLoading(false)
  }

  return (
    <div className="mt-4 border-t pt-4">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="text-sm text-gray-500 hover:text-black underline"
        >
          {t('changePassword.trigger')}
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <p className="text-sm font-medium text-gray-700">{t('changePassword.heading')}</p>

          <div>
            <label className="mb-1 block text-xs text-gray-500">{t('changePassword.newPassword')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-500">{t('changePassword.confirmPassword')}</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {loading ? t('changePassword.saving') : t('changePassword.save')}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setPassword(''); setConfirm('') }}
              className="rounded-xl border px-4 py-2 text-sm text-gray-500 hover:bg-gray-50"
            >
              {t('changePassword.cancel')}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
