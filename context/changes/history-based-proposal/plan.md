# History-Based Workout Proposal (S-03) Implementation Plan

## Overview

Give a logged-in user a workout **proposal** for a chosen muscle group and target day, derived entirely from their **own logged history** — not a generic template. The user picks a muscle group + day, sees a proposed plan (their most-recent set per exercise with a small progressive weight bump), and either **accepts** it as a planned workout or **ignores** it. This is the product's north-star differentiator (roadmap S-03, PRD US-01 / FR-005).

The whole flow rides on infrastructure that already exists. The only genuinely new code is a **derivation module** (`src/lib/proposal.ts`). History reads, the catalog, the plan-create route, the RLS, and the planned-workout render are all reused unchanged.

## Current State Analysis

What exists today (verified against the codebase at commit `6942c80`):

- **History source** — `getRecentWorkouts(supabase, userId, limit, "logged")` (`src/lib/workouts.ts:153-180`) returns `LoggedWorkout[]`, newest first (`workout_date` desc, `created_at` desc), each exercise carrying `{exerciseId, exerciseName, sets, reps, weight}`. The `reps` column is real (migration `20260622132912`). This is everything the derivation needs.
- **Catalog** — `getExercises(supabase, slug)` (`src/lib/catalog.ts:59-81`) returns the exercises for one muscle group; `getMuscleGroups` (`:36-52`) lists groups. Already used by `workouts.astro:15-16`.
- **Accept path** — `POST /api/workouts/plan` (`src/pages/api/workouts/plan.ts`) parses a `{exerciseId, sets, reps, weight}[]` JSON field + a `workout_date`, validates date is today-or-future (UTC), and calls `createWorkout(..., {status: "planned"})` (`src/lib/workouts.ts:80-124`). On success redirects `/workouts?planned=1`; on a one-plan-per-day collision (Postgres `23505`) redirects `/workouts?error=You already have a plan for that day.` **Reused unchanged** for accept.
- **Proposal output target type** — `WorkoutExerciseInput {exerciseId, sets, reps, weight}` (`src/lib/workouts.ts:25-30`) maps 1:1 onto a proposal row. DB constraints: `sets` int ≥ 1, `reps` int ≥ 1, `weight` numeric ≥ 0.
- **UI surface** — `WorkoutLogForm.tsx` is a `client:load` React island with a Log/Plan tab toggle (`:218-236`), a muscle-group selector, a row renderer, date-bounds logic (`switchMode`, `localDateIso`), and a hidden `exercises` JSON field (`:398`). `workouts.astro` loads catalog + history server-side and passes them in. `PlannedWorkouts.astro` shows the accepted-plan render shape.
- **No JSON data API today** — every interaction is SSR page load + form POST + redirect. This plan keeps that convention (proposal is computed server-side from query params, not fetched as JSON).

Blocking product decisions — **already resolved** in `change.md` (2026-06-26), closing roadmap Open Question 1:

- **Minimum history**: ≥ 3 logged sessions for the chosen muscle group. Below that → no proposal.
- **Empty-state**: prompt to log first (do not fall back to manual planning, do not silently hide the group).

## Desired End State

On `/workouts`, a third **Propose** tab lets the user choose a muscle group and a target day and click *Get proposal*. The page reloads server-side and either:

- **shows a proposal** — one read-only row per exercise the user has logged for that group, each displaying "was *X* kg → propose *Y* kg" at the carried sets×reps, with **Accept as plan** and **Ignore** actions; or
- **shows the empty-state** — "Log at least 3 sessions for *<group>* to get a proposal (you have *N*)", with a CTA back to logging.

Accepting posts the proposal to the existing plan route, materializing a `planned` workout (visible immediately in *Planned workouts*) and showing the existing "Workout planned." confirmation. **Verification**: a user with ≥ 3 logged chest sessions gets a chest proposal whose weights are a small bump over their last logged set; accepting it creates a planned workout for the chosen day; a user with < 3 sees the empty-state.

### Key Discoveries:

- The accept path needs **zero new backend code** — `/api/workouts/plan` already accepts exactly the proposal payload and enforces the today-or-future date rule US-01 requires (`src/pages/api/workouts/plan.ts:13-20,50`).
- The one-plan-per-day collision already returns a friendly, non-destructive error (`src/lib/workouts.ts:100-103`); "block on collision" is therefore free.
- History granularity is one row per exercise per workout (uniform sets/reps), which is exactly enough for "carry last set + bump weight" (`research.md` Area 1).
- The team lesson "prefer native JS/TS, don't add deps" (`context/foundation/lessons.md:9`) is honored — the bump is one line of arithmetic in `src/lib/proposal.ts`, no `@finegym/fitness-calc` dependency.

