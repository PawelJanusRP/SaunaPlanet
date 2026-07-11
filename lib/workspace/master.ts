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
  { key: 'dashboard', label: 'Pulpit', href: '/studio' },
  { key: 'profile', label: 'Profil', href: '/studio/profile' },
  { key: 'affiliations', label: 'Afiliacje', href: '/studio/affiliations' },
  { key: 'settings', label: 'Ustawienia', href: '/studio/settings' },
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

export const MASTER_STATUS_LABELS: Record<string, string> = {
  pending: '⏳ Oczekuje na moderację',
  approved: '✓ Zatwierdzony',
  rejected: '✗ Odrzucony',
}

export const AFFILIATION_STATUS_LABELS: Record<string, string> = {
  pending: '⏳ Oczekuje',
  approved: '✓ Aktywna',
  rejected: '✗ Odrzucona',
  ended: '— Zakończona',
}
