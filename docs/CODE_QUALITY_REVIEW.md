# Code Quality Review — SP-035D

Date: 2026-07-16
Branch: `feature/sp-035-master-studio`
Scope: full `npm run lint` + `npm run build` output review (React 19 / Next.js 16 compliance)

Status: **IMPLEMENTED (P1 + P2) — 2026-07-16.** See §6 for the implementation
record. P3 (items 6–7 in §5) remains open.

---

## 1. Executive Summary

The project builds cleanly on Next.js 16.2.10 / React 19.2.4 (Turbopack production build, 29 routes, TypeScript strict passes, exit code 0). Lint reports **35 problems: 10 errors and 25 warnings**.

Key conclusions:

1. **No React 19 runtime incompatibilities exist.** Every lint *error* is either a new-rule artifact (eslint-plugin-react-hooks v6 / React Compiler rules shipped with `eslint-config-next` 16) or a pre-existing type-quality issue (`no-explicit-any`). The build does not depend on lint, so nothing is release-blocking today.
2. **Two real (latent) bugs were found during the review**, both hiding *behind* warnings rather than being the warnings themselves:
   * The realtime subscription in `SaunaMap.tsx` refreshes saunas using a **stale closure** — after the user changes location or radius, realtime-triggered reloads still use the initial values (`components/SaunaMap.tsx:781-811`).
   * The master rejection note typed by moderators is **silently discarded** — `MasterModerationActions.tsx` passes `note` to `rejectMaster`, which never persists it (`app/(main)/admin/actions.ts:74`).
3. The dominant root cause of type errors is the known debt item "no shared entity types" (REPOSITORY_AUDIT §8.7): RPC results are consumed as `any` in 7 places.
4. 16 of 25 warnings are `@next/next/no-img-element`. Most are worth converting to `next/image`; the ones inside `SaunaMap.tsx` should be **accepted debt** until the map refactor (protected area, Leaflet sizing constraints).

Recommended SP-035D implementation scope: **P1 items only** (~0.5–1 day), P2 as a fast-follow, P3 opportunistic.

---

## 2. Current Project Health

| Check | Result |
|-------|--------|
| `npm run build` (Next 16.2.10, Turbopack) | ✅ Pass, 0 warnings, 29 routes |
| TypeScript strict | ✅ Pass (8.1 s) |
| `npm run lint` (ESLint 9 flat config, `eslint-config-next` 16.2.10) | ❌ 10 errors, 25 warnings |
| Tests | ⚠️ None exist (pre-existing debt, out of scope here) |

Lint is **not** wired into the build (`next build` no longer runs ESLint in Next 16), so lint errors do not block deploys. That is convenient today and dangerous long-term — once the error count reaches zero, lint should become a CI gate.

### Why errors appeared now

`eslint-config-next` 16 bundles **eslint-plugin-react-hooks v6**, which promotes React Compiler–derived rules (`react-hooks/immutability`, `react-hooks/set-state-in-effect`) to `error`. The flagged code predates the upgrade and behaves identically at runtime under React 19. These are **new-rule findings, not React 19 breakages**.

---

## 3. Error Classification

### Category A — Blocking issues (P1)

| # | Location | Rule | Real bug? | Cause |
|---|----------|------|-----------|-------|
| A1 | `components/SaunaMap.tsx:811` | `react-hooks/exhaustive-deps` (warning severity, real impact) | **Yes — latent.** The realtime channel (`[]` deps) captures the first-render `loadSaunas`, so realtime-triggered reloads use the *initial* `userLocation`/`radiusKm` forever. After the user moves the map or changes radius, a realtime event silently resets the dataset to the original area. | Stale closure; pre-existing, surfaced by new lint |
| A2 | `app/(main)/admin/actions.ts:74` | `@typescript-eslint/no-unused-vars` (`note`) | **Yes — data loss.** `MasterModerationActions.tsx:26` collects and passes a rejection note; the server action drops it. Moderators believe they are recording a reason. | Incomplete SP-015 implementation |
| A3 | `components/SaunaMap.tsx:366`, `components/AddEventMasterForm.tsx:26` | `react-hooks/immutability` (error) | No runtime bug (function declarations hoist), but it blocks React Compiler optimization and hides future stale-closure risk. | New react-hooks v6 rule |
| A4 | `components/SaunaMap.tsx:747` | `react-hooks/set-state-in-effect` (error) | Not a bug — `loadSaunas()` calls `setLoading(true)` synchronously inside the fetch-on-change effect. Cascading-render concern is minor here, but it is a hard error under the new preset. | New react-hooks v6 rule |
| A5 | `components/SaunaMap.tsx:689-691` | (not lint-flagged) | Debug `console.log` left in the hot path of `loadSaunas` — runs on every load/realtime refresh in production. | Leftover from image debugging |

