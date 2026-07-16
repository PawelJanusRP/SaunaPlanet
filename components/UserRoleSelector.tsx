'use client'

import { useState, useTransition } from 'react'
import { updateUserRole } from '@/app/(main)/admin/actions'
import { toast } from 'sonner'

const ROLES = [
  { value: 'user',      label: 'Użytkownik' },
  { value: 'moderator', label: 'Moderator' },
  { value: 'admin',     label: 'Administrator' },
]

const roleStyle: Record<string, string> = {
  admin:     'bg-red-100 text-red-700',
  moderator: 'bg-orange-100 text-orange-700',
  user:      'bg-gray-100 text-gray-600',
}

export default function UserRoleSelector({
  userId,
  currentRole,
  isCurrentUser,
}: {
  userId: string
  currentRole: string
  isCurrentUser: boolean
}) {
  const [role, setRole] = useState(currentRole)
  const [isPending, startTransition] = useTransition()

  if (isCurrentUser) {
    return (
      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${roleStyle[role] ?? roleStyle.user}`}>
        {ROLES.find((r) => r.value === role)?.label ?? role}
      </span>
    )
  }

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newRole = e.target.value as 'user' | 'moderator' | 'admin'
    const prev = role
    setRole(newRole)
    startTransition(async () => {
      try {
        await updateUserRole(userId, newRole)
        toast.success('Rola zaktualizowana')
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Błąd zapisu')
        setRole(prev)
      }
    })
  }

  return (
    <select
      value={role}
      onChange={handleChange}
      disabled={isPending}
      className={`rounded-full border-0 px-2 py-0.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-black disabled:opacity-50 ${roleStyle[role] ?? roleStyle.user}`}
    >
      {ROLES.map((r) => (
        <option key={r.value} value={r.value}>{r.label}</option>
      ))}
    </select>
  )
}
