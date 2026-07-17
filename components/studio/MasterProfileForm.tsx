'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { updateOwnMasterProfile } from '@/app/(main)/studio/actions'

/**
 * Own-profile edit form for the Master Studio. Only fields the master
 * controls (name, bio) — level and status belong to moderation
 * (USER_MODEL §2.4) and are displayed read-only by the page.
 */
export default function MasterProfileForm({
  initialName,
  initialBio,
}: {
  initialName: string
  initialBio: string | null
}) {
  const [name, setName] = useState(initialName)
  const [bio, setBio] = useState(initialBio ?? '')
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('Imię i nazwisko nie może być puste')
      return
    }
    startTransition(async () => {
      try {
        await updateOwnMasterProfile({ name, bio: bio || null })
        toast.success('Profil zapisany')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Błąd zapisu')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-500">Imię i nazwisko *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl border px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-500">O sobie</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={4}
          placeholder="Krótki opis doświadczenia, specjalizacji..."
          className="w-full rounded-xl border px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {isPending ? 'Zapisywanie...' : 'Zapisz zmiany'}
      </button>
    </form>
  )
}
