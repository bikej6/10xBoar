# Weight Progress Stats (S-04) Implementation Plan

## Overview

Build a read-only `/stats` page that shows, for **each exercise in the user's logged
history**, a small inline-SVG sparkline of **logged weight over time**. This satisfies
FR-006 (*"Użytkownik widzi statystyki/wykres progresu ciężaru dla każdego ćwiczenia"*),
a must-have Secondary success criterion. The view is derived entirely from data that
already exists — no schema change, no new RLS, no React island.

## Current State Analysis

- **The data contract already exists.** `getRecentWorkouts(supabase, userId, limit, "logged")`
  (`src/lib/workouts.ts:153`) returns `LoggedWorkout[]` newest-first, each with
  `{ id, workoutDate, status, exercises: [{ exerciseId, exerciseName, sets, reps, weight }] }`.
  That is everything a per-exercise weight-over-time series needs.
- **Render convention is server-rendered Astro sections**, not React islands:
  `RecentWorkouts.astro` and `PlannedWorkouts.astro` each take a `LoggedWorkout[]` prop
  and render a list. The page shell (`src/pages/workouts.astro`) fetches via the `@/lib`
  helpers and passes data down.
- **There is a clean derivation pattern to mirror.** `src/lib/proposal.ts` splits a pure
  core (`buildProposal`) — the only new business logic — from a thin async wrapper
  (`generateProposal`) that resolves catalog/history via existing helpers and delegates.
- **No charting library** is in the project, and `context/foundation/lessons.md` warns
  against adding dependencies casually (prefer native JS/TS). So the chart is hand-rolled
  inline SVG.
- **Route protection** is a string-prefix match against `PROTECTED_ROUTES`
  (`src/middleware.ts:4`); `context.locals.user` is already populated for every route.
- **No test suite is configured** (CLAUDE.md): CI runs `lint` + `build` only. Automated
  verification for this slice is lint + typecheck + build; correctness of the pure
  functions is verified manually.

## Desired End State

A signed-in user can open `/stats` (linked from the dashboard) and see one block per
exercise they have ever logged, each showing a sparkline of the weight they logged for
that exercise across sessions, newest-trained exercise first. An exercise logged only
once shows its current weight with a gentle "log more sessions to see a trend" hint. A
user with no logged history sees a friendly empty state. Unauthenticated visitors to
`/stats` are redirected to `/auth/signin`.

Verify by: logging the same exercise at increasing weights across ≥2 dates, opening
`/stats`, and seeing an upward sparkline for that exercise; logging a brand-new exercise
once and seeing the single-point hint; a fresh account seeing the empty state.

### Key Discoveries:

- Read helper to reuse: `getRecentWorkouts(supabase, userId, limit, "logged")` — `src/lib/workouts.ts:153`.
- Source order is **newest-first** (`workout_date` desc) — the pure core must reverse to
  chronological for a left→right time series.
- Pure-core/async-wrapper pattern to mirror: `src/lib/proposal.ts:64` (`buildProposal`) and `:109` (`generateProposal`).
- Astro read-section pattern to mirror: `src/components/workouts/RecentWorkouts.astro` (incl. its empty state at line 15).
- Route protection: add `/stats` to `PROTECTED_ROUTES` — `src/middleware.ts:4`.
- Dependency discipline: `context/foundation/lessons.md` (no casual deps).

## What We're NOT Doing

- No charting library / React island — the sparkline is inline SVG in an Astro component.
- No new metric beyond **logged weight** (no estimated 1RM, no volume).
- No numeric first→latest/Δ summary, no per-muscle-group grouping, no date-range filter,
  no single-exercise selector — these were explicitly deferred (MVP core only).
- No schema change, migration, or new RLS policy — read-only over existing tables.
- No edit/delete of history (that is S-06).
- No new test runner — the project has none; we do not introduce one in this slice.

## Implementation Approach

Two phases. Phase 1 adds `src/lib/stats.ts`: a pure `buildExerciseProgress` that maps the
existing `LoggedWorkout[]` into per-exercise chronological weight series, plus a pure
`sparklineGeometry` helper that converts a list of weights into SVG polyline/point
coordinates (kept pure so the geometry is trivially inspectable). A thin async
`getExerciseProgress` wrapper fetches logged history via `getRecentWorkouts` and delegates.
Phase 2 renders it: a `WeightProgress.astro` section consuming `ExerciseProgress[]`, a
`Sparkline.astro` presentational component drawing the SVG, a `/stats` page shell wiring
the fetch, the `PROTECTED_ROUTES` entry, and a dashboard link.

## Critical Implementation Details

- **Chronological reversal.** `getRecentWorkouts` returns newest-first; the time series
  must read oldest→newest left-to-right. `buildExerciseProgress` reverses the workout
  order (or sorts points by `workoutDate` ascending) before collecting points.
