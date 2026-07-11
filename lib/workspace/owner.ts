import type { WorkspaceBreadcrumb, WorkspaceNavItem } from './types'
import { withWorkspaceContext, type ActiveWorkspaceContext } from './context'

/**
 * Owner/Manager Workspace configuration (SP-033) — "Panel obiektu"
 * (docs/PLATFORM_WORKSPACES.md §4). Same shape as lib/workspace/personal.ts,
 * except navigation is a function of the active facility context so links
 * preserve the current selection.
 */

export const OWNER_WORKSPACE_LABEL = 'Panel obiektu'
export const OWNER_WORKSPACE_HOME = '/workspace'
export const OWNER_ALL_FACILITIES_LABEL = 'Wszystkie obiekty'

const OWNER_NAV_BASE: WorkspaceNavItem[] = [
  { key: 'dashboard', label: 'Pulpit', href: '/workspace' },
  { key: 'reservations', label: 'Rezerwacje', href: '/workspace/reservations' },
  { key: 'events', label: 'Wydarzenia', href: '/workspace/events' },
  { key: 'team', label: 'Zespół', href: '/workspace/team' },
]

/** Single nav definition (mobile chips + desktop sidebar) carrying the context. */
export function ownerNav(context: ActiveWorkspaceContext): WorkspaceNavItem[] {
  return OWNER_NAV_BASE.map((item) => ({
    ...item,
    href: withWorkspaceContext(item.href, context),
  }))
}

/** Breadcrumb trail: platform root → workspace home → optional current page. */
export function ownerBreadcrumbs(
  context: ActiveWorkspaceContext,
  pageLabel?: string
): WorkspaceBreadcrumb[] {
  const trail: WorkspaceBreadcrumb[] = [
    { label: 'SaunaPlanet', href: '/' },
    { label: OWNER_WORKSPACE_LABEL, href: withWorkspaceContext(OWNER_WORKSPACE_HOME, context) },
  ]
  if (pageLabel) trail.push({ label: pageLabel })
  return trail
}
