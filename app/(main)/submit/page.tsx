import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SubmitSaunaForm from '@/components/SubmitSaunaForm'

export default async function SubmitPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  return (
    <main className="mx-auto max-w-2xl p-4">
      <h1 className="mb-2 text-2xl font-bold">Zgłoś saunę</h1>
      <p className="mb-6 text-sm text-gray-500">
        Wypełnij formularz. Zgłoszenie trafi do moderacji i po zatwierdzeniu pojawi się na mapie.
      </p>
      <SubmitSaunaForm userId={user.id} />
    </main>
  )
}
