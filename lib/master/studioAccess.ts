// SP-039 Slice 4C2-App — Studio access gate as a pure decision.
//
// Slice 2 deferred the editor for pending owners; the publication workflow
// lifts that: a claimed owner needs the Studio (edit, completeness, submit)
// BEFORE moderation approves the master. Rejected profiles and accounts
// without a profile keep their safe notice states.

export type StudioGate =
  | { kind: 'none' }
  | { kind: 'rejected' }
  | { kind: 'workspace'; pendingModeration: boolean }

export function resolveStudioGate(
  status: 'pending' | 'approved' | 'rejected' | null
): StudioGate {
  if (status === null) return { kind: 'none' }
  if (status === 'rejected') return { kind: 'rejected' }
  return { kind: 'workspace', pendingModeration: status === 'pending' }
}
