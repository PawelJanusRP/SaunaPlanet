'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import type { GlobalRole, WorkspaceAccess } from '@/lib/workspace/types'
import { AUTHENTICATED_BASE_ACCESS, GUEST_ACCESS } from '@/lib/workspace/destinations'

type UserRole = GlobalRole | null

type AuthContextType = {
  user: User | null
  role: UserRole
  /**
   * Workspace-visibility snapshot (SP-031). Drives navigation only — every
   * privileged action stays enforced by RLS and server actions.
   */
  access: WorkspaceAccess
  loading: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  access: GUEST_ACCESS,
  loading: true,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<UserRole>(null)
  const [access, setAccess] = useState<WorkspaceAccess>(GUEST_ACCESS)
  const [loading, setLoading] = useState(true)

  async function loadUserAndRole(userId: string) {
    // Session is already known to be valid: expose the base authenticated
    // access immediately so the workspace hub does not flash empty while the
    // role/membership queries below resolve. Never downgrades an already
    // resolved snapshot (avoids admin links blinking on token refresh).
    setAccess((prev) => (prev.isAuthenticated ? prev : AUTHENTICATED_BASE_ACCESS))

    const supabase = createClient()
    const [{ data: profile }, { count: membershipCount }, { count: masterCount }] =
      await Promise.all([
        supabase.from('profiles').select('role').eq('id', userId).single(),
        supabase
          .from('sauna_managers')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('status', 'approved'),
        supabase
          .from('sauna_masters')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('status', 'approved'),
      ])

    const nextRole = (profile?.role as GlobalRole) ?? 'user'
    setRole(nextRole)
    setAccess({
      isAuthenticated: true,
      role: nextRole,
      hasApprovedSaunaMembership: (membershipCount ?? 0) > 0,
      hasLinkedMasterProfile: (masterCount ?? 0) > 0,
    })
  }

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      if (data.user) {
        loadUserAndRole(data.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        loadUserAndRole(session.user.id)
      } else {
        setRole(null)
        setAccess(GUEST_ACCESS)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ user, role, access, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