## What We're NOT Doing

- **No inline editing of the proposal.** Preview is read-only (Accept / Ignore). Editing weights/reps before saving is manual planning — that is S-02's job (PRD FR-004 vs FR-005: proposal = automation, planning = manual control).
- **No `@finegym/fitness-calc` (or any new dependency).** Native arithmetic only.
- **No schema, migration, or RLS change.** No new table, column, or policy.
- **No change to `/api/workouts/plan` or `createWorkout`.** Accept reuses them verbatim.
- **No 1RM percentage model, trend/regression analysis, or multi-set pyramid handling.** Heuristic v1 = last weight + small % bump.
- **No JSON/fetch API.** Proposal is computed server-side from query params on page load.
- **No "replace existing plan" on collision.** Block with the existing friendly error; user picks another day or deletes the old plan.
- **No preservation of the proposal across a failed accept.** A collision redirects to a clean `/workouts?error=…`; re-request if needed (see Open Risks).

## Implementation Approach

Two layers, two phases:

1. **Derivation + server generation** — a pure core (`buildProposal`) that takes logged history + the group's exercise ids and returns a discriminated `ProposalResult`, plus a thin async wrapper (`generateProposal`) that fetches via the existing catalog/history helpers. `workouts.astro` reads `propose` / `muscleGroup` / `date` query params, calls `generateProposal`, and passes the result into the island.
2. **Propose tab UI** — restructure `WorkoutLogForm.tsx` so the tab bar sits outside the POST form; the Propose tab renders a GET request form (group + day → *Get proposal*, a page navigation) and, when a proposal prop is present, the read-only preview + an Accept POST to `/api/workouts/plan` + Ignore, or the empty-state.

The SSR-via-query-params design (rather than a client fetch) keeps the app's "no JSON API, everything is page-load + form-POST" convention intact and puts all derivation on the server.

## Critical Implementation Details

- **Most-recent set per exercise**: `getRecentWorkouts(..., "logged")` already returns newest-first, so the *first* occurrence of each `exerciseId` while iterating is its latest set. No extra sorting needed, but fetch a generous limit (e.g. 100) so older-but-still-relevant exercises in the group aren't truncated.
- **Session count is per workout, not per exercise**: "≥ 3 sessions for the group" counts **distinct logged `workouts`** that contain at least one exercise in the group — not 3 rows of one exercise. Count distinct `workout.id` where any child exercise is in the group's id set.
- **Weight bump must stay valid and never regress**: multiply the historical weight by `1.025`, round to the nearest 0.5 kg; if that rounds back to (or below) the historical weight and the historical weight is > 0, use `historical + 0.5`; if historical weight is 0 (bodyweight), keep 0. Result is always ≥ historical and DB-valid (`weight ≥ 0`). Carried `sets`/`reps` are already integers ≥ 1, so they pass unchanged.

## Phase 1: Proposal derivation + server generation

### Overview

Add the derivation module and wire it into the page so a propose-request URL yields a `ProposalResult`. No UI yet — verified by type/build plus a temporary inline render of the result.

### Changes Required:

#### 1. Proposal derivation module

**File**: `src/lib/proposal.ts` (new)

**Intent**: Turn a user's logged history for one muscle group into a proposal, or signal insufficient history. Pure core for testability + a thin async wrapper that reuses existing helpers. Houses the only new business logic in this change.

**Contract**:
- Constants: `MIN_SESSIONS = 3`, `PROGRESSION_FACTOR = 1.025`.
- `ProposalExercise = { exerciseId, exerciseName, sets, reps, weight, previousWeight }` — `weight` is the bumped/rounded value, `previousWeight` the historical one (for "was X → propose Y" display).
- `ProposalResult = { kind: "ok"; muscleGroupName; exercises: ProposalExercise[] } | { kind: "insufficient-history"; muscleGroupName; sessionCount }`.
- `buildProposal(loggedWorkouts: LoggedWorkout[], groupExerciseIds: Set<number>, muscleGroupName: string): ProposalResult` — pure. Counts distinct logged workouts touching the group; if `< MIN_SESSIONS` returns `insufficient-history`; else for each group exercise present in history, takes the most-recent set and emits a `ProposalExercise` with the bumped weight (per the rounding rule in Critical Implementation Details). Skips group exercises with no history.
- `generateProposal(supabase, userId, muscleGroupSlug): Promise<ProposalResult | null>` — async wrapper: resolves the group + its exercise ids via `getExercises`/`getMuscleGroups`, fetches `getRecentWorkouts(supabase, userId, 100, "logged")`, delegates to `buildProposal`. Returns `null` on a null client or unknown slug (page treats it as "no proposal requested"). Never throws.

