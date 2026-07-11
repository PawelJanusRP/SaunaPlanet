'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  WORKSPACE_CONTEXT_PARAM,
  type WorkspaceContextOption,
} from '@/lib/workspace/context'

/**
 * Generic context switcher for workspaces (SP-033) — the "context bar"
 * control from docs/PLATFORM_WORKSPACES.md §3.2. Renders the options the
 * account holds plus the aggregate; changing the selection rewrites the
 * context query param on the current pathname, so every workspace page
 * keeps its place while the scope changes.
 *
 * Pure navigation control: options come in via props, no domain queries or
 * role checks live here. A native <select> keeps it touch-friendly.
 */
export default function WorkspaceContextSwitcher({
  options,
  activeId,
  allLabel = 'Wszystkie obiekty',
  ariaLabel = 'Aktywny kontekst',
}: {
  options: WorkspaceContextOption[]
  /** Currently selected option id; null selects the aggregate. */
  activeId: string | null
  allLabel?: string
  ariaLabel?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams)
    if (event.target.value) {
      params.set(WORKSPACE_CONTEXT_PARAM, event.target.value)
    } else {
      params.delete(WORKSPACE_CONTEXT_PARAM)
    }
    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  return (
    <select
      value={activeId ?? ''}
      onChange={handleChange}
      aria-label={ariaLabel}
      className="max-w-[14rem] rounded-xl border bg-white px-3 py-2 text-sm font-medium text-gray-700"
    >
      <option value="">{allLabel}</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
