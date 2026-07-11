import Link from 'next/link'
import type { WorkspaceBreadcrumb } from '@/lib/workspace/types'

export default function WorkspaceBreadcrumbs({ items }: { items: WorkspaceBreadcrumb[] }) {
  if (items.length === 0) return null

  return (
    <nav aria-label="Ścieżka nawigacji" className="mb-3 text-xs text-gray-400">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1">
              {item.href && !isLast ? (
                <Link href={item.href} className="rounded hover:text-gray-600 hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? 'page' : undefined}
                  className={isLast ? 'font-medium text-gray-600' : undefined}
                >
                  {item.label}
                </span>
              )}
              {!isLast && <span aria-hidden="true">/</span>}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
