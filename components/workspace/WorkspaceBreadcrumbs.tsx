import { getTranslations } from 'next-intl/server'
import { Link } from '@/lib/i18n/navigation'
import type { WorkspaceBreadcrumb } from '@/lib/workspace/types'

export default async function WorkspaceBreadcrumbs({ items }: { items: WorkspaceBreadcrumb[] }) {
  if (items.length === 0) return null

  const t = await getTranslations('workspace')
  const tRoot = await getTranslations()
  // SP-047E2: fixed workspace-root items carry a labelKey (resolved here); the
  // brand root and page-provided labels stay literal (already localized).
  const labelOf = (item: WorkspaceBreadcrumb) =>
    item.labelKey ? tRoot(item.labelKey) : item.label

  return (
    <nav aria-label={t('aria.breadcrumbs')} className="mb-3 text-xs text-gray-400">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1">
              {item.href && !isLast ? (
                <Link href={item.href} className="rounded hover:text-gray-600 hover:underline">
                  {labelOf(item)}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? 'page' : undefined}
                  className={isLast ? 'font-medium text-gray-600' : undefined}
                >
                  {labelOf(item)}
                </span>
              )}
              {!isLast && <span aria-hidden="true">/</span>}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
