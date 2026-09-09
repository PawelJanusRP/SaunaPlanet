'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/lib/i18n/navigation'
import { useRouter } from '@/lib/i18n/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

export default function LoginPage() {
  const t = useTranslations('auth')
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      toast.error(error.message)
    } else {
      toast.success(t('login.success'))
      router.push('/')
      router.refresh()
    }

    setLoading(false)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-3xl border bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-2xl font-bold">{t('login.title')}</h1>

        <form onSubmit={handleLogin} className="space-y-4">
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

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('common.password')}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-black py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? t('login.submitting') : t('login.submit')}
          </button>
        </form>

        <div className="mt-4 flex flex-col gap-2 text-center text-sm text-gray-500">
          <Link href="/auth/reset-password" className="hover:text-black">
            {t('login.forgotPassword')}
          </Link>
          <span>
            {t('login.noAccount')}{' '}
            <Link href="/auth/register" className="font-medium text-black hover:underline">
              {t('login.registerLink')}
            </Link>
          </span>
        </div>
      </div>
    </main>
  )
}
