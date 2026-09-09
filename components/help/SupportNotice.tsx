import { TriangleAlert } from 'lucide-react'
import { useTranslations } from 'next-intl'

/**
 * SP-039P0 — the shared pilot support block. The central copy lives in the help
 * catalog (help.support.*), so the pilot support path changes in one place; the
 * pure lib/help/support.ts keeps the same copy as a canonical reference.
 */
export default function SupportNotice({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('help.support')
  const checklist = t.raw('checklist') as string[]
  return (
    <div
      className={`rounded-2xl border border-orange-200 bg-orange-50 ${
        compact ? 'p-3 text-sm' : 'p-4 text-sm sm:p-5'
      }`}
    >
      <p className="font-bold text-orange-900">{t('heading')}</p>
      <p className="mt-1 text-orange-800">{t('channel')}</p>
      {!compact && (
        <>
          <p className="mt-2 text-orange-800">{t('requestChecklistIntro')}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-orange-800">
            {checklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-2 flex items-start gap-1.5 font-semibold text-orange-900">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {t('securityWarning')}
      </p>
    </div>
  )
}
