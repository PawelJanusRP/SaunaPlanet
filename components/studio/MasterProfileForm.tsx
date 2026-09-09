'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { updateOwnMasterProfile, updateOwnMasterIdentity } from '@/app/[locale]/(main)/studio/actions'
import { slugify } from '@/lib/master/slug'
import { LANGUAGE_OPTIONS, SPECIALTY_OPTIONS } from '@/lib/master/specialties'
import { SOCIAL_PLATFORMS } from '@/lib/import/social'

const SOCIAL_LABELS: Record<(typeof SOCIAL_PLATFORMS)[number], string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  youtube: 'YouTube',
  tiktok: 'TikTok',
}

export type MasterProfileFormInitial = {
  /** Real imię i nazwisko (owner/admin only — never the public projection). */
  fullName: string
  /** Optional pseudonym. */
  nickname: string | null
  /** When true, the public identity everywhere is the pseudonym. */
  showNicknameOnly: boolean
  bio: string | null
  slug: string | null
  city: string | null
  specialties: string[] | null
  languages: string[] | null
  experienceSinceYear: number | null
  socialLinks: Record<string, string> | null
  website: string | null
}

/**
 * Own-profile edit form for the Master Studio (SP-039). Only self-editable
 * fields — level, status, rating and the founding badge belong to
 * moderation and never appear here. The save sends the full visible field
 * set (values present in the form are intentional; blanks clear).
 */
