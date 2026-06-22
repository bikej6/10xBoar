# Log a Workout (S-01) Implementation Plan

## Overview

Let an authenticated user **log a workout for a given day in under a minute** — pick a muscle group, choose a catalog exercise, enter a set count and a weight, add a few more exercises if they want, and save the whole session as one dated workout — with the data stored **privately per user** and read back so they can see their recent sessions.

This is 10xBoar's **first private-per-user schema**. F-01 seeded a shared, read-only catalog and explicitly noted "every later table will instead be private-per-user" (`supabase/migrations/20260616173529_seed_exercise_catalog.sql:10-11`). S-01 introduces that posture: two new tables (`workouts`, `workout_exercises`) with RLS keyed to `auth.uid()`. The schema is load-bearing beyond S-01 — S-02 (manual planning) reuses it via a `status` column, S-03 (history-based proposal) accepts a proposal as a `planned` workout, and S-04 (weight-progress stats) aggregates over it.

## Current State Analysis

- **Only shared reference data exists today.** `muscle_groups` and `exercises` are seeded, read-only, RLS = SELECT-for-authenticated, no write policies (`supabase/migrations/20260616173529_seed_exercise_catalog.sql`). There is no per-user domain table yet. S-01 is the precedent for the private-per-user RLS posture.
- **The catalog access contract is ready.** `getMuscleGroups(supabase)` and `getExercises(supabase, slug?)` in `src/lib/catalog.ts` return typed rows and degrade to `[]` on a null client. The logging UI consumes these to populate the muscle-group filter and exercise picker — no re-querying the catalog ad hoc.
- **Supabase client is per-request and may be null.** `createClient(request.headers, cookies)` returns `null` when env is missing (`src/lib/supabase.ts:6`). Every helper must handle that, mirroring `catalog.ts`.
- **Auth is the write-path precedent.** Forms POST to an API route under `src/pages/api/...`; the route does the Supabase call and `context.redirect(...)`s back with `?error=` on failure or to a destination on success (`src/pages/api/auth/signin.ts`). The interactive form is a React island mounted `client:load` in an `.astro` page, receiving `serverError` via props (`src/pages/auth/signin.astro:16`, `src/components/auth/SignInForm.tsx`). CLAUDE.md: "There is no JSON API for auth."
- **Route protection is a middleware array.** `PROTECTED_ROUTES = ["/dashboard"]` (`src/middleware.ts:4`); the middleware populates `context.locals.user` (typed in `src/env.d.ts`) for every route and redirects unauthenticated users on protected paths.
- **Identity for `user_id`.** `context.locals.user` (and `supabase.auth.getUser()`) yields the authenticated user; `user.id` is the UUID matching `auth.uid()` in RLS policies.
- **No test suite; cloud Supabase.** CI runs `lint` + `build` only. Migrations are applied to the cloud project via `supabase db push` (PAT), not local `db reset`; verification of schema/RLS is via the Supabase Management API query endpoint and Studio. Lint runs locally show pre-existing repo-wide CRLF failures — judge lint by *new* errors in changed files, not the exit code.
- **No lodash.** Native JS/TS only (`context/foundation/lessons.md`).

## Desired End State

After this plan:

- A signed-in user can open `/workouts`, pick a muscle group (which filters the exercise list), choose an exercise, enter sets + weight, optionally add more exercise rows, pick a date (defaulting to today, backdating allowed), and save — in well under a minute.
- The save persists one `workouts` row (with `user_id`, `workout_date`, `status = 'logged'`) and one `workout_exercises` row per exercise (with `exercise_id`, `sets`, `weight`).
- The page shows a success confirmation and a list of the user's **recent logged workouts**, proving persistence and that only their own data is visible.
- Both tables have **RLS enabled** with policies keyed to `auth.uid()`; no other user can read or write the rows. A signed-out request to `/workouts` redirects to `/auth/signin`.
- `src/lib/workouts.ts` exposes typed write/read helpers used by the API route and the page, degrading gracefully on a null client.

**How to verify:** migration applies via `supabase db push`; a Management-API query confirms both tables exist with RLS enabled and the expected policies; `npm run build` (Astro typecheck) and `npm run lint` show no new errors; manually, logging a workout as user A persists it and shows it in the recent list, and the same row is not visible to user B.

### Key Discoveries:

