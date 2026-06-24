'use client'

import { useState, useTransition } from 'react'
import { addEventComment } from '@/app/events/actions'
import { toast } from 'sonner'

export default function EventCommentForm({ eventId }: { eventId: string }) {
  const [comment, setComment] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!comment.trim()) { toast.error('Napisz komentarz'); return }
    startTransition(async () => {
      try {
        await addEventComment(eventId, comment)
        toast.success('Komentarz dodany')
        setComment('')
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Błąd zapisu')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Napisz komentarz do tego wydarzenia…"
        rows={3}
        className="w-full resize-none rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
      />
      <button
        type="submit"
        disabled={isPending}
        className="rounded-xl bg-black px-5 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
      >
        {isPending ? 'Zapisywanie…' : 'Dodaj komentarz'}
      </button>
    </form>
  )
}
