'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from './AuthProvider'
import { createClient } from '@/lib/supabase/client'
import AvatarMenu from './workspace/AvatarMenu'

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
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="19" y2="6" />
            <line x1="3" y1="11" x2="19" y2="11" />
            <line x1="3" y1="16" x2="19" y2="16" />
          </svg>
        </button>
      </nav>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
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
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="2" y1="2" x2="16" y2="16" />
              <line x1="16" y1="2" x2="2" y2="16" />
            </svg>
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
                className="w-full rounded-xl px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 active:bg-red-100"
              >
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
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors hover:bg-gray-100 ${
        bold ? 'font-semibold' : ''
      } ${highlight ? 'bg-black text-white hover:bg-gray-800' : 'text-gray-700'}`}
    >
      {children}
      {badge && (
        <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
          {badge}
        </span>
      )}
    </Link>
  )
}
