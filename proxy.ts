import createMiddleware from 'next-intl/middleware'
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { routing } from '@/lib/i18n/routing'
import { LOCALES, DEFAULT_LOCALE } from '@/lib/i18n/locales'
import { isBarePath, legacyRedirectPath } from '@/lib/i18n/routingPolicy'

// SP-047 — request proxy (Next.js 16 renamed middleware.ts -> proxy.ts).
//
// Responsibilities, in order:
//   1. Keep infra endpoints (/auth/callback, /claim) UNPREFIXED and stable.
//   2. Permanent-redirect legacy unprefixed content to its Polish equivalent.
//   3. Negotiate locale for '/' and route locale-prefixed URLs (next-intl).
//   4. Refresh the Supabase auth session on every matched request.
//   5. Preserve the SP-039 /admin auth guard (now locale-aware).

const handleI18nRouting = createMiddleware(routing)

/**
 * Refresh the Supabase session and mirror any rotated auth cookies onto the
 * response we are about to return (which may be the next-intl response).
 */
async function withSupabaseSession(
  request: NextRequest,
  response: NextResponse,
): Promise<NextResponse> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // SP-039 admin guard, now locale-aware: /<locale>/admin requires a session.
  const { pathname } = request.nextUrl
  const adminMatch = LOCALES.some(
    (l) => pathname === `/${l}/admin` || pathname.startsWith(`/${l}/admin/`),
  )
  if (adminMatch && !user) {
    const locale = pathname.split('/')[1] || DEFAULT_LOCALE
    return NextResponse.redirect(new URL(`/${locale}/auth/login`, request.url))
  }

  return response
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  // 1. Bare infra endpoints: only refresh the session, never localize.
  if (isBarePath(pathname)) {
    return withSupabaseSession(request, NextResponse.next({ request }))
  }

  // 2. Legacy unprefixed content (all historical URLs were Polish): permanent
  //    308 to the /pl equivalent, preserving path + query. '/' is excluded so
  //    it can negotiate in step 3.
  const legacy = legacyRedirectPath(pathname, search)
  if (legacy) {
    const url = request.nextUrl.clone()
    url.pathname = `/${DEFAULT_LOCALE}${pathname}`
    // search is carried by the cloned URL automatically.
    return NextResponse.redirect(url, 308)
  }

  // 3. Root negotiation ('/' -> temporary 307 to detected locale) and routing
  //    of locale-prefixed URLs, all handled by next-intl.
  const response = handleI18nRouting(request)

  // 4. Layer Supabase session refresh onto the intl response.
  return withSupabaseSession(request, response)
}

export const config = {
  // Skip Next internals, API routes, files with an extension, and generated
  // metadata routes (icon/sitemap/robots/etc. must not be localized/redirected).
  matcher: [
    '/((?!api|_next|_vercel|icon|apple-icon|opengraph-image|twitter-image|sitemap|robots|manifest|favicon|.*\\..*).*)',
  ],
}