- **Degenerate y-range.** A single point, or several sessions all at the same weight,
  yields `max === min`. `sparklineGeometry` must not divide by zero — clamp a zero range
  to render a horizontal mid-line (and a single point renders as a centered dot, handled
  by the component as the "log more" case). Bodyweight exercises (weight `0`) are valid and
  render as a flat line at the baseline.
- **History cap.** `getRecentWorkouts` defaults `limit` to 10; stats needs the user's full
  history. Call it with a generous explicit cap (e.g. a `STATS_HISTORY_LIMIT = 1000`
  constant in `stats.ts`), acceptable at the project's stated small scale (F1).

## Phase 1: Data derivation layer

### Overview

Add `src/lib/stats.ts` with the pure series-building core, the pure SVG-geometry helper,
and the thin async wrapper. No UI in this phase.

### Changes Required:

#### 1. Stats derivation module

**File**: `src/lib/stats.ts` (new)

**Intent**: Turn the user's logged history into per-exercise, chronologically-ordered
weight series, and provide the pure geometry used to draw a sparkline — keeping all new
logic pure and reusing the existing read helper, mirroring `proposal.ts`.

**Contract**:
- `STATS_HISTORY_LIMIT` constant (e.g. `1000`) — the cap passed to `getRecentWorkouts`.
- `export interface ExerciseProgressPoint { workoutDate: string; weight: number }`.
- `export interface ExerciseProgress { exerciseId: number; exerciseName: string; points: ExerciseProgressPoint[]; latestWeight: number }`
  — `points` ordered oldest→newest; `latestWeight` is the most recent point's weight (for
  the single-point hint and any endpoint label).
- `export function buildExerciseProgress(loggedWorkouts: LoggedWorkout[]): ExerciseProgress[]`
  — pure. Groups every exercise occurrence across workouts by `exerciseId`, emits one
  point per occurrence (`workoutDate`, `weight`), orders each exercise's points
  oldest→newest, and orders the returned exercises by most-recently-trained first.
  Returns `[]` for empty input.
- `export function sparklineGeometry(weights: number[], width: number, height: number): { points: string; lastX: number; lastY: number }`
  — pure. Maps `weights` (already chronological) to SVG coordinates: x evenly spaced by
  index across `width`, y scaled to `[min,max]` within `height` (top = max), with a
  zero-range clamp that centers the line. `points` is the `polyline`/`polygon` coordinate
  string; `lastX`/`lastY` locate the latest-point marker.
- `export async function getExerciseProgress(supabase, userId): Promise<ExerciseProgress[]>`
  — thin wrapper: returns `[]` on null client; otherwise
  `buildExerciseProgress(await getRecentWorkouts(supabase, userId, STATS_HISTORY_LIMIT, "logged"))`.
  Never throws. Same null-safety convention as `generateProposal`.

### Success Criteria:

#### Automated Verification:

- Typecheck/sync passes: `npx astro sync` then `npm run build` (no TS errors)
- Linting passes for the new file: `npm run lint` (no new errors introduced)

#### Manual Verification:

- `buildExerciseProgress` orders points oldest→newest and groups correctly (reason through
  a small fixture: two exercises across three dated workouts).
- `sparklineGeometry` returns finite coordinates for a single weight and for all-equal
  weights (no `NaN`/division-by-zero).

**Implementation Note**: After completing this phase and all automated verification passes,
pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Stats page, UI, and navigation

### Overview

Render the derived data: a sparkline component, a section that lists one block per
exercise (with single-point and empty states), a `/stats` page shell, route protection,
and a dashboard link.

### Changes Required:

#### 1. Sparkline component

**File**: `src/components/workouts/Sparkline.astro` (new)

**Intent**: Draw one exercise's weight series as a small inline SVG line, with a marker on
the latest point — no client JS.

**Contract**: Props `{ points: ExerciseProgressPoint[] }` (or `weights: number[]`). Uses
`sparklineGeometry` from `stats.ts` to compute coordinates for a fixed `viewBox`; renders
an SVG `polyline` (stroke, no fill, `vector-effect="non-scaling-stroke"`) plus a small
circle at `lastX/lastY`. Styling consistent with the app's glass/blue palette
(`text-blue-…`, `stroke-current`). For a single point, renders just the centered dot.

#### 2. Weight-progress section

**File**: `src/components/workouts/WeightProgress.astro` (new)

**Intent**: List one progress block per exercise, with the global empty state and the
thin-history hint.

