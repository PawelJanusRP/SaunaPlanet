# SP-036 Test Matrix — Facility Submission Workflow (slice 1)

Status legend: ✅ verified · 🔶 verified at the RLS boundary, app-path manual
check pending · ⏳ requires an authenticated session (manual, see steps).

The repository has no automated test infrastructure (docs/CURRENT_STATE.md);
per the SP-036 brief this documented matrix is the verification artifact.
RLS-boundary items were verified against the live database on 2026-07-18
via direct PostgREST calls with the anon key (script:
`scratchpad/smoke-anon.mjs`, results S1–S18 in the session log); the
boundary — not the UI — is the security control, so an RLS-verified item
cannot be bypassed by any client.

| # | Case | Boundary | Status | Evidence / manual steps |
|---|---|---|---|---|
| 1 | Anonymous user cannot submit a facility | RLS INSERT | ✅ | S3/S4: anon POST `saunas` (active AND pending) → 42501. UI additionally shows a login prompt (AddSaunaForm) / redirects (`/submit`) |
| 2 | Ordinary user's submission is created as `pending` only | RLS INSERT + action | 🔶 | RLS WITH CHECK forces `status='pending'` for non-moderation (V1 policy inventory); `submitFacility` never sends another status for non-moderation. Manual: submit via map form as a regular user → row has `status='pending'` |
| 3 | Client cannot choose `active`/`rejected`/other status | RLS INSERT | ✅ | S3: direct insert with `status='active'` as non-moderation → 42501 (policy allows only `pending`); the action does not accept a status parameter at all |
| 4 | User cannot override `created_by` | RLS INSERT | ✅ | WITH CHECK requires `created_by = auth.uid()` (V1); a spoofed uuid fails the policy; the action always sets the session user |
| 5 | Sixth open submission rejected clearly | trigger + action | ⏳ | Manual: as one user create 5 pending submissions → 6th shows "Masz już 5 zgłoszeń…" (friendly pre-check) ; direct API 6th insert → same trigger message (guard_sauna_submission_cap, advisory-locked) |
| 6 | Submission creates no `sauna_managers` row | code review | ✅ | `submitFacility` writes only to `saunas`; no trigger writes to `sauna_managers` (V4 trigger inventory: saunas_guard, saunas_submission_cap, sauna_events_guard only) |
| 7 | Pending facility hidden from public reads | RLS SELECT | 🔶 | Policy: `status='active' OR created_by=auth.uid() OR is_platform_moderator()` (V1). Live probe currently shows 0 pending rows (S1: 215×active). Manual after first real submission: anon GET `saunas?status=eq.pending` → 0 rows; map RPC filters `active` |
| 8 | Submitter can read their own pending facility | RLS SELECT | ⏳ | Manual: after submitting, the "Twoje zgłoszenia" section on `/submit` lists the pending row |
| 9 | Another ordinary user cannot read it | RLS SELECT | ⏳ | Manual: second non-moderation account, GET `saunas?id=eq.<pending-id>` → 0 rows |
| 10 | Admin/moderator can read it | RLS SELECT | ⏳ | Manual: admin panel → Sauny tab lists the pending row with an "Oczekuje" chip |
| 11 | Public map and facility pages unaffected | RPC/read | ✅ | S14: `get_saunas_nearby` returns rows; S1/S2: 215 saunas / 10 events untouched; S15: /masters source query returns 8 |
| 12 | Legacy `sauna_submissions` receives no new writes | code review | ✅ | The only writer (`SubmitSaunaForm`) now calls `submitFacility`; `approveSubmission`/`rejectSubmission` only move existing rows (1 approved, 0 pending — 2026-07-18 census) |
| 13 | No raw PG/policy/trigger/function names in user-facing errors | action | ✅ | `translateDbError`: own trigger message passes through (user-oriented), RLS/permission errors map to a generic message, unknown errors log server-side and return a generic message |
| 14 | Photo upload to own pending submission works; imported stays impossible from client | RLS INSERT | ⏳/✅ | Manual: map-form submission with photo → photo row created. Client `source='imported'` insert → blocked (policy pins `source='user'`; verified in policy inventory V1) |
| 15 | Duplicate warning shows candidates, never blocks | action + UI | 🔶 provisional | pg_trgm confirmed in `extensions` (V5 ✅); direct `similarity()` run confirmed (Termy Maltańskie 0.708). Full V7 through `find_similar_saunas` as an authenticated user still pending — the UI degrades to "no warnings" on RPC failure and never blocks submission |

## Slice 2 — facility moderation manual checklist

Prerequisite: at least one pending submission exists (create one as a
regular user via the map form or /submit).

