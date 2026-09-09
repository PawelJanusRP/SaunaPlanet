'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { assertCanManageSaunaEvents } from '@/app/[locale]/events/actions'

/**
 * SP-037 — master event participation (W-11). Expected failures return as
 * { error } (production strips thrown server-action messages); the
 * database (policies + guard triggers from
 * supabase/2026-07-19_sp037_event_participation.sql) is the boundary —
 * these actions re-verify and translate, never replace it.
 */

export type ParticipationRole = 'lead' | 'assistant' | 'guest'
const ROLES: ParticipationRole[] = ['lead', 'assistant', 'guest']

async function translateDbError(raw: string): Promise<string> {
  const t = await getTranslations('events')
  // our own trigger/RPC messages are user-oriented Polish — pass through
  if (/rozstrzyg|wymaga|nie można|Niedozwolona|Tylko zatwierdzony|musi mieć|Obiekt nie istnieje|można tworzyć|Limit miejsc|dołączony|Decyzja musi|propozycja/i.test(raw)) {
    return raw
  }
  if (raw.includes('duplicate key')) {
    return t('actions.participation.duplicateRequest')
  }
  if (raw.includes('row-level security') || raw.includes('permission denied')) {
    return t('actions.participation.permissionDenied')
  }
  console.error('participation db error:', raw)
  return t('actions.participation.genericError')
}

async function getOwnApprovedMasterId(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{ masterId?: string; error?: string }> {
  const t = await getTranslations('events')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: t('actions.mustBeLoggedIn') }

  const { data: master } = await supabase
    .from('sauna_masters')
    .select('id, status')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!master) return { error: t('actions.participation.masterOnly') }
  if (master.status !== 'approved') {
    return { error: t('actions.participation.masterPending') }
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
  // not past, one open request per pair (partial unique index). Since the
  // SP-037B migration the request policy also requires the handshake
  // direction to be explicit: initiated_by = 'master'.
  const { error } = await supabase
    .from('sauna_event_masters')
    .insert({
      event_id: eventId,
      master_id: own.masterId,
      status: 'pending',
      initiated_by: 'master',
    })

  if (error) return { error: await translateDbError(error.message) }

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

  if (error) return { error: await translateDbError(error.message) }
  if (!data || data.length === 0) {
    const t = await getTranslations('events')
    return { error: t('actions.participation.requestNotFoundOrResolved') }
  }

  revalidatePath(`/events/${data[0].event_id}`)
  revalidatePath('/studio/events')
  revalidatePath('/workspace/events')
  return {}
}

/**
 * SP-037B slice 5 (rule D): facility-initiated invitation. The database
 * contract enforces everything essential (staff-of-event INSERT policy,
 * pending+'facility' only, offered role from the vocabulary, target
 * master approved, event active and future, unique open pair); this
 * action re-verifies staff/admin and translates failures.
 */
export async function inviteMasterToEvent(
  eventId: string,
  masterId: string,
  role: ParticipationRole
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const t = await getTranslations('events')

  if (!ROLES.includes(role)) {
    return { error: t('actions.participation.invalidInviteRole') }
  }

  const { data: ev } = await supabase
    .from('sauna_events')
    .select('sauna_id')
    .eq('id', eventId)
    .maybeSingle()
  if (!ev?.sauna_id) return { error: t('actions.participation.eventNotFound') }
  try {
    await assertCanManageSaunaEvents(supabase, ev.sauna_id)
  } catch {
    return { error: t('actions.participation.inviteForbidden') }
  }

  const { error } = await supabase
    .from('sauna_event_masters')
    .insert({
      event_id: eventId,
      master_id: masterId,
      status: 'pending',
      initiated_by: 'facility',
      role,
    })
  if (error) {
    if (error.message.includes('duplicate key')) {
      return { error: t('actions.participation.duplicateInvite') }
    }
    return { error: await translateDbError(error.message) }
  }

  revalidatePath('/workspace/events')
  revalidatePath('/studio/events')
  return {}
}

/**
 * The invited master accepts or declines their own pending
 * facility-originated invitation. Acceptance keeps the EXACT offered role
 * (the guard freezes it) and the trigger assigns the trusted approved_at;
 * rejection clears role and approved_at per the database invariant.
 */
export async function respondToEventInvitation(
  invitationId: string,
  decision: 'approved' | 'rejected'
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const own = await getOwnApprovedMasterId(supabase)
  if (own.error || !own.masterId) return { error: own.error }

  const { data, error } = await supabase
    .from('sauna_event_masters')
    .update({ status: decision })
    .eq('id', invitationId)
    .eq('master_id', own.masterId)
    .eq('status', 'pending')
    .eq('initiated_by', 'facility')
    .select('event_id')

  if (error) return { error: await translateDbError(error.message) }
  if (!data || data.length === 0) {
    const t = await getTranslations('events')
    return { error: t('actions.participation.invitationNotFoundOrResolved') }
  }

  revalidatePath(`/events/${data[0].event_id}`)
  revalidatePath('/studio/events')
  revalidatePath('/workspace/events')
  return {}
}

/**
 * Facility staff (or admin) withdraws a pending invitation. MVP
 * limitation, mirroring request withdrawal: DELETE removes the pending
 * invitation history.
 */
