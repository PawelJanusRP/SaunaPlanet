'use client'

// SP-039 Slice 4B — inline authentication on the public claim page.
//
// The chosen auth-return design (ADR §9): the user authenticates ON the claim
// page, so the invitation token never leaves its path segment — this component
// deliberately receives NO token, builds NO redirects, and stores NOTHING.
// After sign-in the server page re-renders via router.refresh(). Registration
// uses the DEFAULT auth callback (never a tokenized URL — the confirmation
// e-mail must not carry the invitation link); the copy tells the user to
// re-open their invitation link after activating the account.

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/lib/i18n/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

type Mode = 'login' | 'register'

export default function ClaimAuthPanel() {
  const t = useTranslations('auth')
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [registered, setRegistered] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      toast.error(t('claimPanel.loginError'))
    } else {
      toast.success(t('claimPanel.loginSuccess'))
      router.refresh()
    }
    setLoading(false)
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) {
      toast.error(t('common.errorTooShort'))
      return
    }
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Default callback ONLY — the activation e-mail must never contain
        // the invitation link.
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
    })
    if (error) {
      toast.error(t('claimPanel.registerError'))
    } else {
      setRegistered(true)
    }
    setLoading(false)
  }

  if (registered) {
    return (
      <div className="rounded-2xl border bg-white p-6 text-center">
        <div className="mb-3 text-4xl">📧</div>
        <h2 className="mb-2 text-lg font-semibold">{t('common.checkInbox')}</h2>
        <p className="text-sm text-gray-600">
          {t.rich('claimPanel.registeredDescription', {
            email,
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border bg-white p-6">
      <div className="mb-4 flex gap-1 rounded-xl bg-gray-100 p-1 text-sm font-medium">
        <button
          type="button"
          onClick={() => setMode('login')}
          className={`flex-1 rounded-lg px-3 py-2 ${
            mode === 'login' ? 'bg-white shadow-sm' : 'text-gray-500'
          }`}
        >
          {t('claimPanel.haveAccount')}
        </button>
        <button
          type="button"
          onClick={() => setMode('register')}
          className={`flex-1 rounded-lg px-3 py-2 ${
            mode === 'register' ? 'bg-white shadow-sm' : 'text-gray-500'
          }`}
        >
          {t('claimPanel.createAccount')}
        </button>
      </div>

      <form
        onSubmit={mode === 'login' ? handleLogin : handleRegister}
        className="space-y-3"
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t('common.email')}
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
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
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            placeholder="••••••••"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-black py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {loading
            ? t('claimPanel.submitting')
            : mode === 'login'
              ? t('claimPanel.login')
              : t('claimPanel.register')}
        </button>
      </form>

      <p className="mt-3 text-center text-xs text-gray-500">
        {t('claimPanel.afterLoginHint')}
      </p>
    </div>
  )
}