export default function MasterProfileForm({
  initial,
  demotionWarning = false,
}: {
  initial: MasterProfileFormInitial
  /** True when the profile is publicly visible: saving a material change
   *  demotes it to moderation (M10 trigger) — warn BEFORE save. */
  demotionWarning?: boolean
}) {
  const t = useTranslations('studio')
  const [fullName, setFullName] = useState(initial.fullName)
  const [nickname, setNickname] = useState(initial.nickname ?? '')
  const [showNicknameOnly, setShowNicknameOnly] = useState(initial.showNicknameOnly)
  const [bio, setBio] = useState(initial.bio ?? '')
  const [slug, setSlug] = useState(initial.slug ?? '')
  const [city, setCity] = useState(initial.city ?? '')
  const [year, setYear] = useState(initial.experienceSinceYear?.toString() ?? '')
  const [specialties, setSpecialties] = useState<string[]>(initial.specialties ?? [])
  const [languages, setLanguages] = useState<string[]>(initial.languages ?? [])
  const [social, setSocial] = useState<Record<string, string>>({
    facebook: initial.socialLinks?.facebook ?? '',
    instagram: initial.socialLinks?.instagram ?? '',
    youtube: initial.socialLinks?.youtube ?? '',
    tiktok: initial.socialLinks?.tiktok ?? '',
  })
  const [website, setWebsite] = useState(initial.website ?? '')
  const [isPending, startTransition] = useTransition()

  const slugChanged = (initial.slug ?? '') !== slug.trim()

  function toggle(list: string[], value: string, max: number): string[] {
    if (list.includes(value)) return list.filter((v) => v !== value)
    if (list.length >= max) return list
    return [...list, value]
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim()) {
      toast.error(t('masterProfileForm.errorFullNameEmpty'))
      return
    }
    if (showNicknameOnly && !nickname.trim()) {
      toast.error(t('masterProfileForm.errorNicknameRequired'))
      return
    }
    startTransition(async () => {
      // Identity/privacy FIRST (trusted RPC: sets the effective public name,
      // stores the real name privately, drops a real-name slug when private).
      const idResult = await updateOwnMasterIdentity(
        fullName,
        nickname.trim() || null,
        showNicknameOnly
      )
      if (idResult?.error) {
        toast.error(idResult.error)
        return
      }

      const socialLinks: Record<string, string> = {}
      for (const p of SOCIAL_PLATFORMS) {
        if (social[p].trim()) socialLinks[p] = social[p].trim()
      }
      // Rest of the profile (name is owned by the identity RPC above; under
      // privacy the slug stays cleared so the URL can't leak the real name).
      const result = await updateOwnMasterProfile({
        bio: bio || null,
        slug: showNicknameOnly ? null : (slug.trim() || null),
        city: city || null,
        specialties,
        languages,
        experienceSinceYear: year.trim() === '' ? null : Number(year),
        socialLinks,
        website: website || null,
      })
      if (result?.error) {
        toast.error(result.error)
      } else if (demotionWarning) {
        toast.success(t('masterProfileForm.savedDemotedToast'))
      } else {
        toast.success(t('masterProfileForm.savedToast'))
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-500">{t('masterProfileForm.fullNameLabel')}</label>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full rounded-xl border px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-gray-400">
          {t('masterProfileForm.fullNameHint')}
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
        <label className="mb-1 block text-xs font-semibold text-gray-500">{t('masterProfileForm.nicknameLabel')}</label>
        <input
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder={t('masterProfileForm.nicknamePlaceholder')}
          maxLength={60}
          className="w-full rounded-xl border px-3 py-2 text-sm"
        />
        <label className="mt-2 flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={showNicknameOnly}
            onChange={(e) => setShowNicknameOnly(e.target.checked)}
          />
          {t('masterProfileForm.showNicknameOnly')}
        </label>
        {showNicknameOnly && (
          <p className="mt-1 text-xs text-gray-500">
            {t('masterProfileForm.showNicknameOnlyHint')}
          </p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-500">{t('masterProfileForm.bioLabel')}</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={4}
          placeholder={t('masterProfileForm.bioPlaceholder')}
          className="w-full rounded-xl border px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-500">
          {t('masterProfileForm.slugLabel')}
        </label>
        <input
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          onBlur={() => setSlug((s) => (s.trim() ? slugify(s) : ''))}
          placeholder={t('masterProfileForm.slugPlaceholder')}
          className="w-full rounded-xl border px-3 py-2 font-mono text-sm"
        />
        <p className="mt-1 text-xs text-gray-400">
          {slug.trim()
            ? t('masterProfileForm.slugYourLink', { slug: slugify(slug) || '…' })
            : t('masterProfileForm.slugHint')}
        </p>
        {initial.slug && slugChanged && (
          <p className="mt-1 rounded-lg bg-orange-50 px-2 py-1 text-xs text-orange-700">
            {t('masterProfileForm.slugChangeWarning', { slug: initial.slug })}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">{t('masterProfileForm.cityLabel')}</label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder={t('masterProfileForm.cityPlaceholder')}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">
            {t('masterProfileForm.experienceLabel')}
          </label>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder={t('masterProfileForm.experiencePlaceholder')}
            min={1980}
            max={new Date().getFullYear()}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-500">{t('masterProfileForm.specialtiesLabel')}</label>
        <div className="flex flex-wrap gap-2">
          {SPECIALTY_OPTIONS.map((option) => {
            const active = specialties.includes(option.id)
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setSpecialties((prev) => toggle(prev, option.id, 12))}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? 'border-orange-600 bg-orange-600 text-white'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-500">
          {t('masterProfileForm.languagesLabel')}
        </label>
        <div className="flex flex-wrap gap-2">
          {LANGUAGE_OPTIONS.map((option) => {
            const active = languages.includes(option.code)
            return (
              <button
                key={option.code}
                type="button"
                onClick={() => setLanguages((prev) => toggle(prev, option.code, 8))}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? 'border-gray-800 bg-gray-800 text-white'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-500">
          {t('masterProfileForm.socialLabel')}
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          {SOCIAL_PLATFORMS.map((p) => (
            <input
              key={p}
              type="url"
              value={social[p]}
              onChange={(e) => setSocial((prev) => ({ ...prev, [p]: e.target.value }))}
              placeholder={t('masterProfileForm.socialPlaceholder', { platform: SOCIAL_LABELS[p] })}
              aria-label={t('masterProfileForm.socialAriaLabel', { platform: SOCIAL_LABELS[p] })}
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />
          ))}
        </div>
        <p className="mt-1 text-xs text-gray-400">
          {t('masterProfileForm.socialHint')}
        </p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-500">{t('masterProfileForm.websiteLabel')}</label>
        <input
          type="url"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder={t('masterProfileForm.websitePlaceholder')}
          className="w-full rounded-xl border px-3 py-2 text-sm"
        />
      </div>

      {demotionWarning && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {t('masterProfileForm.demotionWarning')}
        </p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {isPending
          ? t('masterProfileForm.saving')
          : demotionWarning
            ? t('masterProfileForm.saveDemoted')
            : t('masterProfileForm.save')}
      </button>
    </form>
  )
}
