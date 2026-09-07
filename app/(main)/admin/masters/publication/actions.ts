'use server'

// SP-039 Slice 4C2-App — moderator publication actions.
//
// Thin gateways to the M10 moderator RPCs. The RPCs gate the platform role
// internally (is_platform_moderator) and enforce the transition matrix —
// nothing here duplicates those rules. Reasons/notes are bounded to the
// database contract before the call.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  callPublicationTransition,
  type PublicationTransitionKey,
} from '@/lib/master/publicationServer'
import {
  parsePublicationTransitionResult,
  type PublicationTransitionResult,
} from '@/lib/master/publicationTransitions'

const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function moderatorTransition(
  key: PublicationTransitionKey,
  masterId: string,
  reason?: string
): Promise<PublicationTransitionResult> {
  if (typeof masterId !== 'string' || !UUID_SHAPE.test(masterId)) {
    return {
      ...parsePublicationTransitionResult({ ok: false, code: 'master_not_found' }),
    }
  }
  const supabase = await createClient()
  const result = await callPublicationTransition(supabase, key, masterId, reason)
  if (result.ok) {
    revalidatePath('/admin/masters/publication')
    revalidatePath(`/admin/masters/publication/${masterId}`)
    revalidatePath(`/masters/${masterId}`)
    revalidatePath('/masters')
  }
  return result
}

export async function approveMasterPublication(
  masterId: string,
  note?: string
): Promise<PublicationTransitionResult> {
  return moderatorTransition('approve', masterId, note)
}

export async function requestMasterPublicationChanges(
  masterId: string,
  reason: string
): Promise<PublicationTransitionResult> {
  return moderatorTransition('requestChanges', masterId, reason)
}

export async function unpublishMasterAsModerator(
  masterId: string,
  reason?: string
): Promise<PublicationTransitionResult> {
  return moderatorTransition('unpublish', masterId, reason)
}

export async function suspendMasterPublication(
  masterId: string,
  reason: string
): Promise<PublicationTransitionResult> {
  return moderatorTransition('suspend', masterId, reason)
}

export async function restoreMasterPublication(
  masterId: string,
  reason: string
): Promise<PublicationTransitionResult> {
  return moderatorTransition('restore', masterId, reason)
}
