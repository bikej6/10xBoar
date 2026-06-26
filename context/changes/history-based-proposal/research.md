---
date: 2026-06-26T00:00:00Z
researcher: bikej6
git_commit: 6942c80abbc4716b25bf1c0c4eef0fce3d1eb510
branch: master
repository: bikej6/10xBoar
topic: "Is fitness-calc-api.md (@finegym/fitness-calc) compatible with our codebase for S-03?"
tags: [research, codebase, history-based-proposal, fitness-calc, one-rep-max, supabase, cloudflare-workers]
status: complete
last_updated: 2026-06-26
last_updated_by: bikej6
---

# Research: Is `fitness-calc-api.md` compatible with our codebase for S-03?

**Date**: 2026-06-26T00:00:00Z
**Researcher**: bikej6
**Git Commit**: 6942c80abbc4716b25bf1c0c4eef0fce3d1eb510
**Branch**: master
**Repository**: bikej6/10xBoar

## Research Question

Review the codebase and decide whether `context/changes/history-based-proposal/fitness-calc-api.md`
(the API documentation for `@finegym/fitness-calc`) is compatible with it, in service of
implementing **S-03** from `context/foundation/roadmap.md` — "użytkownik dostaje propozycję
treningu z własnej historii".

## Summary

**Verdict: technically compatible on all three axes that matter — data, runtime, and integration.**
The package's documented claims hold up against the live codebase:

1. **Data** — the logged history already stores the `(weight, reps)` pairs the library's 1RM
   functions require. `reps` exists as a real column (added in migration `20260622132912`), and
   `getRecentWorkouts(..., "logged")` returns it. ✅
2. **Runtime** — pure-ESM + zero-dep is safe and idiomatic on this Astro-v6-SSR-on-Cloudflare-Workers
   stack; there is direct precedent (`clsx`, `tailwind-merge`) for importing pure-ESM utilities in
   server code, and no bundling restrictions to fight. ✅
3. **Integration** — the proposal output (`{exerciseId, sets, reps, weight}` per exercise) maps
   1:1 onto the existing `WorkoutExerciseInput` type and the shared `createWorkout(..., {status:
   "planned"})` path, so an accepted proposal materializes as a planned workout with **zero schema
   changes**. ✅

**However, "compatible" ≠ "ready to build".** Three caveats, in priority order:

- **S-03 is `blocked` on a product decision, not a technical one** (roadmap Open Question 1:
  minimum logged sessions before a proposal is meaningful, plus empty-state when a muscle group has
  no history). The library is pure math on whatever you feed it — it cannot resolve this, and the
  fitness-calc doc explicitly carries the same caveat. The library being compatible does **not**
  unblock S-03.
- **The team's own lesson questions whether to add the dependency at all.** `context/foundation/lessons.md`
  records "prefer native JS/TS, don't add deps without clear indication." The 7 1RM formulas are
  one-line arithmetic (Epley = `weight * (1 + reps/30)`). Adding `@finegym/fitness-calc` is compatible,
  but a ~20-line `src/lib/one-rep-max.ts` would satisfy the same need with no dependency and is more
  aligned with the recorded lesson. This is a genuine decision for the plan phase, not a blocker.
- **Type/shape mismatches the derivation code must bridge** (none fatal): the library outputs
  fractional weights and `estimateRepsAtWeight` returns a fractional number, but the DB requires
  `reps` to be an **integer ≥ 1** and the proposal must also supply a **`sets`** count, which the
  library does **not** produce. The S-03 derivation layer owns rounding and the sets decision.

## Detailed Findings

### Area 1 — Data-model compatibility (the critical axis)

The library's three S-03-relevant functions (`calculateOneRepMax`, `estimateRepsAtWeight`,
`calculateAllFormulas`) all take `(weight, reps)`. The codebase supplies exactly that.

- `workout_exercises` stores `sets` (int, `> 0`), `weight` (numeric, `>= 0`), and `reps` (int,
  `> 0`). `reps` was added in `supabase/migrations/20260622132912_add_workout_exercise_reps.sql:12-18`
  with comment *"Repetitions per set for this exercise (one value for all sets)."*
- Base table: `supabase/migrations/20260619132351_create_workouts.sql:30-36`.
- The read helper `getRecentWorkouts(supabase, userId, limit, status?)`
  (`src/lib/workouts.ts:153-180`) selects `WORKOUT_SELECT`
  (`src/lib/workouts.ts:127`: `"id, workout_date, status, workout_exercises(exercise_id, sets,
  reps, weight, exercises(name))"`) and returns `reps` + `weight` per exercise. Filtering
  `status: "logged"` excludes plans from the history aggregation.