export async function withdrawEventInvitation(
  invitationId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const t = await getTranslations('events')

  const { data: inv } = await supabase
    .from('sauna_event_masters')
    .select('id, sauna_events(sauna_id)')
    .eq('id', invitationId)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const saunaId = (inv as any)?.sauna_events?.sauna_id
  if (!inv || !saunaId) return { error: t('actions.participation.invitationNotFound') }
  try {
    await assertCanManageSaunaEvents(supabase, saunaId)
  } catch {
    return { error: t('actions.participation.withdrawInviteForbidden') }
  }

  const { data, error } = await supabase
    .from('sauna_event_masters')
    .delete()
    .eq('id', invitationId)
    .eq('status', 'pending')
    .eq('initiated_by', 'facility')
    .select('id')

  if (error) return { error: await translateDbError(error.message) }
  if (!data || data.length === 0) {
    return { error: t('actions.participation.invitationNotFoundOrResolved') }
  }

  revalidatePath('/workspace/events')
  revalidatePath('/studio/events')
  return {}
}

export type CreateMasterEventInput = {
  saunaId: string
  title: string
  eventDate: string
  eventTime: string | null
  price: string | null
  description: string | null
  maxParticipants: number | null
}

/**
 * SP-037B slice 2: master event creation goes EXCLUSIVELY through the
 * trusted create_master_event RPC — managed/unmanaged routing is decided
 * inside the database transaction and the RPC's returned statuses are the
 * only source of truth the UI may present.
 */
export async function createMasterEvent(
  input: CreateMasterEventInput
): Promise<{
  eventId?: string
  eventStatus?: 'active' | 'pending'
  participationStatus?: 'approved' | 'pending'
  error?: string
}> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_master_event', {
    p_sauna_id: input.saunaId,
    p_title: input.title,
    p_event_date: input.eventDate,
    p_event_time: input.eventTime,
    p_price: input.price,
    p_description: input.description,
    p_max_participants: input.maxParticipants,
  })

  if (error) return { error: await translateDbError(error.message) }

  const result = data as {
    event_id: string
    event_status: 'active' | 'pending'
    participation_status: 'approved' | 'pending'
  }

  revalidatePath('/events')
  revalidatePath(`/events/${result.event_id}`)
  revalidatePath(`/sauna/${input.saunaId}`)
  revalidatePath('/studio/events')
  revalidatePath('/workspace/events')
  return {
    eventId: result.event_id,
    eventStatus: result.event_status,
    participationStatus: result.participation_status,
  }
}

/**
 * Withdrawing a pending master-event PROPOSAL deletes the whole event
 * (the organizer pair follows via FK cascade) — distinct from withdrawing
 * an ordinary participation request. RLS (events_delete_master) plus the
 * pending-status predicate are the boundary.
 */
export async function withdrawMasterEventProposal(
  eventId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const own = await getOwnApprovedMasterId(supabase)
  if (own.error || !own.masterId) return { error: own.error }

  const { data, error } = await supabase
    .from('sauna_events')
    .delete()
    .eq('id', eventId)
    .eq('organizer_master_id', own.masterId)
    .eq('status', 'pending')
    .select('id')

  if (error) return { error: await translateDbError(error.message) }
  if (!data || data.length === 0) {
    const t = await getTranslations('events')
    return { error: t('actions.participation.proposalNotFoundOrResolved') }
  }

  revalidatePath('/studio/events')
  revalidatePath('/workspace/events')
  return {}
}

/**
 * SP-037B slice 3: manager resolution of a master-created event proposal.
 * Uses ONLY the trusted resolve_master_event RPC — event activation and
 * organizer-participation approval (with the manager-selected role and a
 * trusted approved_at) happen atomically in the database; rejection
 * rejects both. Authorization (staff of the event's facility OR admin)
 * and concurrency safety (FOR UPDATE + pending-only) live in the RPC.
 */
export async function resolveMasterEventProposal(
  eventId: string,
  decision: 'approved' | 'rejected',
  role?: ParticipationRole
): Promise<{ error?: string }> {
  const supabase = await createClient()

  if (decision === 'approved' && (!role || !ROLES.includes(role))) {
    const t = await getTranslations('events')
    return { error: t('actions.participation.roleRequiredOrganizer') }
  }

  const { error } = await supabase.rpc('resolve_master_event', {
    p_event_id: eventId,
    p_decision: decision,
    p_organizer_role: decision === 'approved' ? role : null,
  })

  if (error) return { error: await translateDbError(error.message) }

  revalidatePath('/events')
  revalidatePath(`/events/${eventId}`)
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
  const t = await getTranslations('events')

  // Locate the request (RLS: visible to event staff / moderation / owner).
  const { data: assignment } = await supabase
    .from('sauna_event_masters')
    .select('id, status, event_id, sauna_events(sauna_id)')
    .eq('id', assignmentId)
    .maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const saunaId = (assignment as any)?.sauna_events?.sauna_id
  if (!assignment || !saunaId) {
    return { error: t('actions.participation.requestNotFound') }
  }
  if (assignment.status !== 'pending') {
    return { error: t('actions.participation.requestAlreadyResolved') }
  }

  // Reuse the SP-034 authorization: admin OR approved staff of the sauna.
  try {
    await assertCanManageSaunaEvents(supabase, saunaId)
  } catch {
    return { error: t('actions.participation.resolveForbidden') }
  }

  if (decision === 'approved' && (!role || !ROLES.includes(role))) {
    return { error: t('actions.participation.roleRequired') }
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

  if (error) return { error: await translateDbError(error.message) }
  if (!updated || updated.length === 0) {
    return { error: t('actions.participation.requestNotFoundOrResolved') }
  }

  revalidatePath(`/events/${assignment.event_id}`)
  revalidatePath('/studio/events')
  revalidatePath('/workspace/events')
  return {}
}
