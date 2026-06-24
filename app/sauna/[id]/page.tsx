import AddEventMasterForm from '@/components/AddEventMasterForm'
import AddMasterToSaunaModal from '@/components/AddMasterToSaunaModal'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import AddReviewForm from '@/components/AddReviewForm'
import Navbar from '@/components/Navbar'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default async function SaunaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const { data: sauna } = await supabase
    .from('saunas')
    .select('*')
    .eq('id', id)
    .single()

  if (!sauna) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Nie znaleziono sauny</h1>

        <Link href="/" className="mt-4 inline-block rounded-xl bg-black px-4 py-2 text-white">
          Powrót
        </Link>
      </div>
    )
  }

  const { data: photos } = await supabase
    .from('sauna_photos')
    .select('image_url')
    .eq('sauna_id', id)
    .order('created_at', { ascending: true })

  const today = new Date().toISOString().split('T')[0]

  const { data: events } = await supabase
    .from('sauna_events')
    .select('*')
    .eq('sauna_id', id)
    .eq('status', 'active')
    .gte('event_date', today)
    .order('event_date', { ascending: true })

  const eventIds = events?.map((e) => e.id) ?? []

  const { data: eventMasters } = eventIds.length > 0
    ? await supabase
        .from('sauna_event_masters')
        .select(`
          event_id,
          role,
          sauna_masters (
            id,
            name,
            avatar_url,
            level
          )
        `)
        .in('event_id', eventIds)
        .eq('status', 'approved')
    : { data: [] }

  const mastersByEvent = (eventMasters ?? []).reduce<Record<string, any[]>>(
    (acc, item: any) => {
      if (!acc[item.event_id]) acc[item.event_id] = []
      acc[item.event_id].push(item)
      return acc
    },
    {}
  )

  const { data: saunaMasters } = await supabase
    .from('sauna_event_masters')
    .select(`
      role,
      status,
      sauna_masters (
        id,
        name,
        avatar_url,
        rating
      ),
      sauna_events (
        sauna_id
      )
    `)
    .eq('status', 'approved')

	const activeMastersRaw =
	saunaMasters?.filter(
		(item: any) =>
		item.sauna_events?.sauna_id === id
	) ?? []
	
	const activeMasters = Array.from(
	new Map(
		activeMastersRaw.map((item: any) => [
		item.sauna_masters?.id,
		item,
		])
	).values()
	)
		
  const { data: reviews } = await supabase
    .from('sauna_reviews')
    .select('*')
    .eq('sauna_id', id)
    .order('created_at', { ascending: false })

  const averageRating =
    reviews && reviews.length > 0
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
      : null

  const mainImage = photos?.[0]?.image_url ?? sauna.cover_image_url

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-5xl p-4">
      <Link href="/" className="mb-4 inline-block rounded-xl border px-4 py-2">
        ← Powrót do mapy
      </Link>

      <h1 className="mb-2 text-3xl font-bold">{sauna.name}</h1>

      {averageRating && (
        <div className="mb-4 text-lg font-semibold text-yellow-600">
          ⭐ {averageRating.toFixed(1)} ({reviews?.length} opinii)
        </div>
      )}

      {mainImage && (
        <img
          src={mainImage}
          alt={sauna.name}
          className="mb-4 h-96 w-full rounded-2xl object-cover"
        />
      )}

      {photos && photos.length > 1 && (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {photos.slice(1).map((photo) => (
            <img
              key={photo.image_url}
              src={photo.image_url}
              alt={sauna.name}
              className="h-32 w-full rounded-xl object-cover"
            />
          ))}
        </div>
      )}

      <div className="mb-2 text-gray-600">{sauna.city}</div>

      <div className="mb-6 text-gray-700">{sauna.description}</div>

	 <section className="mb-6 rounded-2xl border border-yellow-200 bg-yellow-50 p-4">
	 <h2 className="mb-3 text-xl font-bold text-yellow-700">
	 	🧖 Saunamistrzowie
	 </h2>
	 
	 {activeMasters.length === 0 ? (
	 	<div className="text-sm text-gray-600">
	 	Brak przypisanych saunamistrzów.
	 	</div>
	 ) : (
	 	<div className="grid gap-3 md:grid-cols-2">
	 	{activeMasters.map((item: any, index: number) => {
	 		const master = item.sauna_masters
	 
	 		return (
	 		<Link
	 			key={index}
	 			href={`/masters/${master?.id}`}
	 			className="flex items-center gap-3 rounded-xl bg-white p-3 hover:bg-yellow-100"
	 		>
	 			{master?.avatar_url ? (
	 			<img
	 				src={master.avatar_url}
	 				alt={master.name}
	 				className="h-14 w-14 rounded-full object-cover"
	 			/>
	 			) : (
	 			<div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-200">
	 				🧖
	 			</div>
	 			)}
	 
	 			<div>
	 			<div className="font-bold">
	 				{master?.name}
	 			</div>
	 
	 			<div className="text-sm text-yellow-700">
	 				⭐ {Number(master?.rating ?? 0).toFixed(1)}
	 			</div>
	 
	 			<div className="text-xs text-gray-500">
	 				Rola: {item.role}
	 			</div>
	 			</div>
	 		</Link>
	 		)
	 	})}
	 	</div>
	 )}
	   <AddMasterToSaunaModal
	     existingEvents={(events ?? []).map((e) => ({
	       id: e.id,
	       title: e.title,
	       event_date: e.event_date,
	     }))}
	   />
	 </section>

      {events && events.length > 0 && (
        <section className="mb-6 rounded-2xl border border-orange-200 bg-orange-50 p-4">
          <h2 className="mb-3 text-xl font-bold text-orange-700">
            🔥 Najbliższe wydarzenia
          </h2>

          <div className="space-y-3">
            {events.map((event) => (
              <div key={event.id} className="rounded-xl bg-white p-3 shadow-sm">
                <Link href={`/events/${event.id}`} className="block hover:opacity-80">
                  <div className="font-bold text-orange-700">{event.title}</div>

                  <div className="text-sm text-gray-500">
                    {event.event_date?.substring(0, 10)}
                    {event.event_time ? ` ${event.event_time.substring(0, 5)}` : ''}
                  </div>

                  {event.price && (
                    <div className="mt-1 text-sm font-semibold text-orange-700">
                      {event.price.includes('zł') ? event.price : `${event.price} zł`}
                    </div>
                  )}

                  {event.description && (
                    <p className="mt-2 text-sm text-gray-700">{event.description}</p>
                  )}
                </Link>

				<div className="mt-3">
				  {(mastersByEvent[event.id] ?? []).length > 0 ? (
				    <div className="flex flex-wrap gap-2">
				      {(mastersByEvent[event.id] ?? []).map((item: any) => (
				        <Link
				          key={item.sauna_masters?.id}
				          href={`/masters/${item.sauna_masters?.id}`}
				          className="flex items-center gap-2 rounded-xl bg-yellow-50 px-2 py-1.5 hover:bg-yellow-100"
				        >
				          {item.sauna_masters?.avatar_url ? (
				            <img
				              src={item.sauna_masters.avatar_url}
				              alt={item.sauna_masters.name}
				              className="h-7 w-7 rounded-full object-cover"
				            />
				          ) : (
				            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-xs">
				              🧖
				            </div>
				          )}
				          <div>
				            <div className="text-xs font-semibold">{item.sauna_masters?.name}</div>
				            {item.sauna_masters?.level && (
				              <div className="text-xs text-gray-400">{item.sauna_masters.level}</div>
				            )}
				          </div>
				        </Link>
				      ))}
				    </div>
				  ) : (
				    <p className="text-xs text-gray-400">Brak przypisanych saunamistrzów</p>
				  )}
				</div>

				<AddEventMasterForm eventId={event.id} />
              </div>
            ))}
          </div>
        </section>
      )}
	  <div className="mb-6">
	  <AddReviewForm saunaId={id} />
	  </div>
      {reviews && reviews.length > 0 && (
        <section className="mb-6 rounded-2xl border p-4">
          <h2 className="mb-3 text-xl font-bold">⭐ Opinie</h2>

          <div className="space-y-3">
            {reviews.map((review) => (
              <div key={review.id} className="rounded-xl bg-gray-50 p-3">
                <div className="font-semibold">
                  {'⭐'.repeat(review.rating)} — {review.author_name}
                </div>

                {review.review_text && (
                  <p className="mt-2 text-sm text-gray-700">
                    {review.review_text}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {sauna.website && (
        <a
          href={sauna.website}
          target="_blank"
          rel="noreferrer"
          className="inline-block rounded-xl bg-orange-600 px-4 py-2 text-white"
        >
          Strona obiektu
        </a>
      )}
    </main>
    </>
  )
}