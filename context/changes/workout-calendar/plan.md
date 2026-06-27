# Workout Calendar (S-05) Implementation Plan

## Overview

Add a read-only, dedicated `/calendar` page that shows the signed-in user a navigable
month grid. Days that have a workout are marked — logged (history) and planned (future)
sessions visually distinguished — and clicking a day expands that day's details
(exercises × sets × reps @ weight). All of the user's workouts are loaded once and passed
into a React island; month paging and day selection happen client-side with no server
round-trips.

This delivers roadmap slice **S-05** (`workout-calendar`): "użytkownik widzi kalendarz z
oznaczonymi dniami, w których ma zapisany trening, i po kliknięciu dnia widzi szczegóły
treningu". It reads the existing logged/planned history (FR-003 read path) without touching
the schema.

## Current State Analysis

- **The read contract already exists.** `src/lib/workouts.ts` exposes `getRecentWorkouts`
  (capped at `limit`, optional `status` filter) and `getPlannedWorkouts`, both selecting the
  shared `WORKOUT_SELECT` embed and mapping rows to `LoggedWorkout` via `mapWorkoutRow`
  (`src/lib/workouts.ts:127`, `:130`). The calendar needs *all* of a user's workouts across
  both statuses, uncapped — the existing helpers are capped at 10, so a dedicated read is
  warranted rather than passing an artificial large limit.
- **`workout_date` is a SQL `date`** (`supabase/migrations/20260619132351_create_workouts.sql:20`),
  stored and returned as a plain `YYYY-MM-DD` string. Grouping workouts onto calendar cells
  is therefore pure string keying — no timezone math at read time. (The roadmap's timezone
  "unknown" only applied at *write* time, settled in S-01.)
- **`status`** distinguishes `logged` (past) from `planned` (future) on the same table
  (`src/lib/workouts.ts:23`). The calendar uses this to style the two marker types.
- **Sibling slice S-04 (`weight-progress-stats`) sets the house style**: a dedicated,
  server-rendered Astro page linked from the dashboard, a pure-derivation module + thin async
  read wrapper, and **no new dependencies** (`context/changes/weight-progress-stats/plan-brief.md`).
  `lessons.md` forbids pulling in libraries like lodash — native JS only.
- **React is the island framework for interactive components** (CLAUDE.md); `WorkoutLogForm.tsx`
  is the precedent for a `client:load` island that receives server-fetched data as props.
- **Route protection** is an array in `src/middleware.ts:4` (`PROTECTED_ROUTES`). `/workouts`
  and `/dashboard` are listed; `/stats` (S-04) and `/calendar` are not yet present.
- **No test runner is configured** — CI runs `lint` + `build` only (CLAUDE.md). Verification
  is type-check / lint / build + manual testing.

## Desired End State

A signed-in user opens `/calendar` (linked from the dashboard) and sees the current month as
a grid. Days with a logged workout show one marker style; days with a planned (future)
workout show another; a legend explains both. Clicking a marked day expands an in-page panel
listing that day's exercises with sets × reps @ weight. Prev/next buttons move between months
without a page reload (the data is already client-side). A user with no workouts sees a gentle
empty state, not an error. Signed-out visitors hitting `/calendar` are redirected to sign-in.

Verify by: signing in with an account that has both logged and planned workouts, navigating
months, clicking days, and confirming details, marker styles, and the empty state render
correctly; and by confirming a signed-out request to `/calendar` redirects to `/auth/signin`.

### Key Discoveries:

- Reuse the existing `WORKOUT_SELECT` embed and `mapWorkoutRow` mapper — add only the new
  uncapped, all-status read (`src/lib/workouts.ts:127`).
- `workout_date` is a plain date string → group by it directly, no `Date`-parsing for keying
  (`supabase/migrations/20260619132351_create_workouts.sql:20`).
- Pure-core + thin-wrapper pattern and dedicated-page + dashboard-link placement are already
  established by S-04 — follow them for consistency.
- `LoggedWorkout` is a type-only import for the React island; it carries no Supabase runtime
  code, so importing it client-side is safe.

## What We're NOT Doing

- **No editing or deleting** workouts from the calendar — that is S-06 (`edit-workout`),
  explicitly out of scope. The view is strictly read-only.
- **No schema or RLS change.** No migration. Reads only, under existing policies.
- **No new API route.** All workouts load once with the page; month navigation is client-side
  filtering (target scale is small per the PRD).
- **No charting / stats** — that is S-04 (`weight-progress-stats`), a separate page.
- **No week view, agenda view, or per-day add/quick-log** from the calendar.
- **No new dependency** (no calendar/date library) — native `Date` + pure helpers only.

## Implementation Approach

Two phases, mirroring S-04. Phase 1 builds the headless pieces: a dedicated read that returns
all of a user's workouts (both statuses), plus a pure `calendar.ts` module that turns a
year/month into a grid of day cells and groups workouts by date — testable by reasoning,
reusable by the island. Phase 2 builds the `WorkoutCalendar` React island (month header,
prev/next, weekday row, marked day cells, legend, day-detail panel, empty state), the
`/calendar` Astro page that fetches the data and mounts the island, the `PROTECTED_ROUTES`
entry, and the dashboard link.

