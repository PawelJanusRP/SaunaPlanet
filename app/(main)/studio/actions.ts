'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getCurrentUserRole } from '@/lib/supabase/server'

/**
 * SP-035: Master Studio + affiliation lifecycle (Decision 016, W-16).
 *
 * Authorization is layered: every action re-verifies the caller's side of
 * the relationship server-side, and the database enforces the same rules
 * independently (RLS + transition trigger in
 * supabase/2026-07-11_sp035_master_studio.sql). Workspace context and route
 * params are presentation only. home_sauna_id is never consulted.
 */

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

async function requireUser(supabase: SupabaseServerClient) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Musisz być zalogowany')
  return user
}

async function isModeration() {
  const role = await getCurrentUserRole()
  return role === 'admin' || role === 'moderator'
}

/** The master profile linked to this account (Layer 3 link — never home_sauna_id). */
async function getOwnMaster(supabase: SupabaseServerClient, userId: string) {
  const { data } = await supabase
    .from('sauna_masters')
    .select('id, status')
    .eq('user_id', userId)
    .maybeSingle()
  return data as { id: string; status: string } | null
}

async function isStaffOfSauna(supabase: SupabaseServerClient, userId: string, saunaId: string) {
  const { data } = await supabase
    .from('sauna_managers')
    .select('id')
    .eq('user_id', userId)
    .eq('sauna_id', saunaId)
    .eq('status', 'approved')
    .maybeSingle()
  return data !== null
}

function revalidateAffiliationSurfaces() {
  revalidatePath('/studio')
  revalidatePath('/studio/affiliations')
  revalidatePath('/workspace')
  revalidatePath('/workspace/team')
}

const DUPLICATE_AFFILIATION_MESSAGE =
  'Ta relacja już istnieje (aktywna lub oczekująca afiliacja z tym obiektem)'

function friendlyInsertError(message: string) {
  return message.includes('master_affiliations_open_unique') || message.includes('duplicate key')
    ? DUPLICATE_AFFILIATION_MESSAGE
    : message
}

// ============================================================
// Own master profile
// ============================================================

export async function updateOwnMasterProfile(data: { name: string; bio: string | null }) {
  const supabase = await createClient()
  const user = await requireUser(supabase)

  if (!data.name.trim()) throw new Error('Imię i nazwisko nie może być puste')

  const own = await getOwnMaster(supabase, user.id)
  if (!own) throw new Error('Brak profilu saunamistrza powiązanego z tym kontem')

  const { data: updated, error } = await supabase
    .from('sauna_masters')
    .update({ name: data.name.trim(), bio: data.bio?.trim() || null })
    .eq('id', own.id)
    .select('id')

  if (error) throw new Error(error.message)
  if (!updated || updated.length === 0) throw new Error('Brak uprawnień do edycji tego profilu')

  revalidatePath('/studio')
  revalidatePath('/studio/profile')
  revalidatePath(`/masters/${own.id}`)
}

// ============================================================
// Affiliation lifecycle — one model, both directions
// ============================================================

export async function requestAffiliation(saunaId: string) {
  const supabase = await createClient()
  const user = await requireUser(supabase)

  const own = await getOwnMaster(supabase, user.id)
  if (!own) throw new Error('Brak profilu saunamistrza powiązanego z tym kontem')
  if (own.status !== 'approved') {
    throw new Error('Afiliacje są dostępne po zatwierdzeniu profilu saunamistrza')
  }

  const { data: created, error } = await supabase
    .from('master_affiliations')
    .insert({
      master_id: own.id,
      sauna_id: saunaId,
      status: 'pending',
      initiated_by: 'master',
      created_by: user.id,
    })
    .select('id')

  if (error) throw new Error(friendlyInsertError(error.message))
  if (!created || created.length === 0) throw new Error('Nie udało się utworzyć zgłoszenia')

  revalidateAffiliationSurfaces()
}

export async function inviteMaster(saunaId: string, masterId: string) {
  const supabase = await createClient()
  const user = await requireUser(supabase)

  if (!(await isModeration()) && !(await isStaffOfSauna(supabase, user.id, saunaId))) {
    throw new Error('Brak uprawnień do zarządzania tym obiektem')
  }

  const { data: master } = await supabase
    .from('sauna_masters')
    .select('id, status')
    .eq('id', masterId)
    .maybeSingle()
  if (!master || master.status !== 'approved') {
    throw new Error('Można zapraszać tylko zatwierdzonych saunamistrzów')
  }

  const { data: created, error } = await supabase
    .from('master_affiliations')
    .insert({
      master_id: masterId,
      sauna_id: saunaId,
      status: 'pending',
      initiated_by: 'facility',
      created_by: user.id,
    })
    .select('id')

  if (error) throw new Error(friendlyInsertError(error.message))
  if (!created || created.length === 0) throw new Error('Nie udało się utworzyć zaproszenia')

  revalidateAffiliationSurfaces()
}

