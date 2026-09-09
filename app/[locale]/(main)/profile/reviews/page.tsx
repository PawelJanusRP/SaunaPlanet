import { redirect } from 'next/navigation'
import { getTranslations, getFormatter } from 'next-intl/server'
import type { useFormatter } from 'next-intl'
import { Link } from '@/lib/i18n/navigation'
import { createClient } from '@/lib/supabase/server'
import WorkspaceShell from '@/components/workspace/WorkspaceShell'
import WorkspaceSection from '@/components/workspace/WorkspaceSection'
import WorkspaceEmptyState from '@/components/workspace/WorkspaceEmptyState'
import {
  PERSONAL_NAV,
  PERSONAL_WORKSPACE_LABEL,
  personalBreadcrumbs,
} from '@/lib/workspace/personal'

function ReviewCard({
  href,
  title,
  rating,
  text,
  createdAt,
  format,
}: {
  href: string
  title: string
  rating: number
  text?: string | null
  createdAt: string
  format: ReturnType<typeof useFormatter>
}) {
  return (
    <Link href={href} className="block rounded-2xl border p-4 transition-colors hover:bg-orange-50">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 font-bold">{title}</p>
        <span className="shrink-0 text-sm font-semibold text-yellow-600">{rating} ★</span>
      </div>
      {text && <p className="mt-1 text-sm text-gray-600">{text}</p>}
      <p className="mt-1 text-xs text-gray-400">{format.dateTime(new Date(createdAt), { dateStyle: 'short' })}</p>
    </Link>
  )
}

export default async function PersonalReviewsPage() {
  const t = await getTranslations('profile')
  const format = await getFormatter()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const [{ data: saunaReviewsRaw }, { data: eventReviewsRaw }] = await Promise.all([
    supabase
      .from('sauna_reviews')
      .select('id, rating, review_text, created_at, sauna_id, saunas(name, city)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('event_reviews')
      .select('id, rating, comment, created_at, event_id, sauna_events(title, event_date)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const saunaReviews = (saunaReviewsRaw ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventReviews = (eventReviewsRaw ?? []) as any[]

  return (
    <WorkspaceShell
      title={PERSONAL_WORKSPACE_LABEL}
      subtitle={t('reviews.subtitle')}
      breadcrumbs={personalBreadcrumbs(t('reviews.breadcrumb'))}
      nav={PERSONAL_NAV}
    >
      <div className="space-y-4 sm:space-y-6">
        <WorkspaceSection title={t('reviews.saunaSection.title')}>
          {saunaReviews.length === 0 ? (
            <WorkspaceEmptyState
              icon="🧖"
              title={t('reviews.saunaSection.emptyTitle')}
              description={t('reviews.saunaSection.emptyDescription')}
              actionHref="/sauny"
              actionLabel={t('reviews.saunaSection.emptyAction')}
            />
          ) : (
            <div className="space-y-3">
              {saunaReviews.map((review) => (
                <ReviewCard
                  key={review.id}
                  href={`/sauna/${review.sauna_id}`}
                  title={review.saunas?.name ?? t('reviews.saunaFallback')}
                  rating={review.rating}
                  text={review.review_text}
                  createdAt={review.created_at}
                  format={format}
                />
              ))}
            </div>
          )}
        </WorkspaceSection>

        <WorkspaceSection title={t('reviews.eventSection.title')}>
          {eventReviews.length === 0 ? (
            <WorkspaceEmptyState
              icon="🔥"
              title={t('reviews.eventSection.emptyTitle')}
              description={t('reviews.eventSection.emptyDescription')}
              actionHref="/events"
              actionLabel={t('reviews.eventSection.emptyAction')}
            />
          ) : (
            <div className="space-y-3">
              {eventReviews.map((review) => (
                <ReviewCard
                  key={review.id}
                  href={`/events/${review.event_id}`}
                  title={review.sauna_events?.title ?? t('reviews.eventFallback')}
                  rating={review.rating}
                  text={review.comment}
                  createdAt={review.created_at}
                  format={format}
                />
              ))}
            </div>
          )}
        </WorkspaceSection>
      </div>
    </WorkspaceShell>
  )
}
