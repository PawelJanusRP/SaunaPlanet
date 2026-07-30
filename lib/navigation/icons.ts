// Navigation Icon Refresh — the single semantic icon mapping for every
// shared navigation surface (drawer, avatar-menu hub, workspace navs).
//
// Icons are deliberately kept OUT of the platform-agnostic configuration
// modules (lib/workspace/types.ts allows no React imports so the configs
// stay reusable by a future React Native layer). This module maps the
// existing stable `key` values to Lucide components at the rendering layer;
// visibility and authorization stay entirely in the destination configs.

import {
  Building2,
  CalendarDays,
  Flame,
  Heart,
  LayoutDashboard,
  Link,
  LogIn,
  LogOut,
  MapPinPlus,
  MessageSquareText,
  Settings,
  ShieldCheck,
  Sparkles,
  TicketCheck,
  UserRound,
  UserRoundPlus,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import type { WorkspaceDestinationKey } from '@/lib/workspace/types'

/** Avatar-menu workspace hub (lib/workspace/destinations.ts). Sparkles for
 *  Master Studio by decision: distinct from the personal profile and free of
 *  authority/certification connotations (no shield/crown/badge). */
export const WORKSPACE_DESTINATION_ICONS: Record<
  WorkspaceDestinationKey,
  LucideIcon
> = {
  profile: UserRound,
  'owner-workspace': Building2,
  'master-studio': Sparkles,
  admin: ShieldCheck,
}

/**
 * Workspace navigation items (PERSONAL_NAV / MASTER_NAV / OWNER_NAV_BASE),
 * keyed by the existing `WorkspaceNavItem.key`. Keys shared across
 * workspaces (dashboard, events, settings) intentionally share one icon.
 */
export const WORKSPACE_NAV_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  // personal
  details: UserRound,
  favorites: Heart,
  reviews: MessageSquareText,
  events: CalendarDays,
  settings: Settings,
  // master studio
  profile: UserRound,
  affiliations: Link,
  // owner workspace
  reservations: TicketCheck,
  team: Users,
}

/** Drawer navigation (components/Navbar.tsx and the SaunaMap account
 *  panel), keyed by href. `/profile` and `/admin` reuse the workspace-hub
 *  icons for the map panel, which links to those routes directly. */
export const DRAWER_NAV_ICONS: Record<string, LucideIcon> = {
  '/auth/login': LogIn,
  '/auth/register': UserRoundPlus,
  '/submit': MapPinPlus,
  '/events': CalendarDays,
  '/masters': UsersRound,
  '/sauny': Flame,
  '/profile': UserRound,
  '/admin': ShieldCheck,
}

export const LOGOUT_ICON: LucideIcon = LogOut
