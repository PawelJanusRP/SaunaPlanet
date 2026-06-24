'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function toggleFavoriteSauna(saunaId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: existing } = await supabase
    .from('user_favorites')
    .select('id')
    .eq('user_id', user.id)
    .eq('sauna_id', saunaId)
    .maybeSingle()

  if (existing) {
    await supabase.from('user_favorites').delete().eq('id', existing.id)
  } else {
    await supabase.from('user_favorites').insert({ user_id: user.id, sauna_id: saunaId })
  }

  revalidatePath(`/sauna/${saunaId}`)
  revalidatePath('/profile')
}

export async function toggleEventInterest(eventId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: existing } = await supabase
    .from('user_event_interests')
    .select('id')
    .eq('user_id', user.id)
    .eq('event_id', eventId)
    .maybeSingle()

  if (existing) {
    await supabase.from('user_event_interests').delete().eq('id', existing.id)
  } else {
    await supabase
      .from('user_event_interests')
      .insert({ user_id: user.id, event_id: eventId, status: 'going' })
  }

  revalidatePath(`/events/${eventId}`)
  revalidatePath('/profile')
}
