'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getCurrentUserRole } from '@/lib/supabase/server'

async function assertEditor() {
  const role = await getCurrentUserRole()
  if (role !== 'admin' && role !== 'moderator') {
    throw new Error('Brak uprawnień')
  }
}

export async function updateEvent(
  id: string,
  data: {
    title: string
    event_date: string
    event_time: string | null
    price: string | null
    description: string | null
  }
) {
  await assertEditor()
  if (!data.title.trim() || !data.event_date) throw new Error('Tytuł i data są wymagane')

  const supabase = await createClient()
  const { error } = await supabase
    .from('sauna_events')
    .update({
      title: data.title.trim(),
      event_date: data.event_date,
      event_time: data.event_time || null,
      price: data.price?.trim() || null,
      description: data.description?.trim() || null,
    })
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath(`/events/${id}`)
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
