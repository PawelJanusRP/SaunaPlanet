import Link from 'next/link'
import { CircleCheck, Circle, CircleHelp } from 'lucide-react'
import SupportNotice from '@/components/help/SupportNotice'
import type { FirstStep, FirstSteps } from '@/lib/master/onboarding'

/**
 * SP-039P0 / SP-039H Layer 1 — the Master Studio first-steps card (server
 * component). Pure presentation of a derived checklist: all completion facts
 * come from lib/master/onboarding.ts, nothing is stored, nothing blocks the
 * Studio (no modal tour). Rendered for every owner, including pending ones.
 */
export default function FirstStepsCard({ firstSteps }: { firstSteps: FirstSteps }) {
  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold">Pierwsze kroki</h2>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
          {firstSteps.progressLabel}
        </span>
      </div>

      <p className="mt-1 mb-3 text-sm text-gray-500">
        Wszystko, co prowadzi do publicznej wizytówki — krok po kroku. Do
        zgłoszenia profilu wystarczą uzupełnione wymagane dane; pozostałe kroki
        wykonasz w swoim tempie.
      </p>

      <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-gray-400">
        Do publikacji wizytówki
      </p>
      <ul className="space-y-1.5">
        {firstSteps.required.map((step) => (
          <StepRow key={step.key} step={step} />
        ))}
      </ul>

      <p className="mt-4 mb-1 text-xs font-semibold uppercase tracking-widest text-gray-400">
        Zalecane po publikacji
      </p>
      <ul className="space-y-1.5">
        {firstSteps.recommended.map((step) => (
          <StepRow key={step.key} step={step} />
        ))}
      </ul>

      <div className="mt-4 border-t pt-3">
        <Link
          href="/help/saunamaster"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-700 hover:underline"
        >
          <CircleHelp className="h-4 w-4" aria-hidden="true" />
          Przewodnik: szybki start saunamistrza
        </Link>
        <div className="mt-3">
          <SupportNotice compact />
        </div>
      </div>
    </section>
  )
}

function StepRow({ step }: { step: FirstStep }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {step.done ? (
        <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
      ) : (
        <Circle className="mt-0.5 h-4 w-4 shrink-0 text-gray-300" aria-hidden="true" />
      )}
      <span className="min-w-0">
        <span className={step.done ? 'text-gray-700' : 'text-gray-600'}>
          {step.label}
        </span>
        {!step.done && step.href && (
          <Link
            href={step.href}
            className="ml-2 whitespace-nowrap font-semibold text-orange-700 hover:underline"
          >
            Przejdź →
          </Link>
        )}
        {step.done && step.key === 'preview' && step.href && (
          <Link
            href={step.href}
            className="ml-2 whitespace-nowrap font-semibold text-orange-700 hover:underline"
          >
            Zobacz podgląd →
          </Link>
        )}
        {step.hint && !step.done && (
          <span className="mt-0.5 block text-xs text-gray-400">{step.hint}</span>
        )}
      </span>
    </li>
  )
}