The island holds the full workout list and derives the visible month client-side; "today"
highlighting uses the client's local date, which is the correct day for the user and sidesteps
the Workers-UTC concern entirely (dates are compared as `YYYY-MM-DD` strings).

## Critical Implementation Details

- **Local-date string formatting must not go through `toISOString()`.** `new Date().toISOString()`
  returns a UTC day, which can be off-by-one from the user's local day near midnight. Build the
  `YYYY-MM-DD` key from `getFullYear()/getMonth()/getDate()` (local) so "today" and any
  date→key comparison align with the local calendar the user sees.
- **Month grid cell-to-date mapping** must agree exactly with the workout grouping keys
  (same local `YYYY-MM-DD` format), or markers land on the wrong cell. Both come from the
  pure `calendar.ts` helpers to guarantee one formatter.

## Phase 1: Data read + pure calendar logic

### Overview

Add the uncapped, all-status workout read and a pure month-grid/grouping module. No UI.

### Changes Required:

#### 1. All-workouts read helper

**File**: `src/lib/workouts.ts`

**Intent**: Add a read that returns *all* of the authenticated user's workouts (both `logged`
and `planned`), uncapped, so the calendar island has the full dataset to filter client-side.
Reuse the existing select embed and row mapper rather than duplicating them.

**Contract**: New exported `async function getAllWorkouts(supabase, userId): Promise<LoggedWorkout[]>`.
Selects `WORKOUT_SELECT`, filters `user_id`, no `status` filter, no `limit`, orders by
`workout_date` (asc or desc — consumer regroups by date so order is non-critical; pick asc for
determinism). Returns `[]` on null client or query error, matching the other readers. Maps via
the existing `mapWorkoutRow`.

#### 2. Pure calendar module

**File**: `src/lib/calendar.ts` (new)

**Intent**: Provide pure, dependency-free helpers that turn a year+month into a renderable grid
and group a `LoggedWorkout[]` by date, plus month-navigation arithmetic — so the island stays
thin and the date logic is verifiable in isolation.

**Contract**: Pure functions, no I/O, native `Date` only:
- `toDateKey(date: Date): string` — local `YYYY-MM-DD` (built from local getters, **not**
  `toISOString`; see Critical Implementation Details).
- `buildMonthGrid(year: number, month: number): DayCell[]` — full weeks (leading/trailing days
  from adjacent months flagged `inMonth: false`), each cell carrying its `dateKey` and `inMonth`.
  Define and export the `DayCell` type and a `WEEKDAY_LABELS` constant. Decide and document the
  week-start (Monday, to match a European audience) so the weekday header and grid agree.
- `groupWorkoutsByDate(workouts: LoggedWorkout[]): Map<string, LoggedWorkout[]>` — keyed by
  `workoutDate` (already a `YYYY-MM-DD` string).
