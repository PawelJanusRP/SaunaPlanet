/**
 * Titled card section used inside any workspace page (SP-032). Pure
 * presentation — pairs with WorkspaceShell the way TodayQueue does, so all
 * workspaces compose dashboards from the same building block.
 */
export default function WorkspaceSection({
  title,
  action,
  children,
}: {
  title: string
  /** Optional header action (e.g. a "see all" link). */
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section aria-label={title} className="rounded-3xl border bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">{title}</h2>
        {action && <div className="shrink-0 text-sm">{action}</div>}
      </div>
      {children}
    </section>
  )
}
