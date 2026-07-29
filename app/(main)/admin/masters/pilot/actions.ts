'use server'

// SP-039 Slice 3B2 — prepared-profile server actions (moderator only).
//
// Writes go through the RLS client (masters_insert_self moderator arm /
// masters_update_moderation) — no service role, no direct claim-table access.
// Validation reuses the pure lib/master/profileUpdate builder (the same
// contract as the owner Studio form), so origin/status/user_id/level can never
// enter the patch. Every failure is RETURNED as a stable code with a Polish
// message (thrown server-action messages are stripped in production builds).
//
// 'use server' contract: only async function exports; all types come from the
// pure libs (lib/claim/pilot, lib/master/profileUpdate).

import { revalidatePath } from 'next/cache'
import { createClient, getCurrentUserRole } from '@/lib/supabase/server'
import {
  buildOwnMasterProfilePatch,
  type OwnMasterProfileUpdate,
} from '@/lib/master/profileUpdate'
import { isUuid, slugWithSuffix } from '@/lib/master/slug'
import {
  evaluatePreparedProfileEditability,
  pilotResult,
  type PilotActionResult,
} from '@/lib/claim/pilot'

async function requireModerator(): Promise<PilotActionResult | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return pilotResult('not_authenticated')
  const role = await getCurrentUserRole()
  if (role !== 'admin' && role !== 'moderator') return pilotResult('not_authorized')
  return null
}

function slugConflictMessage(requestedSlug: string): string {
  return `Adres „${requestedSlug}" jest już zajęty — spróbuj np. „${slugWithSuffix(requestedSlug, 2)}"`
}

/**
 * Creates an admin-prepared pilot profile: origin='admin_prepared',
 * status='pending', user_id=NULL (column default), level='guest' baseline
 * (levels are certification-driven and stay with dedicated moderation flows).
 */
export async function createPreparedMasterProfile(
  data: OwnMasterProfileUpdate
): Promise<PilotActionResult> {
  try {
    const denied = await requireModerator()
    if (denied) return denied

    if (typeof data.name !== 'string' || data.name.trim().length === 0) {
      return pilotResult('invalid_input', { message: 'Imię i nazwisko jest wymagane' })
    }
    const built = buildOwnMasterProfilePatch(data)
    if (!built.ok) return pilotResult('invalid_input', { message: built.error })

    const supabase = await createClient()
    const { data: created, error } = await supabase
      .from('sauna_masters')
      .insert({
        ...built.patch,
        level: 'guest',
        status: 'pending',
        origin: 'admin_prepared',
      })
      .select('id')

    if (error) {
      if (
        built.requestedSlug &&
        (error.code === '23505' || error.message.includes('sauna_masters_slug_unique'))
      ) {
        return pilotResult('invalid_input', {
          message: slugConflictMessage(built.requestedSlug),
        })
      }
      return pilotResult('unexpected_error')
    }
    if (!created || created.length === 0) return pilotResult('unexpected_error')

    const masterId = (created[0] as { id: string }).id
    revalidatePath('/admin/masters/pilot')
    return pilotResult('ok', { message: 'Profil przygotowany.', masterId })
  } catch {
    return pilotResult('unexpected_error')
  }
}

/**
 * Edits a prepared, UNCLAIMED profile. Concurrency contract: the current row
 * is re-read first (fresh editability verdict), and the UPDATE repeats the
 * same conditions as WHERE clauses — if the profile was claimed, re-originated
 * or moderated in between, zero rows match and the caller gets `conflict`
 * instead of overwriting claim-related state.
 */
export async function updatePreparedMasterProfile(
  masterId: string,
  data: OwnMasterProfileUpdate
): Promise<PilotActionResult> {
  try {
    if (typeof masterId !== 'string' || !isUuid(masterId)) {
      return pilotResult('invalid_input')
    }
    const denied = await requireModerator()
    if (denied) return denied

    const supabase = await createClient()
    const { data: current, error: readError } = await supabase
      .from('sauna_masters')
      .select('id, user_id, origin, status')
      .eq('id', masterId)
      .maybeSingle()
    if (readError) return pilotResult('unexpected_error')

    const row = current as { id: string; user_id: string | null; origin: string; status: string } | null
    const editable = evaluatePreparedProfileEditability({
      exists: row !== null,
      userId: row?.user_id ?? null,
      origin: row?.origin ?? '',
      status: row?.status ?? '',
    })
    if (!editable.ok) return pilotResult(editable.code)

    const built = buildOwnMasterProfilePatch(data)
    if (!built.ok) return pilotResult('invalid_input', { message: built.error })
    if (Object.keys(built.patch).length === 0) return pilotResult('ok')

    const { data: updated, error } = await supabase
      .from('sauna_masters')
      .update(built.patch)
      .eq('id', masterId)
      .is('user_id', null)
      .eq('origin', 'admin_prepared')
      .eq('status', 'pending')
      .select('id')

    if (error) {
      if (
        built.requestedSlug &&
        (error.code === '23505' || error.message.includes('sauna_masters_slug_unique'))
      ) {
        return pilotResult('invalid_input', {
          message: slugConflictMessage(built.requestedSlug),
        })
      }
      return pilotResult('unexpected_error')
    }
    if (!updated || updated.length === 0) return pilotResult('conflict')

    revalidatePath('/admin/masters/pilot')
    revalidatePath(`/admin/masters/pilot/${masterId}`)
    return pilotResult('ok', { message: 'Profil zapisany.' })
  } catch {
    return pilotResult('unexpected_error')
  }
}
