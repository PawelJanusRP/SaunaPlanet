import { TriangleAlert } from 'lucide-react'
import {
  SUPPORT_CHANNEL_PL,
  SUPPORT_HEADING_PL,
  SUPPORT_REQUEST_CHECKLIST_PL,
  SUPPORT_SECURITY_WARNING_PL,
} from '@/lib/help/support'

/**
 * SP-039P0 — the shared pilot support block (server component). Renders the
 * central copy from lib/help/support.ts verbatim; used on the Quick Start
 * page and in the Studio first-steps card so the support path changes in
 * exactly one place.
 */
export default function SupportNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`rounded-2xl border border-orange-200 bg-orange-50 ${
        compact ? 'p-3 text-sm' : 'p-4 text-sm sm:p-5'
      }`}
    >
      <p className="font-bold text-orange-900">{SUPPORT_HEADING_PL}</p>
      <p className="mt-1 text-orange-800">{SUPPORT_CHANNEL_PL}</p>
      {!compact && (
        <>
          <p className="mt-2 text-orange-800">W zgłoszeniu podaj:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-orange-800">
            {SUPPORT_REQUEST_CHECKLIST_PL.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-2 flex items-start gap-1.5 font-semibold text-orange-900">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {SUPPORT_SECURITY_WARNING_PL}
      </p>
    </div>
  )
}
