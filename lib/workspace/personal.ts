import type { WorkspaceBreadcrumb, WorkspaceNavItem } from './types'

/**
 * Personal Workspace configuration (SP-032) — the reference implementation
 * of a workspace built on the SP-031 shell. Navigation is defined once here
 * and rendered by WorkspaceNav in both responsive variants; pages never
 * hard-code their own nav.
 */

export const PERSONAL_WORKSPACE_LABEL = 'Mój profil'
export const PERSONAL_WORKSPACE_HOME = '/profile'

export const PERSONAL_NAV: WorkspaceNavItem[] = [
  { key: 'dashboard', labelKey: 'nav.personal.dashboard', href: '/profile' },
  { key: 'details', labelKey: 'nav.personal.details', href: '/profile/details' },
  { key: 'favorites', labelKey: 'nav.personal.favorites', href: '/profile/favorites' },
  { key: 'reviews', labelKey: 'nav.personal.reviews', href: '/profile/reviews' },
  { key: 'events', labelKey: 'nav.personal.events', href: '/profile/events' },
  { key: 'settings', labelKey: 'nav.personal.settings', href: '/profile/settings' },
]

/** Breadcrumb trail: platform root → workspace home → optional current page. */
export function personalBreadcrumbs(pageLabel?: string): WorkspaceBreadcrumb[] {
  const trail: WorkspaceBreadcrumb[] = [
    { label: 'SaunaPlanet', href: '/' },
    { label: PERSONAL_WORKSPACE_LABEL, href: PERSONAL_WORKSPACE_HOME },
  ]
  if (pageLabel) trail.push({ label: pageLabel })
  return trail
}
