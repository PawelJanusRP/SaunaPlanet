import type { WorkspaceAccess, WorkspaceDestination } from './types'

/**
 * The avatar-menu workspace hub (docs/PLATFORM_WORKSPACES.md §3.1):
 * Profile → Owner Workspace → Master Studio → Administration.
 *
 * Visibility derives ONLY from the existing role model:
 * - profile: any authenticated user (existing Navbar behaviour),
 * - owner-workspace: at least one approved `sauna_managers` membership —
 *   the current model has no separate owner role yet; owner ⊇ manager
 *   (docs/USER_MODEL.md §3.2), so approved membership is the entry condition,
 * - master-studio: an approved `sauna_masters` profile linked to the account,
 * - admin: global role admin/moderator (existing Navbar behaviour).
 *
 * Routes that do not exist yet carry `status: 'planned'` and are excluded
 * from rendering until they ship — the config represents them without
 * exposing broken links. Owner Workspace became available in SP-033;
 * Master Studio remains planned.
 */
export const WORKSPACE_DESTINATIONS: WorkspaceDestination[] = [
  {
    key: 'profile',
    label: 'Mój profil',
    href: '/profile',
    status: 'available',
    isVisible: (access) => access.isAuthenticated,
  },
  {
    key: 'owner-workspace',
    label: 'Panel obiektu',
    href: '/workspace',
    status: 'available',
    isVisible: (access) => access.isAuthenticated && access.hasApprovedSaunaMembership,
  },
  {
    key: 'master-studio',
    label: 'Studio',
    href: '/studio',
    status: 'planned',
    isVisible: (access) => access.isAuthenticated && access.hasLinkedMasterProfile,
  },
  {
    key: 'admin',
    label: 'Panel admina',
    href: '/admin',
    status: 'available',
    badge: 'Admin',
    isVisible: (access) => access.role === 'admin' || access.role === 'moderator',
  },
]

export const GUEST_ACCESS: WorkspaceAccess = {
  isAuthenticated: false,
  role: null,
  hasApprovedSaunaMembership: false,
  hasLinkedMasterProfile: false,
}

/**
 * Optimistic snapshot used while role/membership queries are still resolving
 * for a known-authenticated session. Grants nothing beyond what every
 * authenticated user gets (the Personal Workspace destination); admin,
 * owner and master visibility stays off until the real snapshot arrives.
 */
export const AUTHENTICATED_BASE_ACCESS: WorkspaceAccess = {
  isAuthenticated: true,
  role: null,
  hasApprovedSaunaMembership: false,
  hasLinkedMasterProfile: false,
}

/** Destinations the user may both see and navigate to (planned routes excluded). */
export function getVisibleWorkspaceDestinations(
  access: WorkspaceAccess
): WorkspaceDestination[] {
  return WORKSPACE_DESTINATIONS.filter(
    (destination) => destination.status === 'available' && destination.isVisible(access)
  )
}
