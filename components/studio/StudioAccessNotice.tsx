import { getTranslations } from 'next-intl/server'
import WorkspaceShell from '@/components/workspace/WorkspaceShell'
import WorkspaceEmptyState from '@/components/workspace/WorkspaceEmptyState'
import { MASTER_STUDIO_LABEL, masterBreadcrumbs } from '@/lib/workspace/master'

/**
 * Minimal Studio shell for accounts without an operational master profile
 * (docs/PLATFORM_WORKSPACES.md §5 — pending masters see a minimal shell,
 * accounts without a profile see the entry point). Shared by every /studio
 * page so the gate renders identically everywhere.
 */
export default async function StudioAccessNotice({
  kind,
  masterId,
}: {
  kind: 'none' | 'pending' | 'rejected'
  masterId?: string
}) {
  const t = await getTranslations('studio')
  return (
    <WorkspaceShell
      title={MASTER_STUDIO_LABEL}
      subtitle={t('accessNotice.subtitle')}
      breadcrumbs={masterBreadcrumbs()}
    >
      {kind === 'none' && (
        <WorkspaceEmptyState
          icon="🧖"
          title={t('accessNotice.noneTitle')}
          description={t('accessNotice.noneDescription')}
          actionHref="/masters"
          actionLabel={t('accessNotice.noneAction')}
        />
      )}
      {kind === 'pending' && (
        <WorkspaceEmptyState
          icon="⏳"
          title={t('accessNotice.pendingTitle')}
          description={t('accessNotice.pendingDescription')}
          actionHref={masterId ? `/masters/${masterId}` : undefined}
          actionLabel={masterId ? t('accessNotice.pendingAction') : undefined}
        />
      )}
      {kind === 'rejected' && (
        <WorkspaceEmptyState
          icon="✗"
          title={t('accessNotice.rejectedTitle')}
          description={t('accessNotice.rejectedDescription')}
        />
      )}
    </WorkspaceShell>
  )
}
