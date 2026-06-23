'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from './AuthProvider'
import { createClient } from '@/lib/supabase/client'

export default function Navbar() {
  const { user, role, loading } = useAuth()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <nav className="flex items-center justify-between border-b bg-white px-4 py-3">
      <div className="flex items-center gap-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          🌍 SaunaPlanet
        </Link>
        <Link href="/events" className="text-sm text-gray-600 hover:text-black">
          Wydarzenia
        </Link>
        <Link href="/masters" className="text-sm text-gray-600 hover:text-black">
          Saunamistrzowie
        </Link>
        {(role === 'admin' || role === 'moderator') && (
          <Link href="/admin" className="text-sm font-medium text-orange-600 hover:text-orange-800">
            Admin
          </Link>
        )}
      </div>

      <div className="flex items-center gap-3">
        {loading ? (
          <div className="h-8 w-20 animate-pulse rounded-xl bg-gray-100" />
        ) : user ? (
          <>
            <Link
              href="/profile"
              className="text-sm text-gray-600 hover:text-black"
            >
              {user.email}
            </Link>
            <button
              onClick={handleLogout}
              className="rounded-xl border px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              Wyloguj
            </button>
          </>
        ) : (
          <>
            <Link
              href="/auth/login"
              className="text-sm text-gray-600 hover:text-black"
            >
              Zaloguj się
            </Link>
            <Link
              href="/auth/register"
              className="rounded-xl bg-black px-3 py-1.5 text-sm text-white hover:bg-gray-800"
            >
              Zarejestruj się
            </Link>
          </>
        )}
      </div>
    </nav>
  )
}
