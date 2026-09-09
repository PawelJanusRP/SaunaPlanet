import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import WorkspaceShell from '@/components/workspace/WorkspaceShell'
import WorkspaceSection from '@/components/workspace/WorkspaceSection'
import WorkspaceEmptyState from '@/components/workspace/WorkspaceEmptyState'
import {
  PERSONAL_NAV,
  PERSONAL_WORKSPACE_LABEL,
  personalBreadcrumbs,
} from '@/lib/workspace/personal'

export default async function PersonalFavoritesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const { data: favoritesRaw } = await supabase
    .from('user_favorites')
    .select('sauna_id, saunas(id, name, city, cover_image_url)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const favorites = (favoritesRaw ?? []) as any[]

  const favSaunaIds = favorites.map((f) => f.sauna_id).filter(Boolean)
  const { data: favPhotosRaw } = favSaunaIds.length > 0
    ? await supabase
        .from('sauna_photos')
        .select('sauna_id, image_url')
        .in('sauna_id', favSaunaIds)
        .order('created_at', { ascending: true })
    : { data: [] }

  const firstFavPhoto: Record<string, string> = {}
  for (const p of favPhotosRaw ?? []) {
    if (!firstFavPhoto[p.sauna_id]) firstFavPhoto[p.sauna_id] = p.image_url
  }

  return (
    <WorkspaceShell
      title={PERSONAL_WORKSPACE_LABEL}
      subtitle="Sauny, które oznaczyłeś jako ulubione"
      breadcrumbs={personalBreadcrumbs('Ulubione')}
      nav={PERSONAL_NAV}
    >
      <WorkspaceSection title={`♥ Ulubione sauny (${favorites.length})`}>
        {favorites.length === 0 ? (
          <WorkspaceEmptyState
            icon="🧖"
            title="Brak ulubionych saun"
            description="Dodaj sauny do ulubionych na ich stronach, aby mieć je pod ręką."
            actionHref="/sauny"
            actionLabel="Przeglądaj sauny"
          />
        ) : (
          <div className="space-y-3">
            {favorites.map((fav) => {
              const sauna = fav.saunas
              return (
                <Link
                  key={fav.sauna_id}
                  href={`/sauna/${sauna?.id}`}
                  className="flex items-center gap-3 rounded-2xl border p-3 transition-colors hover:bg-orange-50"
                >
                  {(firstFavPhoto[fav.sauna_id] ?? sauna?.cover_image_url) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={firstFavPhoto[fav.sauna_id] ?? sauna.cover_image_url}
                      alt={sauna.name}
                      className="h-14 w-14 shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-2xl">
                      🧖
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-bold leading-tight">{sauna?.name}</p>
                    {sauna?.city && <p className="mt-0.5 text-sm text-gray-500">{sauna.city}</p>}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </WorkspaceSection>
    </WorkspaceShell>
  )
}
