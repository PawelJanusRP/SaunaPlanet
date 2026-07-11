/**
 * Presentation container for a workspace "Today" queue
 * (docs/PLATFORM_WORKSPACES.md §3.2). It renders whatever queue content the
 * workspace supplies as children — no persistence, orchestration or
 * workspace-specific business rules live here.
 */
export default function TodayQueue({
  title = 'Na dziś',
  emptyLabel = 'Brak pozycji do obsłużenia.',
  children,
}: {
  title?: string
  emptyLabel?: string
  children?: React.ReactNode
}) {
  return (
    <section aria-label={title} className="mb-6 rounded-3xl border bg-white p-4 shadow-sm sm:p-5">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500">{title}</h2>
      {children ?? <p className="text-sm text-gray-500">{emptyLabel}</p>}
    </section>
  )
}
