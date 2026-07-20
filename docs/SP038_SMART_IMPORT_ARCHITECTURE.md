# SP-038 — Smart Facility Import: Architecture

Status: **Slice 2 implemented** (extraction server action + editable
import preview on `/submit`; Slice 1 delivered the engine library).
Date: 2026-07-20.
Branch: `feature/sp-038-smart-import` (from `main` @ `351d7a2`).

Binding inputs: SP-038 audit report (2026-07-20, approved), approved
product decisions (below), `docs/BACKLOG.md` §SP-038,
`docs/SP036_ARCHITECTURE.md` §1.3 (honest constraints of FB/IG
extraction) and §1.5.2 (image-import security requirements),
`docs/IMPORTS.md` (import safety rules).

---

## 1. Goal

Paste a public facility URL → receive a pre-filled, fully editable
facility submission. The importer is a **prefill layer in front of the
existing SP-036 submission workflow** — it never writes facilities
itself, never bypasses moderation, and never grants any rights. Every
imported facility enters the standard `saunas.status='pending'` queue
through the existing `submitFacility` contract.

## 2. Approved product decisions (Paweł, 2026-07-20)

1. Any authenticated user may import; import grants no permissions and
   always feeds the existing pending-submission workflow.
2. No automatic copying of `og:image` into Storage in the MVP — remote
   image is preview-only. No `sharp` in Slice 1.
3. `opening_hours` approved for the MVP (structured, preferably JSONB
   later). No dedicated `facebook_url` / `instagram_url` columns.
4. Address geocoding is a later best-effort feature, marked `inferred`,
   never blocking. Not in Slice 1.
5. Rate limit for the extraction action: **10 imports / user / rolling
   hour** (enforced in Slice 2 via `import_log`).
6. No raw HTML is ever stored — only normalized extracted fields,
   result metadata and provenance.
7. No Google Places assessment this sprint; Google Maps URLs are
   classified and handled as **unsupported for automatic persistent
   import**.
8. **One `import_log` row per import operation**; Slice 3 links that row
   to the created pending sauna through a controlled RPC (no second log
   row for the same operation).

## 3. Pipeline

```
raw URL
  → normalizeImportUrl()        canonical https URL (pure, no network)
  → classifyImportUrl()         website | facebook_* | instagram_* |
                                google_maps | unsupported
  → provider registry           website → extractFromWebsite()
                                others  → typed 'unsupported-source'
  → safeFetchHtml()             SSRF-guarded fetch (redirects validated,
                                size/time-capped, HTML only)
  → parseHtmlDocument()         SAX metadata scan (no DOM, no scripts)
  → extractBusinessFromJsonLd() best business node (object/array/@graph)
  → buildDraft()                FacilityDraft with per-field provenance
```

Later slices wrap this engine in a rate-limited server action
(Slice 2), persist provenance into `import_log.extracted` and link the
log row to the submission (Slice 3).

## 4. Module map (`lib/import/`)

| Module | Responsibility |
|---|---|
| `types.ts` | `SourceKind`, `ExtractedField` (value/origin/confidence/sourceHint), `FacilityDraft`, `ProviderResult`, `ImportErrorCode` |
| `normalizeUrl.ts` | Canonical URL normalization (pure string work) |
| `classify.ts` | Source-type classification (never implies extractability) |
| `ssrf.ts` | Pure address/target validation (`isPublicAddress`, `validateFetchTarget`) |
| `safeFetch.ts` | Policy loop + pinned-DNS undici transport |
| `htmlMeta.ts` | htmlparser2 SAX scan: title, canonical, meta, JSON-LD blocks, mailto/tel/social links |
| `jsonld.ts` | JSON-LD business extraction (object / array / `@graph`; malformed blocks skipped with warnings) |
| `providers/website.ts` | Official-website provider (merge order: JSON-LD → OG → metadata → conservative HTML) |
| `index.ts` | Engine entry (`extractFacilityFromUrl`) + provider registry |
| `__tests__/` | 53 focused unit tests with deterministic fixtures and a fake transport (no real network/DNS) |

The library is server-only (Node runtime). `safeFetchHtml` throws if it
ever runs in a browser context; raw HTML never leaves the server.

## 5. URL normalization

- https only — `http:` is **rejected, not upgraded** (documented
  decision; the UI will ask for the https address). All other schemes
  (`ftp:`, `javascript:`, `data:`, `mailto:` …) are rejected.
- Embedded credentials rejected; any port other than 443 rejected.
- Hostname lowercased (URL API applies IDN → punycode).
- Fragment removed; tracking params removed (`utm_*`, `fbclid`,
  `gclid`, `gbraid`, `wbraid`, `msclkid`, `igshid`, `mc_cid`, …);
  remaining params kept and sorted for a deterministic canonical form.
