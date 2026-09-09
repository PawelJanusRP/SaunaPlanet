import Link from 'next/link'
import Navbar from '@/components/Navbar'
import SaunyClient from '@/components/SaunyClient'
import { createClient } from '@/lib/supabase/server'

export default async function SaunyPage() {
  const supabase = await createClient()

  const [
    { data: saunasRaw },
    { data: photosRaw },
    { data: reviewsRaw },
  ] = await Promise.all([
    supabase
      .from('saunas')
      .select('id, name, city, category, cover_image_url, status')
      .eq('status', 'active')
      .order('name'),
    supabase
      .from('sauna_photos')
      .select('sauna_id, image_url')
      .order('created_at', { ascending: true }),
    supabase
      .from('sauna_reviews')
      .select('sauna_id, rating'),
  ])

  const firstPhoto: Record<string, string> = {}
  for (const p of photosRaw ?? []) {
    if (!firstPhoto[p.sauna_id]) firstPhoto[p.sauna_id] = p.image_url
  }

  const ratingSum: Record<string, number> = {}
  const ratingCount: Record<string, number> = {}
  for (const r of reviewsRaw ?? []) {
    ratingSum[r.sauna_id] = (ratingSum[r.sauna_id] ?? 0) + r.rating
    ratingCount[r.sauna_id] = (ratingCount[r.sauna_id] ?? 0) + 1
  }

  const saunas = (saunasRaw ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    city: s.city,
    category: s.category,
    thumbnail: firstPhoto[s.id] ?? s.cover_image_url ?? null,
    avgRating: ratingCount[s.id] ? ratingSum[s.id]! / ratingCount[s.id]! : null,
    reviewCount: ratingCount[s.id] ?? 0,
  }))

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl p-4">
        <Link href="/" className="mb-4 inline-block rounded-xl border px-4 py-2 text-sm">
          ← Powrót do mapy
        </Link>
        <SaunyClient saunas={saunas} />
      </main>
    </>
  )
}
