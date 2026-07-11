import WorkspaceShell from '@/components/workspace/WorkspaceShell'
import WorkspaceEmptyState from '@/components/workspace/WorkspaceEmptyState'
import { MASTER_STUDIO_LABEL, masterBreadcrumbs } from '@/lib/workspace/master'

/**
 * Minimal Studio shell for accounts without an operational master profile
 * (docs/PLATFORM_WORKSPACES.md §5 — pending masters see a minimal shell,
 * accounts without a profile see the entry point). Shared by every /studio
 * page so the gate renders identically everywhere.
 */
export default function StudioAccessNotice({
  kind,
  masterId,
}: {
  kind: 'none' | 'pending' | 'rejected'
  masterId?: string
}) {
  return (
    <WorkspaceShell
      title={MASTER_STUDIO_LABEL}
      subtitle="Twoja przestrzeń zawodowa saunamistrza"
      breadcrumbs={masterBreadcrumbs()}
    >
      {kind === 'none' && (
        <WorkspaceEmptyState
          icon="🧖"
          title="To konto nie ma profilu saunamistrza"
          description="Zgłoś swój profil na stronie saunamistrzów — po zatwierdzeniu przez moderację Studio otworzy się tutaj."
          actionHref="/masters"
          actionLabel="Zgłoś się jako saunamistrz"
        />
      )}
      {kind === 'pending' && (
        <WorkspaceEmptyState
          icon="⏳"
          title="Twój profil czeka na moderację"
          description="Po zatwierdzeniu profilu zyskasz dostęp do afiliacji i pełnego Studia."
          actionHref={masterId ? `/masters/${masterId}` : undefined}
          actionLabel={masterId ? 'Zobacz swój profil' : undefined}
        />
      )}
      {kind === 'rejected' && (
        <WorkspaceEmptyState
          icon="✗"
          title="Zgłoszenie profilu zostało odrzucone"
          description="Skontaktuj się z moderacją, jeśli uważasz, że to pomyłka."
        />
      )}
    </WorkspaceShell>
  )
}