- `addMonths(year, month, delta): { year, month }` — month navigation with year rollover.
- A small helper to derive, for a date key, whether it has logged and/or planned workouts
  (e.g. from the grouped map) — used for marker styling. May live as a derivation in the island
  if trivial; keep keying logic here.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run lint` (type-checked ESLint config)
- Production build succeeds: `npm run build`

#### Manual Verification:

- `getAllWorkouts` returns both logged and planned rows for a seeded account (spot-check via a
  temporary log or the page in Phase 2).
- `buildMonthGrid` for a known month (e.g. a month starting mid-week) produces correct
  leading/trailing days and 6×7 (or 5×7) coverage with no gaps.

**Implementation Note**: After completing this phase and all automated verification passes,
pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Calendar island + page + navigation

### Overview

Build the interactive calendar UI, the protected page that feeds it, and the navigation wiring.

### Changes Required:

#### 1. Calendar island component

**File**: `src/components/workouts/WorkoutCalendar.tsx` (new)

**Intent**: Render a navigable month grid from the full workout list, mark logged vs planned
days distinctly with a legend, and expand a selected day's details in-page — all client-side.

**Contract**: Default-exported React component. Props: `{ workouts: LoggedWorkout[] }`
(type-only import from `@/lib/workouts`). State: current `{ year, month }` (init to local today)
and `selectedDateKey: string | null`. Uses `buildMonthGrid`, `groupWorkoutsByDate`, `addMonths`,
`toDateKey` from `@/lib/calendar`. Renders: month label + prev/next buttons; weekday header row
(`WEEKDAY_LABELS`); 7-column grid of day cells where out-of-month cells are dimmed, today is
highlighted, and cells with workouts show a marker (logged vs planned styled differently — e.g.
two dot colors) and are clickable; a legend; and a detail panel showing the selected day's
exercises as `name — sets × reps @ weight kg` (reuse the row layout idiom from
`RecentWorkouts.astro:24`). Empty state when `workouts.length === 0`. Follows the existing
Tailwind glass-card styling (`bg-white/5`, `border-white/10`, `text-blue-100/…`).

#### 2. Calendar page

**File**: `src/pages/calendar.astro` (new)

**Intent**: Server-render the page shell, fetch all the user's workouts, and mount the island.

**Contract**: Mirrors `src/pages/workouts.astro` shell. Creates the per-request Supabase client
via `createClient(Astro.request.headers, Astro.cookies)`; reads `Astro.locals.user`; calls
`getAllWorkouts(supabase, user.id)` when `user` is set (else `[]`); renders inside `Layout`
with the same `bg-cosmic` wrapper and a gradient `<h1>` ("Workout calendar"); mounts
`<WorkoutCalendar workouts={...} client:load />`; includes a "Back to dashboard" link like
`workouts.astro:52`.

#### 3. Route protection

**File**: `src/middleware.ts`

**Intent**: Require auth for `/calendar`.

**Contract**: Add `"/calendar"` to the `PROTECTED_ROUTES` array (`src/middleware.ts:4`).

#### 4. Dashboard link

**File**: `src/pages/dashboard.astro`

**Intent**: Make the calendar reachable from the dashboard, alongside "Log a workout".

**Contract**: Add an anchor to `/calendar` (e.g. "View calendar") styled consistently with the
existing dashboard buttons (`src/pages/dashboard.astro:17`).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- Days with logged workouts and days with planned workouts are marked with distinct styles, and
  the legend matches.
- Clicking a marked day expands its details (exercises × sets × reps @ weight); clicking a day
  with no workout shows nothing (or an empty-day note), no error.
- Prev/next moves between months with no page reload; markers re-place correctly per month;
  "today" is highlighted in the current month.
- A fresh account (no workouts) shows the empty state, not an error.
- A signed-out request to `/calendar` redirects to `/auth/signin`.
- The dashboard link navigates to `/calendar`.
- Renders correctly on a mobile-width viewport (NFR: mobile browser).

**Implementation Note**: After completing this phase and all automated verification passes,
pause for manual confirmation. This is the user's human gate (a new user-facing view).

---

## Testing Strategy

### Unit Tests:

- No test runner is configured; pure `calendar.ts` functions are verified by reasoning and
  manual spot-checks (month boundaries, week-start alignment, date-key formatting near midnight).

### Integration Tests:

- None automated. Manual end-to-end via the running app (`npm run dev`).

### Manual Testing Steps:

1. Seed an account with at least one logged and one planned workout in the current month and
   one in an adjacent month.
2. Open `/calendar`; confirm current month renders, today is highlighted, and the right days are
   marked with the correct logged/planned styles.
3. Click a marked day; confirm details (exercises × sets × reps @ weight) appear.
4. Page to the previous month; confirm the adjacent-month workout shows and the grid is correct.
5. Sign out; hit `/calendar`; confirm redirect to `/auth/signin`.
6. With a fresh account, confirm the empty state.
7. Check a mobile-width viewport.

## Performance Considerations

Target scale is small (PRD: small users, low qps, small data volume). Loading all of a user's
workouts once is well within budget; month navigation is in-memory filtering. If history ever
grows large, the read can later be range-scoped behind an API route — out of scope now.

## Migration Notes

None. No schema, RLS, or data migration. Read-only over existing tables and policies.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-05)
- Read contract: `src/lib/workouts.ts:153` (`getRecentWorkouts`), `:127` (`WORKOUT_SELECT`), `:130` (`mapWorkoutRow`)
- Schema: `supabase/migrations/20260619132351_create_workouts.sql`
- Sibling style precedent (S-04): `context/changes/weight-progress-stats/plan.md`
- Read-view layout idiom: `src/components/workouts/RecentWorkouts.astro`
- Page shell: `src/pages/workouts.astro`; protection: `src/middleware.ts:4`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data read + pure calendar logic

#### Automated

- [x] 1.1 Type checking passes: `npm run lint`
- [x] 1.2 Production build succeeds: `npm run build`

#### Manual

- [x] 1.3 `getAllWorkouts` returns both logged and planned rows for a seeded account
- [x] 1.4 `buildMonthGrid` produces correct leading/trailing days with full coverage

### Phase 2: Calendar island + page + navigation

#### Automated

- [ ] 2.1 Type checking passes: `npm run lint`
- [ ] 2.2 Production build succeeds: `npm run build`

#### Manual

- [ ] 2.3 Logged vs planned days marked distinctly; legend matches
- [ ] 2.4 Clicking a marked day expands details; empty day shows no error
- [ ] 2.5 Prev/next moves months with no reload; markers re-place; today highlighted
- [ ] 2.6 Fresh account shows the empty state
- [ ] 2.7 Signed-out `/calendar` redirects to `/auth/signin`
- [ ] 2.8 Dashboard link navigates to `/calendar`
- [ ] 2.9 Renders correctly on a mobile-width viewport
