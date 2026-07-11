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
  { key: 'dashboard', label: 'Pulpit', href: '/profile' },
  { key: 'details', label: 'Profil', href: '/profile/details' },
  { key: 'favorites', label: 'Ulubione', href: '/profile/favorites' },
  { key: 'reviews', label: 'Recenzje', href: '/profile/reviews' },
  { key: 'events', label: 'Wydarzenia', href: '/profile/events' },
  { key: 'settings', label: 'Ustawienia', href: '/profile/settings' },
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
