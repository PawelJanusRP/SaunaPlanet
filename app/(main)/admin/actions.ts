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

export async function approveCertificate(certId: string) {
  await assertAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from('master_certificates')
    .update({ status: 'approved' })
    .eq('id', certId)

  if (error) throw new Error(error.message)
  revalidatePath('/admin')
}

export async function rejectCertificate(certId: string) {
  await assertAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from('master_certificates')
    .update({ status: 'rejected' })
    .eq('id', certId)

  if (error) throw new Error(error.message)
  revalidatePath('/admin')
}

export async function addCertificateType(name: string, category: string) {
  await assertAdmin()
  if (!name.trim() || !category.trim()) throw new Error('Podaj nazwę i kategorię')
  const supabase = await createClient()

  const { error } = await supabase
    .from('certificate_types')
    .insert({ name: name.trim(), category: category.trim() })

  if (error) throw new Error(error.message)
  revalidatePath('/admin')
}

export async function toggleCertificateType(id: string, isActive: boolean) {
  await assertAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from('certificate_types')
    .update({ is_active: isActive })
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath('/admin')
}

export async function updateSaunaAdmin(
  id: string,
  data: {
    name: string
    city: string | null
    description: string | null
    website: string | null
    category: string
    status: string
  }
) {
  await assertAdmin()
  if (!data.name.trim()) throw new Error('Nazwa jest wymagana')
  const supabase = await createClient()

  const { error } = await supabase
    .from('saunas')
    .update({
      name: data.name.trim(),
      city: data.city?.trim() || null,
      description: data.description?.trim() || null,
      website: data.website?.trim() || null,
      category: data.category,
      status: data.status,
    })
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath('/admin')
  revalidatePath(`/sauna/${id}`)
}

export async function deleteSaunaAdmin(id: string) {
  await assertAdmin()
  const supabase = await createClient()

  const { error } = await supabase.from('saunas').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin')
}

export async function updateEventStatusAdmin(id: string, status: 'active' | 'rejected') {
  await assertAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from('sauna_events')
    .update({ status })
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath('/admin')
  revalidatePath(`/events/${id}`)
}

export async function deleteEventAdmin(id: string) {
  await assertAdmin()
  const supabase = await createClient()

  const { error } = await supabase.from('sauna_events').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin')
}

export async function deleteReviewAdmin(id: string) {
  await assertAdmin()
  const supabase = await createClient()

  const { error } = await supabase.from('sauna_reviews').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin')
}

export async function approveManagerRequest(managerId: string) {
  await assertAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from('sauna_managers')
    .update({ status: 'approved' })
    .eq('id', managerId)

  if (error) throw new Error(error.message)
  revalidatePath('/admin')
}

export async function rejectManagerRequest(managerId: string) {
  await assertAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from('sauna_managers')
    .update({ status: 'rejected' })
    .eq('id', managerId)

  if (error) throw new Error(error.message)
  revalidatePath('/admin')
}

export async function updateUserRole(userId: string, newRole: 'user' | 'moderator' | 'admin') {
  const role = await getCurrentUserRole()
  if (role !== 'admin') throw new Error('Tylko administrator może zmieniać role')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user?.id === userId) throw new Error('Nie możesz zmienić własnej roli')

  const { error } = await supabase
    .from('profiles')
    .update({ role: newRole })
    .eq('id', userId)

  if (error) throw new Error(error.message)
  revalidatePath('/admin')
}