#### 2. Server-side proposal generation in the workouts page

**File**: `src/pages/workouts.astro`

**Intent**: Detect a propose-request via query params, compute the proposal server-side, and pass it (plus the requested muscle group + date) into the island alongside the existing catalog/history props.

**Contract**: Read `propose` (presence flag), `muscleGroup` (slug), and `date` (`YYYY-MM-DD`) from `Astro.url.searchParams`. When `propose` is set and the user is authed, call `generateProposal(supabase, user.id, muscleGroup)` and pass the resulting `ProposalResult | null` plus the echoed `muscleGroup`/`date` into `WorkoutLogForm` as new props. When not requesting, pass `null`. No change to existing catalog/history loading. (Temporary: render the raw result as JSON for Phase-1 manual verification; removed in Phase 2.)

### Success Criteria:

#### Automated Verification:

- [ ] Linting passes (no *new* errors vs baseline): `npm run lint`
- [ ] Production build succeeds: `npm run build`

#### Manual Verification:

- [ ] Visiting `/workouts?propose=1&muscleGroup=<slug>&date=<future>` for a user with ≥ 3 logged sessions in that group renders an `ok` result whose `weight` values are a small bump over `previousWeight`.
- [ ] The same URL for a user with < 3 qualifying sessions renders `insufficient-history` with the correct `sessionCount`.
- [ ] An unknown/empty `muscleGroup` yields no proposal (treated as no request), not an error.

**Implementation Note**: After Phase 1 automated verification passes, pause for human confirmation that the temporary JSON render shows correct proposals before building the UI in Phase 2.

---

## Phase 2: "Propose" tab UI

### Overview

Surface the proposal as a third tab in `WorkoutLogForm.tsx`: request (group + day), read-only preview with Accept/Ignore, and the empty-state. Remove the Phase-1 temporary render.

### Changes Required:

#### 1. Tab restructure + Propose mode

**File**: `src/components/workouts/WorkoutLogForm.tsx`

