'use client'

// SP-044 Slice A — admin-only destructive control for a sauna-master card.
// Rendered as a SIBLING of the card <Link> (never nested inside it), with an
// explicit two-step inline confirmation. Visibility/authorization are decided
// by the caller (admin only) AND re-enforced by the server action + RPC.

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { deleteMasterProfile } from '@/app/[locale]/masters/actions'

const CODE_MESSAGES: Record<string, string> = {
  not_authorized: 'Brak uprawnień do usunięcia profilu.',
  not_authenticated: 'Musisz być zalogowany.',
  not_found: 'Nie znaleziono profilu (mógł już zostać usunięty).',
  invalid_input: 'Nieprawidłowe dane.',
  unexpected_error: 'Nie udało się usunąć profilu.',
}

export default function DeleteMasterButton({
  masterId,
  masterName,
}: {
  masterId: string
  masterName: string
}) {
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteMasterProfile(masterId)
      if (res.ok) {
        toast.success(`Usunięto profil saunamistrza ${res.name ?? masterName}`)
        setConfirming(false)
      } else {
        toast.error(CODE_MESSAGES[res.code] ?? CODE_MESSAGES.unexpected_error)
      }
    })
  }

  if (confirming) {
    return (
      <div className="w-60 rounded-xl border bg-white p-3 text-left shadow-lg">
        <p className="text-xs leading-relaxed text-gray-700">
          Usunąć profil saunamistrza{' '}
          <span className="font-semibold">{masterName}</span>? Tej operacji nie
          można cofnąć.
        </p>
        <div className="mt-2.5 flex gap-2">
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {isPending ? 'Usuwanie…' : 'Usuń'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={isPending}
            className="rounded-lg border px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
          >
            Anuluj
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      aria-label={`Usuń saunamistrza ${masterName}`}
      title="Usuń saunamistrza"
      className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-red-600 shadow-sm ring-1 ring-red-200 transition-colors hover:bg-red-50"
    >
      <Trash2 className="h-4 w-4" aria-hidden="true" />
    </button>
  )
}
