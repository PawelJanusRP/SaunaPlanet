// SP-047 — locale-aware navigation helpers.
//
// Use these EVERYWHERE instead of `next/link` / `next/navigation` for internal
// app navigation. They automatically prepend the active locale, so a <Link
// href="/masters"> from /de renders /de/masters and language is preserved
// across navigation.
//
// Infrastructure endpoints that must stay unprefixed (`/auth/callback`,
// `/claim/...`) intentionally keep using next/navigation — see the i18n
// architecture doc.

import { createNavigation } from 'next-intl/navigation'
import { routing } from './routing'

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing)
