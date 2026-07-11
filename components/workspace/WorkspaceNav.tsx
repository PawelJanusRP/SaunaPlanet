'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { WorkspaceNavItem } from '@/lib/workspace/types'

/**
 * Single navigation definition rendered in two responsive variants:
 * horizontally scrollable chips on mobile, a sidebar list on desktop.
 *
 * Active state comes from `activeKey` when the workspace routes via query
 * params (e.g. /admin?tab=x); otherwise it falls back to the pathname —
 * centralised here so no other component needs pathname checks.
 */
export default function WorkspaceNav({
  items,
  activeKey,
  ariaLabel = 'Nawigacja panelu',
}: {
  items: WorkspaceNavItem[]
  activeKey?: string
  ariaLabel?: string
}) {
  const pathname = usePathname()

  function isActive(item: WorkspaceNavItem) {
    if (activeKey !== undefined) return item.key === activeKey
    return item.href.split('?')[0] === pathname
  }

  return (
    <nav aria-label={ariaLabel}>
      <ul className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:gap-0.5 md:overflow-visible md:pb-0">
        {items.map((item) => {
          const active = isActive(item)
          return (
            <li key={item.key} className="shrink-0 md:shrink">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium transition-colors md:w-full md:rounded-xl md:px-3 ${
                  active
                    ? 'bg-black text-white'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-black'
                }`}
              >
                <span className="truncate">{item.label}</span>
                {typeof item.badgeCount === 'number' && item.badgeCount > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${
                      active ? 'bg-white/20 text-white' : 'bg-yellow-500 text-white'
                    }`}
                  >
                    {item.badgeCount}
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
