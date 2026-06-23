# Plan a Future Workout (S-02) Implementation Plan

## Overview

Let an authenticated user **manually plan a workout for a future day** — pick catalog exercises (group → exercise → sets/reps/weight, same builder as logging) and a future date, then save it as a `workouts` row with `status = 'planned'`. The plan is shown back in a dedicated "Planned workouts" list, separate from logged history.

This is roadmap slice **S-02** (Stream A, critical path), sequenced immediately before the north star **S-03** — accepting a history-based proposal will *reuse* this exact "create a planned workout" capability. The work is deliberately maximal-reuse: the schema, RLS, write path, and entry UI from S-01 already exist; S-02 adds the `planned` status flow on top of them.

## Current State Analysis

S-01 (`log-a-workout`, merged in PR #10) shipped the entire substrate this slice needs:

- **Schema** (`supabase/migrations/20260619132351_create_workouts.sql`): `workouts(id, user_id, workout_date, status default 'logged', created_at)` + `workout_exercises(id, workout_id, exercise_id, sets, reps, weight)`. The `status` column was added **specifically so S-02's `planned` is additive** (migration comment, line 11; status amendment migration `20260622132912_add_workout_exercise_reps.sql` added `reps`).
- **RLS** keyed to `auth.uid()`: per-user SELECT / INSERT / DELETE on `workouts`; transitive `for all` on `workout_exercises`. The INSERT/SELECT policies already cover `planned` rows — **no RLS change needed** for the planning capability itself.
- **Data layer** (`src/lib/workouts.ts`): `createWorkout` (parent + children insert with best-effort orphan cleanup) and `getRecentWorkouts` (all statuses, newest first). `createWorkout` **hardcodes `status: 'logged'`** (line 85) — the single seam that must change. `getRecentWorkouts` does **not** filter by status (line 131), so planned rows would leak into the logged list.
- **Entry UI** (`src/components/workouts/WorkoutLogForm.tsx`): a self-contained React island — multi-exercise row builder, client validation, hidden `exercises` JSON field, native form POST. Date input is bounded `max={today}` (line 329) with copy "backdating is allowed" — logging-specific.
- **API** (`src/pages/api/workouts.ts`): form-POST route that resolves the user server-side, validates (rejecting future dates via `isAcceptableDate`, lines 18–28, with a UTC +1-day grace), calls `createWorkout`, redirects to `/workouts?saved=1`.
- **Page** (`src/pages/workouts.astro`): protected (`PROTECTED_ROUTES` in `src/middleware.ts`), server-renders the catalog through `catalog.ts`, mounts the island, renders `RecentWorkouts.astro`.
- **Read-back** (`src/components/workouts/RecentWorkouts.astro`): renders a `LoggedWorkout[]` list; displays `workoutDate` + exercise lines; does not surface `status`.

The catalog (F-01) is done. Dashboard already links to `/workouts`.

## Desired End State

A signed-in user on `/workouts` flips a **Log / Plan** toggle. In **Plan** mode the date picker requires a future day, the copy reads "Plan", and saving writes a `planned` workout. Below the form, a **"Planned workouts"** list shows their upcoming plans (soonest first), distinct from the **"Recent workouts"** (logged) list. Planning a second workout for a date that already has a plan is rejected with a clear message. A planned workout persists under RLS keyed to `auth.uid()` and is invisible to other users.

Verify by: toggling to Plan, saving a future-dated workout, seeing it appear in "Planned workouts" and **not** in "Recent workouts"; confirming a same-date second plan is refused; confirming a past/today date is refused in Plan mode; confirming the logging flow (Log mode) still behaves exactly as before.

### Key Discoveries:

- `status` column is purpose-built for this slice — additive, no reshape (`20260619132351_create_workouts.sql:21,25`).
- `createWorkout` hardcodes `status: 'logged'` (`src/lib/workouts.ts:85`) — the one write seam.
- `getRecentWorkouts` returns all statuses (`src/lib/workouts.ts:131`) — planned rows leak into the logged list unless filtered.
- Future-date rejection logic to invert lives in `src/pages/api/workouts.ts:18–28`; the +1-day UTC grace exists to avoid false-rejecting a valid local "today" (form note F2).
- `WorkoutLogForm` already owns local date state and `localTodayIso()` (`WorkoutLogForm.tsx:55,98`) — adding a mode toggle that swaps `min`/`max` is a localized change.
- Contract registry to update: `docs/reference/contract-surfaces.md` (Workouts section).

## What We're NOT Doing

- **No auto-transition** of `planned` → `logged` when the planned day arrives, and no "mark as done" / completion flow. A planned workout stays `planned`.
- **No edit or delete** of planned (or logged) workouts — edit is S-06's job and requires an RLS UPDATE policy that does not exist yet.
- **No calendar / forward date-grid** view — planned workouts are a simple list; the calendar is S-05.
- **No multiple plans per future day** — at most one `planned` workout per `(user, date)`, enforced in the DB.
- No JSON API, Astro Actions, test suite, or Supabase type generation (consistent with S-01's boundaries).
- No change to the logging flow's behavior, the RLS policies, or the `reps`/`sets`/`weight` entry model.

## Implementation Approach

Maximal reuse along the S-01 grain. One additive migration adds a partial unique index that guarantees the "one plan per day" rule at the DB layer (matching the project's RLS-defense posture). The data layer grows a `status` parameter on the existing write helper plus a `planned`-specific read helper, keeping `src/lib/workouts.ts` the single access contract. The entry UI becomes mode-aware via an internal toggle (no fork, per the roadmap's explicit "reuse the entry UI" risk note), and a sibling API route owns the future-date rule and redirect. Presentation reuses the existing list pattern with a planned-specific section.

## Critical Implementation Details

- **Future-date validation & timezone grace.** Plan mode must accept future dates and reject past/today. The S-01 log route rejects `submitted > todayUtc + 1 day` (a one-sided grace so an ahead-of-UTC user's valid local "today" isn't rejected). The symmetric risk for planning is a **behind-UTC** user (e.g. UTC−8): late in their local day the UTC clock has already rolled to the next date, so their genuine local "tomorrow" can equal **today (UTC)**. Therefore the server backstop for planning must accept `submitted >= todayUtc` (reject strictly-past UTC dates), **not** `submitted > todayUtc`, which would falsely reject those users. The form's `min = local tomorrow` enforces the strict "tomorrow onward" UX; the server rule is the grace-inclusive backstop. Reuse the existing `YYYY-MM-DD` regex + `Date.parse(...T00:00:00Z)` parsing from `api/workouts.ts`.
- **Unique-conflict surfacing.** The partial unique index makes a duplicate-date plan insert fail at the DB. `createWorkout` must detect that specific failure on the parent insert (Postgres unique-violation, code `23505`) and return a friendly `{ ok: false, error: "You already have a plan for that day." }` rather than the generic save error — otherwise the user sees a confusing message.

## Phase 1: Migration — one-plan-per-day guard

### Overview

Add a DB-level guarantee that a user has at most one `planned` workout per date. Logged workouts are unaffected (a user may log and plan the same date, and may have multiple logged rows historically).

### Changes Required:

#### 1. New migration

**File**: `supabase/migrations/<timestamp>_unique_planned_per_day.sql`

**Intent**: Enforce "one plan per future day" (the slice's chosen scope boundary) at the database, consistent with the project's preference for DB-level guarantees over app-only checks.

**Contract**: A **partial unique index** on `workouts (user_id, workout_date) WHERE status = 'planned'`. The `WHERE` clause scopes the constraint to planned rows only, so it never restricts logged history. Additive and backward-safe (no existing `planned` rows exist yet). Include a `comment`-style header consistent with the existing migrations explaining the scope decision and that it does not touch logged rows.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly via `db push` (PAT flow, per project Supabase convention).
- `npm run build` passes.

#### Manual Verification:

- Index exists and is partial (`WHERE status = 'planned'`), confirmed via the Supabase Management API query endpoint (`pg_indexes` / `\d workouts`).
- Inserting two `planned` rows for the same `(user, date)` fails the second; inserting two `logged` rows for the same date still succeeds.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation that the migration applied and the constraint behaves as intended (DB change = human gate) before proceeding.

---

## Phase 2: Data layer — status-aware write + planned read

### Overview

Make `src/lib/workouts.ts` able to write a `planned` workout and read planned vs logged sets separately, keeping it the single access contract (no ad-hoc Supabase queries in routes/views).

### Changes Required:

#### 1. Parametrize the write helper

**File**: `src/lib/workouts.ts`

**Intent**: Allow `createWorkout` to write either status without forking the insert/cleanup logic, so S-03 can reuse it for proposal acceptance.

**Contract**: `CreateWorkoutInput` gains an optional `status?: "logged" | "planned"` (default `"logged"`, preserving every existing caller). The parent insert uses that status instead of the hardcoded `'logged'` (`workouts.ts:85`). On the parent insert error path, detect the unique-violation (Postgres `23505`) and return `{ ok: false, error: "You already have a plan for that day." }`; all other failures keep the existing generic message. Never throws; null-client behavior unchanged.

#### 2. Status filter on the recent read

**File**: `src/lib/workouts.ts`

**Intent**: Keep planned rows out of the "Recent workouts" (logged) list.

**Contract**: `getRecentWorkouts` accepts an optional `status?: "logged" | "planned"` filter; when provided, adds `.eq("status", status)` to the query. Default (omitted) preserves current all-status behavior so no existing caller breaks; the `/workouts` page will pass `"logged"`.

#### 3. New planned read helper

**File**: `src/lib/workouts.ts`

**Intent**: Provide the planned list its own query with the right ordering for upcoming plans.

**Contract**: `getPlannedWorkouts(supabase, userId, limit = 10): Promise<LoggedWorkout[]>` — same nested select and mapping as `getRecentWorkouts`, filtered to `status = 'planned'`, ordered `workout_date` **ascending** (soonest upcoming first), then `created_at` ascending. Returns `[]` on null client or error. Reuse the `RecentWorkoutRow` shape and mapping (extract a shared mapper if it reduces duplication).

#### 4. Update the contract registry

**File**: `docs/reference/contract-surfaces.md`

**Intent**: Record the new/changed load-bearing names so later slices (S-03) rely on stable signatures.

**Contract**: In the Workouts section, document the `createWorkout` `status` param + unique-conflict behavior, the `getRecentWorkouts` status filter, `getPlannedWorkouts`, and the new partial unique index (one `planned` per `(user, date)`). Note that S-03 reuses `createWorkout(..., { status: 'planned' })`.

### Success Criteria:

#### Automated Verification:

- Type checking / `npm run build` passes (signatures backward-compatible).
- Lint shows no new errors (judge by new errors, not exit code — pre-existing CRLF noise).

#### Manual Verification:

- `createWorkout` with `status: 'planned'` creates a planned row; a second same-date call returns the friendly duplicate message.
- `getPlannedWorkouts` returns only planned rows, soonest-first; `getRecentWorkouts(..., 'logged')` excludes planned rows.

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 3: Entry path — plan-mode toggle + API route (core)

### Overview

Deliver the core capability: from `/workouts`, toggle to Plan mode and save a future-dated planned workout. This is the must-have phase.

### Changes Required:

#### 1. New planning API route

**File**: `src/pages/api/workouts/plan.ts`

**Intent**: Own the future-date validation and the plan redirect, mirroring the existing log route's structure rather than multiplexing two opposite date rules into one route.

**Contract**: `POST` form route. Resolves the user server-side (redirect to `/auth/signin` if absent); reuses the same `YYYY-MM-DD` parsing + `parseExerciseRow` validation as `api/workouts.ts` (extract the shared row parser/date helpers into a small shared module if duplication is meaningful, otherwise mirror). Date rule: reject unless `submitted >= todayUtc` (see Critical Implementation Details — grace-inclusive backstop); the error message names the future-date requirement. On success calls `createWorkout(supabase, { userId, workoutDate, exercises, status: "planned" })` and redirects to `/workouts?planned=1`; on `createWorkout` failure redirects back with the returned error (covers the duplicate-day message).

#### 2. Mode-aware entry form

**File**: `src/components/workouts/WorkoutLogForm.tsx`

**Intent**: Reuse the one builder for both flows via an internal Log/Plan toggle (no fork), per the roadmap reuse directive.

**Contract**: Add internal `mode: "log" | "plan"` state (default `"log"`). A toggle control (two buttons / segmented control, matching existing UI primitives) flips it. Mode drives: the form `action` (`/api/workouts` vs `/api/workouts/plan`), the date input bounds (`max={today}` in log; `min={tomorrow}` and no `max` in plan), the heading/submit copy and date helper text (e.g. "Plan a future workout" / "Pick a future day"), and the `saved`/`planned` success banner shown. Compute `tomorrow` from the existing `localTodayIso()` (+1 local day). The exercises payload, validation, and hidden `exercises` field are unchanged. Keep `serverError` handling; accept a `planned` success prop or read both query flags.

#### 3. Page wires both success flags

**File**: `src/pages/workouts.astro`

**Intent**: Surface the planned-save confirmation and pass it to the island.

**Contract**: Read `planned === "1"` from the query alongside the existing `saved`; pass to `WorkoutLogForm`. No layout change here beyond prop wiring (the planned list is Phase 4).

### Success Criteria:

#### Automated Verification:

- `npm run build` passes; lint shows no new errors.

#### Manual Verification:

- Toggling to Plan changes copy and date bounds; the picker disallows today/past.
- Saving a future-dated workout in Plan mode persists it as `status = 'planned'` (confirm via DB) and redirects with the planned confirmation.
- Log mode is unchanged: still defaults to today, allows backdating, rejects future, writes `logged`.
- A future date in the past relative to UTC edge (behind-UTC "tomorrow") is accepted; a clearly-past date is rejected server-side.
- Signed-out POST to `/api/workouts/plan` redirects to sign-in.

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 4: Presentation — planned workouts list

### Overview

Show upcoming planned workouts on `/workouts`, clearly separated from logged history.

### Changes Required:

#### 1. Planned workouts list

**File**: `src/components/workouts/PlannedWorkouts.astro` (new), or extend `RecentWorkouts.astro` with a labeled variant.

**Intent**: Render the planned list with its own heading and soonest-first ordering, reusing the existing list markup/styling.

**Contract**: Accepts `workouts: LoggedWorkout[]`. Same item layout as `RecentWorkouts.astro` (date + exercise lines `{sets} × {reps} @ {weight} kg`), under a "Planned workouts" heading, with an empty-state ("No workouts planned yet."). Prefer a small dedicated component over branching `RecentWorkouts` to keep each view single-purpose; share styling by copying the established classes.

#### 2. Page renders both lists with filtered reads

**File**: `src/pages/workouts.astro`

**Intent**: Read logged and planned sets separately and render both sections.

**Contract**: Call `getRecentWorkouts(supabase, user.id, /* limit */, "logged")` for the Recent list and `getPlannedWorkouts(supabase, user.id)` for the Planned list. Render `RecentWorkouts` (logged) and the planned list. Planned section placed sensibly relative to the form (e.g. directly under it).

### Success Criteria:

#### Automated Verification:

- `npm run build` passes; lint shows no new errors.

#### Manual Verification:

- A saved planned workout appears in "Planned workouts" (soonest first) and **not** in "Recent workouts".
- Logged workouts appear only in "Recent workouts".
- Empty states render correctly when either list is empty.
- No regression to the logging flow or recent-list rendering.

**Implementation Note**: Pause for manual confirmation; this completes the slice.

---

## Testing Strategy

No automated test suite is configured (CI = lint + build). Verification is build/lint + manual.

### Manual Testing Steps:

1. Sign in; on `/workouts` toggle to **Plan**; confirm copy + date bounds change and today/past is not selectable.
2. Save a future-dated multi-exercise plan; confirm it appears under "Planned workouts" (soonest first) and not under "Recent workouts".
3. Try to plan a second workout for the same future date; confirm the "already have a plan for that day" message.
4. Switch to **Log**, save a today/backdated workout; confirm it appears under "Recent workouts" only and the logging flow is unchanged.
5. Edge: as (or simulating) a behind-UTC user, plan local "tomorrow" near UTC midnight; confirm it's accepted. Submit a clearly-past date to `/api/workouts/plan` directly; confirm server rejection.
6. Sign out; confirm `/workouts` redirects to sign-in and the plan POST redirects too.
7. Sign in as a second user; confirm none of the first user's planned workouts are visible (RLS isolation).

## Performance Considerations

Negligible — two small indexed reads per page load (existing `(user_id, workout_date)` index covers both the logged and planned queries; the new partial index covers the uniqueness check). Single-user scale.

## Migration Notes

One additive migration (partial unique index). Apply via `db push` (PAT), verify via the Management API query endpoint per project convention. Backward-safe: no existing `planned` rows, logged rows unaffected. Rollback = drop the index (no data change).

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-02, lines 92–102)
- Change identity: `context/changes/plan-future-workout/change.md`
- Reused S-01 plan: `context/changes/log-a-workout/plan.md`, brief `…/plan-brief.md`
- Contract registry: `docs/reference/contract-surfaces.md` (Workouts)
- Key files: `src/lib/workouts.ts`, `src/pages/api/workouts.ts`, `src/components/workouts/WorkoutLogForm.tsx`, `src/components/workouts/RecentWorkouts.astro`, `src/pages/workouts.astro`
- Schema: `supabase/migrations/20260619132351_create_workouts.sql`, `…/20260622132912_add_workout_exercise_reps.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Migration — one-plan-per-day guard

#### Automated

- [x] 1.1 Migration applies cleanly via `db push` — 331b5ac
- [x] 1.2 `npm run build` passes — 331b5ac

#### Manual

- [x] 1.3 Partial unique index exists (`WHERE status = 'planned'`), confirmed via Management API — 331b5ac
- [x] 1.4 Second same-date `planned` insert fails; two `logged` rows for one date still succeed — 331b5ac

### Phase 2: Data layer — status-aware write + planned read

#### Automated

- [x] 2.1 Type checking / `npm run build` passes (signatures backward-compatible) — adc6093
- [x] 2.2 Lint shows no new errors — adc6093

#### Manual

- [x] 2.3 `createWorkout` writes `planned`; duplicate same-date returns the friendly message — adc6093
- [x] 2.4 `getPlannedWorkouts` returns planned-only soonest-first; `getRecentWorkouts(..., 'logged')` excludes planned — adc6093

### Phase 3: Entry path — plan-mode toggle + API route

#### Automated

- [x] 3.1 `npm run build` passes; lint shows no new errors — bdb64d5

#### Manual

- [x] 3.2 Plan toggle changes copy + date bounds; picker disallows today/past — bdb64d5
- [x] 3.3 Plan-mode save persists `status = 'planned'` and confirms — bdb64d5
- [x] 3.4 Log mode unchanged (defaults today, allows backdate, rejects future, writes `logged`) — bdb64d5
- [x] 3.5 Behind-UTC "tomorrow" accepted; clearly-past date rejected server-side — bdb64d5
- [x] 3.6 Signed-out POST to `/api/workouts/plan` redirects to sign-in — bdb64d5

### Phase 4: Presentation — planned workouts list

#### Automated

- [x] 4.1 `npm run build` passes; lint shows no new errors

#### Manual

- [x] 4.2 Planned workout appears in "Planned workouts" (soonest first), not in "Recent workouts"
- [x] 4.3 Logged workouts appear only in "Recent workouts"
- [x] 4.4 Empty states render for both lists
- [x] 4.5 No regression to logging flow or recent-list rendering