- Trailing slash removed on non-root paths.
- **No redirects are followed during normalization** — it is pure
  string work; redirects happen only inside the guarded fetcher.

The canonical form is what Slice 2 logs and what duplicate matching
(`find_similar_saunas` website/source_url arms) will compare against.

## 6. Classification

Kinds: `website`, `facebook_page`, `facebook_post`, `facebook_event`,
`instagram_profile`, `instagram_post`, `google_maps`, `unsupported`.
Facebook hosts (`facebook.com`, `fb.com`, `fb.me`, `fb.watch`) route by
path (`/events/` → event; `posts|permalink.php|story.php|share|photo|
videos|watch|reel` → post; else page). Instagram (`instagram.com`,
`instagr.am`): `/p/`, `/reel/`, `/tv/`, `/stories/` → post; else
profile. Google Maps: `maps.app.goo.gl`, `goo.gl/maps`,
`maps.google.*`, `google.*/maps…`.

Classification is routing only. In Slice 1 every non-website kind
resolves to a typed `unsupported-source` result — nothing is fetched
from Facebook, Instagram or Google Maps. For `import_log.source_kind`,
`facebook_post` maps to `facebook_page`, `instagram_*` to `instagram`,
`google_maps` to `other` until the Slice 3 migration extends the CHECK.

## 7. SSRF threat model and policy (`safeFetch.ts`)

Threats: internal-network reach (RFC1918, link-local), cloud metadata
theft (169.254.169.254, `metadata.google.internal`), DNS rebinding
(public answer at check time, private at connect time), redirect
laundering, memory exhaustion via huge/decompression-heavy responses,
protocol smuggling.

Policy (every rule unit-tested):

1. **Target validation** (`validateFetchTarget`, applied to the initial
   URL *and every redirect hop*): https only, no credentials, port 443
   only, hostname blocklist (`localhost`, `*.localhost`, `*.internal`,
   metadata hostnames), IP-literal hosts validated directly.
2. **Address validation** (`isPublicAddress`): IPv4 — loopback,
   private, link-local, CGNAT, unspecified, documentation,
   benchmarking, multicast, reserved/broadcast all rejected. IPv6 —
   `::`, `::1`, `fc00::/7`, `fe80::/10`, `ff00::/8`, `2001:db8::/32`,
   `100::/64`, NAT64 `64:ff9b::/96` rejected; IPv4-mapped addresses are
   unwrapped and checked against the IPv4 rules. **All** resolved
   addresses must be public (split answers are rejected).
3. **DNS-rebinding prevention by pinning**: the addresses validated in
   step 2 are the addresses the socket connects to — a per-request
   undici `Agent` receives a custom `lookup` that returns only the
   validated list, so no second resolution can swap the target. TLS
   SNI/certificate validation still uses the hostname.
4. **Redirects**: never followed by the transport (`redirect:
   'manual'`); the policy loop validates each hop (scheme, port,
   credentials, host, resolved addresses) with a hard cap (default 3).
5. **Limits**: total deadline 8 s (`AbortSignal.timeout`), decompressed
   body cap 2 MB (streamed count + early `content-length` reject),
   `text/html` / `application/xhtml+xml` only, charset from the
   header with utf-8 fallback.
6. **Error model**: typed, non-sensitive codes
   (`blocked-address`, `invalid-redirect`, `timeout`,
   `response-too-large`, `unsupported-content-type`, `http-status`, …)
   — no internal addresses or stack traces are surfaced.
7. **Not a proxy**: the fetcher is called only by trusted server code;
   raw HTML is parsed server-side and discarded — it is never returned
   to the browser and never persisted (decision 6).

## 8. Parser behavior

All remote content is untrusted data: SAX scan (htmlparser2), no DOM,
no script execution, no rendering. Bounded collection: ≤10 JSON-LD
blocks × ≤200 KB each, text fields capped, ≤20 links per class.

Extraction preference (never inventing values):

1. **JSON-LD** — object, array and `@graph` all supported; malformed
   blocks are skipped with a `malformed-jsonld-block-skipped` warning
   and never fail the import. Business node selection: tier 1
   (LocalBusiness family + `*Business`), tier 2 (Place-like), tier 3
   (Organization); ties broken by filled-field count.
2. **Open Graph** — `og:title`, `og:description`, `og:image`,
   `og:url`, `og:site_name`.
3. **Standard metadata** — `link rel=canonical`, `meta description`,
   `geo.position`/`ICBM`.
4. **Conservative HTML fallbacks** — `<title>`, `mailto:`/`tel:`
   anchors, Facebook/Instagram profile links found on the page.

