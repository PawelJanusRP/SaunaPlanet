'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getCurrentUserRole } from '@/lib/supabase/server'

/**
 * SP-036 facility submission workflow (docs/SP036_ARCHITECTURE.md §5.1).
 * Shared by the map form, /submit and (future) Master Studio — there is
 * exactly one moderated server-side path; no client-side inserts.
 *
 * Expected failures are RETURNED as { error } instead of thrown: Next.js
 * strips thrown server-action messages in production builds (same pattern
 * as createEvent, commit fd67891).
 */

export type FacilitySubmissionInput = {
  name: string
  description: string | null
  category: string
  city: string | null
  website?: string | null
  latitude: number | null
  longitude: number | null
}

export type SimilarFacility = {
  id: string
  name: string
  city: string | null
  status: string
  distance_m: number | null
  match_reasons: string[]
}

const OPEN_SUBMISSION_LIMIT = 5

/**
 * User-facing error translation. Raw PostgreSQL / RLS / trigger / function
 * names must never surface in normal user flows; our own trigger messages
 * (already user-oriented Polish) pass through, everything else maps to a
 * category message and the raw cause goes to the server log only.
 */
function translateDbError(raw: string): string {
  // own trigger/RPC messages are user-oriented Polish — pass them through
  if (/oczekując|moderacj|nie istnieje|Tylko zatwierdzony|musi mieć|wymaga|dołączony|można tworzyć|Limit miejsc/.test(raw)) {
    return raw
  }
  if (raw.includes('row-level security') || raw.includes('permission denied')) {
    return 'Brak uprawnień do wykonania tej operacji'
  }
  console.error('facility action db error:', raw)
  return 'Operacja nie powiodła się — spróbuj ponownie'
}

function validateCoordinates(
  lat: number | null,
  lng: number | null
): string | null {
  if (lat === null && lng === null) return null // optional (e.g. /submit)
  if (lat === null || lng === null) return 'Podaj obie współrzędne albo żadną'
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return 'Współrzędne muszą być liczbami'
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return 'Współrzędne są poza dopuszczalnym zakresem'
  }
  return null
}

/**
 * Duplicate WARNING helper (warn-only by contract — results must never
 * block or mutate anything automatically). Errors degrade to an empty
 * list: a broken dedup check must not stop a submission.
 */
export async function findSimilarFacilities(params: {
  name: string
  lat?: number | null
  lng?: number | null
  website?: string | null
}): Promise<{ matches: SimilarFacility[] }> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('find_similar_saunas', {
    p_name: params.name,
    p_lat: params.lat ?? null,
    p_lng: params.lng ?? null,
    p_website: params.website ?? null,
  })
  if (error) {
    console.error('find_similar_saunas failed', error)
    return { matches: [] }
  }
  return { matches: (data ?? []) as SimilarFacility[] }
}

export async function submitFacility(
  data: FacilitySubmissionInput
): Promise<{ id?: string; status?: 'pending' | 'active'; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Musisz być zalogowany, aby zgłosić saunę' }

    if (!data.name.trim()) return { error: 'Podaj nazwę sauny lub obiektu' }
    const coordError = validateCoordinates(data.latitude, data.longitude)
    if (coordError) return { error: coordError }

    const role = await getCurrentUserRole()
    const isModeration = role === 'admin' || role === 'moderator'

    // Friendly pre-check of the open-submission cap; the database trigger
    // (guard_sauna_submission_cap, advisory-locked) is the real boundary.
    if (!isModeration) {
      const { count } = await supabase
        .from('saunas')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', user.id)
        .eq('status', 'pending')
      if ((count ?? 0) >= OPEN_SUBMISSION_LIMIT) {
        return {
          error: `Masz już ${OPEN_SUBMISSION_LIMIT} zgłoszeń oczekujących na moderację — poczekaj na ich rozpatrzenie`,
        }
      }
    }

    const { data: created, error } = await supabase
      .from('saunas')
      .insert({
        name: data.name.trim(),
        description: data.description?.trim() || null,
        category: data.category,
        city: data.city?.trim() || null,
        website: data.website?.trim() || null,
        latitude: data.latitude,
        longitude: data.longitude,
        // Moderation keeps the pre-SP-036 direct-to-map behavior; everyone
        // else enters the moderated queue. RLS enforces the same rule.
        status: isModeration ? 'active' : 'pending',
        created_by: user.id,
        source: 'user_submission',
      })
      .select('id, status')
      .single()

    if (error) return { error: translateDbError(error.message) }

    revalidatePath('/admin')
    return { id: created.id, status: created.status as 'pending' | 'active' }
  } catch (e) {
    console.error('submitFacility failed:', e)
    return { error: 'Nie udało się zgłosić sauny — spróbuj ponownie' }
  }
}

export type BundledEventInput = {
  title: string
  eventDate: string
  eventTime: string | null
  price: string | null
  description: string | null
  maxParticipants: number | null
}

