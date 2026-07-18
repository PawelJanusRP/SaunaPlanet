'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertCanManageSaunaEvents } from '@/app/events/actions'

/**
 * SP-037 — master event participation (W-11). Expected failures return as
 * { error } (production strips thrown server-action messages); the
 * database (policies + guard triggers from
 * supabase/2026-07-19_sp037_event_participation.sql) is the boundary —
 * these actions re-verify and translate, never replace it.
 */

export type ParticipationRole = 'lead' | 'assistant' | 'guest'
const ROLES: ParticipationRole[] = ['lead', 'assistant', 'guest']

function translateDbError(raw: string): string {
  // our own trigger messages are user-oriented Polish — pass them through
  if (/rozstrzyga|wymaga|nie można|Niedozwolona/.test(raw)) return raw
  if (raw.includes('duplicate key')) {
    return 'Zgłoszenie dla tego wydarzenia już istnieje'
  }
  if (raw.includes('row-level security') || raw.includes('permission denied')) {
    return 'Brak uprawnień do wykonania tej operacji'
  }
  console.error('participation db error:', raw)
  return 'Operacja nie powiodła się — spróbuj ponownie'
}

async function getOwnApprovedMasterId(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{ masterId?: string; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Musisz być zalogowany' }

  const { data: master } = await supabase
    .from('sauna_masters')
    .select('id, status')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!master) return { error: 'Tylko saunamistrzowie mogą zgłaszać udział' }
  if (master.status !== 'approved') {
    return { error: 'Twój profil saunamistrza czeka na zatwierdzenie' }
  }
  return { masterId: master.id }
}

export async function requestEventParticipation(
  eventId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const own = await getOwnApprovedMasterId(supabase)
  if (own.error || !own.masterId) return { error: own.error }

  // RLS independently enforces: pending-only, role NULL, event active and
  // not past, one open request per pair (partial unique index).
  const { error } = await supabase
    .from('sauna_event_masters')
    .insert({ event_id: eventId, master_id: own.masterId, status: 'pending' })

  if (error) return { error: translateDbError(error.message) }

  revalidatePath(`/events/${eventId}`)
  revalidatePath('/studio/events')
  revalidatePath('/workspace/events')
  return {}
}

/**
 * MVP limitation (documented in the SP-037 migration): withdrawal deletes
 * the pending row — request history is not preserved.
 */
export async function withdrawEventParticipation(
  assignmentId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const own = await getOwnApprovedMasterId(supabase)
  if (own.error || !own.masterId) return { error: own.error }

  const { data, error } = await supabase
    .from('sauna_event_masters')
    .delete()
    .eq('id', assignmentId)
    .eq('master_id', own.masterId)
    .eq('status', 'pending')
    .select('event_id')

  if (error) return { error: translateDbError(error.message) }
  if (!data || data.length === 0) {
    return { error: 'Zgłoszenie nie istnieje albo zostało już rozstrzygnięte' }
  }

  revalidatePath(`/events/${data[0].event_id}`)
  revalidatePath('/studio/events')
  revalidatePath('/workspace/events')
  return {}
}

export async function resolveEventParticipation(
  assignmentId: string,
  decision: 'approved' | 'rejected',
  role?: ParticipationRole
): Promise<{ error?: string }> {
  const supabase = await createClient()

  // Locate the request (RLS: visible to event staff / moderation / owner).
  const { data: assignment } = await supabase
    .from('sauna_event_masters')
    .select('id, status, event_id, sauna_events(sauna_id)')
    .eq('id', assignmentId)
    .maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const saunaId = (assignment as any)?.sauna_events?.sauna_id
  if (!assignment || !saunaId) {
    return { error: 'Nie znaleziono zgłoszenia' }
  }
  if (assignment.status !== 'pending') {
    return { error: 'Zgłoszenie zostało już rozstrzygnięte' }
  }

  // Reuse the SP-034 authorization: admin OR approved staff of the sauna.
  try {
    await assertCanManageSaunaEvents(supabase, saunaId)
  } catch {
    return { error: 'Brak uprawnień do rozstrzygania zgłoszeń tego obiektu' }
  }

  if (decision === 'approved' && (!role || !ROLES.includes(role))) {
    return { error: 'Zatwierdzenie wymaga wyboru roli (lead, assistant lub guest)' }
  }

  // The guard trigger owns approved_at and re-validates the transition,
  // the actor and the role vocabulary at the database boundary.
  const { data: updated, error } = await supabase
    .from('sauna_event_masters')
    .update(
      decision === 'approved'
        ? { status: 'approved', role }
        : { status: 'rejected' }
    )
    .eq('id', assignmentId)
    .eq('status', 'pending')
    .select('id')

  if (error) return { error: translateDbError(error.message) }
  if (!updated || updated.length === 0) {
    return { error: 'Zgłoszenie nie istnieje albo zostało już rozstrzygnięte' }
  }

  revalidatePath(`/events/${assignment.event_id}`)
  revalidatePath('/studio/events')
  revalidatePath('/workspace/events')
  return {}
}
