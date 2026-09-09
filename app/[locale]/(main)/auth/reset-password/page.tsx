'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/lib/i18n/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

export default function ResetPasswordPage() {
  const t = useTranslations('auth')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/auth/callback?next=/auth/update-password`,
    })

    if (error) {
      toast.error(error.message)
    } else {
      setDone(true)
    }

    setLoading(false)
  }

  if (done) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm rounded-3xl border bg-white p-8 text-center shadow-sm">
          <div className="mb-4 text-5xl">📧</div>
          <h1 className="mb-2 text-2xl font-bold">{t('common.checkInbox')}</h1>
          <p className="text-sm text-gray-500">
            {t.rich('reset.doneDescription', {
              email,
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
          <Link
            href="/auth/login"
            className="mt-6 inline-block text-sm text-gray-500 hover:text-black"
          >
            {t('common.backToLogin')}
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-3xl border bg-white p-8 shadow-sm">
        <h1 className="mb-2 text-2xl font-bold">{t('reset.title')}</h1>
        <p className="mb-6 text-sm text-gray-500">
          {t('reset.description')}
        </p>

        <form onSubmit={handleReset} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('common.email')}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              placeholder={t('common.emailPlaceholder')}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-black py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? t('reset.submitting') : t('reset.submit')}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-500">
          <Link href="/auth/login" className="hover:text-black">
            {t('common.backToLogin')}
          </Link>
        </p>
      </div>
    </main>
  )
}