- TS shape `LoggedWorkout` (`src/lib/workouts.ts:32-43`) carries `exerciseId`, `exerciseName`,
  `sets`, `reps`, `weight` — enough to group history per exercise and feed the 1RM functions.

**Granularity caveat:** `reps`/`weight` are uniform across an exercise's sets (one row per
exercise per workout, not one row per physical set). You cannot reconstruct a pyramid/heterogeneous
load. For standard single-load 1RM estimation (Epley/Brzycki/etc.) this is sufficient — each
`workout_exercises` row yields one clean `(weight, reps)` pair; `sets` is just a multiplier the 1RM
formulas don't need.

### Area 2 — Runtime / edge compatibility

The fitness-calc doc claims "ESM + zero-dep ⇒ Workers-edge safe (matches tech-stack constraint)."
Confirmed against config and precedent:

- `package.json` is `"type": "module"` and already imports pure-ESM utilities in **server** code:
  `clsx` and `tailwind-merge` in `src/lib/utils.ts:1-2`; `@supabase/ssr` in `src/lib/supabase.ts:1`.
  So a pure-ESM math lib is idiomatic, not novel.
- `astro.config.mjs` — `output: "server"`, `adapter: cloudflare()`, and **no** `vite.ssr.external` /
  `noExternal` / `optimizeDeps` restrictions to fight when bundling a new package.
- `wrangler.jsonc` — `compatibility_flags: ["nodejs_compat"]`, `compatibility_date: "2026-05-08"`.
  Pure compute libraries with no I/O bundle cleanly.
- Idiomatic placement: wrap in `src/lib/<name>.ts` and import via the `@/` alias, mirroring how API
  routes consume lib modules (e.g. `src/pages/api/workouts.ts:1-4`).
- No ESLint dependency allow/deny list (`eslint.config.js`) — nothing blocks adding a package.