- `supabase/migrations/20260616173529_seed_exercise_catalog.sql:10-11,40-53` — RLS precedent: `enable row level security` + per-role policy; F-01 foreshadows private-per-user tables here. `exercises.id` is `bigint generated always as identity` — the FK from `workout_exercises.exercise_id` must be `bigint`.
- `src/lib/catalog.ts` — the helper shape to mirror: typed interfaces, `CatalogClient` (= `NonNullable<ReturnType<typeof createClient>>`), null-guard returning `[]`, `.overrideTypes<...>()` for typed selects.
- `src/pages/api/auth/signin.ts` — the write-path contract: read `formData()`, guard null client, do the mutation, `redirect` with `?error=` on failure.
- `src/pages/auth/signin.astro:5,16` — island mount pattern: read `?error` from `Astro.url.searchParams`, pass to the island as a prop, mount `client:load`.
- `src/middleware.ts:4` — add `/workouts` to `PROTECTED_ROUTES`.
- PRD FR-003 (`prd.md:67`) — model is "ćwiczenie + liczba serii + ciężar" (exercise + set count + weight), not per-set reps; `< 1 min` is the acceptance test. Isolation NFR (`prd.md:81`) and persistence Guardrail (`prd.md:43`).

## What We're NOT Doing

- **Not building S-02 planning** — no future-dated `planned` workouts and no plan-acceptance flow. We add the `status` column (default `logged`) so S-02 is additive, but S-01 only ever writes `logged`, and the date input rejects future dates.
- **Not building S-04 stats** — no charts or progress aggregation; the recent-workouts list is a flat read-back, not analytics.
- ~~**Not capturing reps or per-set detail**~~ — **superseded by the 2026-06-22 reps scope amendment** (see "Scope Amendments" below). Entry now captures set-count + reps-per-set + single weight per exercise; still **not** per-individual-set detail (one reps value covers all sets).
- **Not adding a JSON API or Astro Actions** — the write path is form POST → API route → redirect, matching auth.
- **Not editing or deleting workouts** — S-01 is create + read-back only. No edit/delete **UI**. A DELETE policy on `workouts` exists solely to support failed-write cleanup (see F1 / Phase 1), not as an end-user delete feature.
- **Not adding a test suite** — none is configured; verification is build/lint + manual + Management API, as in F-01.
- **Not generating Supabase types** — types are hand-written in `src/lib`, matching `catalog.ts`.

## Scope Amendments

- **2026-06-22 — reps per set (approved by user during Phase 3 manual verification).** The original S-01 model (PRD FR-003: exercise + set-count + weight) is extended to also capture **repetitions per set**, so a user can log e.g. "3 sets × 12 reps". Model: **one reps value per exercise** (all sets share it), consistent with the single-weight-per-exercise model — still not per-individual-set detail. Affected surfaces:
  - New additive migration `supabase/migrations/20260622132912_add_workout_exercise_reps.sql` adds `reps integer not null check (reps > 0)` to `workout_exercises` (existing rows backfilled to 1 via a temporary default that is then dropped).
  - `src/lib/workouts.ts`: `WorkoutExerciseInput` and `LoggedWorkout.exercises` gain `reps`; `createWorkout` inserts it and `getRecentWorkouts` selects/returns it.
  - `src/pages/api/workouts.ts`: parses + validates `reps` (whole number ≥ 1).
  - `src/components/workouts/WorkoutLogForm.tsx`: adds a "Reps per set" field.
  - `docs/reference/contract-surfaces.md`: schema + helper-type entries updated.
  - This note supersedes the struck-through "Not capturing reps" bullet under "What We're NOT Doing". The PRD's FR-003 model is intentionally extended here; downstream slices (S-04 stats) may aggregate over `reps`.

## Implementation Approach

Four phases, foundation-first, with the cut line from planning honored: Phases 1–3 deliver the must-have (a persistent, isolated write end-to-end), Phase 4 adds the deferrable <1-min polish (multi-exercise builder + recent list).

1. **Schema + RLS migration** establishes the private-per-user posture in one versioned file that ships to prod via `db push`.
2. **Typed data layer** (`src/lib/workouts.ts`) gives the API route and page one stable, null-safe access contract — mirroring `catalog.ts`.
3. **Write path + page** wires the form-POST route, the protected `/workouts` page, and the interactive island for a single dated exercise — proving the end-to-end persistent isolated write.
4. **UX completion** turns the single-exercise form into a multi-row session builder and adds the recent-workouts read-back.

