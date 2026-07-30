'use server'

// SP-039 Slice 4C2-App — owner publication actions.
//
// The master id is ALWAYS resolved server-side from the authenticated
// account (never accepted from the client), so swapping ids cannot target
// another profile. The M10 RPCs re-verify ownership and every transition
// rule authoritatively; results are the stable-code contract objects.

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

async function ownerTransition(
  key: PublicationTransitionKey,
  reason?: string
): Promise<PublicationTransitionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return {
      ...parsePublicationTransitionResult({ ok: false, code: 'not_authenticated' }),
    }
  }

  const { data: own } = await supabase
    .from('sauna_masters')
    .select('id, slug')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!own) {
    return {
      ...parsePublicationTransitionResult({ ok: false, code: 'master_not_found' }),
    }
  }

  const result = await callPublicationTransition(supabase, key, own.id, reason)

  if (result.ok) {
    revalidatePath('/studio')
    revalidatePath('/studio/profile')
    revalidatePath(`/masters/${own.id}`)
    if (own.slug) revalidatePath(`/masters/${own.slug}`)
    revalidatePath('/masters')
  }
  return result
}

/** draft / changes_requested -> submitted (completeness gate in the RPC). */
export async function submitOwnMasterForPublication(): Promise<PublicationTransitionResult> {
  return ownerTransition('submit')
}

/** submitted -> draft (owner withdraws a pending submission). */
export async function withdrawOwnMasterSubmission(
  reason?: string
): Promise<PublicationTransitionResult> {
  return ownerTransition('withdraw', reason)
}

/** published -> draft (owner hides an own published profile). */
export async function unpublishOwnMasterProfile(
  reason?: string
): Promise<PublicationTransitionResult> {
  return ownerTransition('unpublish', reason)
}
