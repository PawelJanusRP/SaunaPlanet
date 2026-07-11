/**
 * Platform-agnostic workspace navigation types (SP-031).
 *
 * No React or browser imports belong in this module: these definitions are
 * shared by the web rendering layer today and are meant to be reusable by a
 * future React Native navigation layer unchanged.
 */

/** Global platform role from `profiles.role`. */
export type GlobalRole = 'user' | 'moderator' | 'admin'

/**
 * Snapshot of the current user's workspace-relevant capabilities, derived
 * from the existing role model only: `profiles.role` (global) plus the
 * contextual relationship tables `sauna_managers` and `sauna_masters`.
 */
export type WorkspaceAccess = {
  isAuthenticated: boolean
  /** Global role; null when not signed in. */
  role: GlobalRole | null
  /** Has at least one approved `sauna_managers` membership. */
  hasApprovedSaunaMembership: boolean
  /** Has an approved `sauna_masters` profile linked via `user_id`. */
  hasLinkedMasterProfile: boolean
}

export type WorkspaceDestinationKey =
  | 'profile'
  | 'owner-workspace'
  | 'master-studio'
  | 'admin'

export type WorkspaceDestination = {
  key: WorkspaceDestinationKey
  label: string
  href: string
  /**
   * 'available' = the route exists; 'planned' = the route is not implemented
   * yet and the destination must never be rendered as a link.
   */
  status: 'available' | 'planned'
  /** Small text marker rendered next to the label (existing Navbar convention). */
  badge?: string
  isVisible: (access: WorkspaceAccess) => boolean
}

export type WorkspaceNavItem = {
  key: string
  label: string
  href: string
  /** Pending-count badge (workspaces are queues first). */
  badgeCount?: number
}

export type WorkspaceBreadcrumb = {
  label: string
  href?: string
}
