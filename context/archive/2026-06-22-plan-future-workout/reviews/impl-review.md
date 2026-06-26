<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Plan a Future Workout (S-02)

- **Plan**: context/changes/plan-future-workout/plan.md
- **Scope**: Phases 1–4 of 4 (full plan)
- **Date**: 2026-06-23
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## What was verified

- **Plan adherence**: All 11 planned changes plus the plan-permitted shared `src/lib/workout-submission.ts` extraction implemented as intended. No DRIFT / MISSING / EXTRA.
- **Date backstops**: Plan route accepts `submitted >= todayUtc` (`src/pages/api/workouts/plan.ts`) — grace-inclusive for behind-UTC users; log route still rejects `> todayUtc + 1 day` (`src/pages/api/workouts.ts`). Both correct after the refactor.
- **Duplicate guard**: Partial unique index `WHERE status='planned'` is the serialization point; 23505 caught on the parent insert (`src/lib/workouts.ts:100`) → friendly message. Concurrent-insert race is DB-safe.
- **Auth / XSS**: Both API routes resolve the user server-side, handle the null Supabase client, redirect to sign-in when absent. Error strings round-trip via `encodeURIComponent` → Astro/React auto-escaped text. Safe.
- **Scope guardrails**: "What we're NOT doing" respected (no auto-transition, no edit/delete, no calendar, one-plan-per-day in DB, no RLS change, logging flow unchanged).
- **Build**: `npm run build` passes.
- **Lint**: 2048 errors, all `prettier/prettier` "Delete ␍" CRLF noise (auto-fixable) — no new substantive errors.
- **Manual checks**: All 17 Progress manual items marked `[x]` with commit shas (331b5ac, adc6093, bdb64d5, ff824c3); each has matching code evidence — no rubber-stamping.

## Findings

### F1 — Orphaned planned parent can hold the per-day uniqueness slot

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/workouts.ts:116-121
- **Detail**: On child-insert failure the parent row is deleted best-effort. If that DELETE itself fails, an orphaned `planned` parent (zero exercises) survives — and because the partial unique index keys on `(user_id, workout_date) WHERE status='planned'`, that orphan occupies the day's single planned slot and blocks re-planning that date until cleaned up. Same best-effort cleanup pattern S-01 shipped and accepted; the planned-uniqueness interaction is new but extremely unlikely at single-user scale.
- **Fix**: None required now — accept as documented residual risk (matches the S-01 boundary). Revisit only if a transactional insert (RPC) is introduced later.
- **Decision**: ACCEPTED — matches S-01's accepted best-effort cleanup boundary; revisit only if a transactional RPC insert is introduced.
