'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

export default function EditProfileNameForm({
  firstName,
  lastName,
}: {
  firstName: string
  lastName: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [first, setFirst] = useState(firstName)
  const [last, setLast] = useState(lastName)
  const [savedFirst, setSavedFirst] = useState(firstName)
  const [savedLast, setSavedLast] = useState(lastName)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // .select() verifies a row was actually written — an update silently
      // filtered out by RLS returns no error but also no rows.
      const { data, error } = await supabase
        .from('profiles')
        .update({ first_name: first.trim() || null, last_name: last.trim() || null })
        .eq('id', user.id)
        .select('id')

      if (error || !data || data.length === 0) {
        toast.error('Błąd zapisu')
      } else {
        toast.success('Dane zaktualizowane')
        setSavedFirst(first.trim())
        setSavedLast(last.trim())
        setOpen(false)
        router.refresh()
      }
    })
  }

  const displayName = [savedFirst, savedLast].filter(Boolean).join(' ')

  return (
    <div className="mt-4 border-t pt-4">
      {!open ? (
        <div className="flex items-center justify-between">
          <div className="text-sm">
            <span className="font-medium text-gray-500">Imię i nazwisko: </span>
            <span className={displayName ? 'text-gray-800' : 'italic text-gray-400'}>
              {displayName || 'Nie podano'}
            </span>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="text-sm text-gray-500 underline hover:text-black"
          >
            Edytuj
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <p className="text-sm font-medium text-gray-700">Imię i nazwisko</p>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-gray-500">Imię</label>
              <input
                type="text"
                value={first}
                onChange={(e) => setFirst(e.target.value)}
                placeholder="Jan"
                className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs text-gray-500">Nazwisko</label>
              <input
                type="text"
                value={last}
                onChange={(e) => setLast(e.target.value)}
                placeholder="Kowalski"
                className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {isPending ? 'Zapisywanie...' : 'Zapisz'}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setFirst(firstName); setLast(lastName) }}
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
