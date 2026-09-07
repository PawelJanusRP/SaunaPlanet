// SP-039 Slice 4C2-App — the ONLY server boundary to the M10 publication
// layer. Every mutation flows through the seven DEFINER RPCs (names live in
// lib/master/publicationTransitions.ts); reads use the RLS-guarded
// master_publication tables and the M9 visibility helper. No direct writes
// to publication tables exist anywhere in the app; no service role.

import type { createClient } from '@/lib/supabase/server'
import {
  PUBLICATION_TRANSITION_RPCS,
  parsePublicationTransitionResult,
  toPublicationStatus,
  type PublicationStatus,
  type PublicationTransitionResult,
} from './publicationTransitions'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export type PublicationTransitionKey = keyof typeof PUBLICATION_TRANSITION_RPCS

const REASON_MAX = 2000

/** Bound a caller-provided reason/note to the database contract. */
export function boundReason(reason: string | null | undefined): string | null {
  const trimmed = (reason ?? '').trim().slice(0, REASON_MAX)
  return trimmed === '' ? null : trimmed
}

/**
 * Invoke one M10 transition RPC. Transport failures and malformed payloads
 * collapse to the retryable `unavailable` result — raw PostgreSQL errors
 * never leave this module.
 */
export async function callPublicationTransition(
  supabase: SupabaseServerClient,
  key: PublicationTransitionKey,
  masterId: string,
  reason?: string | null
): Promise<PublicationTransitionResult> {
  const rpcName = PUBLICATION_TRANSITION_RPCS[key]
  const args: Record<string, unknown> =
    key === 'submit'
      ? { p_master_id: masterId }
      : key === 'approve'
        ? { p_master_id: masterId, p_note: boundReason(reason) }
        : { p_master_id: masterId, p_reason: boundReason(reason) }
  try {
    const { data, error } = await supabase.rpc(rpcName, args)
    if (error) return parsePublicationTransitionResult(null)
    return parsePublicationTransitionResult(data)
  } catch {
    return parsePublicationTransitionResult(null)
  }
}

export type PublicationStateRow = {
  publicationStatus: PublicationStatus
  submittedAt: string | null
  publishedAt: string | null
  reviewedAt: string | null
  /** Moderator feedback for the owner — never rendered publicly. */
  reviewNote: string | null
}

/** Read the RLS-visible publication row (owner sees own; moderator all).
 *  null = no row yet, which the workflow treats as an ordinary draft. */
export async function loadPublicationState(
  supabase: SupabaseServerClient,
  masterId: string
): Promise<PublicationStateRow | null> {
  const { data } = await supabase
    .from('master_publication')
    .select(
      'publication_status, submitted_at, published_at, publication_reviewed_at, publication_review_note'
    )
    .eq('master_id', masterId)
    .maybeSingle()
  if (!data) return null
  const status = toPublicationStatus(data.publication_status)
  if (!status) return null
  return {
    publicationStatus: status,
    submittedAt: data.submitted_at ?? null,
    publishedAt: data.published_at ?? null,
    reviewedAt: data.publication_reviewed_at ?? null,
    reviewNote: data.publication_review_note ?? null,
  }
}

/** The M9 visibility verdict — the ONE public predicate, never mirrored. */
export async function loadPublicVisibility(
  supabase: SupabaseServerClient,
  masterId: string
): Promise<boolean> {
  const { data } = await supabase.rpc('is_master_publicly_visible', {
    target_master_id: masterId,
  })
  return data === true
}

export type PublicationAuditEntry = {
  id: string
  eventType: string
  reason: string | null
  createdAt: string
  actorPresent: boolean
}

/** Moderation-facing audit trail (RLS: moderator-only SELECT). Actor ids
 *  are reduced to presence — no UUIDs reach the UI. */
export async function loadPublicationAudit(
  supabase: SupabaseServerClient,
  masterId: string
): Promise<PublicationAuditEntry[]> {
  const { data } = await supabase
    .from('master_publication_events')
    .select('id, event_type, reason, created_at, actor_user_id')
    .eq('master_id', masterId)
    .order('created_at', { ascending: false })
    .limit(50)
  return (data ?? []).map((row) => ({
    id: row.id as string,
    eventType: row.event_type as string,
    reason: (row.reason as string | null) ?? null,
    createdAt: row.created_at as string,
    actorPresent: row.actor_user_id !== null,
  }))
}