/**
 * SP-037B slice 4 (rule A): a verified master submits a facility together
 * with one bundled event and their own organizer participation. The
 * facility goes through the standard moderated submitFacility path; the
 * event + organizer pair are created by the trusted create_master_event
 * RPC (p_bundled routing, statuses decided in the database transaction) —
 * no client-side inserts, no client-supplied statuses/roles/flags.
 *
 * The two steps are not one database transaction (the deployed RPC
 * contract composes them); event inputs are pre-validated first so a
 * facility-without-event outcome is limited to pathological failures and
 * is reported explicitly via eventError.
 */
export async function submitFacilityWithEvent(
  facility: FacilitySubmissionInput,
  event: BundledEventInput
): Promise<{
  facilityId?: string
  facilityStatus?: 'pending' | 'active'
  eventStatus?: 'pending' | 'active'
  error?: string
  eventError?: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Musisz być zalogowany' }

  // Bundling is master-only (ordinary users keep facility-only submission)
  const { data: ownMaster } = await supabase
    .from('sauna_masters')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .maybeSingle()
  if (!ownMaster) {
    return { error: 'Wydarzenie do zgłoszenia mogą dołączyć tylko zatwierdzeni saunamistrzowie' }
  }

  // Pre-validate the event before creating the facility, so the bundle
  // cannot fail on trivially-checkable input after the facility exists.
  if (!event.title.trim()) return { error: 'Podaj nazwę wydarzenia' }
  if (!event.eventDate) return { error: 'Podaj datę wydarzenia' }
  const todayIso = new Date().toISOString().split('T')[0]
  if (event.eventDate < todayIso) {
    return { error: 'Wydarzenie musi mieć dzisiejszą lub przyszłą datę' }
  }
  if (event.maxParticipants !== null && event.maxParticipants < 1) {
    return { error: 'Limit miejsc musi być większy od zera' }
  }

  const facilityResult = await submitFacility(facility)
  if (facilityResult.error || !facilityResult.id) {
    return { error: facilityResult.error ?? 'Nie udało się zgłosić sauny' }
  }

  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    'create_master_event',
    {
      p_sauna_id: facilityResult.id,
      p_title: event.title,
      p_event_date: event.eventDate,
      p_event_time: event.eventTime,
      p_price: event.price,
      p_description: event.description,
      p_max_participants: event.maxParticipants,
      // moderation submitting via this flow gets an active facility, so the
      // bundle flag must follow the ACTUAL facility status from the server
      p_bundled: facilityResult.status === 'pending',
    }
  )

  if (rpcError) {
    console.error('bundled event creation failed:', rpcError.message)
    return {
      facilityId: facilityResult.id,
      facilityStatus: facilityResult.status,
      eventError:
        'Obiekt został zgłoszony, ale wydarzenia nie udało się dołączyć: ' +
        translateDbError(rpcError.message),
    }
  }

  const result = rpcResult as { event_id: string; event_status: 'pending' | 'active' }
  revalidatePath('/admin')
  revalidatePath('/studio/events')
  return {
    facilityId: facilityResult.id,
    facilityStatus: facilityResult.status,
    eventStatus: result.event_status,
  }
}

async function assertModerationResult(): Promise<string | null> {
  const role = await getCurrentUserRole()
  if (role !== 'admin' && role !== 'moderator') return 'Brak uprawnień'
  return null
}

/**
 * Facility approval goes through the approve_facility_submission RPC so
 * bundled master events (SP-036 path B') activate atomically, with the
 * eligibility re-checks living in the database.
 */
export async function approveFacility(
  saunaId: string
): Promise<{
  activatedEvents?: number
  skippedEvents?: number
  approvedParticipations?: number
  error?: string
}> {
  const denied = await assertModerationResult()
  if (denied) return { error: denied }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('approve_facility_submission', {
    target_sauna_id: saunaId,
  })
  if (error) return { error: translateDbError(error.message) }

  revalidatePath('/admin')
  revalidatePath('/events')
  revalidatePath(`/sauna/${saunaId}`)
  const result = data as {
    activated_event_ids?: string[]
    skipped_event_ids?: string[]
    approved_participations?: number
  } | null
  return {
    activatedEvents: result?.activated_event_ids?.length ?? 0,
    skippedEvents: result?.skipped_event_ids?.length ?? 0,
    approvedParticipations: result?.approved_participations ?? 0,
  }
}

/**
 * SP-037B slice 4: rejection goes through the trusted
 * reject_facility_submission RPC — the pending facility, its
 * deterministically bundled pending event(s) and their organizer
 * participations reject atomically; unrelated events are untouched and no
 * orphaned pending bundle records remain.
 */
export async function rejectFacility(
  saunaId: string
): Promise<{ rejectedEvents?: number; error?: string }> {
  const denied = await assertModerationResult()
  if (denied) return { error: denied }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('reject_facility_submission', {
    target_sauna_id: saunaId,
  })
  if (error) return { error: translateDbError(error.message) }

  revalidatePath('/admin')
  const result = data as { rejected_event_ids?: string[] } | null
  return { rejectedEvents: result?.rejected_event_ids?.length ?? 0 }
}
