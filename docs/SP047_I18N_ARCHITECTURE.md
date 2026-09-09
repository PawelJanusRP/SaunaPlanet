# SP-047 — Internationalization & Localization Architecture (PL / EN / DE)

Target multilingual architecture for SaunaPlanet. This is the design we keep as
more languages (Swedish, Finnish, Italian, Spanish, …) are added later: adding a
language is a **catalog task**, not an application-routing refactor.

- Library: **next-intl 4.14** on **Next.js 16.2 App Router** (React 19).
- Initial production locales: **`pl` (default/reference), `en`, `de`**.
- Zero production database migrations.

---

## 1. Locale URL model

Canonical URLs always carry the locale segment:

```
https://sauna-planet.pl/pl/…
https://sauna-planet.pl/en/…
https://sauna-planet.pl/de/…
```

Route segment names AFTER the locale are **stable and never translated**:

```
/pl/masters/jan-kowalski   /en/masters/jan-kowalski   /de/masters/jan-kowalski
/pl/events/<id>            /en/events/<id>            /de/events/<id>
/pl/sauna/<id>             /en/sauna/<id>             /de/sauna/<id>
```

This keeps routing, deep links and future native-app interop simple. Entity
slugs/ids are identical across locales (`/de/masters/jan-kowalski`, never
`/de/saunameister/…`).

`localePrefix: 'always'` (see `lib/i18n/routing.ts`).

## 2. Routing authority

**The URL locale is authoritative.** `/de/masters/x` renders German even if a
cookie says `pl`. The cookie is a *preference* used only to resolve `/` and
non-URL-authoritative contexts — never to override an explicit locale URL.

## 3. Root `/` negotiation

A visit to `/` is negotiated (next-intl middleware) in this order:

1. explicit previously-selected locale in the `NEXT_LOCALE` cookie;
2. supported `Accept-Language`;
3. fallback = **Polish**.

The negotiation redirect is **temporary (307)** so a per-visitor locale is never
cached globally. Query strings are preserved (e.g. `/?sauna=<uuid>` →
`/{detected}/?sauna=<uuid>`).

## 4. Legacy URL compatibility

Every historical unprefixed public URL represented the previous Polish app, so
any non-root, non-locale-prefixed, non-infra path is **permanently (308)**
redirected to its `/pl` equivalent, preserving path + query:

```
/masters/jan-kowalski      → 308 → /pl/masters/jan-kowalski
/events/<id>?x=1           → 308 → /pl/events/<id>?x=1
/sauna/<uuid>              → 308 → /pl/sauna/<uuid>
/help/saunamaster          → 308 → /pl/help/saunamaster
```

The root `/` is intentionally excluded (it negotiates — §3). Logic lives in the
pure, unit-tested `lib/i18n/routingPolicy.ts` (`legacyRedirectPath`).

## 5. Cookie negotiation

- Name: **`NEXT_LOCALE`** (next-intl default), `SameSite=Lax`, ~1 year.
- Written when the user explicitly switches language (language selector) and by
  next-intl during negotiation.
- Server-readable (Server Components rely on the URL segment, not localStorage).

## 6. Auth / callback exceptions (release-critical)

`/auth/callback` and the whole `/claim` subtree are **bare** — they never carry a
locale prefix (`BARE_PREFIXES` in `routingPolicy.ts`). Reasons:

- **`/auth/callback`** is the externally-configured Supabase provider redirect
  URL. It must not change. Locale is resolved **after** authentication, in the
  route handler, from the `NEXT_LOCALE` cookie (default `pl`), and only then does
  it redirect into `/{locale}/…`. Claim deep links passed as `next` keep their
  bare token path.
- **`/claim/master/<token>`** — invitations already sent during SP-039P use the
  unprefixed path, and `next.config.ts` sets `Referrer-Policy: no-referrer` +
  `X-Robots-Tag: noindex` on `/claim/:path*`. Moving it under `[locale]` would
  break both. The claim subtree has its own root layout
  (`app/(bare)/claim/layout.tsx`) that resolves the display locale from the
  cookie (preference), while the URL/token stay untouched.

