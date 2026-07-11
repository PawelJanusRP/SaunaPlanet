import type { WorkspaceBreadcrumb, WorkspaceNavItem } from '@/lib/workspace/types'
import WorkspaceBreadcrumbs from './WorkspaceBreadcrumbs'
import WorkspaceNav from './WorkspaceNav'

/**
 * Generic workspace shell (SP-031): breadcrumbs, header (title, subtitle,
 * active context, page actions), shared navigation (mobile chips / desktop
 * sidebar from one definition), an optional Today-queue slot and the page
 * content. Pure presentation — workspaces pass their own data and business
 * components in via props; no domain logic belongs here.
 */
export default function WorkspaceShell({
  title,
  subtitle,
  contextLabel,
  breadcrumbs,
  nav,
  activeNavKey,
  actions,
  todayQueue,
  children,
}: {
  title: string
  subtitle?: string
  /** Active context (e.g. the current facility) shown next to the title. */
  contextLabel?: string
  breadcrumbs?: WorkspaceBreadcrumb[]
  nav?: WorkspaceNavItem[]
  activeNavKey?: string
  /** Page-level actions rendered in the header. */
  actions?: React.ReactNode
  /** Today-queue slot rendered above the page content. */
  todayQueue?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <main className="mx-auto w-full max-w-6xl p-4">
      {breadcrumbs && <WorkspaceBreadcrumbs items={breadcrumbs} />}

      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{title}</h1>
            {contextLabel && (
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
                {contextLabel}
              </span>
            )}
          </div>
          {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>

      <div className="md:flex md:gap-6">
        {nav && nav.length > 0 && (
          <div className="mb-4 md:mb-0 md:w-52 md:shrink-0">
            <div className="md:sticky md:top-4">
              <WorkspaceNav items={nav} activeKey={activeNavKey} />
            </div>
          </div>
        )}
        <div className="min-w-0 flex-1">
          {todayQueue}
          {children}
        </div>
      </div>
    </main>
  )
}
