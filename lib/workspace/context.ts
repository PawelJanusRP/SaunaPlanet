/**
 * Generic active-context model for workspaces (SP-033).
 *
 * A workspace that operates on a set of business objects (Owner Workspace:
 * facilities; future workspaces: whatever they manage) carries an "active
 * context": either the aggregate of everything the account holds ("all") or
 * one selected object. The context travels in the URL query string — the
 * same routing convention as /admin?tab= — so server components read it from
 * searchParams and modules consume the resolved context without introducing
 * their own filters.
 *
 * Like lib/workspace/types.ts this module is platform-agnostic: no React or
 * browser imports.
 */

export const WORKSPACE_CONTEXT_PARAM = 'context'

export type WorkspaceContextOption = {
  id: string
  label: string
}

export type ActiveWorkspaceContext =
  | { scope: 'all' }
  | { scope: 'one'; option: WorkspaceContextOption }

/**
 * Resolve the raw query-string value against the options the account
 * actually holds. Unknown or missing values fall back to the aggregate —
 * a stale or foreign id can never select a context the user does not own.
 */
export function resolveWorkspaceContext(
  param: string | undefined,
  options: WorkspaceContextOption[]
): ActiveWorkspaceContext {
  const option = param ? options.find((o) => o.id === param) : undefined
  return option ? { scope: 'one', option } : { scope: 'all' }
}

/** Object ids the active context spans (one id, or all held ids). */
export function workspaceContextIds(
  context: ActiveWorkspaceContext,
  options: WorkspaceContextOption[]
): string[] {
  return context.scope === 'one' ? [context.option.id] : options.map((o) => o.id)
}

/** Append the context to an href so navigation preserves the selection. */
export function withWorkspaceContext(
  href: string,
  context: ActiveWorkspaceContext
): string {
  if (context.scope !== 'one') return href
  const separator = href.includes('?') ? '&' : '?'
  return `${href}${separator}${WORKSPACE_CONTEXT_PARAM}=${encodeURIComponent(context.option.id)}`
}

/**
 * Human label for the context chip. With a single held object the workspace
 * IS that object (docs/PLATFORM_WORKSPACES.md §4.1), so its name is shown
 * even in the aggregate scope.
 */
export function workspaceContextLabel(
  context: ActiveWorkspaceContext,
  options: WorkspaceContextOption[],
  allLabel = 'Wszystkie obiekty'
): string {
  if (context.scope === 'one') return context.option.label
  if (options.length === 1) return options[0].label
  return allLabel
}