**Caveat (matches the doc's open follow-up):** safety assumes the package contains no I/O / Node
`fs`/`path`/`child_process` usage. `@finegym/fitness-calc` is documented as pure math, so this holds —
but per your "static analysis only" scope, the doc's "verify exports + dependency tree at install
time" remains an **implementation-phase** check, not done here.

### Area 3 — Integration / output compatibility (S-02 plan-schema reuse)

The fitness-calc doc says the proposal "Output reuses the S-02 plan schema as a proposed workout."
Confirmed:

- A plan is created via `POST /api/workouts/plan` (`src/pages/api/workouts/plan.ts`), which parses
  a `{exerciseId, sets, reps, weight}[]` payload and calls the shared inserter
  `createWorkout(supabase, { userId, workoutDate, exercises, status: "planned" })`
  (`src/lib/workouts.ts:80-124`). The only difference from logging is the `status` argument and a
  future-date guard.
- The per-exercise payload type `WorkoutExerciseInput` (`src/lib/workouts.ts:25-30`) is exactly
  `{ exerciseId: number; sets: number; reps: number; weight: number }` — a proposal row maps 1:1.
- "Planned" vs "logged" is purely the `workouts.status` text column; no separate table/boolean.

**Constraints S-03 must respect when materializing an accepted proposal** (compatibility notes, not
schema changes):

- **`reps` must be an integer ≥ 1, `sets` ≥ 1, `weight` ≥ 0** (DB check constraints + hand-rolled
  validation in `src/lib/workout-submission.ts:27-47`). The library's `estimateRepsAtWeight` returns
  a fractional number → must be rounded/clamped. The library produces **no `sets` count** → S-03
  decides it (e.g. carry the historical `sets`, or a default).
- **One plan per day**: partial unique index `workouts_one_planned_per_day_idx`
  (`supabase/migrations/20260622140500_unique_planned_per_day.sql:14-16`) raises Postgres `23505`
  ("You already have a plan for that day."). S-03 must choose surface/block/replace. Note there is
  **no UPDATE policy** on `workouts` (only SELECT/INSERT/DELETE) — "replace" means delete-then-insert.
- **Date today-or-future (UTC)** to pass the plan route's `isFutureDate`; auth `user_id` is taken
  server-side from `context.locals.user`, never client input (RLS: `user_id = auth.uid()`).

## Code References

- `supabase/migrations/20260622132912_add_workout_exercise_reps.sql:12-18` — `reps` column (the fact that makes the library usable)
- `supabase/migrations/20260619132351_create_workouts.sql:17-36` — `workouts` + `workout_exercises` schema
- `supabase/migrations/20260622140500_unique_planned_per_day.sql:14-16` — one-planned-per-day unique index
- `src/lib/workouts.ts:25-30` — `WorkoutExerciseInput` (proposal output target type)
- `src/lib/workouts.ts:80-124` — `createWorkout` shared insert path (accept-proposal target)
- `src/lib/workouts.ts:153-180` — `getRecentWorkouts` (history source, returns weight+reps)
- `src/pages/api/workouts/plan.ts:26-56` — plan-create route (status:"planned")
- `src/lib/workout-submission.ts:27-47` — payload validation (reps int ≥1, weight ≥0)
- `src/lib/utils.ts:1-2` — precedent: pure-ESM utility imports in server code
- `astro.config.mjs` / `wrangler.jsonc` — no bundling restrictions; `nodejs_compat` enabled
- `context/foundation/lessons.md:5-10` — "prefer native JS/TS, don't add deps without clear indication"

GitHub permalinks (commit pushed on `master`):
- https://github.com/bikej6/10xBoar/blob/6942c80abbc4716b25bf1c0c4eef0fce3d1eb510/src/lib/workouts.ts#L80-L124
- https://github.com/bikej6/10xBoar/blob/6942c80abbc4716b25bf1c0c4eef0fce3d1eb510/src/pages/api/workouts/plan.ts#L26-L56

## Architecture Insights

- **The hard problem in S-03 is not arithmetic — it's the policy.** Aggregation is SQL; 1RM is a
  one-liner; the schema reuse is solved. What the codebase/library cannot decide is the product
  guardrail (minimum history, empty-state). That is precisely why the roadmap marks S-03 `blocked`.
- **Dependency vs. lesson tension.** `library-research.md` recommends `@finegym/fitness-calc`;
  `lessons.md` prefers native implementations for trivial logic. Both can be honored: a tiny
  `src/lib/one-rep-max.ts` (Epley + optionally Brzycki) gives a percentage target with no new
  dependency, no install-time edge-compat verification, and no bundle weight — while remaining
  swappable for the library if richer formula coverage is ever wanted. Recommend the planner weigh
  "7 formulas + percentage tables for free" against "zero-dep, aligned with our lesson."
- **The derivation layer is the only genuinely new code.** Everything downstream of it (insert,
  RLS, plan rendering) already exists and is reusable as-is.

## Historical Context (from prior changes)

- `context/changes/history-based-proposal/library-research.md` — recommends `@finegym/fitness-calc`
  (or leaner `@nathaliem/one-rep-max`), SQL for aggregation, skip stats/ML for v1; flags the same
  blocking open question.
- `context/changes/history-based-proposal/fitness-calc-api.md` — the API surface under review;
  its three strength functions and the SQL-then-derive split are confirmed feasible here.
- S-02 (`plan-future-workout`, archived `2026-06-22`) built the `createWorkout` + plan route +
  `status` discriminator + one-plan-per-day index that S-03 reuses.
- S-01 (`log-a-workout`, archived `2026-06-19`) established the schema; the `reps` column landed in
  a follow-up migration (`20260622132912`), which is what makes 1RM estimation possible at all.

## Related Research

- `context/changes/history-based-proposal/library-research.md`
- `context/changes/history-based-proposal/fitness-calc-api.md`

## Open Questions

1. **(Blocking, roadmap Open Question 1 — owner: user)** Minimum logged sessions before a proposal
   is generated, and empty-state behavior when a muscle group has no history. Must be answered before
   `/10x-plan`; the library does not resolve it.
2. **(Decision for the planner)** Use `@finegym/fitness-calc` vs. inline a native `one-rep-max.ts`,
   given `lessons.md`. Trade-off: formula breadth/percentage tables vs. zero-dependency + lesson fit.
3. **`sets` for a proposed exercise** — the library yields weight + reps only. Carry the historical
   `sets`, or pick a default?
4. **Accept-collision policy** — when a plan already exists for the target day (`23505`): surface,
   block, or delete-then-insert (no UPDATE policy exists).
5. **(Deferred per scope)** Install-time verification of the package's `exports`/`module` fields and
   dependency tree — only relevant if the library route (not the native route) is chosen.
