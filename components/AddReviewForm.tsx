'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { useAuth } from './AuthProvider'
import Link from 'next/link'

export default function AddReviewForm({
  saunaId,
  onAdded,
}: {
  saunaId: string
  onAdded?: () => void
}) {
  const { user } = useAuth()
  const [rating, setRating] = useState(5)
  const [reviewText, setReviewText] = useState('')
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  if (!user) {
    return (
      <div className="rounded-2xl border border-dashed p-4 text-center text-sm text-gray-500">
        <Link href="/auth/login" className="font-medium text-black hover:underline">
          Zaloguj się
        </Link>
        {' '}aby dodać opinię.
      </div>
    )
  }

  async function saveReview() {
    setSaving(true)

    const supabase = createClient()

    // author_name is NOT NULL and shown publicly — store the display name,
    // never the email. Live rendering resolves names via public_profiles;
    // the stored value covers legacy paths (admin panel).
    const { data: profile } = await supabase
      .from('public_profiles')
      .select('first_name, last_name')
      .eq('id', user!.id)
      .maybeSingle()
    const displayName =
      [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Użytkownik'

    const { error } = await supabase
      .from('sauna_reviews')
      .insert([{
        sauna_id: saunaId,
        author_name: displayName,
        rating,
        review_text: reviewText,
        user_id: user!.id,
      }])

    setSaving(false)

    if (error) {
      console.error(error)
      toast.error('Nie udało się dodać opinii')
      return
    }

    toast.success('Opinia dodana')
    router.refresh()
    setReviewText('')
    setRating(5)
    onAdded?.()
  }

  return (
    <div className="rounded-2xl border p-4">
      <h2 className="mb-3 text-xl font-bold">Dodaj opinię</h2>

      <select
        value={rating}
        onChange={(e) => setRating(Number(e.target.value))}
        className="mb-3 w-full rounded-xl border p-2"
      >
        <option value={5}>⭐⭐⭐⭐⭐ 5</option>
        <option value={4}>⭐⭐⭐⭐ 4</option>
        <option value={3}>⭐⭐⭐ 3</option>
        <option value={2}>⭐⭐ 2</option>
        <option value={1}>⭐ 1</option>
      </select>

      <textarea
        value={reviewText}
        onChange={(e) => setReviewText(e.target.value)}
        placeholder="Napisz opinię..."
        rows={4}
        className="mb-3 w-full rounded-xl border p-2"
      />

      <button
        disabled={saving}
        onClick={saveReview}
        className="rounded-xl bg-yellow-500 px-4 py-2 font-semibold text-white disabled:opacity-50"
      >
        {saving ? 'Zapisywanie...' : 'Dodaj opinię'}
      </button>
    </div>
  )
}