type AffiliationRow = {
  id: string
  master_id: string
  sauna_id: string
  status: string
  initiated_by: 'master' | 'facility'
  is_primary: boolean
}

async function getAffiliation(supabase: SupabaseServerClient, id: string): Promise<AffiliationRow> {
  const { data } = await supabase
    .from('master_affiliations')
    .select('id, master_id, sauna_id, status, initiated_by, is_primary')
    .eq('id', id)
    .maybeSingle()
  // RLS hides pending/rejected rows from third parties — "not found" both
  // for missing ids and for rows the caller may not see.
  if (!data) throw new Error('Nie znaleziono afiliacji')
  return data as AffiliationRow
}

async function callerSides(supabase: SupabaseServerClient, userId: string, row: AffiliationRow) {
  const [own, staff, moderation] = await Promise.all([
    getOwnMaster(supabase, userId),
    isStaffOfSauna(supabase, userId, row.sauna_id),
    isModeration(),
  ])
  return {
    isMasterSide: own !== null && own.id === row.master_id,
    isFacilitySide: staff,
    isModeration: moderation,
  }
}

/** The receiving side resolves a pending handshake (approve/reject). */
export async function respondToAffiliation(id: string, decision: 'approved' | 'rejected') {
  const supabase = await createClient()
  const user = await requireUser(supabase)

  const row = await getAffiliation(supabase, id)
  if (row.status !== 'pending') throw new Error('Ta afiliacja została już rozstrzygnięta')

  const sides = await callerSides(supabase, user.id, row)
  const isReceiver =
    row.initiated_by === 'master' ? sides.isFacilitySide : sides.isMasterSide
  if (!isReceiver && !sides.isModeration) {
    throw new Error('Tę afiliację rozstrzyga druga strona relacji')
  }

  const { data: updated, error } = await supabase
    .from('master_affiliations')
    .update({ status: decision, resolved_by: user.id, resolved_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id')

  if (error) throw new Error(error.message)
  if (!updated || updated.length === 0) throw new Error('Brak uprawnień do rozstrzygnięcia tej afiliacji')

  revalidateAffiliationSurfaces()
}

/**
 * Ends an affiliation: withdrawal of an own pending handshake (initiator
 * side) or ending an active one (either side). The DB trigger enforces the
 * same rules independently.
 */
export async function endAffiliation(id: string) {
  const supabase = await createClient()
  const user = await requireUser(supabase)

  const row = await getAffiliation(supabase, id)
  if (row.status !== 'pending' && row.status !== 'approved') {
    throw new Error('Ta afiliacja jest już zakończona')
  }

  const sides = await callerSides(supabase, user.id, row)
  if (!sides.isModeration) {
    if (row.status === 'pending') {
      const isInitiator =
        row.initiated_by === 'master' ? sides.isMasterSide : sides.isFacilitySide
      if (!isInitiator) throw new Error('Wycofać może tylko strona, która wysłała zgłoszenie')
    } else if (!sides.isMasterSide && !sides.isFacilitySide) {
      throw new Error('Brak uprawnień do zakończenia tej afiliacji')
    }
  }

  const { data: updated, error } = await supabase
    .from('master_affiliations')
    .update({ status: 'ended', is_primary: false, ended_at: new Date().toISOString() })
    .eq('id', id)
    .in('status', ['pending', 'approved'])
    .select('id')

  if (error) throw new Error(error.message)
  if (!updated || updated.length === 0) throw new Error('Brak uprawnień do zakończenia tej afiliacji')

  revalidateAffiliationSurfaces()
}

/** The master picks which approved affiliation is primary (home-sauna successor). */
export async function setPrimaryAffiliation(id: string) {
  const supabase = await createClient()
  const user = await requireUser(supabase)

  const row = await getAffiliation(supabase, id)
  if (row.status !== 'approved') throw new Error('Główną może być tylko aktywna afiliacja')

  const sides = await callerSides(supabase, user.id, row)
  if (!sides.isMasterSide && !sides.isModeration) {
    throw new Error('Afiliację główną wybiera saunamistrz')
  }

  // clear the current primary first (unique index allows at most one)
  const { error: clearError } = await supabase
    .from('master_affiliations')
    .update({ is_primary: false })
    .eq('master_id', row.master_id)
    .eq('is_primary', true)
  if (clearError) throw new Error(clearError.message)

  const { data: updated, error } = await supabase
    .from('master_affiliations')
    .update({ is_primary: true })
    .eq('id', id)
    .eq('status', 'approved')
    .select('id')

  if (error) throw new Error(error.message)
  if (!updated || updated.length === 0) throw new Error('Nie udało się ustawić afiliacji głównej')

  revalidateAffiliationSurfaces()
}
