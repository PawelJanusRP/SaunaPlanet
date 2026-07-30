// Navigation Icon Refresh — contracts: complete semantic mapping, unchanged
// routes/labels/gating, single icon library, accessible markup.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  DRAWER_NAV_ICONS,
  LOGOUT_ICON,
  WORKSPACE_DESTINATION_ICONS,
  WORKSPACE_NAV_ICONS,
} from '../icons'
import { WORKSPACE_DESTINATIONS } from '@/lib/workspace/destinations'
import { MASTER_NAV } from '@/lib/workspace/master'
import { PERSONAL_NAV } from '@/lib/workspace/personal'

// OWNER_NAV_BASE is not exported; its keys are part of this pinned contract.
const OWNER_NAV_KEYS = ['dashboard', 'reservations', 'events', 'team']

describe('icon mapping completeness', () => {
  it('every avatar-menu destination key has an icon', () => {
    for (const destination of WORKSPACE_DESTINATIONS) {
      expect(
        WORKSPACE_DESTINATION_ICONS[destination.key],
        destination.key
      ).toBeTruthy()
    }
  })
  it('every workspace nav key (personal, master, owner) has an icon', () => {
    const keys = [
      ...PERSONAL_NAV.map((i) => i.key),
      ...MASTER_NAV.map((i) => i.key),
      ...OWNER_NAV_KEYS,
    ]
    for (const key of keys) {
      expect(WORKSPACE_NAV_ICONS[key], key).toBeTruthy()
    }
  })
  it('every drawer entry has an icon, plus logout', () => {
    for (const href of ['/auth/login', '/auth/register', '/submit', '/events', '/masters']) {
      expect(DRAWER_NAV_ICONS[href], href).toBeTruthy()
    }
    expect(LOGOUT_ICON).toBeTruthy()
  })
})

describe('routes and labels stay unchanged (icons are presentation only)', () => {
  it('avatar-menu destinations keep their exact hrefs and labels', () => {
    expect(
      WORKSPACE_DESTINATIONS.map(({ key, label, href }) => ({ key, label, href }))
    ).toEqual([
      { key: 'profile', label: 'Mój profil', href: '/profile' },
      { key: 'owner-workspace', label: 'Panel obiektu', href: '/workspace' },
      { key: 'master-studio', label: 'Studio', href: '/studio' },
      { key: 'admin', label: 'Panel admina', href: '/admin' },
    ])
  })
  it('master studio nav keeps its exact routes and labels', () => {
    expect(MASTER_NAV).toEqual([
      { key: 'dashboard', label: 'Pulpit', href: '/studio' },
      { key: 'profile', label: 'Profil', href: '/studio/profile' },
      { key: 'events', label: 'Moje wydarzenia', href: '/studio/events' },
      { key: 'affiliations', label: 'Afiliacje', href: '/studio/affiliations' },
      { key: 'settings', label: 'Ustawienia', href: '/studio/settings' },
    ])
  })
  it('personal nav keeps its exact routes and labels', () => {
    expect(PERSONAL_NAV.map((i) => i.href)).toEqual([
      '/profile',
      '/profile/details',
      '/profile/favorites',
      '/profile/reviews',
      '/profile/events',
      '/profile/settings',
    ])
  })
})

describe('single icon library and clean dependencies', () => {
  const pkg = readFileSync('package.json', 'utf8')
  it('lucide-react is the one and only icon library', () => {
    expect(pkg).toContain('"lucide-react"')
    for (const other of ['react-icons', '@heroicons', '@tabler/icons', 'react-feather']) {
      expect(pkg).not.toContain(other)
    }
  })
})

describe('accessible markup contracts', () => {
  const navbar = readFileSync('components/Navbar.tsx', 'utf8')
  const avatarMenu = readFileSync('components/workspace/AvatarMenu.tsx', 'utf8')
  const workspaceNav = readFileSync('components/workspace/WorkspaceNav.tsx', 'utf8')

  it('icons beside visible labels are aria-hidden in every surface', () => {
    for (const src of [navbar, avatarMenu, workspaceNav]) {
      expect(src).toContain('aria-hidden="true"')
    }
  })
  it('icon-only controls keep their accessible labels', () => {
    expect(navbar).toContain('aria-label="Menu"')
    expect(navbar).toContain('aria-label="Zamknij menu"')
  })
  it('no raw inline svg remains in the navbar (single icon family)', () => {
    expect(navbar).not.toContain('<svg')
  })
  it('renderers take icons from the central mapping module only', () => {
    expect(navbar).toContain("from '@/lib/navigation/icons'")
    expect(avatarMenu).toContain("from '@/lib/navigation/icons'")
    expect(workspaceNav).toContain("from '@/lib/navigation/icons'")
    // no per-component direct lucide imports beyond Menu/X chrome controls
    expect(avatarMenu).not.toContain("from 'lucide-react'")
    expect(workspaceNav).not.toContain("from 'lucide-react'")
  })
  it('active-state logic in WorkspaceNav is untouched (single implementation)', () => {
    expect(workspaceNav).toContain("if (activeKey !== undefined) return item.key === activeKey")
    expect(workspaceNav).toContain("return item.href.split('?')[0] === pathname")
  })
})
