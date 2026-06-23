import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import UploadAvatarButton from '@/components/UploadAvatarButton'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default async function MasterPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const { data: master } = await supabase
    .from('sauna_masters')
    .select('*')
    .eq('id', id)
    .single()

  if (!master) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-bold">Nie znaleziono saunamistrza</h1>

        <Link href="/masters" className="mt-4 inline-block rounded-xl bg-black px-4 py-2 text-white">
          Powrót
        </Link>
      </main>
    )
  }

  const { data: credentials } = await supabase
    .from('master_credentials')
    .select('*')
    .eq('master_id', id)
    .order('created_at', { ascending: false })

	const { data: upcomingEvents } = await supabase
	.from('sauna_event_masters')
	.select(`
		role,
		status,
		sauna_events (
		id,
		title,
		event_date,
		event_time,
		sauna_id
		)
	`)
	.eq('master_id', id)
	.eq('status', 'approved')
	
  return (
    <main className="mx-auto max-w-4xl p-4">
      <Link href="/masters" className="mb-4 inline-block rounded-xl border px-4 py-2">
        ← Powrót do saunamistrzów
      </Link>

      <section className="rounded-3xl border bg-white p-6 shadow-sm">
        <div className="flex items-center gap-5">
          <div className="flex flex-col items-center gap-2">
            {master.avatar_url ? (
              <img
                src={master.avatar_url}
                alt={master.name}
                className="h-28 w-28 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-28 w-28 items-center justify-center rounded-full bg-gray-200 text-5xl">
                🧖
              </div>
            )}

            <UploadAvatarButton masterId={id} currentAvatarUrl={master.avatar_url} />
          </div>

          <div>
            <h1 className="text-3xl font-bold">{master.name}</h1>

            <div className="mt-2 text-lg font-semibold text-yellow-600">
              ⭐ {Number(master.rating ?? 0).toFixed(1)} ({master.review_count ?? 0} opinii)
            </div>
          </div>
        </div>

        {master.bio && (
          <p className="mt-6 text-gray-700">
            {master.bio}
          </p>
        )}
      </section>

      <section className="mt-6 rounded-3xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-2xl font-bold">🏅 Certyfikaty i tytuły</h2>

        {!credentials || credentials.length === 0 ? (
          <div className="text-gray-500">
            Brak dodanych certyfikatów.
          </div>
        ) : (
          <div className="space-y-3">
            {credentials.map((credential) => (
              <div key={credential.id} className="rounded-xl bg-gray-50 p-3">
                <div className="font-bold">
                  {credential.title}
                </div>

                <div className="text-sm text-gray-500">
                  Typ: {credential.credential_type}
                </div>

                {credential.issuer && (
                  <div className="text-sm text-gray-500">
                    Wystawca: {credential.issuer}
                  </div>
                )}

                <div className="text-sm text-gray-500">
                  Status: {credential.status}
                </div>

                {(credential.valid_from || credential.valid_until) && (
                  <div className="text-sm text-gray-500">
                    Ważność:{' '}
                    {credential.valid_from ?? '—'} - {credential.valid_until ?? 'bezterminowo'}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
	  <section className="mt-6 rounded-3xl border bg-white p-6 shadow-sm">
  <h2 className="mb-4 text-2xl font-bold">
    🔥 Najbliższe wydarzenia
  </h2>

  {!upcomingEvents || upcomingEvents.length === 0 ? (
    <div className="text-gray-500">
      Brak przypisanych wydarzeń.
    </div>
  ) : (
    <div className="space-y-3">
      {upcomingEvents.map((item: any, index) => {
        const event = item.sauna_events

        return (
          <div
            key={index}
            className="rounded-xl bg-orange-50 p-3"
          >
            <div className="font-bold text-orange-700">
              🔥 {event?.title}
            </div>

            <div className="text-sm text-gray-500">
              {event?.event_date?.substring(0, 10)}
            </div>

            <div className="text-sm">
              Rola: {item.role}
            </div>
          </div>
        )
      })}
    </div>
  )}
</section>


    </main>
  )
}