'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getCurrentUserRole } from '@/lib/supabase/server'

async function assertEditor() {
  const role = await getCurrentUserRole()
  if (role !== 'admin' && role !== 'moderator') {
    throw new Error('Brak uprawnień')
  }
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * SP-034: event management is allowed for admins/moderators and for approved
 * facility staff (sauna_managers) of the event's sauna. Same authorization
 * pattern as updateRegistrationStatus; RLS on sauna_events enforces the same
 * rule at the DB layer (supabase/2026-07-11_sp034_owner_events_rls.sql).
 */
async function assertCanManageSaunaEvents(supabase: SupabaseServerClient, saunaId: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Musisz być zalogowany')

  const role = await getCurrentUserRole()
  if (role === 'admin' || role === 'moderator') return

  const { data: mgr } = await supabase
    .from('sauna_managers')
    .select('id')
    .eq('user_id', user.id)
    .eq('sauna_id', saunaId)
    .eq('status', 'approved')
    .maybeSingle()
  if (!mgr) throw new Error('Brak uprawnień')
}

async function getEventSaunaId(supabase: SupabaseServerClient, eventId: string): Promise<string> {
  const { data: ev } = await supabase
    .from('sauna_events')
    .select('sauna_id')
    .eq('id', eventId)
    .single()
  if (!ev?.sauna_id) throw new Error('Nie znaleziono eventu')
  return ev.sauna_id
}

export type EventFormData = {
  title: string
  event_date: string
  event_time: string | null
  price: string | null
  description: string | null
  max_participants?: number | null
}

function eventRowFromForm(data: EventFormData) {
  if (!data.title.trim() || !data.event_date) throw new Error('Tytuł i data są wymagane')
  const maxParticipants =
    data.max_participants !== undefined && data.max_participants !== null
      ? Math.floor(data.max_participants)
      : null
  if (maxParticipants !== null && maxParticipants < 1) {
    throw new Error('Limit miejsc musi być większy od zera')
  }
  return {
    title: data.title.trim(),
    event_date: data.event_date,
    event_time: data.event_time || null,
    price: data.price?.trim() || null,
    description: data.description?.trim() || null,
    ...(data.max_participants !== undefined ? { max_participants: maxParticipants } : {}),
  }
}

function revalidateEventSurfaces(eventId: string, saunaId: string) {
  revalidatePath(`/events/${eventId}`)
  revalidatePath('/events')
  revalidatePath(`/sauna/${saunaId}`)
  revalidatePath('/workspace')
  revalidatePath('/workspace/events')
}

export async function createEvent(saunaId: string, data: EventFormData) {
  const supabase = await createClient()
  await assertCanManageSaunaEvents(supabase, saunaId)

  const { data: created, error } = await supabase
    .from('sauna_events')
    .insert({ sauna_id: saunaId, status: 'active', ...eventRowFromForm(data) })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  revalidateEventSurfaces(created.id, saunaId)
}

export async function updateEvent(id: string, data: EventFormData) {
  const supabase = await createClient()
  const saunaId = await getEventSaunaId(supabase, id)
  await assertCanManageSaunaEvents(supabase, saunaId)

  // .select() so an RLS mismatch (0 rows) surfaces as an error instead of a
  // silent no-op — matters until the SP-034 policies are applied to the DB.
  const { data: updated, error } = await supabase
    .from('sauna_events')
    .update(eventRowFromForm(data))
    .eq('id', id)
    .select('id')

  if (error) throw new Error(error.message)
  if (!updated || updated.length === 0) throw new Error('Brak uprawnień do edycji tego wydarzenia')
  revalidateEventSurfaces(id, saunaId)
}

export async function deleteEvent(id: string) {
  const supabase = await createClient()
  const saunaId = await getEventSaunaId(supabase, id)
  await assertCanManageSaunaEvents(supabase, saunaId)

  const { data: deleted, error } = await supabase
    .from('sauna_events')
    .delete()
    .eq('id', id)
    .select('id')

  if (error) throw new Error(error.message)
  if (!deleted || deleted.length === 0) throw new Error('Brak uprawnień do usunięcia tego wydarzenia')
  revalidateEventSurfaces(id, saunaId)
}

export async function removeEventMaster(eventId: string, masterId: string) {
  await assertEditor()
  const supabase = await createClient()

  const { error } = await supabase
    .from('sauna_event_masters')
    .delete()
    .eq('event_id', eventId)
    .eq('master_id', masterId)

  if (error) throw new Error(error.message)
  revalidatePath(`/events/${eventId}`)
}

export async function registerForEvent(eventId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Musisz być zalogowany')

  const { error } = await supabase
    .from('event_registrations')
    .insert({ event_id: eventId, user_id: user.id, status: 'pending' })

  if (error) throw new Error(error.message)
  revalidatePath(`/events/${eventId}`)
}

export async function cancelRegistration(eventId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Musisz być zalogowany')

  const { error } = await supabase
    .from('event_registrations')
    .delete()
    .eq('event_id', eventId)
    .eq('user_id', user.id)

  if (error) throw new Error(error.message)
  revalidatePath(`/events/${eventId}`)
}

export async function updateRegistrationStatus(registrationId: string, status: 'confirmed' | 'cancelled') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Musisz być zalogowany')

  const role = await getCurrentUserRole()
  if (role !== 'admin' && role !== 'moderator') {
    const { data: reg } = await supabase
      .from('event_registrations')
      .select('event_id')
      .eq('id', registrationId)
      .single()
    if (!reg) throw new Error('Nie znaleziono rezerwacji')

    const { data: ev } = await supabase
      .from('sauna_events')
      .select('sauna_id')
      .eq('id', reg.event_id)
      .single()
    if (!ev) throw new Error('Nie znaleziono eventu')

    const { data: mgr } = await supabase
      .from('sauna_managers')
      .select('id')
      .eq('user_id', user.id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .eq('sauna_id', (ev as any).sauna_id)
      .eq('status', 'approved')
      .maybeSingle()
    if (!mgr) throw new Error('Brak uprawnień')
  }

  const { error } = await supabase
    .from('event_registrations')
    .update({ status })
    .eq('id', registrationId)

  if (error) throw new Error(error.message)
  revalidatePath('/profile')
  revalidatePath('/workspace')
  revalidatePath('/workspace/reservations')
  revalidatePath(`/events/${registrationId}`)
}

export async function addEventReview(eventId: string, rating: number, comment: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Musisz być zalogowany')

  const { error } = await supabase
    .from('event_reviews')
    .insert({ event_id: eventId, user_id: user.id, rating, comment: comment.trim() || null })

  if (error) throw new Error(error.message)
  revalidatePath(`/events/${eventId}`)
}

export async function deleteEventReview(reviewId: string, eventId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Musisz być zalogowany')

  const { error } = await supabase
    .from('event_reviews')
    .delete()
    .eq('id', reviewId)

  if (error) throw new Error(error.message)
  revalidatePath(`/events/${eventId}`)
}

export async function addEventComment(eventId: string, comment: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Musisz być zalogowany')
  if (!comment.trim()) throw new Error('Komentarz nie może być pusty')

  const { error } = await supabase
    .from('event_comments')
    .insert({ event_id: eventId, user_id: user.id, comment: comment.trim() })

  if (error) throw new Error(error.message)
  revalidatePath(`/events/${eventId}`)
}

export async function deleteEventComment(commentId: string, eventId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Musisz być zalogowany')

  const { error } = await supabase
    .from('event_comments')
    .delete()
    .eq('id', commentId)

  if (error) throw new Error(error.message)
  revalidatePath(`/events/${eventId}`)
}
