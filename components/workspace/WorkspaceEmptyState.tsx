import Link from 'next/link'

/**
 * Consistent empty state for workspace modules (SP-032). Modules without
 * business functionality yet render this instead of fake data
 * (docs/PLATFORM_WORKSPACES.md — "absent is absent", no fabricated content).
 */
export default function WorkspaceEmptyState({
  icon = '🌿',
  title,
  description,
  actionHref,
  actionLabel,
}: {
  icon?: string
  title: string
  description?: string
  /** Optional call to action; rendered only when both href and label are set. */
  actionHref?: string
  actionLabel?: string
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-gray-50 px-4 py-8 text-center">
      <span aria-hidden="true" className="text-3xl">{icon}</span>
      <p className="text-sm font-semibold text-gray-700">{title}</p>
      {description && <p className="max-w-sm text-sm text-gray-500">{description}</p>}
      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="mt-2 rounded-xl border px-4 py-2 text-sm font-medium transition-colors hover:bg-gray-100"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  )
}