`CLAIM_PUBLIC_ORIGIN` and `CLAIM_ROUTE_PREFIX = '/claim/master/'` are unaffected
(claim stays bare).

## 7. App directory structure (multi-root layout)

```
app/
  [locale]/
    layout.tsx            ← root layout for the localized app: <html lang={locale}>,
                            providers, NextIntlClientProvider, localized metadata
    page.tsx              ← map home
    about/ events/ masters/ sauna/ sauny/
    (main)/               ← navbar-wrapped app: admin, auth (login/register/…),
                            profile, studio, submit, workspace, help
  (bare)/
    claim/
      layout.tsx          ← separate root layout (<html lang> from cookie)
      master/[token]/page.tsx
  auth/callback/route.ts  ← bare, stable Supabase callback (route handler)
  sitemap.ts  robots.ts  icon.tsx  globals.css
```

There is **no** `app/layout.tsx`: two root layouts (`[locale]` and
`(bare)/claim`) each render `<html lang>` so the correct language ships on the
first SSR response (never patched client-side).

## 8. Catalog structure

```
messages/
  pl/  common.json nav.json about.json map.json sauna.json masters.json
       events.json auth.json profile.json claim.json studio.json workspace.json
       help.json admin.json errors.json metadata.json
  en/  … (same namespaces)
  de/  … (same namespaces)
```

- Domain-oriented namespaces (not route-file-oriented) so the same catalogs can
  be reused by the future SP-030 Expo/React Native client.
- One namespace structure across every locale (enforced by the parity test).
- `lib/i18n/messages.ts` composes namespaces per locale; `NAMESPACES` is the
  single list. Components consume semantic keys via
  `useTranslations('<ns>')` (client) / `getTranslations('<ns>')` (server).
- Keys are **semantic** (`map.search`, `master.profile.edit`), never full
  sentences.

## 9. Translated vs untranslated content boundary

**Translated (platform-controlled UI):** labels, buttons, placeholders,
headings, empty/loading/error states, toasts, aria-labels, metadata, status
*labels*.

**NOT translated (user/entity content):** sauna names, master public
names/pseudonyms, event titles/descriptions, facility descriptions, bios,
reviews, comments, arbitrary user text. Changing UI locale **never** rewrites
database records; the original author text stays authoritative. On-demand
translation of user content is a possible future feature (§12).

## 10. Domain code vs presentation label

Database values stay **canonical codes**; only presentation is localized:

```
DB:  status = 'pending'
UI:  pl → Oczekuje   en → Pending   de → Ausstehend
```

Never `pending_pl` / duplicated per-locale rows, and never branch logic on a
localized string:

```
// BAD                          // GOOD
if (status === 'Oczekuje')      if (status === 'pending') render t('status.pending')
```

Map-mode and category codes (`public_sauna`, `spa`, …) follow the same rule.

## 11. Formatting (date / time / number / currency / plural)

- `timeZone: 'Europe/Warsaw'` set in `lib/i18n/request.ts`; formatting only —
  stored timestamps and event semantics are unchanged.
- Region tags for `Intl`: `pl-PL`, `en-GB`, `de-DE` (`INTL_LOCALE` in
  `locales.ts`). Use next-intl's `useFormatter()` / `format.dateTime`.
- Pluralization uses **ICU MessageFormat** (Polish one/few/many/other; EN & DE
  one/other). Example: `map.popup.reviewsCount`.

## 12. Future dynamic (editorial) content extension point

Long, admin-editable platform copy (e.g. the `/about` changelog) is authored
content and stays in its authored language for now. If runtime-editable
multilingual copy is needed later, add a `content_translations` table
(`content_key, locale, title, body, updated_at`) — **deferred**; ordinary
interface strings (Save/Cancel/Search/…) always stay in the versioned catalogs,
never in Supabase. SP-047 introduces **no** DB table for this.

