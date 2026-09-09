import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { sanitizeReturnPath } from '@/lib/auth/returnPath'
import { LOCALE_COOKIE } from '@/lib/i18n/routing'
import { DEFAULT_LOCALE, isLocale } from '@/lib/i18n/locales'
import { callbackDestination } from '@/lib/i18n/routingPolicy'

// SP-047 §8: the Supabase callback URL stays UNPREFIXED and stable
// (/auth/callback) so the externally-configured provider redirect never
// changes. Locale is resolved AFTER authentication, here, from the preference
// cookie — the claim deep link keeps its unprefixed token path untouched.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // SP-039 4B: `next` is untrusted input — collapse anything outside the
  // explicit internal allow-list to '/'.
  const next = sanitizeReturnPath(searchParams.get('next'))

  const cookieStore = await cookies()
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value
  const locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${callbackDestination(next, cookieLocale)}`)
    }
  }

  return NextResponse.redirect(`${origin}/${locale}/auth/login?error=callback`)
}
