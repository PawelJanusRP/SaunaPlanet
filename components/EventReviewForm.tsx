'use client'

import { useState, useTransition } from 'react'
import { addEventReview } from '@/app/events/actions'
import { toast } from 'sonner'

export default function EventReviewForm({ eventId }: { eventId: string }) {
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [comment, setComment] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (rating === 0) { toast.error('Wybierz ocenę'); return }
    startTransition(async () => {
      try {
        await addEventReview(eventId, rating, comment)
        toast.success('Ocena dodana')
        setRating(0)
        setComment('')
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Błąd zapisu')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm font-medium text-gray-700">Twoja ocena</p>

      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => setRating(star)}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(0)}
            className={`text-2xl transition-opacity active:scale-110 ${
              star <= (hovered || rating) ? 'opacity-100' : 'opacity-25'
            }`}
          >
            ⭐
          </button>
        ))}
      </div>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Opcjonalny komentarz…"
        rows={3}
        className="w-full resize-none rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
      />

      <button
        type="submit"
        disabled={isPending || rating === 0}
        className="rounded-xl bg-orange-600 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-40"
      >
        {isPending ? 'Zapisywanie…' : 'Dodaj ocenę'}
      </button>
    </form>
  )
}
