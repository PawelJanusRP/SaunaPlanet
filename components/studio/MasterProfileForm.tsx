'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { updateOwnMasterProfile, updateOwnMasterIdentity } from '@/app/(main)/studio/actions'
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
      toast.error('Imię i nazwisko nie może być puste')
      return
    }
    if (showNicknameOnly && !nickname.trim()) {
      toast.error('Włączenie trybu pseudonimu wymaga podania pseudonimu')
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
        toast.success(
          'Profil zapisany — wrócił do moderacji i jest tymczasowo niewidoczny publicznie'
        )
      } else {
        toast.success('Profil zapisany')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-500">Imię i nazwisko *</label>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full rounded-xl border px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-gray-400">
          Widoczne publicznie, chyba że włączysz tryb pseudonimu poniżej.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
        <label className="mb-1 block text-xs font-semibold text-gray-500">Pseudonim</label>
        <input
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="np. Mistrz Pary"
          maxLength={60}
          className="w-full rounded-xl border px-3 py-2 text-sm"
        />
        <label className="mt-2 flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={showNicknameOnly}
            onChange={(e) => setShowNicknameOnly(e.target.checked)}
          />
          Pokazuj tylko pseudonim
        </label>
        {showNicknameOnly && (
          <p className="mt-1 text-xs text-gray-500">
            Twoje imię i nazwisko nie będzie widoczne publicznie — wszędzie
            pojawi się pseudonim. Publiczny link profilu użyje identyfikatora,
            aby adres nie zdradzał prawdziwych danych.
          </p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-500">O sobie</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={4}
          placeholder="Krótki opis doświadczenia, specjalizacji..."
          className="w-full rounded-xl border px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-500">
          Adres profilu (publiczny link)
        </label>
        <input
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          onBlur={() => setSlug((s) => (s.trim() ? slugify(s) : ''))}
          placeholder="np. jan-kowalski"
          className="w-full rounded-xl border px-3 py-2 font-mono text-sm"
        />
        <p className="mt-1 text-xs text-gray-400">
          {slug.trim()
            ? `Twój link: sauna-planet.pl/masters/${slugify(slug) || '…'}`
            : 'Małe litery, cyfry i myślniki (3–40 znaków). Bez adresu działa link techniczny.'}
        </p>
        {initial.slug && slugChanged && (
          <p className="mt-1 rounded-lg bg-orange-50 px-2 py-1 text-xs text-orange-700">
            ⚠️ Zmiana adresu sprawi, że dotychczasowy link /masters/{initial.slug} przestanie
            działać.
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">Miasto</label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="np. Poznań"
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">
            Saunuję od roku
          </label>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder="np. 2018"
            min={1980}
            max={new Date().getFullYear()}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-500">Specjalizacje</label>
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
          Języki prowadzenia ceremonii
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
          Profile społecznościowe
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          {SOCIAL_PLATFORMS.map((p) => (
            <input
              key={p}
              type="url"
              value={social[p]}
              onChange={(e) => setSocial((prev) => ({ ...prev, [p]: e.target.value }))}
              placeholder={`${SOCIAL_LABELS[p]} (https://...)`}
              aria-label={`Adres profilu ${SOCIAL_LABELS[p]}`}
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />
          ))}
        </div>
        <p className="mt-1 text-xs text-gray-400">
          Tylko adresy https na właściwej platformie zostaną zapisane.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-500">Strona WWW</label>
        <input
          type="url"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://..."
          className="w-full rounded-xl border px-3 py-2 text-sm"
        />
      </div>

      {demotionWarning && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          ⚠️ Profil jest widoczny publicznie — zapis zmian tymczasowo ukryje go do
          czasu ponownego zatwierdzenia przez moderację.
        </p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {isPending
          ? 'Zapisywanie...'
          : demotionWarning
            ? 'Zapisz (profil wróci do moderacji)'
            : 'Zapisz zmiany'}
      </button>
    </form>
  )
}
