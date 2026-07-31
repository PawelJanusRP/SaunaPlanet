import type { WorkspaceAccess } from './types'
import { AUTHENTICATED_BASE_ACCESS, GUEST_ACCESS } from './destinations'

/**
 * SP-039P0 — client-side access-snapshot state machine.
 *
 * The AuthProvider loads the WorkspaceAccess snapshot (navigation visibility
 * ONLY — every privileged route keeps its own server-side gate). Before this
 * module, a transient PostgREST failure (e.g. a 503 during the master-rows
 * query) was indistinguishable from "no master profile": the Studio
 * destination silently vanished for an entitled owner until reload.
 *
 * The machine distinguishes four phases:
 *
 *   guest ──signIn──▶ loading ──success──▶ confirmed
 *     ▲                  │  ▲                  │
 *     │               failure │◀──reload/retry──┘   (retained snapshot kept
 *   signOut              ▼  │                        across loading/error
 *     ◀───────────────  error                        for the SAME user)
 *
 * Retention rules:
 * - a snapshot is retained ONLY for the user id it was confirmed for;
 * - loading/error phases display the retained snapshot when one exists,
 *   otherwise the minimal AUTHENTICATED_BASE_ACCESS (never invents access);
 * - a confirmed success ALWAYS replaces the snapshot — including a
 *   confirmed "no master profile" result, which removes Studio access;
 * - account switch and sign-out drop the retained snapshot immediately;
 * - stale async results for a previously loading user are ignored.
 *
 * Nothing here is persisted (no localStorage) and nothing here is an
 * authorization source — the server-side /studio gate stays authoritative.
 */

export type AccessLoadState =
  | { phase: 'guest' }
  | { phase: 'loading'; userId: string; retained: WorkspaceAccess | null }
  | { phase: 'confirmed'; userId: string; access: WorkspaceAccess }
  | { phase: 'error'; userId: string; retained: WorkspaceAccess | null }

export const GUEST_ACCESS_STATE: AccessLoadState = { phase: 'guest' }

/** Snapshot retained for `userId`, or null (different user, guest). */
function retainedFor(
  state: AccessLoadState,
  userId: string
): WorkspaceAccess | null {
  if (state.phase === 'confirmed' && state.userId === userId) {
    return state.access
  }
  if (
    (state.phase === 'loading' || state.phase === 'error') &&
    state.userId === userId
  ) {
    return state.retained
  }
  return null
}

/** A (re)load begins for `userId`. Switching accounts clears retention. */
export function accessLoadStarted(
  state: AccessLoadState,
  userId: string
): AccessLoadState {
  return { phase: 'loading', userId, retained: retainedFor(state, userId) }
}

/** All access queries succeeded — the snapshot is authoritative, including
 *  a confirmed "no entitlements" result. Stale results (a different user is
 *  now current) are dropped. */
export function accessLoadSucceeded(
  state: AccessLoadState,
  userId: string,
  access: WorkspaceAccess
): AccessLoadState {
  if (state.phase !== 'guest' && state.userId !== userId) return state
  if (state.phase === 'guest') return state
  return { phase: 'confirmed', userId, access }
}

/** At least one access query failed (transport/HTTP error). Previously
 *  confirmed access for the SAME user survives the failure. */
export function accessLoadFailed(
  state: AccessLoadState,
  userId: string
): AccessLoadState {
  if (state.phase !== 'guest' && state.userId !== userId) return state
  if (state.phase === 'guest') return state
  return { phase: 'error', userId, retained: retainedFor(state, userId) }
}

/** Sign-out (or session loss): everything is dropped. */
export function accessSignedOut(): AccessLoadState {
  return GUEST_ACCESS_STATE
}

/** The WorkspaceAccess the UI should render for the current phase. */
export function resolveVisibleAccess(state: AccessLoadState): WorkspaceAccess {
  switch (state.phase) {
    case 'guest':
      return GUEST_ACCESS
    case 'confirmed':
      return state.access
    case 'loading':
    case 'error':
      return state.retained ?? AUTHENTICATED_BASE_ACCESS
  }
}

/** Bounded automatic recovery: after this many failed attempts the machine
 *  waits for a manual refresh or the next auth event (no infinite loop). */
export const ACCESS_LOAD_MAX_AUTO_RETRIES = 2

export function shouldAutoRetryAccessLoad(
  state: AccessLoadState,
  userId: string,
  attemptsSoFar: number
): boolean {
  return (
    state.phase === 'error' &&
    state.userId === userId &&
    attemptsSoFar < ACCESS_LOAD_MAX_AUTO_RETRIES
  )
}

/** Backoff for automatic retries: 2 s, then 4 s. */
export function accessRetryDelayMs(attempt: number): number {
  return 2000 * 2 ** attempt
}