| # | Case | Steps | Expected |
|---|---|---|---|
| M1 | Pending list | Admin → Sauny tab | Pending submissions appear FIRST, highlighted, with submitter name, date, coordinates, description; tab label shows "· N oczekuje"; header badge includes pending facilities |
| M2 | Approve | Click "Zatwierdź" on a pending entry | Toast "Obiekt zatwierdzony"; entry loses pending state; sauna appears on the map/`/sauny`; submitter sees "Zatwierdzona" chip on /submit |
| M3 | Reject | Click "Odrzuć" on a pending entry | Toast "Zgłoszenie odrzucone"; sauna never appears publicly; submitter sees "Odrzucona" chip on /submit |
| M4 | Bundled event activation | (Requires slice 3+ bundled submission; until then verify via SQL: pending sauna + bundled pending event) → approve | Approve toast reports "aktywowano eventy: N"; only bundled, non-expired events of approved masters activate; ordinary pending events untouched |
| M5 | Unauthorized access | Open /admin as regular user / anon | Redirect away (existing admin gate); calling approveFacility/rejectFacility directly → "Brak uprawnień"; RPC as anon → permission denied (S13 ✅) |
| M6 | Duplicate warning visibility | Submit a near-duplicate of an existing sauna, open admin | Pending entry shows "⚠️ Możliwe duplikaty" with names + match reasons; active duplicates link to their pages; decision stays manual (no auto-action exists) |

## SP-037B slice 2 — regression steps (added after the 2026-07-19 E2E defects)

| # | Case | Steps | Expected |
|---|---|---|---|
| R1 | Dashboard shows the event immediately after creation | Studio → Moje wydarzenia → create an event → modal closes | The list re-renders at once (router.refresh); the event appears in "Nadchodzące wydarzenia" (unmanaged: 📣 Organizator chip) or "Oczekujące" (managed: proposal chip) without a manual reload |
| R2 | Organizer events never depend on the participation pair | (admin) delete the organizer's `sauna_event_masters` row for a test event; reload /studio/events | The event STILL shows, exactly once, as an organizer entry (synthesized from `organizer_master_id`) |
| R3 | Satellite avatar rule (documented) | Create a master event at an unmanaged facility with a master WITHOUT an avatar → check the map → then upload an avatar in Studio → Profil → recheck | No satellite before (documented rule: KNOWN_ISSUES "Sauna Master Satellite System" — `avatar_url` required; the map RPC DOES return the master); satellite appears after the avatar upload, same time-window rules as other masters |
| R4 | Lineup does not require an avatar | Event page of the same event | The organizer is visible in the lineup and in the organizer banner even without an avatar (placeholder circle) |
| R6 | Participation request carries the handshake direction | As a verified non-admin master: event page of an ACTIVE event → "Zgłoś udział jako saunamistrz" | Request row created as pending with `initiated_by='master'` (the SP-037B policy requires it — a missing value produced "Brak uprawnień" before this regression fix); withdraw still works |
| R5 | No staff-permission dead end for masters on ANY entry point | As a verified NON-ADMIN master: (a) Studio → Utwórz wydarzenie at a MANAGED facility; (b) map popup → 🔥 Dodaj event at the same managed facility | Both paths create a pending proposal via create_master_event (never the staff-only createEvent refusal); the manager-review toast shows; the event stays non-public until resolved; at an UNMANAGED facility both paths publish immediately with the organizer approved as lead |

## Manual pass to run after deploy (10 minutes)

1. As anon: open map → "Dodaj saunę" → login prompt visible.
2. As user A: submit "Testowa Sauna SP036" via map form (with photo) →
   success toast about moderation; sauna NOT on map; `/submit` shows it
   under "Twoje zgłoszenia" as pending.
3. As user A: submit a facility named "Termy Maltanskie" → duplicate
   warning lists "Termy Maltańskie Poznań" (this also closes V7 end-to-end).
4. As user B: cannot see user A's pending row (direct API).
5. As admin: Sauny tab shows the pending row; edit/approve path works.
6. Cleanup: admin deletes the test submission.

## SP-037B slice 5 — production E2E closure (2026-07-20)

The full invitation matrix was executed against production and is GREEN:

* **DB-level matrix 20/20** (single rolled-back transaction with RLS
  enforced via role impersonation): invitation lifecycle
  (create/accept/reject/withdraw), duplicate-pair rejection, foreign-master
  and foreign-facility denials, unapproved-master denial, frozen offered
  role, stale/double response, master-request regression with staff
  resolution, admin direct assignment with forced `approved_at`; zero
  traces after rollback, invariant sweep 0.
* **UI-level matrix** (headless browser on production, throwaway seeded
  accounts, total cleanup): manager invite flow, "Wysłane zaproszenia"
  with direction chips, Studio "Zaproszenia od obiektów", accept → upcoming
  with the offered role, reject → history, withdraw → disappears on both
  sides, public lineup + `get_saunas_nearby` satellite data for the
  accepted master.

Sprint SP-037/SP-037B closed; the terminology pass renamed the Studio nav
label "Wystąpienia" → "Moje wydarzenia" (route `/studio/events` unchanged).