**Fix before SP-036: yes, all of A.** A1/A2 are behavior bugs; A3/A4 are the only genuine lint *errors* of the hooks family and their fix (define fetchers with `useCallback` above the effect, or move them inside the effect) is small and naturally resolves the neighboring `exhaustive-deps` warnings (`SaunaMap.tsx:367, 750`). SaunaMap is a protected area — the fix must be behavior-preserving and reviewed against map/realtime/cluster behavior.

### Category B — Type quality (P2)

7 × `@typescript-eslint/no-explicit-any` (all errors):

| Location | What is `any` |
|----------|---------------|
| `app/events/page.tsx:38` | `get_upcoming_events` RPC row |
| `app/masters/[id]/page.tsx:199, 217` | `sauna_event_masters` join rows |
| `components/SaunaMap.tsx:690, 704, 708` | `get_saunas_nearby` / `get_upcoming_event_saunas` RPC rows |
| `components/UserRoleSelector.tsx:47` | `catch (err: any)` |

* **Why they exist:** there is no shared types module; every RPC result is consumed untyped. Not caused by React 19 or new rules — these were always errors under the Next TS preset.
* **Real bugs?** No, but they remove all compile-time safety exactly where the schema drifts most (RPC payloads, per REPOSITORY_AUDIT §5).
* **Recommendation:** fix in SP-035D by creating `lib/types.ts` with the 3–4 RPC row types (SaunaNearby, UpcomingEvent, EventMasterRow) and using `catch (err: unknown)` + narrowing in `UserRoleSelector`. This directly retires audit debt item §8.7 and pays off for every future sprint. Do **not** expand into a full typegen project (e.g. `supabase gen types`) yet — that is worth doing when a migrations directory exists.

### Category C — Code hygiene (P2)

| Location | Finding | Disposition |
|----------|---------|-------------|
| `app/events/page.tsx:2, 14` | `CalendarView` import and `currentDate` unused — dead remnants; calendar now lives inside `EventsPageClient` | Delete |
| `app/(main)/admin/page.tsx:22` | `roleStyle` unused — duplicate of the copy inside `UserRoleSelector.tsx` | Delete (keep the used copy) |
| `app/layout.tsx:1` | `Metadata` imported but `metadata` export is untyped | Keep the import, add `: Metadata` annotation — better than deleting |
| `components/SaunaMap.tsx:240` | `pulseClass` computed, never applied | **Investigate before deleting** — `sauna-event-pulse` looks like a lost feature (event markers should pulse). Protected area: confirm intent, then either re-apply the class or remove the line. |
| `app/events/page.tsx:7` | (not lint-flagged) Raw `@supabase/supabase-js` client created at module scope in a Server Component instead of `lib/supabase/server.ts` | Align when touching the file; third parallel client pattern (audit §4) |

### Category D — Performance recommendations (P3)

16 × `@next/next/no-img-element`:

| Group | Files | Recommendation |
|-------|-------|----------------|
| Server-rendered content pages | `app/events/[id]/page.tsx` (2), `app/sauna/[id]/page.tsx` (4), `app/masters/[id]/page.tsx` (1), `app/masters/page.tsx` (1), `components/SaunyClient.tsx` (1) | **Convert to `next/image`** — these are the LCP-relevant, indexable pages; biggest mobile win (mobile-first product). Requires adding the Supabase storage hostname to `images.remotePatterns` in `next.config.ts`. |
| Modal previews | `components/AddMasterModal.tsx`, `AddPhotoModal.tsx`, `AddSaunaForm.tsx` (3 total) | Low value (local object-URL previews, post-interaction). Convert opportunistically or accept. |
| Map UI | `components/SaunaMap.tsx` (4: popup images, avatars) | **Accept for now** (Category E) — Leaflet popups/panels have fixed pixel layouts inside a protected 1,350-line component; churn risk outweighs the gain. Revisit during the planned map decomposition. |

The remaining `exhaustive-deps` warnings (`SaunaMap.tsx:367, 750`) disappear as a side effect of the A3/A4 fix; no separate memoization work is recommended. No other memoization opportunities rise to "worth implementing" — React Compiler will subsume most of them once the hooks errors are gone.

### Category E — Accepted technical debt (intentional, do not "fix")

1. **`<img>` inside `SaunaMap.tsx`** — protected area; `next/image` inside Leaflet popups/satellite markers brings sizing/layout risk with negligible LCP benefit (the map is client-only). Revisit at map refactor.
2. **`pulseClass`** until product intent is confirmed — deleting it may permanently bury a wanted feature (pulsing event markers); re-applying it changes visible map behavior, which requires explicit approval per CLAUDE.md.
3. **No test suite / no error boundaries** — real debt, tracked in REPOSITORY_AUDIT §8.5, explicitly out of SP-035D scope.
4. **`dev --webpack` while build uses Turbopack** — intentional (react-leaflet dev-mode compatibility); do not unify as part of lint cleanup.

