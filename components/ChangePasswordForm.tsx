'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

export default function ChangePasswordForm() {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (password.length < 6) {
      toast.error('Hasło musi mieć co najmniej 6 znaków')
      return
    }

    if (password !== confirm) {
      toast.error('Hasła nie są zgodne')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      toast.error(error.message)
    } else {
      toast.success('Hasło zostało zmienione')
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
          Zmień hasło
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <p className="text-sm font-medium text-gray-700">Zmień hasło</p>

          <div>
            <label className="mb-1 block text-xs text-gray-500">Nowe hasło</label>
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
            <label className="mb-1 block text-xs text-gray-500">Powtórz hasło</label>
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
              {loading ? 'Zapisywanie...' : 'Zapisz'}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setPassword(''); setConfirm('') }}
              className="rounded-xl border px-4 py-2 text-sm text-gray-500 hover:bg-gray-50"
            >
              Anuluj
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
