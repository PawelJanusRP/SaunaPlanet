'use client'

// SP-039 Slice 3B3 — invitation management + one-time claim link.
//
// SECRET HANDLING: the claim URL (which embeds the token secret) lives ONLY
// in local React state, set from the immediate create/regenerate response. It
// is never written to any browser storage, cookie or URL, never logged, and
// disappears on close or full page reload. There is no "show again" path —
// the only recovery is an explicit regeneration.
//
// The action-availability flags come from the server (pure evaluator); after
// every mutation the component calls router.refresh() so the authoritative
// server state re-renders — no optimistic transitions.

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/lib/i18n/navigation'
import { toast } from 'sonner'
import {
  generateMasterInvitation,
  markMasterInvitationSent,
  regenerateMasterInvitation,
  revokeMasterInvitation,
} from '@/app/[locale]/(main)/admin/masters/pilot/actions'
import {
  DELIVERY_CHANNEL_LABELS_PL,
  DELIVERY_HINT_EXAMPLES,
  VALID_DAYS_DEFAULT,
  VALID_DAYS_MAX,
  VALID_DAYS_MIN,
  validateDeliveryHint,
  type InvitationActionAvailability,
} from '@/lib/claim/invitationControls'
import { DELIVERY_CHANNELS } from '@/lib/claim/types'

type OneTimeSecret = {
  claimUrl: string
  tokenPrefix: string
  expiresAt: string
  regenerated: boolean
}

type OpenPanel = 'none' | 'generate' | 'sent' | 'revoke' | 'regenerate'

