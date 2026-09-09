'use client'

// SP-039 Slice 3B2 — moderator form for prepared pilot profiles.
// Same self-editable field set as the owner Studio form (MasterProfileForm);
// origin/status/user_id/level are NEVER part of the payload — the server
// action and the M1 guard enforce that independently. No invitation controls
// here: generation/sending belongs to Slice 3B3.

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/lib/i18n/navigation'
import { toast } from 'sonner'
import {
  createPreparedMasterProfile,
  updatePreparedMasterProfile,
} from '@/app/[locale]/(main)/admin/masters/pilot/actions'
import { slugify } from '@/lib/master/slug'
import { LANGUAGE_OPTIONS, SPECIALTY_OPTIONS } from '@/lib/master/specialties'
import { SOCIAL_PLATFORMS } from '@/lib/import/social'

const SOCIAL_LABELS: Record<(typeof SOCIAL_PLATFORMS)[number], string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  youtube: 'YouTube',
  tiktok: 'TikTok',
}

export type PilotProfileFormInitial = {
  name: string
  bio: string | null
  slug: string | null
  city: string | null
  specialties: string[] | null
  languages: string[] | null
  experienceSinceYear: number | null
  socialLinks: Record<string, string> | null
  website: string | null
}

const EMPTY_INITIAL: PilotProfileFormInitial = {
  name: '',
  bio: null,
  slug: null,
  city: null,
  specialties: null,
  languages: null,
  experienceSinceYear: null,
  socialLinks: null,
  website: null,
}

export default function PilotProfileForm({
  masterId,
  initial,
}: {
  /** Absent = create mode; present = edit mode for this prepared profile. */
  masterId?: string
  initial?: PilotProfileFormInitial
}) {
  const t = useTranslations('admin.pilotForm')
  const init = initial ?? EMPTY_INITIAL
  const [name, setName] = useState(init.name)
  const [bio, setBio] = useState(init.bio ?? '')
  const [slug, setSlug] = useState(init.slug ?? '')
  const [city, setCity] = useState(init.city ?? '')
  const [year, setYear] = useState(init.experienceSinceYear?.toString() ?? '')
  const [specialties, setSpecialties] = useState<string[]>(init.specialties ?? [])
  const [languages, setLanguages] = useState<string[]>(init.languages ?? [])
  const [social, setSocial] = useState<Record<string, string>>({
    facebook: init.socialLinks?.facebook ?? '',
    instagram: init.socialLinks?.instagram ?? '',
    youtube: init.socialLinks?.youtube ?? '',
    tiktok: init.socialLinks?.tiktok ?? '',
  })
  const [website, setWebsite] = useState(init.website ?? '')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const isEdit = !!masterId

  function toggle(list: string[], value: string, max: number): string[] {
    if (list.includes(value)) return list.filter((v) => v !== value)
    if (list.length >= max) return list
    return [...list, value]
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      toast.error(t('nameRequired'))
      return
    }
    startTransition(async () => {
      const socialLinks: Record<string, string> = {}
      for (const p of SOCIAL_PLATFORMS) {
        if (social[p].trim()) socialLinks[p] = social[p].trim()
      }
      const payload = {
        name,
        bio: bio || null,
        slug: slug.trim() || null,
        city: city || null,
        specialties,
        languages,
        experienceSinceYear: year.trim() === '' ? null : Number(year),
        socialLinks,
        website: website || null,
      }
      const result = isEdit
        ? await updatePreparedMasterProfile(masterId, payload)
        : await createPreparedMasterProfile(payload)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(result.message)
      if (!isEdit && result.masterId) {
        router.push(`/admin/masters/pilot/${result.masterId}`)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-500">{t('nameLabel')}</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl border px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-500">{t('bioLabel')}</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={4}
          placeholder={t('bioPlaceholder')}
          className="w-full rounded-xl border px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-gray-400">
          {t('bioNote')}
        </p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-500">
          {t('slugLabel')}
        </label>
        <input
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          onBlur={() => setSlug((s) => (s.trim() ? slugify(s) : ''))}
          placeholder={t('slugPlaceholder')}
          className="w-full rounded-xl border px-3 py-2 font-mono text-sm"
        />
        <p className="mt-1 text-xs text-gray-400">
          {t('slugNote')}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">{t('cityLabel')}</label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder={t('cityPlaceholder')}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">
            {t('yearLabel')}
          </label>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder={t('yearPlaceholder')}
            min={1980}
            max={new Date().getFullYear()}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-500">{t('specialtiesLabel')}</label>
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
          {t('languagesLabel')}
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
          {t('socialLabel')}
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          {SOCIAL_PLATFORMS.map((p) => (
            <input
              key={p}
              type="url"
              value={social[p]}
              onChange={(e) => setSocial((prev) => ({ ...prev, [p]: e.target.value }))}
              placeholder={t('socialPlaceholder', { platform: SOCIAL_LABELS[p] })}
              aria-label={t('socialAria', { platform: SOCIAL_LABELS[p] })}
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />
          ))}
        </div>
        <p className="mt-1 text-xs text-gray-400">
          {t('socialNote')}
        </p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-500">{t('websiteLabel')}</label>
        <input
          type="url"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder={t('websitePlaceholder')}
          className="w-full rounded-xl border px-3 py-2 text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {isPending
          ? t('saving')
          : isEdit
            ? t('saveChanges')
            : t('createProfile')}
      </button>
    </form>
  )
}
