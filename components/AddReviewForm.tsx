'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

export default function AddReviewForm({
  saunaId,
  onAdded,
}: {
  saunaId: string
  onAdded?: () => void
}) {
  const [authorName, setAuthorName] = useState('')
  const [rating, setRating] = useState(5)
  const [reviewText, setReviewText] = useState('')
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  
  async function saveReview() {
    setSaving(true)

    const { error } = await supabase
      .from('sauna_reviews')
      .insert([
        {
          sauna_id: saunaId,
          author_name: authorName || 'Anonim',
          rating,
          review_text: reviewText,
        },
      ])

    setSaving(false)

    if (error) {
      console.error(error)
      toast.error('Nie udało się dodać opinii')
      return
    }

    toast.success('Opinia dodana')
	router.refresh()
	
    setAuthorName('')
    setReviewText('')
    setRating(5)

    onAdded?.()
  }

  return (
    <div className="rounded-2xl border p-4">
      <h2 className="mb-3 text-xl font-bold">
        Dodaj opinię
      </h2>

      <input
        value={authorName}
        onChange={(e) => setAuthorName(e.target.value)}
        placeholder="Twoje imię"
        className="mb-3 w-full rounded-xl border p-2"
      />

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
        className="rounded-xl bg-yellow-500 px-4 py-2 font-semibold text-white"
      >
        {saving ? 'Zapisywanie...' : 'Dodaj opinię'}
      </button>
    </div>
  )
}