Coordinates are extracted **only when explicitly present** (JSON-LD
`geo` or geo meta tags), validated to ranges and with `0,0` rejected.
Opening hours become a structured draft
(`{ specifications: [{days, opens, closes}], raw: [strings] }`) —
schema.org day URLs normalized to day names, free-form strings
preserved verbatim for the user to review.

## 9. Provenance and confidence model

Every extracted field is an `ExtractedField`:

```ts
{ value, origin, confidence, sourceHint }
```

- `origin`: `jsonld` | `opengraph` | `metadata` | `html` — the
  mechanism that produced the value. `inferred` (geocoding, Slice 2+)
  and `user` (manual edits, Slice 3) are reserved in the same union so
  the whole lifecycle uses one vocabulary.
- `confidence`: `high` (structured business data), `medium` (page-level
  metadata — describes the page, not necessarily the facility), `low`
  (conservative fallbacks).
- `sourceHint`: exact human-readable pointer (`"og:title"`,
  `"JSON-LD LocalBusiness.name"`, `"tel: link"`) — shown in the
  Slice 2 preview and persisted into `import_log.extracted`.

`ProviderSuccess.result` is `'ok'` when a name was extracted,
`'partial'` otherwise — mapping directly onto `import_log.result`.

## 10. Provider interface — how to add a provider

A provider is one async function
`(normalizedUrl, options) => Promise<ProviderResult>` registered in the
`PROVIDERS` map in `lib/import/index.ts` under its `SourceKind`.
Adding Facebook best-effort in Slice 4 means: one new module in
`lib/import/providers/`, one registry entry, tests. Classification,
normalization, SSRF policy and the draft/provenance model are shared
and stay untouched. Kinds without a provider intentionally resolve to
`unsupported-source` — an explicit product state, not an error.

## 11. Dependencies (Slice 1)

| Package | Why | Why platform APIs are not enough | Notes |
|---|---|---|---|
| `undici` (runtime) | Pinned-DNS connections: `Agent` with a custom `connect.lookup` guarantees the socket uses only pre-validated addresses | Node's global fetch does not expose a supported/typed way to inject a validating lookup into the actual connection (the `dispatcher` RequestInit is untyped/non-standard); hand-rolling node:https + zlib decompression would reimplement HTTP semantics in security-critical code | Maintained by the Node.js core team (it *is* Node's fetch engine); pure JS, no native code |
| `htmlparser2` (runtime) | Forgiving SAX parsing of untrusted real-world HTML | Regex extraction over adversarial HTML is fragile and unsafe; no DOM is built and nothing executes | Powers cheerio; one of the most-downloaded parsers on npm, actively maintained; small dependency tree |
| `vitest` (dev) | Test runner — the repo previously had none | `node --test` cannot resolve the project's extensionless TS imports under `moduleResolution: bundler` without extra loaders | Standard for Vite/Next-era TS projects; dev-only, not shipped |

Explicitly **not** added: `sharp` (decision 2), cheerio/jsdom (DOM not
needed), axios (undici covers it), any headless browser.

## 12. Slice map (approved)

1. **Slice 1 (this document)** — architecture, classification,
   normalization, SSRF-safe fetcher, website provider, parser, tests.
   No UI, no actions, no DB writes.
2. **Slice 2 (implemented — §12a)** — `extractFacilityDraft` server
   action (auth required, 10/h/user rolling rate limit from
   `import_log`, one log row per accepted operation), editable import
   preview on `/submit` with per-field provenance, duplicate candidates
   via `find_similar_saunas`. Geocoding excluded by decision (Slice 3+
   at the earliest, always `inferred`).
3. **Slice 3** — persistence migration (extend `source_kind` CHECK, add
   `import_log.sauna_id` + link RPC, `opening_hours` on `saunas`),
   `submitFacility` extension (phone/email/address/opening hours +
   source metadata, `source='url_import'`), moderation provenance
   display.
4. **Slice 4** — Facebook best-effort OG provider + paste-text
   fallback; explicit unsupported states for Google Maps and Instagram.
5. **Slice 5** — E2E, documentation, closure.

## 12a. Slice 2 implementation — action boundary and preview

### Action boundary

`extractFacilityDraft(url)` (`app/saunas/importActions.ts`) is the only
user-reachable entry to the engine. Orchestration lives in the
dependency-injected core `lib/import/actionCore.ts` (fully unit-tested
without Next/Supabase). Contract:

- authenticated users only (server-side check; UI gating is never the
  authorization boundary);
- URL is normalized and classified **server-side** — the client cannot
  select a provider;
- only the website provider fetches; Facebook / Instagram / Google Maps
  return a source-specific unsupported state with the normalized URL
  preserved, and the manual form stays fully usable;
