// SP-039 Slice 4B — public claim landing page: /claim/master/[token]
//
// The invitation token lives ONLY in the path segment. This page: validates
// the shape BEFORE any RPC, renders exclusively the M7 public-safe projection,
// authenticates inline (no redirect — the token never moves anywhere), and
// performs the claim only on an explicit user action. Metadata is a STATIC
// const (never a params-aware function): the token structurally cannot appear
// in the title or any social/share field. The no-referrer policy ships both
// as page metadata and as an HTTP header (next.config).

import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { inspectMasterClaimInvitation } from '@/app/claim/actions'
import { resolveClaimPageView } from '@/lib/claim/claimPage'
import {
  isValidClaimTokenShape,
  PUBLIC_INSPECTION_MESSAGES_PL,
} from '@/lib/claim/publicClaim'
import ClaimAuthPanel from '@/components/claim/ClaimAuthPanel'
import ClaimActionPanel from '@/components/claim/ClaimActionPanel'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Zaproszenie dla saunamistrza — SaunaPlanet',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

/* eslint-disable @next/next/no-img-element -- avatar preview matches the
   existing public profile pages (repo-wide baseline warning class) */

function ProfilePreviewCard({
  name,
  city,
  avatarUrl,
  bio,
  expiresAt,
}: {
  name: string
  city: string | null
  avatarUrl: string | null
  bio: string | null
  expiresAt: string | null
}) {
  return (
    <div className="rounded-2xl border bg-white p-6">
      <div className="flex items-center gap-4">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-2xl">
            🧖
          </div>
        )}
        <div>
          <h2 className="text-lg font-semibold">{name}</h2>
          {city && <p className="text-sm text-gray-500">{city}</p>}
        </div>
      </div>
      {bio && <p className="mt-4 text-sm text-gray-700">{bio}</p>}
      {expiresAt && (
        <p className="mt-4 text-xs text-gray-400">
          Zaproszenie ważne do:{' '}
          {new Date(expiresAt).toLocaleDateString('pl-PL')}
        </p>
      )}
    </div>
  )
}

function TerminalNotice({
  icon,
  message,
  showStudioHint = false,
}: {
  icon: string
  message: string
  showStudioHint?: boolean
}) {
  return (
    <div className="rounded-2xl border bg-white p-8 text-center">
      <div className="mb-3 text-5xl">{icon}</div>
      <p className="text-sm text-gray-700">{message}</p>
      {showStudioHint && (
        <p className="mt-4 text-sm">
          Twoje konto ma już profil saunamistrza —{' '}
          <Link href="/studio" className="font-medium underline">
            przejdź do Master Studio
          </Link>
          .
        </p>
      )}
    </div>
  )
}

export default async function ClaimMasterPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  // Fail closed BEFORE any boundary call on a malformed shape.
  const inspection = isValidClaimTokenShape(token)
    ? await inspectMasterClaimInvitation(token)
    : {
        state: 'invalid_or_unknown' as const,
        message: PUBLIC_INSPECTION_MESSAGES_PL.invalid_or_unknown,
        preview: null,
      }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Own-row read only (RLS owner arm) — powers the Studio hint, leaks nothing.
  let viewerOwnsMaster = false
  if (user) {
    const { data: own } = await supabase
      .from('sauna_masters')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    viewerOwnsMaster = own !== null
  }

  const view = resolveClaimPageView(inspection, user !== null, viewerOwnsMaster)

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 px-4 py-10">
      <header className="text-center">
        <p className="text-sm font-medium text-gray-400">SaunaPlanet</p>
        <h1 className="text-2xl font-bold">Zaproszenie dla saunamistrza</h1>
      </header>

      {view.kind === 'invalid' && <TerminalNotice icon="🔗" message={view.message} />}
      {view.kind === 'expired' && <TerminalNotice icon="⏳" message={view.message} />}
      {view.kind === 'revoked' && <TerminalNotice icon="🚫" message={view.message} />}
      {view.kind === 'unavailable' && (
        <TerminalNotice icon="🛠️" message={view.message} />
      )}
      {view.kind === 'already_claimed' && (
        <TerminalNotice
          icon="✅"
          message={view.message}
          showStudioHint={view.showStudioHint}
        />
      )}

      {view.kind === 'claimable_anon' && (
        <>
          <ProfilePreviewCard
            name={view.preview.masterName}
            city={view.preview.city}
            avatarUrl={view.preview.avatarUrl}
            bio={view.preview.bio}
            expiresAt={view.preview.expiresAt}
          />
          <p className="text-center text-sm text-gray-600">
            Aby przejąć ten profil, zaloguj się lub załóż konto.
          </p>
          <ClaimAuthPanel />
        </>
      )}

      {view.kind === 'claimable_auth' && (
        <>
          <ProfilePreviewCard
            name={view.preview.masterName}
            city={view.preview.city}
            avatarUrl={view.preview.avatarUrl}
            bio={view.preview.bio}
            expiresAt={view.preview.expiresAt}
          />
          <ClaimActionPanel token={token} masterName={view.preview.masterName} />
        </>
      )}
    </main>
  )
}
