'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  CORRECTION_CATEGORIES,
  categoryAcceptsProposedValue,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_MESSAGE_MIN,
} from '@/lib/feedback/intake'
import { submitFeedbackReport } from '@/app/feedback/actions'

/**
 * SP-042B — facility "report incorrect information" entry (owner decision D1:
 * facility detail page ONLY; the SP-045 map popup stays untouched).
 *
 * The facility identity comes from the page context (server-passed saunaId);
 * the user never selects or types the facility. The name is shown for
 * orientation only — it is never submitted as identity. Mobile-first: the
 * form opens as a bottom sheet on phones, a centered dialog on larger
 * screens.
 */
export default function FeedbackReportButton({
  saunaId,
  saunaName,
  isAuthenticated,
}: {
  saunaId: string
  saunaName: string
  isAuthenticated: boolean
}) {
  const t = useTranslations('feedback')
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState('')
  const [message, setMessage] = useState('')
  const [proposedValue, setProposedValue] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [trap, setTrap] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)

  const showProposed = categoryAcceptsProposedValue(category)

  const close = () => {
    setOpen(false)
    setCategory('')
    setMessage('')
    setProposedValue('')
    setContactEmail('')
    setTrap('')
    setSaving(false)
    setDone(false)
    setErrorText(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return // double-submit guard
    setErrorText(null)

    if (!category) {
      setErrorText(t('form.validation.category-required'))
      return
    }
    if (message.trim().length < FEEDBACK_MESSAGE_MIN) {
      setErrorText(t('form.validation.message-too-short'))
      return
    }

    setSaving(true)
    try {
      const result = await submitFeedbackReport({
        saunaId,
        category,
        message,
        proposedValue: showProposed ? proposedValue : '',
        contactEmail: isAuthenticated ? '' : contactEmail,
        trap,
      })
      if (result.ok) {
        setDone(true)
      } else {
        setErrorText(result.message)
      }
    } catch {
      setErrorText(t('form.errors.unavailable'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
      >
        {t('entry.reportIncorrect')}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('form.title')}
            className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 sm:max-w-lg sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            {done ? (
              <div className="py-4 text-center">
                <div className="mb-2 text-lg font-bold">{t('form.successTitle')}</div>
                <p className="mb-5 text-sm text-gray-600">{t('form.successBody')}</p>
                <button
                  type="button"
                  onClick={close}
                  className="rounded-xl bg-black px-5 py-2.5 text-sm font-medium text-white"
                >
                  {t('form.close')}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <h2 className="text-lg font-bold">{t('form.title')}</h2>
                  <p className="mt-0.5 text-sm text-gray-500">
                    {t('form.facilityLabel')}: <span className="font-medium text-gray-700">{saunaName}</span>
                  </p>
                </div>

                {/* Honeypot — visually hidden, humans never fill it. */}
                <div aria-hidden="true" className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
                  <label>
                    URL
                    <input
                      type="text"
                      name="company_website"
                      tabIndex={-1}
                      autoComplete="off"
                      value={trap}
                      onChange={(e) => setTrap(e.target.value)}
                    />
                  </label>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">{t('form.categoryLabel')}</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    required
                    className="w-full rounded-xl border px-3 py-2.5 text-sm"
                  >
                    <option value="">{t('form.categoryPlaceholder')}</option>
                    {CORRECTION_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {t(`categories.${c}`)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">{t('form.messageLabel')}</label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    required
                    minLength={FEEDBACK_MESSAGE_MIN}
                    maxLength={FEEDBACK_MESSAGE_MAX}
                    rows={4}
                    placeholder={t('form.messagePlaceholder')}
                    className="w-full rounded-xl border px-3 py-2.5 text-sm"
                  />
                </div>

                {showProposed && (
                  <div>
                    <label className="mb-1 block text-sm font-medium">{t('form.proposedLabel')}</label>
                    <input
                      type="text"
                      value={proposedValue}
                      onChange={(e) => setProposedValue(e.target.value)}
                      placeholder={
                        category === 'coordinates'
                          ? t('form.proposedCoordinatesPlaceholder')
                          : t('form.proposedPlaceholder')
                      }
                      className="w-full rounded-xl border px-3 py-2.5 text-sm"
                    />
                    <p className="mt-1 text-xs text-gray-400">{t('form.proposedHint')}</p>
                  </div>
                )}

                {!isAuthenticated && (
                  <div>
                    <label className="mb-1 block text-sm font-medium">{t('form.emailLabel')}</label>
                    <input
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder={t('form.emailPlaceholder')}
                      className="w-full rounded-xl border px-3 py-2.5 text-sm"
                    />
                    <p className="mt-1 text-xs text-gray-400">{t('form.emailHint')}</p>
                  </div>
                )}

                {errorText && (
                  <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{errorText}</p>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {saving ? t('form.sending') : t('form.submit')}
                  </button>
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-xl border px-4 py-2.5 text-sm font-medium"
                  >
                    {t('form.cancel')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