## 13. SEO model

- `metadataBase = https://sauna-planet.pl` + localized `<title>`/description +
  OpenGraph in the `[locale]` layout (`generateMetadata`).
- `hreflang` alternates + self-canonical per locale via
  `localizedAlternates()` in `lib/i18n/seo.ts`; entity/sub-pages set their own
  alternates with the same (untranslated) slug across locales, plus `x-default`
  (Polish).
- `app/sitemap.ts` — multilingual sitemap (each public route × locale with
  hreflang alternates). `app/robots.ts` points at it and keeps
  `/claim`, `/auth`, `/{locale}/admin` out of crawlers.
- `<html lang>` is correct on first SSR response per locale.

## 14. Native-app compatibility (SP-030)

Domain-namespaced catalogs and semantic keys are framework-agnostic JSON, so an
Expo/React Native client can reuse `messages/**` (or a synced subset) directly.
Keys are not coupled to Next.js page filenames.

## 15. Fallback & missing-key behaviour

- Reference language = Polish; supported locales ship complete catalogs.
- Missing file → deterministic fallback to Polish (`messages.ts`), with a dev
  warning.
- Missing key → `getMessageFallback` shows a `⟦namespace.key⟧` marker in
  development and an empty string in production (users never see raw keys).
- CI parity test (`lib/i18n/__tests__/catalogParity.test.ts`) fails the build if
  any locale/namespace key set drifts.

---

## 16. How to add a future language (worked example: Swedish `sv`)

Adding Swedish must NOT require copying pages, changing the DB, rewriting routes,
or adding `if (locale === 'sv')` branches. Steps:

1. **Registry** — add `'sv'` to `LOCALES` in `lib/i18n/locales.ts` and its
   `LOCALE_LABELS` (`Svenska`), `HTML_LANG` (`sv`), `INTL_LOCALE` (`sv-SE`).
2. **Catalogs** — create `messages/sv/` with the same namespaces as
   `messages/pl/` and translate the values (start by copying `pl` or `en`).
3. **Translate** — fill in `messages/sv/*.json` (glossary: extend
   `docs/SP047_TERMINOLOGY.md` with the `sv` column).
4. **Selector** — nothing to do: the language selector renders every entry in
   `LOCALES` automatically.
5. **SEO/sitemap** — nothing to do: hreflang alternates and the sitemap iterate
   `LOCALES` automatically.
6. **Gates** — run `npm run lint && npm test && npm run build`. The catalog
   parity test enforces that `sv` has every key; fix any gaps; QA layouts.

Everything else (routing, negotiation, legacy redirects, `<html lang>`, metadata)
derives from the registry — no code changes.

---

## 17. Known remaining work (post-RC follow-ups)

The RC localizes the entire UI surface (all pages, forms and modals) in PL/EN/DE.

**Completed since the first RC** (no longer Polish-only):

- Server-side i18n now works in Server Actions — `lib/i18n/request.ts` resolves
  the locale from the `NEXT_LOCALE` cookie when there is no `[locale]` segment.
- All **direct** server-action user-visible messages localized (studio, events +
  participation, admin + pilot, saunas + import, profile).
- Workspace/Master/Personal/Owner **side-navigation** labels → `labelKey` +
  `t()` (nav catalog).
- **Presentation status labels** (master / affiliation / participation) → studio
  catalog; **specialty & language** labels → common catalog.

**Done in SP-047E1** — the security/behaviour-sensitive pure-lib **messages** are
now localized at the presentation boundary (the pure libs keep their canonical
codes and PL reference maps unchanged; components/actions resolve the message
from the stable code via next-intl):

- claim invitation results (`claim.results` / `claim.invitationExtra`),
- public claim states & results (`claim.publicState` / `claim.publicResult`),
- publication transition messages + missing-field labels (`publication.*`),
- import result/error + image-import messages (`sauna.import.results` /
  `sauna.import.imageResults`).