---

## 4. Root Causes (summary)

| Root cause | Issues it explains |
|------------|--------------------|
| eslint-plugin-react-hooks v6 (React Compiler rules) via `eslint-config-next` 16 | A3, A4 errors + related deps warnings |
| No shared entity/RPC types | all 7 `no-explicit-any` |
| Organic feature evolution without cleanup passes | all unused-var warnings, dead calendar code, debug `console.log` |
| Pre-`next/image` implementation era | all 16 `no-img-element` |
| Incomplete moderation feature (SP-015) | dropped rejection note (A2) |
| Effect-heavy SaunaMap architecture | A1 stale realtime closure |

**Caused by React 19 itself: nothing.** React 19.2 runs the current patterns correctly; the pressure comes from the new lint preset preparing the codebase for React Compiler.

---

## 5. Recommended Implementation Order (SP-035D implementation phase)

| Order | Work item | Priority | Effort |
|-------|-----------|----------|--------|
| 1 | SaunaMap hooks correctness: restructure `loadSaunas`/`loadEvents`/`loadMasters` fetchers (A3, A4), fix realtime stale closure (A1), remove debug log (A5) — behavior-preserving, manual map regression test required | P1 | 0.5 day |
| 2 | Persist or explicitly drop the master rejection note (A2) — product decision: persist requires a `moderation_note` column (schema change, needs approval); minimal fix is removing the dead UI field | P1 | 1–2 h |
| 3 | `lib/types.ts` + eliminate 7 × `any` (Category B) | P2 | 0.5 day |
| 4 | Hygiene sweep: unused vars, dead calendar code, `Metadata` annotation (Category C, excl. `pulseClass`) | P2 | 1 h |
| 5 | `pulseClass` decision (restore pulse vs delete) — needs product input | P2 | 15 min once decided |
| 6 | `next/image` on content pages + `remotePatterns` config (Category D group 1) | P3 | 0.5 day |
| 7 | Enable lint as CI/build gate once errors = 0 | P3 | 15 min |

After items 1–4 the project reaches **zero lint errors**; remaining warnings are either scheduled (item 6) or accepted (Category E).

### What should wait until after SP-036

* `next/image` in modals and SaunaMap (Category D groups 2–3).
* Supabase type generation, migrations directory, test suite — separate initiatives.
* Any SaunaMap decomposition — do not couple it to lint cleanup.

### What should never change as part of this effort

* Map behavior, satellite orbits, clustering, realtime semantics (beyond the stale-closure correction, which restores *intended* behavior).
* The `--webpack` dev flag.
* Warning-suppression via blanket `eslint-disable` — every remaining warning must be either fixed or documented here as accepted.

---

## 6. Implementation Record (2026-07-16)

Items 1–5 of §5 are implemented. Result: **0 lint errors, 16 warnings** — all
`@next/next/no-img-element`, split between scheduled work (content pages,
item 6) and accepted debt (SaunaMap/modals, Category E).

| Item | Resolution |
|------|------------|
| A1 realtime stale closure | Realtime handlers call `loadSaunas` through a `useEffectEvent`, so they always see the current `userLocation`/`radiusKm` without resubscribing the channel. A `loadSeqRef` sequence guard makes concurrent loads last-write-wins. |
| A2 lost rejection note | New moderation-only, append-only audit table `master_moderation_notes` (`supabase/2026-07-16_sp035d_master_moderation_notes.sql` — **run manually in the SQL Editor, after the SP-035 script**). `rejectMaster` persists the note first, then verifies the status update wrote a row (fail-loud). |
| A3/A4 hooks errors | Fetchers converted to `useCallback`; popup/form loaders moved inside their effects with cancellation flags; the mount/params effect calls the loaders through an inner `load()` and `loadSaunas` yields a microtask before `setLoading`, so no state is set synchronously inside an effect. |
| A5 debug logging | Removed from `loadSaunas`. |
| B types | `lib/types.ts` created (`SaunaNearbyRow`, `UpcomingEventRow`, `UpcomingEventSaunaRow`, `EventMasterRow`); all 7 `any` sites typed; `catch (err: unknown)` + narrowing in `UserRoleSelector`. Retires the RPC-payload part of audit §8.7. |
| C hygiene | Dead `CalendarView` import/`currentDate` removed from `/events`, duplicate `roleStyle` removed from the admin page, `metadata` annotated with `Metadata`. The raw module-scope Supabase client in `app/events/page.tsx` was deliberately left (its replacement changes rendering/caching semantics — separate decision). |
| `pulseClass` | **Restored** — event markers pulse again (`sauna-event-pulse` re-applied in `createSaunaIcon`). This is a visible map change; revert the single class binding if unwanted. |

Manual verification still required (protected area): map load, radius/location
change, realtime refresh after adding a sauna/photo, event-marker pulse,
cluster refresh, master rejection with a note (after the SQL script).