export default function InvitationControls({
  masterId,
  availability,
  latestInvitationId,
}: {
  masterId: string
  availability: InvitationActionAvailability
  latestInvitationId: string | null
}) {
  const t = useTranslations('admin.invitationControls')
  const [panel, setPanel] = useState<OpenPanel>('none')
  const [secret, setSecret] = useState<OneTimeSecret | null>(null)

  const [validDays, setValidDays] = useState(String(VALID_DAYS_DEFAULT))
  const [adminNote, setAdminNote] = useState('')
  const [channel, setChannel] = useState<string>('email')
  const [hint, setHint] = useState('')
  const [revokeReason, setRevokeReason] = useState('')
  const [regenerateReason, setRegenerateReason] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const anyAction =
    availability.canGenerate ||
    availability.canMarkSent ||
    availability.canRevoke ||
    availability.canRegenerate

  function afterMutation() {
    setPanel('none')
    router.refresh()
  }

  function handleGenerate() {
    startTransition(async () => {
      const result = await generateMasterInvitation(
        masterId,
        Number(validDays),
        adminNote || null
      )
      if (!result.ok) {
        toast.error(result.message)
        if (result.code === 'active_invitation_exists' || result.code === 'payload_malformed') {
          router.refresh()
        }
        return
      }
      setSecret({
        claimUrl: result.claimUrl,
        tokenPrefix: result.tokenPrefix,
        expiresAt: result.expiresAt,
        regenerated: false,
      })
      setAdminNote('')
      toast.success(result.message)
      afterMutation()
    })
  }

  function handleMarkSent() {
    const hintCheck = validateDeliveryHint(hint)
    if (!hintCheck.ok) {
      toast.error(hintCheck.message)
      return
    }
    if (!latestInvitationId) return
    startTransition(async () => {
      const result = await markMasterInvitationSent(latestInvitationId, channel, hint || null)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(result.message)
      setHint('')
      afterMutation()
    })
  }

  function handleRevoke() {
    if (!latestInvitationId) return
    if (!revokeReason.trim()) {
      toast.error(t('reasonRequired'))
      return
    }
    startTransition(async () => {
      const result = await revokeMasterInvitation(latestInvitationId, revokeReason)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(result.message)
      setRevokeReason('')
      afterMutation()
    })
  }

  function handleRegenerate() {
    if (!regenerateReason.trim()) {
      toast.error(t('reasonRequired'))
      return
    }
    startTransition(async () => {
      const result = await regenerateMasterInvitation(
        masterId,
        regenerateReason,
        Number(validDays)
      )
      if (!result.ok) {
        toast.error(result.message)
        if (result.code === 'payload_malformed') router.refresh()
        return
      }
      setSecret({
        claimUrl: result.claimUrl,
        tokenPrefix: result.tokenPrefix,
        expiresAt: result.expiresAt,
        regenerated: true,
      })
      setRegenerateReason('')
      toast.success(result.message)
      afterMutation()
    })
  }

  async function handleCopy() {
    if (!secret) return
    try {
      await navigator.clipboard.writeText(secret.claimUrl)
      toast.success(t('linkCopied'))
    } catch {
      toast.error(t('copyFailed'))
    }
  }

  const panelButton = (target: OpenPanel, label: string, className: string) => (
    <button
      type="button"
      disabled={isPending}
      onClick={() => setPanel((p) => (p === target ? 'none' : target))}
      className={`rounded-xl border px-3 py-2 text-sm font-semibold transition disabled:opacity-50 ${className}`}
    >
      {label}
    </button>
  )

  const validDaysInput = (
    <div>
      <label className="mb-1 block text-xs font-semibold text-gray-500">
        {t('validDaysLabel', { min: VALID_DAYS_MIN, max: VALID_DAYS_MAX })}
      </label>
      <input
        type="number"
        min={VALID_DAYS_MIN}
        max={VALID_DAYS_MAX}
        value={validDays}
        onChange={(e) => setValidDays(e.target.value)}
        className="w-28 rounded-xl border px-3 py-2 text-sm"
      />
    </div>
  )

  return (
    <>
      {/* Jednorazowy link */}
      {secret && (
        <section className="mb-4 rounded-3xl border-2 border-orange-300 bg-orange-50 p-5 shadow-sm">
          <h2 className="mb-2 text-sm font-bold text-orange-800">{t('oneTimeLinkHeading')}</h2>
          <p className="mb-3 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-orange-700">
            {t('oneTimeLinkWarning')}
          </p>
          {secret.regenerated && (
            <p className="mb-3 text-xs text-orange-700">
              {t('regeneratedNotice')}
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              readOnly
              value={secret.claimUrl}
              onFocus={(e) => e.target.select()}
              className="w-full rounded-xl border bg-white px-3 py-2 font-mono text-xs"
              aria-label={t('linkAria')}
            />
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white"
            >
              {t('copy')}
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-orange-700">
            <span>
              {t('validUntil', {
                date: new Date(secret.expiresAt).toLocaleString('pl-PL', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              })}
              <code>{secret.tokenPrefix}</code>
            </span>
            <button
              type="button"
              onClick={() => setSecret(null)}
              className="rounded-xl border border-orange-300 px-3 py-1.5 font-semibold"
            >
              {t('close')}
            </button>
          </div>
        </section>
      )}

      {/* Zarządzanie zaproszeniem */}
      <section className="mb-4 rounded-3xl border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-bold">{t('manageHeading')}</h2>

        {!anyAction ? (
          <p className="text-sm text-gray-500">
            {availability.state === 'claimed'
              ? t('claimedNoActions')
              : t('noActions')}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {availability.canGenerate &&
              panelButton('generate', t('generateButton'), 'border-blue-300 text-blue-700 hover:bg-blue-50')}
            {availability.canMarkSent &&
              panelButton('sent', t('markSentButton'), 'border-indigo-300 text-indigo-700 hover:bg-indigo-50')}
            {availability.canRevoke &&
              panelButton('revoke', t('revokeButton'), 'border-gray-300 text-gray-700 hover:bg-gray-50')}
            {availability.canRegenerate &&
              panelButton('regenerate', t('regenerateButton'), 'border-red-300 text-red-700 hover:bg-red-50')}
          </div>
        )}

        {panel === 'generate' && availability.canGenerate && (
          <div className="mt-4 space-y-3 rounded-xl border bg-gray-50 p-4">
            {validDaysInput}
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">
                {t('internalNoteLabel')}
              </label>
              <textarea
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                rows={2}
                className="w-full rounded-xl border px-3 py-2 text-sm"
              />
            </div>
            <p className="text-xs text-gray-500">
              {t('generateHint')}
            </p>
            <button
              type="button"
              disabled={isPending}
              onClick={handleGenerate}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isPending ? t('generating') : t('generate')}
            </button>
          </div>
        )}

        {panel === 'sent' && availability.canMarkSent && (
          <div className="mt-4 space-y-3 rounded-xl border bg-gray-50 p-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">
                {t('channelLabel')}
              </label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="w-full rounded-xl border bg-white px-3 py-2 text-sm sm:w-64"
              >
                {DELIVERY_CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {DELIVERY_CHANNEL_LABELS_PL[c]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">
                {t('hintLabel')}
              </label>
              <input
                type="text"
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                placeholder={DELIVERY_HINT_EXAMPLES[0]}
                className="w-full rounded-xl border px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-gray-400">
                {t('hintNote', { examples: DELIVERY_HINT_EXAMPLES.join(' · ') })}
              </p>
            </div>
            <button
              type="button"
              disabled={isPending}
              onClick={handleMarkSent}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isPending ? t('saving') : t('markSent')}
            </button>
          </div>
        )}

        {panel === 'revoke' && availability.canRevoke && (
          <div className="mt-4 space-y-3 rounded-xl border border-gray-300 bg-gray-50 p-4">
            <p className="rounded-xl bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
              {t('revokeWarning')}
            </p>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">
                {t('reasonLabel')}
              </label>
              <textarea
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                rows={2}
                className="w-full rounded-xl border px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={handleRevoke}
                className="rounded-xl bg-gray-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {isPending ? t('revoking') : t('confirmRevoke')}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => setPanel('none')}
                className="rounded-xl border px-4 py-2 text-sm font-semibold"
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        )}

        {panel === 'regenerate' && availability.canRegenerate && (
          <div className="mt-4 space-y-3 rounded-xl border-2 border-red-300 bg-red-50 p-4">
            <p className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-red-700">
              {t('regenerateWarning')}
            </p>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">
                {t('reasonLabel')}
              </label>
              <textarea
                value={regenerateReason}
                onChange={(e) => setRegenerateReason(e.target.value)}
                rows={2}
                className="w-full rounded-xl border px-3 py-2 text-sm"
              />
            </div>
            {validDaysInput}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={handleRegenerate}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {isPending ? t('generating') : t('confirmRegenerate')}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => setPanel('none')}
                className="rounded-xl border px-4 py-2 text-sm font-semibold"
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  )
}
