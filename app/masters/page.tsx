import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default async function MastersPage() {
  const { data: masters } = await supabase
    .from('sauna_masters')
    .select('*')
    .order('name')

  return (
    <main className="mx-auto max-w-5xl p-4">
      <Link
        href="/"
        className="mb-4 inline-block rounded-xl border px-4 py-2"
      >
        ← Powrót do mapy
      </Link>

      <h1 className="mb-6 text-3xl font-bold">
        🧖 Saunamistrzowie
      </h1>

      {!masters || masters.length === 0 ? (
        <div className="rounded-xl border p-6 text-gray-500">
          Brak saunamistrzów
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {masters.map((master) => (
            <Link
              key={master.id}
              href={`/masters/${master.id}`}
              className="rounded-2xl border bg-white p-4 shadow-sm hover:bg-orange-50"
            >
              <div className="flex items-center gap-3">
                {master.avatar_url ? (
                  <img
                    src={master.avatar_url}
                    alt={master.name}
                    className="h-16 w-16 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-200 text-2xl">
                    🧖
                  </div>
                )}

                <div>
                  <div className="font-bold">
                    {master.name}
                  </div>

                  <div className="text-sm text-gray-500">
                    ⭐ {Number(master.rating ?? 0).toFixed(1)}
                  </div>
                </div>
              </div>

              {master.bio && (
                <p className="mt-3 text-sm text-gray-600">
                  {master.bio}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}