## Critical Implementation Details

- **`user_id` is set server-side, never from the client.** The API route reads the authenticated user from `context.locals.user` (or `supabase.auth.getUser()`) and passes `user.id` into the insert. The form never carries a user id. RLS is the backstop, but the insert must still populate `user_id` because the `WITH CHECK` policy requires `user_id = auth.uid()`.
- **`workout_exercises` ownership is transitive.** That table has no `user_id`; its RLS policies authorize a row by checking the parent `workouts` row belongs to `auth.uid()` (an `EXISTS`/`IN` subquery on `workouts`). This keeps a single source of ownership truth on the parent.
- **`exercise_id` FK type must be `bigint`.** `exercises.id` is `bigint generated always as identity` (F-01). A mismatched `integer` FK will fail to create.
- **Multi-exercise save = insert-then-cleanup (decided, F1).** supabase-js cannot run a client-side multi-statement transaction over PostgREST, so the write is: insert the parent `workouts` row, then insert the `workout_exercises` children; **on child-insert failure, delete the just-created parent** (best-effort cleanup) and return a typed error — never redirect as success on a partial write. This is *not* crash-atomic (a crash between the failed child insert and the cleanup delete can orphan a parent), which is acceptable at `target_scale: small`. The cleanup delete runs as the authenticated user, so it relies on the `workouts` DELETE policy added in Phase 1.
- **Future dates are rejected with a one-day grace (decided, F2).** The Cloudflare Workers clock is UTC, while the date input defaults to the browser's local "today"; a strict UTC comparison would falsely reject a valid local-today for users in positive-UTC offsets late in the evening. So the API route rejects only when `workout_date > today(UTC) + 1 day`. Enforce server-side, not only via the date input's `max`.

## Phase 1: Private workout schema + per-user RLS

### Overview

Create the second migration: `workouts` and `workout_exercises` tables with per-user RLS keyed to `auth.uid()`, and register the new load-bearing names in the contract-surfaces registry.

### Changes Required:

#### 1. Workout schema migration

**File**: `supabase/migrations/<timestamp>_create_workouts.sql` (generate via `npx supabase migration new create_workouts`)

**Intent**: Define the first private-per-user schema and lock it down with RLS so each user can read and write only their own workouts. Ships to prod via `db push`.

**Contract**:
- `workouts` table: `id` (PK, `bigint generated always as identity`), `user_id` (`uuid not null`, references the authenticated user / `auth.users`), `workout_date` (`date not null`), `status` (`text not null default 'logged'` — value set is `logged` | `planned`; S-01 only writes `logged`), `created_at` (`timestamptz not null default now()`). Index on `(user_id, workout_date)` for the recent-workouts read.
- `workout_exercises` table: `id` (PK, `bigint generated always as identity`), `workout_id` (`bigint not null` FK → `workouts.id` `on delete cascade`), `exercise_id` (`bigint not null` FK → `exercises.id`), `sets` (`integer not null`, positive), `weight` (`numeric not null`, non-negative). Index on `workout_id`.
- RLS on **both** tables, enabled. Policies keyed to `auth.uid()`:
  - `workouts`: **SELECT, INSERT, and DELETE** policies, all `to authenticated`. SELECT/DELETE `using (auth.uid() = user_id)`; INSERT `with check (auth.uid() = user_id)`. DELETE is required (not optional) to support the Fix-A cleanup path — a user deletes only their own workouts; no UPDATE policy.
  - `workout_exercises`: authorize via parent ownership — `using` / `with check` that an `EXISTS` on `workouts w where w.id = workout_id and w.user_id = auth.uid()`.