**Intent**: Add a third mode without breaking the shared Log/Plan POST form. Move the tab bar outside the POST `<form>` so each mode can own its own form element (the request is a GET navigation; accept is a POST to a different action — these can't be nested in the log/plan form).

**Contract**:
- `Mode` becomes `"log" | "plan" | "propose"`; add a third tab button.
- New props: `proposal: ProposalResult | null`, plus the echoed `proposeMuscleGroup?: string` and `proposeDate?: string`. Initialize `mode` to `"propose"` when a `proposal` (or a propose request) is present, so a post-request reload lands on the tab.
- Render the existing log/plan POST form only in those two modes; render the Propose UI separately when `mode === "propose"`.

#### 2. Proposal request form (GET)

**File**: `src/components/workouts/WorkoutLogForm.tsx` (Propose mode)

**Intent**: Let the user choose a muscle group + target day and request a proposal via a server round-trip.

**Contract**: A `<form method="GET" action="/workouts">` with a hidden `propose=1`, a muscle-group `<select>` (reusing `muscleGroups`, but a *single specific group* — no "All groups" option, since a proposal targets one group), and a date input defaulting to today with `min` = today (US-01 allows today or future). Submitting navigates to `/workouts?propose=1&muscleGroup=<slug>&date=<iso>`, which Phase 1 already handles.

#### 3. Proposal preview + accept/ignore + empty-state

**File**: `src/components/workouts/WorkoutLogForm.tsx` (Propose mode)

**Intent**: Render the computed proposal read-only and let the user commit or dismiss it; show the empty-state when history is insufficient.

**Contract**:
- `proposal.kind === "ok"`: list each `ProposalExercise` read-only as "<name> — <sets> × <reps> @ <previousWeight> → **<weight>** kg" (reuse `PlannedWorkouts.astro` styling cues). Below it, an **Accept as plan** `<form method="POST" action="/api/workouts/plan">` carrying `workout_date` = requested date and a hidden `exercises` field = `JSON.stringify` of the rows mapped to `WorkoutExerciseInput` (`{exerciseId, sets, reps, weight}`), submitted via the existing `SubmitButton`. An **Ignore** control links back to `/workouts` (clears the propose params). On success the existing route redirects to `/workouts?planned=1` → existing "Workout planned." banner.
- `proposal.kind === "insufficient-history"`: render "Log at least 3 sessions for *<muscleGroupName>* to get a proposal — you have *<sessionCount>*." with a CTA that switches to the Log tab (or links to `/workouts`).
- No `proposal`: show only the request form.

### Success Criteria:

#### Automated Verification:

- [ ] Linting passes (no *new* errors vs baseline): `npm run lint`
- [ ] Production build succeeds: `npm run build`

#### Manual Verification:

- [ ] Propose tab → pick a group with ≥ 3 logged sessions + a date → *Get proposal* shows a read-only plan with bumped weights.
- [ ] *Accept as plan* creates a planned workout for that day (appears in Planned workouts) and shows "Workout planned."
- [ ] Accepting when a plan already exists for that day shows "You already have a plan for that day." and creates nothing.
- [ ] A group with < 3 sessions shows the empty-state with the correct count and a working CTA to log.
- [ ] *Ignore* returns to the form with no plan created; Log/Plan tabs still work unchanged.
- [ ] Proposal appears within ~2s of *Get proposal* (NFR), on desktop and mobile-width viewport.

**Implementation Note**: After Phase 2 automated verification passes, pause for human confirmation of the manual UI testing (this is a user-facing surface and the north-star flow) before considering the change complete.

---

## Testing Strategy

No automated test suite is configured (CI = lint + build only), so correctness rests on the pure core's simplicity plus manual verification.

### Unit Tests:

- None added (no harness). `buildProposal` is written as a pure function so it *can* be unit-tested later; if a harness lands, cover: < 3 sessions → empty-state; exactly 3 → ok; bump rounding (e.g. 60 → 62.5, 20 → 20.5→ guard); bodyweight (0 → 0); exercises with no history skipped; session count counts distinct workouts not rows.

### Integration Tests:

- Manual end-to-end only: request → proposal → accept → planned workout visible.

### Manual Testing Steps:

1. As a user with ≥ 3 logged chest sessions, open `/workouts`, Propose tab, pick Chest + a future date, *Get proposal* — verify rows and bumped weights.
2. Accept — verify a planned workout appears and the confirmation shows.
3. Accept again for the same day — verify the friendly collision error and no duplicate.
4. As a user with < 3 sessions for a group, request a proposal — verify the empty-state and count.
5. Ignore a proposal — verify nothing is created and Log/Plan still work.

## Performance Considerations

Proposal generation is one catalog read + one history read (≤ 100 rows) + in-memory grouping — trivially within the < 2s NFR. The SSR round-trip on *Get proposal* is a normal page load. No N+1: `getRecentWorkouts` embeds exercises in a single PostgREST query.

## Migration Notes

None. No schema, data, or RLS changes. The change is purely additive code; reverting is deleting `src/lib/proposal.ts` and the `workouts.astro` / `WorkoutLogForm.tsx` additions.

## References

- Research: `context/changes/history-based-proposal/research.md`
- Library research: `context/changes/history-based-proposal/library-research.md`
- Resolved blocking decisions: `context/changes/history-based-proposal/change.md`
- Accept path (reused): `src/pages/api/workouts/plan.ts`, `src/lib/workouts.ts:80-124`
- History source (reused): `src/lib/workouts.ts:153-180`
- Catalog (reused): `src/lib/catalog.ts:36-81`
- UI surface to extend: `src/components/workouts/WorkoutLogForm.tsx`, `src/pages/workouts.astro`
- Lesson honored (native, no dep): `context/foundation/lessons.md:9`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Proposal derivation + server generation

#### Automated

- [x] 1.1 Linting passes (no new errors vs baseline): `npm run lint` — 13e6340
- [x] 1.2 Production build succeeds: `npm run build` — 13e6340

#### Manual

- [x] 1.3 Propose URL for a user with ≥ 3 sessions renders an `ok` result with bumped weights — 13e6340
- [x] 1.4 Propose URL for a user with < 3 qualifying sessions renders `insufficient-history` with correct `sessionCount` — 13e6340
- [x] 1.5 Unknown/empty `muscleGroup` yields no proposal (no error) — 13e6340

### Phase 2: "Propose" tab UI

#### Automated

- [x] 2.1 Linting passes (no new errors vs baseline): `npm run lint`
- [x] 2.2 Production build succeeds: `npm run build`

#### Manual

- [x] 2.3 Propose tab produces a read-only plan with bumped weights for a group with ≥ 3 sessions
- [x] 2.4 Accept as plan creates a planned workout and shows the confirmation
- [x] 2.5 Accepting into an occupied day shows the friendly collision error and creates nothing
- [x] 2.6 Group with < 3 sessions shows empty-state with correct count and working CTA
- [x] 2.7 Ignore creates nothing; Log/Plan tabs unaffected
- [x] 2.8 Proposal appears within ~2s on desktop and mobile-width viewport
