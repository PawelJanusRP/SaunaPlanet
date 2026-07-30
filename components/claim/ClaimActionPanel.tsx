'use client'

// SP-039 Slice 4B — the explicit claim action.
//
// Claiming happens ONLY on the user's click (never automatically after
// authentication). The raw token exists here solely as the prop forwarded to
// the server action — it is never logged, rendered, stored, or put into any
// URL; the success link goes to the token-free Studio route. Terminal results
// hide the action; retryable ones keep it available.

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { claimMasterProfile } from '@/app/claim/actions'
import {
  TERMINAL_PUBLIC_CLAIM_CODES,
  type PublicClaimActionResult,
} from '@/lib/claim/publicClaim'

type Props = {
  token: string
  masterName: string
}

export default function ClaimActionPanel({ token, masterName }: Props) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<PublicClaimActionResult | null>(null)

  async function handleClaim() {
    if (pending) return
    setPending(true)
    const res = await claimMasterProfile(token)
    setResult(res)
    setPending(false)
  }

  if (result?.ok) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
        <div className="mb-3 text-4xl">✅</div>
        <h2 className="mb-2 text-lg font-semibold text-green-900">
          Profil należy teraz do Ciebie
        </h2>
        <p className="mb-4 text-sm text-green-800">
          Profil <strong>{masterName}</strong> został przypisany do Twojego
          konta. Kolejny krok to uzupełnienie danych i publikacja profilu —
          zrobisz to w Master Studio. Profil <strong>nie został jeszcze
          opublikowany</strong> publicznie.
        </p>
        <Link
          href="/studio"
          className="inline-block rounded-xl bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
        >
          Przejdź do Master Studio
        </Link>
      </div>
    )
  }

  if (result && TERMINAL_PUBLIC_CLAIM_CODES.includes(result.code)) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
        <div className="mb-3 text-4xl">⚠️</div>
        <p className="text-sm text-amber-900">{result.message}</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border bg-white p-6">
      <p className="mb-4 text-sm text-gray-700">
        Przejmujesz profil <strong>{masterName}</strong>. Zostanie on trwale
        powiązany z kontem, na które jesteś teraz zalogowany. Publikacja
        profilu to osobny, późniejszy krok w Master Studio.
      </p>
      {result && (
        <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">
          {result.message}
        </p>
      )}
      <button
        type="button"
        onClick={handleClaim}
        disabled={pending}
        className="w-full rounded-xl bg-black py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {pending ? 'Przejmowanie…' : 'Przejmij profil'}
      </button>
      {result?.code === 'not_authenticated' && (
        <button
          type="button"
          onClick={() => router.refresh()}
          className="mt-2 w-full rounded-xl border py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Odśwież stronę
        </button>
      )}
    </div>
  )
}
