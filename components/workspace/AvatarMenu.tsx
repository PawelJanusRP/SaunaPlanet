'use client'

import Link from 'next/link'
import { useAuth } from '@/components/AuthProvider'
import { getVisibleWorkspaceDestinations } from '@/lib/workspace/destinations'

/**
 * Reusable workspace hub (docs/PLATFORM_WORKSPACES.md §3.1): lists exactly
 * the workspaces the signed-in account holds. Visibility comes from the
 * shared destination config fed by the AuthProvider access snapshot — no
 * role checks live in this component.
 */
export default function AvatarMenu({ onNavigate }: { onNavigate?: () => void }) {
  const { user, access, loading } = useAuth()

  if (loading || !user) return null

  const destinations = getVisibleWorkspaceDestinations(access)
  if (destinations.length === 0) return null

  return (
    <ul className="space-y-1">
      {destinations.map((destination) => (
        <li key={destination.key}>
          <Link
            href={destination.href}
            onClick={onNavigate}
            className="flex items-center justify-between rounded-xl px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100"
          >
            {destination.label}
            {destination.badge && (
              <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                {destination.badge}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  )
}
