# Workout Calendar (S-05) — Plan Brief

> Full plan: `context/changes/workout-calendar/plan.md`

## What & Why

Build a read-only `/calendar` page: a navigable month grid that marks days with workouts and,
on clicking a day, shows that day's exercises (sets × reps @ weight). This delivers roadmap
slice **S-05** — "użytkownik widzi kalendarz z oznaczonymi dniami, w których ma zapisany
trening, i po kliknięciu dnia widzi szczegóły treningu" — giving the logged/planned history a
calendar overview that today only exists as flat lists.

## Starting Point

The read contract already exists: `getRecentWorkouts` / `getPlannedWorkouts` in
`src/lib/workouts.ts` select a shared embed and map to `LoggedWorkout` (date + exercises with
sets/reps/weight). `workout_date` is a plain `YYYY-MM-DD` `date`, so grouping by day is pure
string keying — no timezone math. `status` distinguishes logged from planned. Sibling slice
S-04 (`weight-progress-stats`) set the house style: a dedicated server-rendered page linked from
the dashboard, a pure-derivation module + thin read wrapper, and no new dependencies. There is
no calendar view today.

## Desired End State

A signed-in user opens `/calendar`, sees the current month with workout days marked (logged vs
planned visually distinct, with a legend), pages between months without a reload, and clicks any
marked day to expand its details. A fresh account sees an empty state; signed-out visitors are
redirected to sign-in.

## Key Decisions Made

| Decision        | Choice                                          | Why (1 sentence)                                                                 | Source   |
| --------------- | ----------------------------------------------- | -------------------------------------------------------------------------------- | -------- |
| Data scope      | Logged + planned, visually distinguished        | One unified calendar that finally surfaces planned workouts; schema already has both. | Plan |
| View scope      | Month grid with prev/next navigation            | Conventional mental model, bounded per-month rendering, matches "kalendarz".      | Plan     |
| Interaction     | React island, client-side day expand            | Snappy, no round-trips; idiomatic island use like `WorkoutLogForm`.              | Plan     |
| Data load       | All workouts once as props, filter client-side  | No new API route; instant month switching; fits the PRD's small scale.           | Plan     |
| Placement       | New dedicated `/calendar` page                  | Keeps `/workouts` lean; consistent with the S-04 `/stats` precedent.             | Plan     |
| Marking         | Dot markers + distinct logged/planned + legend  | Clear at a glance; handles the no-history empty state the PRD calls out.          | Plan     |

## Scope

**In scope:** `/calendar` page; `getAllWorkouts` read; pure `calendar.ts` (month grid, date
grouping, month nav); `WorkoutCalendar.tsx` island; route protection; dashboard link.

**Out of scope:** editing/deleting workouts (S-06); any schema/RLS/migration; new API route;
charts/stats (S-04); week/agenda views; quick-log from the calendar; any new dependency.

## Architecture / Approach

`workouts.ts` gains a pure-data `getAllWorkouts(supabase, userId)` (both statuses, uncapped,
reusing the existing select + mapper). A new pure `calendar.ts` turns year/month into a `DayCell[]`
grid, groups `LoggedWorkout[]` by local date key, and does month arithmetic — local-date
formatting only (no `toISOString`, to avoid midnight off-by-one). `calendar.astro` (protected)
fetches the workouts server-side and mounts `<WorkoutCalendar client:load>`, which holds the full
list, renders the current month with markers + legend, and expands the selected day's details
client-side.

## Phases at a Glance

| Phase                              | What it delivers                                            | Key risk                                          |
| ---------------------------------- | ---------------------------------------------------------- | ------------------------------------------------- |
| 1. Data read + pure calendar logic | `getAllWorkouts` + pure `calendar.ts` (grid/grouping/nav)  | Date-key/grid alignment; local-vs-UTC off-by-one  |
| 2. Island + page + nav             | `WorkoutCalendar.tsx`, `/calendar`, protection, dashboard link | Marker placement per month; mobile layout; empty state |

**Prerequisites:** S-01 (logged + planned history, `workouts`/`workout_exercises` schema) — done and merged.
**Estimated effort:** ~1–2 sessions across 2 phases.

## Open Risks & Assumptions

- No test runner exists; pure `calendar.ts` is verified by reasoning + manual spot-checks.
- Loading all workouts up front assumes small history (PRD scale); a range-scoped API read is the
  later escape hatch if histories grow.
- "Today" and date keys use the client's local date; correct for the user and sidesteps Workers-UTC.

## Success Criteria (Summary)

- A user with logged and planned workouts sees them marked distinctly on the right days and can
  page months without a reload.
- Clicking a marked day shows its exercises (sets × reps @ weight); a fresh account shows a clean
  empty state.
- `/calendar` is auth-protected and reachable from the dashboard.
