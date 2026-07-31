'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import type { GlobalRole, WorkspaceAccess } from '@/lib/workspace/types'
import { GUEST_ACCESS } from '@/lib/workspace/destinations'
import {
  GUEST_ACCESS_STATE,
  accessLoadFailed,
  accessLoadStarted,
  accessLoadSucceeded,
  accessRetryDelayMs,
  accessSignedOut,
  resolveVisibleAccess,
  shouldAutoRetryAccessLoad,
  type AccessLoadState,
} from '@/lib/workspace/accessState'

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
  /**
   * Recompute the snapshot on demand (SP-039 4C2): entitlements can change
   * mid-session without an auth event — e.g. right after claiming a master
   * profile the Studio link must appear without a full reload.
   */
  refreshAccess: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  access: GUEST_ACCESS,
  loading: true,
  refreshAccess: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  // SP-039P0: the access snapshot lives inside the lib/workspace/accessState
  // machine — a transient query failure (e.g. PostgREST 503) keeps the last
  // CONFIRMED snapshot for the same user instead of erasing Studio access.
  // The state is never persisted and never authorizes anything server-side.
  const [accessState, setAccessState] = useState<AccessLoadState>(GUEST_ACCESS_STATE)
  const accessStateRef = useRef<AccessLoadState>(GUEST_ACCESS_STATE)
  const retryRef = useRef<{ userId: string; attempts: number }>({ userId: '', attempts: 0 })
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function transition(next: (prev: AccessLoadState) => AccessLoadState) {
    accessStateRef.current = next(accessStateRef.current)
    setAccessState(accessStateRef.current)
  }

  function clearRetryTimer() {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }
  }

  async function loadUserAndRole(userId: string) {
    transition((prev) => accessLoadStarted(prev, userId))

    const supabase = createClient()
    const [profileRes, membershipRes, masterRes] = await Promise.all([
      supabase.from('profiles').select('role').eq('id', userId).maybeSingle(),
      supabase
        .from('sauna_managers')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'approved'),
      // Own rows are RLS-visible in any status (owner arm). 4C2: a
      // pending claimed profile already unlocks the Studio destination.
      supabase.from('sauna_masters').select('status').eq('user_id', userId),
    ])

    // Any query-level error means the snapshot is UNKNOWN, not empty: an
    // empty result carries no error, so this branch is only transport/HTTP
    // failure. The machine keeps previously confirmed access for this user.
    if (profileRes.error || membershipRes.error || masterRes.error) {
      transition((prev) => accessLoadFailed(prev, userId))
      scheduleRetry(userId)
      return
    }

    retryRef.current = { userId, attempts: 0 }
    const masterStatuses = (masterRes.data ?? []).map((row) => row.status as string)
    const nextRole = (profileRes.data?.role as GlobalRole) ?? 'user'
    transition((prev) =>
      accessLoadSucceeded(prev, userId, {
        isAuthenticated: true,
        role: nextRole,
        hasApprovedSaunaMembership: (membershipRes.count ?? 0) > 0,
        hasLinkedMasterProfile: masterStatuses.includes('approved'),
        hasMasterStudioAccess:
          masterStatuses.includes('approved') || masterStatuses.includes('pending'),
      })
    )
  }

  // Bounded automatic recovery (2 attempts, 2 s / 4 s backoff); afterwards
  // recovery still works via refreshAccess(), any auth event, or a reload.
  function scheduleRetry(userId: string) {
    if (retryRef.current.userId !== userId) {
      retryRef.current = { userId, attempts: 0 }
    }
    if (
      !shouldAutoRetryAccessLoad(
        accessStateRef.current,
        userId,
        retryRef.current.attempts
      )
    ) {
      return
    }
    const attempt = retryRef.current.attempts
    retryRef.current = { userId, attempts: attempt + 1 }
    clearRetryTimer()
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null
      const state = accessStateRef.current
      if (state.phase === 'error' && state.userId === userId) {
        loadUserAndRole(userId)
      }
    }, accessRetryDelayMs(attempt))
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
        clearRetryTimer()
        retryRef.current = { userId: '', attempts: 0 }
        transition(() => accessSignedOut())
      }
    })

    return () => {
      clearRetryTimer()
      listener.subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function refreshAccess() {
    if (!user) return
    // Manual refresh resets the bounded auto-retry budget.
    retryRef.current = { userId: user.id, attempts: 0 }
    clearRetryTimer()
    await loadUserAndRole(user.id)
  }

  const access = resolveVisibleAccess(accessState)
  // Role is part of the same snapshot: retained across a transient failure
  // for the same user, cleared on sign-out and on account switch.
  const role: UserRole = access.role

  return (
    <AuthContext.Provider value={{ user, role, access, loading, refreshAccess }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
