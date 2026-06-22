<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Log a Workout (S-01)

- **Plan**: context/changes/log-a-workout/plan.md
- **Mode**: Deep
- **Date**: 2026-06-19
- **Verdict**: REVISE → SOUND after fixes
- **Findings**: 0 critical, 1 warning, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | WARNING |
| Blind Spots | PASS |
| Plan Completeness | PASS |

## Grounding

8/8 paths ✓, 1/1 symbol ✓ (`PROTECTED_ROUTES` @ src/middleware.ts:4), brief↔plan ✓, Progress↔Phase ✓. Contract-surfaces: plan accurately reports the F-01 catalog surface (`exercises.id` = bigint) and adds a non-breaking Workouts surface.

## Findings

### F1 — Atomic multi-exercise write had an unresolved Phase-1 dependency

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Critical Implementation Details (line 65); Phase 1 §1 (line 86); Phase 2 §1 (line 144)
- **Detail**: The plan offered "single transaction/RPC, or parent-then-children with cleanup" as interchangeable and deferred the choice to "Phase 2/3". supabase-js cannot run a client-side multi-statement transaction over PostgREST — true atomicity needs a Postgres RPC created in the Phase-1 migration, while the cleanup fallback needs a DELETE policy on `workouts` (marked "optional" in Phase 1, and partly contradicted by "What We're NOT Doing"). Either mechanism changes the Phase-1 migration, so the decision can't be deferred.
- **Fix A ⭐ Recommended**: Accept non-atomic insert-then-cleanup; add the `workouts` DELETE policy to Phase 1.
  - Strength: No SQL function; matches the thin-helper style of catalog.ts; concrete Phase-1 contract.
  - Tradeoff: Not crash-atomic; grants user delete on own workouts earlier than strictly needed.
  - Confidence: HIGH — standard supabase-js pattern; PostgREST transaction limit is well known.
  - Blind spot: User-facing DELETE capability arrives in S-01 (acceptable, no UI).
- **Fix B**: Create a `create_workout` Postgres RPC in the Phase-1 migration; helper uses `.rpc()`.
  - Strength: Genuinely atomic; no DELETE policy; one round-trip; cleaner invariant for S-02/S-03.
  - Tradeoff: First SQL function in the project; new pattern + JSON-arg contract to register.
  - Confidence: HIGH — `security invoker` RPC with inserts is well-trodden.
  - Blind spot: Function signature becomes a surface S-02 reuses.
- **Decision**: Fixed via Fix A — plan updated (Critical Impl Details, Phase 1 policies + manual check 1.10, Phase 2 createWorkout contract, What We're NOT Doing).

### F2 — Future-date rejection is timezone-sensitive

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details (line 66); Phase 3 §2 (line 201)
- **Detail**: Date input defaults to browser-local "today"; server (Cloudflare Workers, UTC) "rejects future dates". A user in a positive-UTC-offset zone logging late evening could have a valid local-today rejected as UTC-tomorrow.
- **Fix**: Reject only when `workout_date > today(UTC) + 1 day` (one-day grace), enforced server-side.
- **Decision**: Fixed — plan updated (Critical Impl Details, Phase 3 §2 API contract, Phase 3 manual check wording).
