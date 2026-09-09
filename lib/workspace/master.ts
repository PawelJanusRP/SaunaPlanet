import type { WorkspaceBreadcrumb, WorkspaceNavItem } from './types'

/**
 * Master Studio configuration (SP-035) — "Studio"
 * (docs/PLATFORM_WORKSPACES.md §5). Same shape as lib/workspace/personal.ts:
 * navigation defined once, rendered by WorkspaceNav in both responsive
 * variants. Masters have no facility context to switch (unlike the Owner
 * Workspace) — the Studio's context is the one master profile itself.
 */

export const MASTER_STUDIO_LABEL = 'Studio'
export const MASTER_STUDIO_HOME = '/studio'

export const MASTER_NAV: WorkspaceNavItem[] = [
  { key: 'dashboard', labelKey: 'nav.master.dashboard', href: '/studio' },
  { key: 'profile', labelKey: 'nav.master.profile', href: '/studio/profile' },
  { key: 'events', labelKey: 'nav.master.events', href: '/studio/events' },
  { key: 'affiliations', labelKey: 'nav.master.affiliations', href: '/studio/affiliations' },
  { key: 'settings', labelKey: 'nav.master.settings', href: '/studio/settings' },
  // SP-039P0: public Quick Start — reachable for every owner, including
  // pending ones (help never depends on approved status).
  { key: 'help', labelKey: 'nav.master.help', href: '/help/saunamaster' },
]

/** Breadcrumb trail: platform root → studio home → optional current page. */
export function masterBreadcrumbs(pageLabel?: string): WorkspaceBreadcrumb[] {
  const trail: WorkspaceBreadcrumb[] = [
    { label: 'SaunaPlanet', href: '/' },
    { label: MASTER_STUDIO_LABEL, href: MASTER_STUDIO_HOME },
  ]
  if (pageLabel) trail.push({ label: pageLabel })
  return trail
}

