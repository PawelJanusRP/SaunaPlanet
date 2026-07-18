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
