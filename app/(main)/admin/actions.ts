'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getCurrentUserRole } from '@/lib/supabase/server'

async function assertAdmin() {
  const role = await getCurrentUserRole()
  if (role !== 'admin' && role !== 'moderator') {
    throw new Error('Brak uprawnień')
  }
}

export async function approveSubmission(submissionId: string) {
  await assertAdmin()
  const supabase = await createClient()

  const { data: submission, error: fetchError } = await supabase
    .from('sauna_submissions')
    .select('*')
    .eq('id', submissionId)
    .single()

  if (fetchError || !submission) throw new Error('Nie znaleziono zgłoszenia')

  const { error: insertError } = await supabase
    .from('saunas')
    .insert({
      name: submission.name,
      description: submission.description ?? null,
      city: submission.city ?? null,
      category: submission.category,
      website: submission.website ?? null,
      latitude: submission.latitude,
      longitude: submission.longitude,
      status: 'active',
    })

  if (insertError) throw new Error(insertError.message)

  await supabase
    .from('sauna_submissions')
    .update({ status: 'approved' })
    .eq('id', submissionId)

  revalidatePath('/admin')
}

export async function rejectSubmission(submissionId: string, note: string) {
  await assertAdmin()
  const supabase = await createClient()

  await supabase
    .from('sauna_submissions')
    .update({ status: 'rejected', admin_note: note || null })
    .eq('id', submissionId)

  revalidatePath('/admin')
}

export async function approveMaster(masterId: string) {
  await assertAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from('sauna_masters')
    .update({ status: 'approved' })
    .eq('id', masterId)

  if (error) throw new Error(error.message)
  revalidatePath('/admin')
  revalidatePath('/masters')
}

export async function rejectMaster(masterId: string, note?: string) {
  await assertAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from('sauna_masters')
    .update({ status: 'rejected' })
    .eq('id', masterId)

  if (error) throw new Error(error.message)
  revalidatePath('/admin')
}