- raw HTML never leaves the server and is never persisted (decision 6);
  internal SSRF error details (`blocked-address` etc.) are collapsed to
  the generic user-safe `fetch-blocked` code — resolution details stay
  in server logs and `import_log.extracted.errorCode` (moderation-read);
- the action never creates/updates saunas, never uploads images and
  never uses a service-role client.

### Rate-limit semantics (decision 5)

10 accepted operations per authenticated user per **rolling hour**,
counted server-side from the caller's own `import_log` rows
(`created_at >= now() - 1h`; readable under the own-row SELECT policy).
Counted: every accepted operation regardless of result — `ok`,
`partial`, `failed` and `blocked` all write exactly one append-only
`import_log` row. Not counted / not logged: unauthenticated calls,
purely local validation failures (no syntactically valid normalized
https URL was accepted) and rate-limited attempts themselves. If the
count query fails, the action **fails closed** (treats the limit as
exhausted). Known accepted race: check-then-insert is not atomic, so a
parallel burst can slightly exceed 10 — the cap is anti-abuse advisory,
not a billing boundary; Slice 3 may tighten it in the database if ever
needed.

### Import-log record shape

One row per accepted operation: `url` = canonical normalized URL,
`source_kind` = current DB vocabulary (see §6 mapping; the
application-level kind is preserved in `extracted.appSourceKind`),
`result` ∈ ok/partial/failed/blocked, `extracted` = normalized draft
with per-field provenance + warnings + finalUrl (success) or
`{errorCode, httpStatus?}` (failure) — never raw HTML, headers or
network internals. `requested_by` comes from the session; timestamps
come from the database default.

### Transient preview model

Extraction results are transient client state — nothing persists except
the `import_log` audit row. The preview state machine
(`lib/import/previewState.ts`, pure and unit-tested) guarantees: a
second extraction replaces the first cleanly; an older slow response
can never overwrite a newer one (monotonic request tokens); cancel
drops the in-flight response; a preview shown for a different URL than
the current input is labelled as such. Applying the draft to the form
is an explicit user action; "clear" restores the pre-import snapshot of
manual values. Extracted fields with no form input yet (address, phone,
email, country, opening hours, image, social links, source title) are
displayed in an information area and retained in the action result and
`import_log` — never silently discarded (form persistence follows in
Slice 3). The remote `og:image` is rendered as a source preview only —
not copied to Storage, not inserted into `sauna_photos`, not used as
the submitted image (decision 2).

### Deduplication flow

After a successful extraction the action calls `find_similar_saunas`
with the best extracted values (name, coordinates, website, phone) plus
the normalized source URL (matched against `saunas.source_url`).
Results are warn-only: the preview shows "Ten obiekt może już istnieć w
SaunaPlanet." with name, city, pending marker, distance, translated
match reasons and a link for active facilities. Lookup failures degrade
to an empty list. No merging, no update workflow, no overwrite — the
controlled improvement path is SP-042 (§13).

## 13. Extension point: facility data improvement proposals (SP-042)

Out of scope for SP-038, discovered during it (backlog:
`docs/BACKLOG.md` §SP-042). When an import matches an existing facility
but carries newer or more complete data, the long-term answer is a
**controlled improvement proposal** (field-level diffs, provenance,
partial acceptance, managed/unmanaged resolution with platform
moderator override, full audit history) — not a duplicate and not an
overwrite of the active record.

What SP-038 guarantees so that SP-042 can attach later without rework:

* duplicate detection stays **warn-only** and its behavior is
  unchanged — an import matching an existing facility still proceeds
  only as an ordinary pending submission if the user insists;
* every extracted value already carries the `ExtractedField`
  provenance (origin / confidence / source hint) and every operation
  has one `import_log` row — exactly the per-field evidence a future
  proposal needs;
* the importer never writes to active facility records (prefill-only),
  so introducing a proposal path is additive.

No proposal tables, actions or UI are built in SP-038.

## 14. Known limitations (Slice 1)

- `<meta charset>` inside HTML is not honored — only the
  `Content-Type` header charset (utf-8 fallback). Old latin-2 pages
  without a header charset may show mojibake in text fields; the user
  edits everything in the preview anyway.
- `http://`-only facility sites are rejected by design (https-only
  policy); revisit only with an explicit documented exception.
- JSON-LD nodes referenced by `@id` from another node are not
  dereferenced; nested `mainEntity` traversal is limited to top-level /
  array / `@graph` (standard placements cover the vast majority of
  real sites).
- The undici transport path (pinned lookup, TLS) is covered by design
  and by the pure-function tests around it, not by a live-socket test —
  automated tests never touch the network by policy.
- `fb.me` / `goo.gl` short links classify by host; their redirect
  targets are only discovered inside the guarded fetcher (website
  provider is not invoked for them in Slice 1).
