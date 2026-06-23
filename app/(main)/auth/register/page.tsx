'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()

    if (password !== confirm) {
      toast.error('Hasła nie są zgodne')
      return
    }

    if (password.length < 6) {
      toast.error('Hasło musi mieć co najmniej 6 znaków')
      return
    }

    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
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
          <h1 className="mb-2 text-2xl font-bold">Sprawdź skrzynkę</h1>
          <p className="text-sm text-gray-500">
            Wysłaliśmy link aktywacyjny na adres <strong>{email}</strong>.
            Kliknij go, aby aktywować konto.
          </p>
          <Link
            href="/auth/login"
            className="mt-6 inline-block text-sm text-gray-500 hover:text-black"
          >
            Wróć do logowania
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-3xl border bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-2xl font-bold">Zarejestruj się</h1>

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              placeholder="ty@example.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Hasło
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

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Powtórz hasło
            </label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
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
            {loading ? 'Rejestrowanie...' : 'Zarejestruj się'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-500">
          Masz już konto?{' '}
          <Link href="/auth/login" className="font-medium text-black hover:underline">
            Zaloguj się
          </Link>
        </p>
      </div>
    </main>
  )
}
