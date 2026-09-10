// SP-042B — the ONLY sanctioned holder of the privileged Supabase server
// credential (SUPABASE_SERVICE_ROLE_KEY). Repo-wide contract tests pin this:
// no other app/components/lib source may reference the service role.
//
// Purpose: trusted SERVER-ONLY invocation of narrowly-granted RPCs whose
// anonymous branch must be unreachable from the browser (first use: the
// SP-042 feedback intake RPC — direct `anon` EXECUTE is revoked, so the
// anonymous path exists exclusively through a Server Action using this
// client). The privileged client bypasses RLS by design, therefore callers
// MUST use it only for explicit RPC calls that revalidate everything
// server-side — never for table reads/writes.
//
// The env var is server-only (no NEXT_PUBLIC prefix) and the constructor
// throws in any browser context as a second line of defense.

import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

export function createTrustedServerClient(): SupabaseClient | null {
  if (typeof window !== 'undefined') {
    throw new Error('trusted server client must never be created in a browser context')
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