Message-mapping is covered by `lib/i18n/__tests__/e1MessageMapping.test.ts`; all
claim/publication security & behaviour contracts stay green (the direct-action
behavioural test stubs next-intl's `getTranslations` and asserts the CODE, not
the wording).

**Done in SP-047E2** — the remaining user-visible presentation labels are now
localized at the boundary (pure libs keep their PL reference maps unchanged);
plus a global Help hub:

- validation/profile (`common.validation.*`, resolved from a stable
  `ProfileValidationCode` / `HintValidationCode`),
- onboarding & completeness (`studio.firstSteps.steps|hints|progress`,
  `studio.completeness.*`),
- publication-view status labels/hints & not-approved guidance
  (`publication.statusLabels|statusHints|notApprovedGuidance`),
- pilot readiness/filter/required-field/invitation-status labels
  (`admin.pilot.*`),
- help support copy (`help.support.*`) and workspace breadcrumb roots
  (`nav.destinations.*` via `WorkspaceBreadcrumb.labelKey`).
- **Global Help hub** at `/{locale}/help` linking to the sauna-master help, with
  a **Help** entry in the shared drawer (`nav.help`, `CircleHelp` icon).

**Done in SP-047E3** (locale formatting + international SEO):

- **Date/number formatting** — all user-visible `toLocaleDateString('pl-PL')` /
  `toLocaleString('pl-PL')` replaced with the next-intl formatter
  (`getFormatter()` / `useFormatter()`), so dates render per the active locale.
- **Currency** — event prices localized via `lib/i18n/formatPrice.ts`
  (`formatEventPrice`): clean-numeric prices → `Intl` PLN in the active locale
  (`50,00 zł` / `PLN 50.00` / `50,00 PLN`); free-text prices pass through
  unchanged (no conversion, no guessing). Source currency stays PLN.
- **International SEO** — per-locale self-canonical + pl/en/de `hreflang`
  alternates via `generateMetadata` on public pages (home layout, `/masters`,
  `/masters/[idOrSlug]`, `/events`, `/events/[id]`, `/sauna/[id]`, `/sauny`,
  `/about`, `/help`, `/help/saunamaster`). Entity slugs/ids are never translated;
  language variants map to the SAME entity. Non-public/unpublished entities are
  `noindex` (SP-044 preserved). Localized OpenGraph on detail pages.
- **x-default** = the negotiating root `https://sauna-planet.pl/` (never `/pl`),
  in both `localizedAlternates` and the sitemap (SP-047 §8).
- **Sitemap** — `app/sitemap.ts` lists platform-controlled public routes × locale
  with hreflang (incl. `/help`, `/help/saunamaster`); sensitive areas excluded.
  Dynamic entity enumeration is intentionally NOT included (safe per-entity
  public-only projection deferred to avoid exposing unpublished/private records;
  detail pages still carry their own canonical + hreflang).
- **robots.ts** — disallows `/claim`, `/auth`, and the private per-locale areas
  (`admin`, `profile`, `workspace`, `studio`).

There is **no known accidental Polish-only user-visible UI** remaining. The only
Polish literals left in `app/`/`components/` are a persisted `author_name`
fallback (stored data) and a developer `console.warn` (not UI).
4. **Locale-aware date formatting** — a few pages still call
   `toLocaleDateString('pl-PL', …)` / date-fns `pl`. Switch to
   `useFormatter()` / `getFormatter()`.
5. **Per-entity `hreflang`** — detail pages inherit the layout's home-path
   alternates; add per-page `generateMetadata` with `localizedAlternates(locale,
   '/masters/<slug>')` using the untranslated slug.
6. **Manual QA matrix** (SP-047 §29/§33) across PL/EN/DE × the required
   viewports — to be done on the Vercel Preview by the owner.
