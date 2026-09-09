import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/lib/i18n/navigation'
import SupportNotice from '@/components/help/SupportNotice'
import { localizedAlternates } from '@/lib/i18n/seo'
import type { Locale } from '@/lib/i18n/locales'

// SP-039P0 / SP-039H Layer 3 — the public saunamaster Quick Start page.
// Public by design: it contains nothing non-public, is safe to send BEFORE
// login, and never shows account-specific data. Content terminology reuses
// the shared publication vocabulary — SP-047E2 resolves the status labels and
// hints from the stable code via the `publication` next-intl catalog
// (statusLabels.* / statusHints.*), so there are no parallel status labels.
// Authoritative content source: docs/SP039H_SAUNAMASTER_ONBOARDING_HELP.md.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'help.saunamaster' })
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: localizedAlternates(locale as Locale, '/help/saunamaster'),
  }
}

function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="mb-2 text-lg font-bold">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-gray-700">{children}</div>
    </section>
  )
}

const TOC_IDS = [
  'przejecie',
  'konto',
  'studio',
  'wizytowka',
  'publikacja',
  'statusy',
  'wydarzenie',
  'obiekty',
  'pomoc',
  'bezpieczenstwo',
] as const

export default async function SaunamasterQuickStartPage() {
  const t = await getTranslations('help.saunamaster')
  // SP-047E2: status labels/hints resolved from the stable code via next-intl.
  const tp = await getTranslations('publication')
  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:py-8 print:max-w-none">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="mt-2 text-sm leading-relaxed text-gray-600">
        {t('intro')}
      </p>

      <nav aria-label={t('tocLabel')} className="mt-4 rounded-2xl border bg-gray-50 p-4 print:hidden">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-400">
          {t('tocHeading')}
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {TOC_IDS.map((id) => (
            <li key={id}>
              <a href={`#${id}`} className="text-orange-700 hover:underline">
                {t(`toc.${id}`)}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-8 space-y-8">
        <Section id="przejecie" title={t('przejecie.title')}>
          <p>
            {t('przejecie.p1')}
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>{t('przejecie.step1')}</li>
            <li>{t('przejecie.step2')}</li>
            <li>
              {t('przejecie.step3Prefix')}<strong>{t('przejecie.step3Cta')}</strong>{t('przejecie.step3Suffix')}
            </li>
          </ol>
          <p>
            <strong>{t('przejecie.importantLabel')}</strong> {t('przejecie.importantMiddle')}<strong>{t('przejecie.importantBold')}</strong>{t('przejecie.importantSuffix')}
          </p>
          <p>
            {t('przejecie.linkKey')}
          </p>
        </Section>

        <Section id="konto" title={t('konto.title')}>
          <p>
            {t('konto.p1')}
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>{t('konto.step1')}</li>
            <li>{t('konto.step2')}</li>
          </ol>
        </Section>

        <Section id="studio" title={t('studio.title')}>
          <p>
            {t('studio.p1')}
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>{t('studio.step1')}</li>
            <li>{t('studio.step2Prefix')}<strong>{t('studio.step2Bold')}</strong>{t('studio.step2Suffix')}</li>
            <li>
              {t('studio.step3Prefix')}
              <Link href="/studio" className="text-orange-700 hover:underline">
                /studio
              </Link>
              {t('studio.step3Suffix')}
            </li>
          </ol>
          <p>
            {t('studio.note')}
          </p>
        </Section>

        <Section id="wizytowka" title={t('wizytowka.title')}>
          <p>
            {t('wizytowka.p1Prefix')}<strong>{t('wizytowka.p1Bold')}</strong>{t('wizytowka.p1Suffix')}
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>{t('wizytowka.req1')}</li>
            <li>{t('wizytowka.req2')}</li>
            <li>{t('wizytowka.req3')}</li>
            <li>{t('wizytowka.req4')}</li>
            <li>{t('wizytowka.req5')}</li>
          </ul>
          <p>
            {t('wizytowka.recommended')}
          </p>
        </Section>

        <Section id="publikacja" title={t('publikacja.title')}>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              <strong>{t('publikacja.previewLabel')}</strong> {t('publikacja.previewText')}
            </li>
            <li>
              <strong>{t('publikacja.submitLabel')}</strong> {t('publikacja.submitText')}
            </li>
            <li>
              <strong>{t('publikacja.moderationLabel')}</strong> {t('publikacja.moderationText')}
            </li>
            <li>
              <strong>{t('publikacja.publicationLabel')}</strong> {t('publikacja.publicationText')}
            </li>
          </ol>
          <p>
            <strong>{t('publikacja.noticeLabel')}</strong> {t('publikacja.noticeText')}
          </p>
        </Section>

        <Section id="statusy" title={t('statusy.title')}>
          <ul className="space-y-2">
            {(
              [
                'draft',
                'submitted',
                'changes_requested',
                'published',
                'suspended',
              ] as const
            ).map((status) => (
              <li key={status} className="rounded-xl bg-gray-50 px-3 py-2">
                <p className="font-semibold text-gray-800">
                  {tp.has(`statusLabels.${status}`)
                    ? tp(`statusLabels.${status}`)
                    : status}
                </p>
                <p className="mt-0.5 text-gray-600">
                  {tp.has(`statusHints.${status}`)
                    ? tp(`statusHints.${status}`)
                    : status}
                </p>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="wydarzenie" title={t('wydarzenie.title')}>
          <p>
            {t('wydarzenie.p1')}
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>{t('wydarzenie.step1Prefix')}<strong>{t('wydarzenie.step1Bold')}</strong>{t('wydarzenie.step1Suffix')}</li>
            <li>{t('wydarzenie.step2')}</li>
            <li>
              {t('wydarzenie.step3Prefix')}<strong>{t('wydarzenie.step3Facility')}</strong>{t('wydarzenie.step3Middle')}
              <strong>{t('wydarzenie.step3Name')}</strong>{t('wydarzenie.step3Middle2')}<strong>{t('wydarzenie.step3Date')}</strong>{t('wydarzenie.step3Suffix')}
            </li>
            <li>{t('wydarzenie.step4')}</li>
          </ol>
          <p>
            {t('wydarzenie.affiliation')}
          </p>
          <p>
            {t('wydarzenie.reservations')}
          </p>
          <p>
            <strong>{t('wydarzenie.correctionLabel')}</strong> {t('wydarzenie.correctionText')}
          </p>
        </Section>

        <Section id="obiekty" title={t('obiekty.title')}>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>{t('obiekty.managedLabel')}</strong>{t('obiekty.managedText')}
            </li>
            <li>
              <strong>{t('obiekty.unmanagedLabel')}</strong>{t('obiekty.unmanagedText')}
            </li>
          </ul>
          <p>
            {t('obiekty.visibility')}
          </p>
        </Section>

        <Section id="pomoc" title={t('pomoc.title')}>
          <SupportNotice />
        </Section>

        <Section id="bezpieczenstwo" title={t('bezpieczenstwo.title')}>
          <ul className="list-disc space-y-1 pl-5">
            <li>{t('bezpieczenstwo.rule1')}</li>
            <li>{t('bezpieczenstwo.rule2')}</li>
            <li>{t('bezpieczenstwo.rule3')}</li>
            <li>{t('bezpieczenstwo.rule4')}</li>
          </ul>
        </Section>
      </div>
    </main>
  )
}
