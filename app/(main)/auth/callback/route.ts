import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { sanitizeReturnPath } from '@/lib/auth/returnPath'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // SP-039 4B: `next` is untrusted input — collapse anything outside the
  // explicit internal allow-list to '/'.
  const next = sanitizeReturnPath(searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=callback`)
}