- Use `to authenticated` on the policies (matching F-01's role targeting).

**Contract (RLS shape — non-obvious, the load-bearing piece other phases trust):**
```sql
-- workout_exercises authorizes through the parent workout's owner
create policy "Users manage their workout exercises"
  on workout_exercises for all to authenticated
  using (exists (select 1 from workouts w where w.id = workout_id and w.user_id = auth.uid()))
  with check (exists (select 1 from workouts w where w.id = workout_id and w.user_id = auth.uid()));
```

#### 2. Register new contract surfaces

**File**: `docs/reference/contract-surfaces.md`

**Intent**: Record the load-bearing names introduced here so S-02/S-03/S-04 reference them consistently.

**Contract**: A new section "Workouts (S-01 · log-a-workout)" listing the two tables and columns, the `status` value set (`logged` | `planned`) with a note that S-02 introduces `planned`, the per-user RLS posture (per-user SELECT/INSERT/DELETE policies on `workouts` — the DELETE policy exists for failed-write cleanup, not an end-user delete feature — and the transitive ownership of `workout_exercises`), and a forward reference to the `src/lib/workouts.ts` helpers (added in Phase 2). Prose registry — no code.

### Success Criteria:

#### Automated Verification:

- Migration applies to the cloud project: `npx supabase db push` succeeds.
- Both tables exist with RLS enabled (Management API query: `select relname, relrowsecurity from pg_class where relname in ('workouts','workout_exercises')` → both `relrowsecurity = true`).
- Expected policies exist (Management API: `select tablename, policyname, cmd from pg_policies where tablename in ('workouts','workout_exercises')`).
- `workout_exercises.exercise_id` FK resolves to `exercises.id` (no migration error on apply).
- Lint passes on changed files: `npm run lint` (judge by new errors; pre-existing CRLF noise out of scope).

#### Manual Verification:

- In Studio, both tables show RLS enabled with the per-user policies and no public/anon access.
- Inserting a `workouts` row with a `user_id` other than the caller is rejected by the `with check` policy.
- A `workout_exercises` row pointing at another user's `workout_id` is rejected.
- `status` defaults to `logged`; FK from `workout_exercises.workout_id` cascades on parent delete.
- A user can DELETE only their own workout (the cleanup path); deleting another user's workout is rejected.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation from the human that the RLS posture is correct in Studio before proceeding to Phase 2.

---

## Phase 2: Typed workout data layer

### Overview

Add `src/lib/workouts.ts` — typed write and read helpers mirroring `catalog.ts` — so the API route and the page share one null-safe access contract instead of querying Supabase ad hoc.

### Changes Required:

#### 1. Workout write + read helpers + types

**File**: `src/lib/workouts.ts` (new)

**Intent**: Expose a typed function to create a dated workout with its exercises (setting `user_id` server-side) and a function to read a user's recent workouts for read-back.

**Contract**:
- Types: `WorkoutExerciseInput { exerciseId: number; sets: number; weight: number }`; `LoggedWorkout { id; workoutDate; status; exercises: Array<{ exerciseId; exerciseName; sets; weight }> }` (exercise name resolved by joining the catalog for display).
- `createWorkout(supabase, { userId, workoutDate, exercises }): Promise<{ ok: true; id: number } | { ok: false; error: string }>` — inserts the parent `workouts` row (status `logged`), then inserts its `workout_exercises`; **on child-insert failure, delete the just-created parent** and return `{ ok: false }` (best-effort cleanup, per F1 — not crash-atomic). Never throws.
- `getRecentWorkouts(supabase, userId, limit?): Promise<LoggedWorkout[]>` — the caller's workouts ordered by `workout_date` desc (then `created_at` desc), with their exercises and resolved exercise names; default limit ~10.
- Both accept the per-request client (`NonNullable<ReturnType<typeof createClient>>` or `null`) and return a null-safe result (`{ ok: false }` / `[]`) when the client is `null`, matching `catalog.ts`.
- Native JS/TS only — no lodash.
- Reuse the catalog for name resolution where practical (join in the read query, or `getExercises`); do not duplicate catalog typing.

#### 2. Extend contract surfaces with helper signatures

**File**: `docs/reference/contract-surfaces.md`

**Intent**: Fill in the forward reference left in Phase 1 with the actual helper signatures.

**Contract**: Under the Workouts section, list `createWorkout` and `getRecentWorkouts` signatures and the `WorkoutExerciseInput` / `LoggedWorkout` types. Prose — no code.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build` (or `npx astro check`) with 0 new errors.
- Lint passes on `src/lib/workouts.ts` (no new errors).
- Helper compiles against the Phase 1 schema (types reference real columns).

#### Manual Verification:

- `createWorkout` with a valid user + 1–2 exercises persists a `workouts` row and matching `workout_exercises` rows.
- A simulated child-insert failure does not leave an orphaned parent (atomicity holds).
- `getRecentWorkouts` returns only the caller's workouts, newest first, with exercise names resolved.
- Null Supabase client yields `{ ok: false }` / `[]` instead of throwing.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation that the helpers read/write correctly before proceeding to Phase 3.

---

## Phase 3: Logging write path + page (core)

### Overview

Wire the must-have end-to-end write: a protected `/workouts` page that server-renders the catalog and mounts an interactive island, and an `/api/workouts` form-POST route that creates the workout via the Phase 2 helper and redirects back with a confirmation. Scope here is a single dated exercise saved end-to-end; the multi-row builder and recent list come in Phase 4.

### Changes Required:

#### 1. Protect the new route

**File**: `src/middleware.ts`

**Intent**: Require auth on `/workouts`.

**Contract**: Add `"/workouts"` to `PROTECTED_ROUTES`. No other middleware change.

#### 2. Workout write API route

**File**: `src/pages/api/workouts.ts` (new)

**Intent**: Accept the logging form POST, create the workout for the authenticated user, redirect back with success or `?error=`.

**Contract**:
- `POST` handler mirroring `src/pages/api/auth/signin.ts`: read `formData()`, guard a null client (redirect `/workouts?error=...`), resolve the user from `context.locals.user` / `getUser()` (redirect to signin if absent).
- Parse the submitted exercise row(s): `exercise_id` (number), `sets` (positive int), `weight` (non-negative number), and `workout_date` (default today; **reject server-side only when `workout_date > today(UTC) + 1 day`** — the one-day grace from F2). Validate; on invalid input redirect `/workouts?error=...`.
- Call `createWorkout(...)` with `userId` from the server; on `{ ok: false }` redirect with `?error=`; on success redirect to `/workouts?saved=1` (confirmation signal the page renders).
- Never trust a client-supplied user id.

#### 3. Logging page

**File**: `src/pages/workouts.astro` (new)

**Intent**: Server-render the catalog and the success/error state, and mount the logging island.

**Contract**:
- Reads `Astro.url.searchParams` for `error` and `saved` (mirrors `signin.astro`'s `error` handling) and passes them to the island.
- Fetches the catalog server-side via `getMuscleGroups` / `getExercises` (per-request `createClient`) and passes muscle groups + exercises to the island as props (enables client-side filtering without a JSON API).
- Mounts the logging island `client:load`. Uses `Layout`.

#### 4. Logging island (single-exercise core)

**File**: `src/components/workouts/WorkoutLogForm.tsx` (new)

**Intent**: Interactive form to log one dated exercise quickly; submits via standard form POST.

**Contract**:
- Props: `muscleGroups: MuscleGroup[]`, `exercises: Exercise[]`, `serverError?: string | null`, `saved?: boolean`.
- A muscle-group selector filters the exercise dropdown **client-side** (from the `exercises` prop, by `muscleGroupId`/slug). An exercise selector, a `sets` number input, a `weight` number input, and a `workout_date` input defaulting to today with `max` = today.
- Client-side validation (required exercise, sets ≥ 1, weight ≥ 0) mirroring `SignInForm`'s `validate()`/`clearError` approach; `noValidate` form that `preventDefault`s on invalid.
- `<form method="POST" action="/api/workouts">` posting the fields. Shows `serverError` via the existing `ServerError` component and a success confirmation when `saved`.
- Reuses `src/components/ui` / auth field primitives where they fit; native JS/TS only.

#### 5. Entry point link

**File**: `src/pages/dashboard.astro` (and/or `src/components/Topbar.astro`)

**Intent**: Give the signed-in user a way to reach `/workouts`.

**Contract**: Add a link/button to `/workouts`. Minimal, matches existing styling.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build` / `npx astro check`, 0 new errors.
- Lint passes on changed files (no new errors).
- `/workouts` is in `PROTECTED_ROUTES` (a signed-out request redirects to `/auth/signin`).

#### Manual Verification:

- Signed in, opening `/workouts` shows the form with the muscle-group filter populating exercises correctly.
- Selecting a group filters the exercise list to that group; choosing an exercise, sets, weight, and saving persists a `workouts` + `workout_exercises` row for the current user and shows the confirmation.
- A clearly-future `workout_date` (beyond today + 1 day) is rejected with a visible error; today and yesterday are accepted.
- Signed out, `/workouts` redirects to `/auth/signin`.
- The whole log-one-exercise flow completes comfortably within a minute.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation that the end-to-end logging works before proceeding to Phase 4.

---

## Phase 4: <1-min UX completion (multi-exercise + recent list)

### Overview

Turn the single-exercise form into a session builder (add/remove multiple exercise rows saved as one workout) and add the recent-workouts read-back on the page. This is the deferrable layer per the planning cut line.

### Changes Required:

#### 1. Multi-exercise row builder in the island

**File**: `src/components/workouts/WorkoutLogForm.tsx`

**Intent**: Let the user add several exercise rows (each: muscle group → exercise, sets, weight) and save them as one dated workout.

**Contract**:
- Local state holds an array of exercise rows; "add row" / "remove row" controls; one shared `workout_date`.
- Serializes all rows into the form POST so `/api/workouts` creates one `workouts` parent with N `workout_exercises` children (indexed field names, e.g. `exercises[i][exerciseId]`, or parallel arrays — pick what the API route parses cleanly).
- Validation extends to per-row checks; empty rows are ignored or blocked.
- Keeps the <1-min flow: sensible defaults, keyboard-friendly, no page reload until save.

#### 2. Parse multiple rows in the API route

**File**: `src/pages/api/workouts.ts`

**Intent**: Accept and validate N exercise rows and pass them to `createWorkout` as the exercises array.

**Contract**: Parse the serialized rows into `WorkoutExerciseInput[]`; validate each; reject empty sets. One `createWorkout` call writes the parent + all children atomically (Phase 2 contract).

#### 3. Recent-workouts list on the page

**File**: `src/pages/workouts.astro` (+ a small presentational component if useful, e.g. `src/components/workouts/RecentWorkouts.astro`)

**Intent**: Show the user's recent logged workouts to prove persistence + isolation (the PRD guardrail).

**Contract**: Server-side, resolve the user from `Astro.locals.user`, call `getRecentWorkouts(supabase, user.id)`, and render a simple list grouped by date showing each exercise + sets + weight. Empty state when there are none. Read-only — no analytics.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build` / `npx astro check`, 0 new errors.
- Lint passes on changed files (no new errors).

#### Manual Verification:

- Adding multiple exercise rows and saving creates one `workouts` row with the matching number of `workout_exercises` rows.
- Removing a row before save excludes it; an all-empty submit is rejected with a clear message.
- The recent-workouts list shows the just-saved session (newest first), grouped by date, with correct exercise names, sets, and weights.
- Logging out and back in still shows the saved workouts (persistence guardrail); a second user does not see the first user's workouts (isolation).
- A representative multi-exercise session logs in under a minute.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation that the multi-exercise flow and read-back work before considering the change complete.

---

## Testing Strategy

### Unit Tests:

- None added — no test suite is configured (CI runs lint + build only). Verification is via build/lint, the Supabase Management API, Studio, and manual flows, matching F-01.

### Integration Tests:

- Implicit: `supabase db push` applies the migration against the cloud project (DDL + RLS) end-to-end. The manual log-a-workout flow exercises the API route → helper → DB → read-back path.

### Manual Testing Steps:

1. Apply the migration (`supabase db push`); confirm both tables + RLS + policies via Management API / Studio.
2. As user A, open `/workouts`, log a single exercise for today; confirm the confirmation and the persisted rows.
3. Try a future date; confirm server-side rejection.
4. Add multiple exercise rows; save; confirm one parent + N children and the recent list reflects them.
5. Sign out and back in; confirm the workouts are still listed (persistence).
6. As user B, confirm A's workouts are not visible and cannot be read via a crafted query (isolation / RLS).
7. Signed out, hit `/workouts`; confirm redirect to `/auth/signin`.

## Performance Considerations

Negligible at `target_scale: small`. Per-user row counts are tiny; the `(user_id, workout_date)` and `workout_id` indexes cover the recent-workouts read and the child join. The catalog is passed to the island as props (a few dozen rows) so muscle-group filtering is client-side with no extra round-trips. The <2s confirmation NFR is met by the redirect.

## Migration Notes

- This is the project's **second** migration and the first private-per-user schema; it sets the RLS precedent (per-user policies keyed to `auth.uid()`, transitive ownership for child rows) that S-02/S-03/S-04 follow.
- Applied to the cloud project via `supabase db push` (PAT), consistent with the project's no-local-Docker setup; the change is purely additive (no existing data to migrate).
- The `status` column ships now (default `logged`) so S-02's `planned` workouts are an additive change rather than a reshape.

## References

- Change identity: `context/changes/log-a-workout/change.md`
- Roadmap item: `context/foundation/roadmap.md` (S-01, lines 76–87; Stream A critical path)
- PRD: `context/foundation/prd.md` (FR-003 line 67; isolation NFR line 81; persistence Guardrail line 43; access control lines 92–97)
- F-01 catalog migration / RLS precedent: `supabase/migrations/20260616173529_seed_exercise_catalog.sql`
- Catalog helper to mirror: `src/lib/catalog.ts`
- Write-path precedent: `src/pages/api/auth/signin.ts`; island mount: `src/pages/auth/signin.astro:16`, `src/components/auth/SignInForm.tsx`
- Route protection: `src/middleware.ts:4`; user typing: `src/env.d.ts`
- Contract registry: `docs/reference/contract-surfaces.md`
- Recurring rules: `context/foundation/lessons.md` (no lodash)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Private workout schema + per-user RLS

#### Automated

- [x] 1.1 Migration applies to the cloud project: `npx supabase db push` succeeds — bffc96d
- [x] 1.2 Both tables exist with RLS enabled (`pg_class.relrowsecurity = true` for both) — bffc96d
- [x] 1.3 Expected per-user policies exist (`pg_policies` for both tables) — bffc96d
- [x] 1.4 `workout_exercises.exercise_id` FK resolves to `exercises.id` (no apply error) — bffc96d
- [x] 1.5 Lint passes on changed files (no new errors) — bffc96d

#### Manual

- [x] 1.6 Studio shows RLS enabled with per-user policies and no anon/public access
- [x] 1.7 Insert with a foreign `user_id` is rejected by `with check`
- [x] 1.8 `workout_exercises` row pointing at another user's `workout_id` is rejected
- [x] 1.9 `status` defaults to `logged`; child FK cascades on parent delete
- [x] 1.10 A user can DELETE only their own workout (cleanup path); deleting another user's is rejected

### Phase 2: Typed workout data layer

#### Automated

- [x] 2.1 Type checking passes: `npm run build` / `npx astro check` (0 new errors) — c3cb6ec
- [x] 2.2 Lint passes on `src/lib/workouts.ts` (no new errors) — c3cb6ec
- [x] 2.3 Helper compiles against the Phase 1 schema — c3cb6ec

#### Manual

- [ ] 2.4 `createWorkout` persists parent + child rows for a valid user
- [ ] 2.5 Simulated child-insert failure leaves no orphaned parent (atomicity)
- [ ] 2.6 `getRecentWorkouts` returns only the caller's workouts, newest first, names resolved
- [ ] 2.7 Null Supabase client yields `{ ok: false }` / `[]` instead of throwing

### Phase 3: Logging write path + page (core)

#### Automated

- [x] 3.1 Type checking passes: `npm run build` / `npx astro check` (0 new errors)
- [x] 3.2 Lint passes on changed files (no new errors)
- [x] 3.3 `/workouts` is in `PROTECTED_ROUTES` (signed-out request redirects to `/auth/signin`)

#### Manual

- [x] 3.4 `/workouts` shows the form; muscle-group filter populates exercises correctly
- [x] 3.5 Saving one exercise persists `workouts` + `workout_exercises` for the user and shows confirmation
- [x] 3.6 Future `workout_date` is rejected with a visible error
- [x] 3.7 Signed out, `/workouts` redirects to `/auth/signin`
- [x] 3.8 Logging one exercise completes within a minute

### Phase 4: <1-min UX completion (multi-exercise + recent list)

#### Automated

- [ ] 4.1 Type checking passes: `npm run build` / `npx astro check` (0 new errors)
- [ ] 4.2 Lint passes on changed files (no new errors)

#### Manual

- [ ] 4.3 Multiple exercise rows save as one `workouts` row with matching `workout_exercises`
- [ ] 4.4 Removed rows are excluded; an all-empty submit is rejected with a clear message
- [ ] 4.5 Recent-workouts list shows saved sessions newest-first, grouped by date, with correct names/sets/weights
- [ ] 4.6 Persistence across logout/login holds; second user does not see the first user's workouts (isolation)
- [ ] 4.7 A representative multi-exercise session logs in under a minute