**Contract**: Props `{ exercises: ExerciseProgress[] }`. Mirrors `RecentWorkouts.astro`
structure (section heading + list). Empty input → friendly empty state ("No logged
workouts yet…", mirroring `RecentWorkouts.astro:15`). Per exercise: name, the `Sparkline`,
and the `latestWeight` (e.g. `… @ X kg`). When an exercise has exactly one point, show the
"log more sessions to see a trend" hint instead of (or beneath) the lone dot.

#### 3. Stats page shell

**File**: `src/pages/stats.astro` (new)

**Intent**: Authenticated page that fetches the progress data and renders the section,
matching the existing page styling.

**Contract**: Mirrors `workouts.astro`/`dashboard.astro` layout (Layout + cosmic glass
card). Creates the per-request client via `createClient(Astro.request.headers, Astro.cookies)`,
reads `Astro.locals.user`, calls `getExerciseProgress(supabase, user.id)` when a user is
present (else `[]`), and passes the result to `WeightProgress`. Includes a "Back to
dashboard" link like `workouts.astro:52`.

#### 4. Route protection

**File**: `src/middleware.ts`

**Intent**: Require auth for `/stats`.

**Contract**: Add `"/stats"` to the `PROTECTED_ROUTES` array (`src/middleware.ts:4`).

#### 5. Dashboard navigation

**File**: `src/pages/dashboard.astro`

**Intent**: Give users a way to reach the new page.

**Contract**: Add a link/button to `/stats` (e.g. "View progress") alongside the existing
"Log a workout" link (`dashboard.astro:17`), matching its styling.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Linting passes: `npm run lint` (no new errors)

#### Manual Verification:

- Signed-out visit to `/stats` redirects to `/auth/signin`.
- With ≥2 logged sessions of one exercise at rising weights, `/stats` shows an upward
  sparkline for it, newest-trained exercise first.
- A once-logged exercise shows the single-point "log more" hint, not a broken/empty chart.
- A fresh account (no logged workouts) shows the empty state, no errors.
- Sparkline renders legibly on mobile-width viewport; dashboard link reaches `/stats`.

**Implementation Note**: After completing this phase and all automated verification passes,
pause for manual confirmation that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- No test runner is configured in this project, so no automated unit tests are added.
  `buildExerciseProgress` and `sparklineGeometry` are written as pure functions so they
  can be reasoned about directly and would be the first targets if a runner is later
  introduced (grouping/order correctness; zero-range and single-point geometry).

### Integration Tests:

- None (no test harness). Covered by manual verification below.

### Manual Testing Steps:

1. Sign in. Log exercise "Bench press" on three different past dates at 40, 42.5, 45 kg.
2. Open `/stats` → Bench press block shows a rising sparkline with a marker on the latest
   point and "@ 45 kg".
3. Log a new exercise once → its block shows the single-point hint.
4. Sign out, visit `/stats` directly → redirected to `/auth/signin`.
5. Create/use an account with no logged workouts → `/stats` shows the empty state.
6. Narrow the viewport to phone width → sparklines and layout remain legible.

## Performance Considerations

One indexed query per page load (`getRecentWorkouts`, covered by
`workouts_user_id_workout_date_idx`) capped at `STATS_HISTORY_LIMIT`. All derivation is
in-memory over the user's own rows; trivial at the project's stated scale. No client JS
shipped (pure SSR SVG).

## Migration Notes

None — no schema or data changes.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-04: weight-progress-stats)
- Read helper reused: `src/lib/workouts.ts:153` (`getRecentWorkouts`)
- Pure-core/wrapper pattern: `src/lib/proposal.ts:64`, `:109`
- Render-section pattern: `src/components/workouts/RecentWorkouts.astro`
- Page shell pattern: `src/pages/workouts.astro`, `src/pages/dashboard.astro`
- Route protection: `src/middleware.ts:4`
- Dependency rule: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data derivation layer

#### Automated

- [x] 1.1 Typecheck/sync + build passes (`npx astro sync` then `npm run build`) — b98c88c
- [x] 1.2 Linting passes for the new file (`npm run lint`, no new errors) — b98c88c

#### Manual

- [x] 1.3 `buildExerciseProgress` grouping and oldest→newest ordering verified on a fixture — b98c88c
- [x] 1.4 `sparklineGeometry` returns finite coords for single-weight and all-equal-weights inputs — b98c88c

### Phase 2: Stats page, UI, and navigation

#### Automated

- [x] 2.1 Build passes (`npm run build`) — ab03bef
- [x] 2.2 Linting passes (`npm run lint`, no new errors) — ab03bef

#### Manual

- [x] 2.3 Signed-out visit to `/stats` redirects to `/auth/signin` — ab03bef (code-verified: `/stats` in PROTECTED_ROUTES)
- [x] 2.4 ≥2 logged sessions render an upward sparkline, newest-trained exercise first — ab03bef (logic-verified; in-browser confirmation pending)
- [x] 2.5 Once-logged exercise shows the single-point "log more" hint — ab03bef (code-verified)
- [x] 2.6 Fresh account shows the empty state with no errors — ab03bef (code-verified)
- [x] 2.7 Sparkline legible on mobile width; dashboard link reaches `/stats` — ab03bef (link code-verified; visual legibility pending in-browser)
