'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { useAuth } from './AuthProvider'
import { createClient } from '@/lib/supabase/client'
import AvatarMenu from './workspace/AvatarMenu'
import { DRAWER_NAV_ICONS, LOGOUT_ICON } from '@/lib/navigation/icons'

const LogoutIcon = LOGOUT_ICON

const roleLabel: Record<string, string> = {
  admin: 'Administrator',
  moderator: 'Moderator',
  user: 'Użytkownik',
}

const roleBadge: Record<string, string> = {
  admin: 'bg-red-100 text-red-700',
  moderator: 'bg-orange-100 text-orange-700',
  user: 'bg-gray-100 text-gray-600',
}

export default function Navbar() {
  const { user, role, loading } = useAuth()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  function close() { setOpen(false) }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    close()
    router.push('/')
    router.refresh()
  }

  return (
    <>
      {/* Top bar */}
      <nav className="flex items-center justify-between border-b bg-white px-4 py-3">
        <Link href="/" className="text-lg font-bold tracking-tight">
          🌍 SaunaPlanet
        </Link>
        <button
          onClick={() => setOpen(true)}
          aria-label="Menu"
          className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-gray-100"
        >
          <Menu className="h-[22px] w-[22px]" aria-hidden="true" />
        </button>
      </nav>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-transparent"
          onClick={close}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed right-0 top-0 z-50 flex h-full w-72 flex-col bg-white shadow-2xl transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <span className="font-bold">🌍 SaunaPlanet</span>
          <button
            onClick={close}
            aria-label="Zamknij menu"
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100"
          >
            <X className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto">
          {/* User section */}
          {!loading && (
            <>
              {user ? (
                <div className="border-b px-5 py-4">
                  <p className="truncate text-sm font-medium text-gray-900">{user.email}</p>
                  {role && (
                    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${roleBadge[role] ?? roleBadge.user}`}>
                      {roleLabel[role] ?? role}
                    </span>
                  )}
                </div>
              ) : (
                <div className="border-b px-5 py-4 space-y-2">
                  <NavItem href="/auth/login" onClick={close} bold>Zaloguj się</NavItem>
                  <NavItem href="/auth/register" onClick={close} highlight>Zarejestruj się</NavItem>
                </div>
              )}
            </>
          )}

          {/* Account links — workspace hub (SP-031) + non-workspace links */}
          {user && (
            <div className="border-b px-5 py-3 space-y-1">
              <AvatarMenu onNavigate={close} />
              <NavItem href="/submit" onClick={close}>Zgłoś saunę</NavItem>
            </div>
          )}

          {/* Navigation */}
          <div className="border-b px-5 py-3 space-y-1">
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-gray-400">Odkrywaj</p>
            <NavItem href="/events" onClick={close}>Wydarzenia</NavItem>
            <NavItem href="/masters" onClick={close}>Saunamistrzowie</NavItem>
          </div>

          {/* Logout */}
          {user && (
            <div className="px-5 py-3">
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 active:bg-red-100"
              >
                <LogoutIcon className="h-4 w-4" aria-hidden="true" />
                Wyloguj się
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function NavItem({
  href,
  onClick,
  children,
  bold,
  highlight,
  badge,
}: {
  href: string
  onClick: () => void
  children: React.ReactNode
  bold?: boolean
  highlight?: boolean
  badge?: string
}) {
  const Icon = DRAWER_NAV_ICONS[href]
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors hover:bg-gray-100 ${
        bold ? 'font-semibold' : ''
      } ${highlight ? 'bg-black text-white hover:bg-gray-800' : 'text-gray-700'}`}
    >
      <span className="flex items-center gap-2.5">
        {Icon && (
          <Icon
            className={`h-4 w-4 ${highlight ? 'text-white' : 'text-gray-500'}`}
            aria-hidden="true"
          />
        )}
        {children}
      </span>
      {badge && (
        <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
          {badge}
        </span>
      )}
    </Link>
  )
}
