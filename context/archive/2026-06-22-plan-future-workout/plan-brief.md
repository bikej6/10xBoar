# Plan a Future Workout (S-02) — Plan Brief

> Full plan: `context/changes/plan-future-workout/plan.md`

## What & Why

Let a signed-in user **manually plan a workout for a future day** — the same exercise builder as logging, but saved as a `planned` workout and shown in its own upcoming list. S-02 sits on the critical path right before the north star S-03: accepting a history-based proposal (S-03) *is* creating a planned workout, so this slice builds the capability S-03 will reuse (PRD FR-004: manual planning ≠ automatic proposal).

## Starting Point

S-01 (merged, PR #10) already shipped the full substrate: `workouts`/`workout_exercises` schema with a `status` column (`logged | planned`) that was **deliberately pre-added so S-02 is additive**; RLS keyed to `auth.uid()` whose INSERT/SELECT policies already cover planned rows; a `createWorkout`/`getRecentWorkouts` data layer; a self-contained `WorkoutLogForm` island; and a protected `/workouts` page. The only seams: `createWorkout` hardcodes `status: 'logged'`, `getRecentWorkouts` doesn't filter status, and both the form and API route reject future dates.

## Desired End State

On `/workouts`, a Log/Plan toggle switches the existing form into plan mode (future-date picker, "Plan" copy). Saving writes a `planned` workout, which then appears in a separate "Planned workouts" list (soonest first) — never mixed into "Recent workouts" (logged). At most one plan per future day is allowed (clear message otherwise), and planned data is private per user. The logging flow is untouched.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Entry UI | One `WorkoutLogForm` with a `mode` toggle | Roadmap explicitly warns against duplicating the entry UI; S-03 can reuse it | Plan |
| Write path | Add optional `status` param to `createWorkout` | One write path, backward-compatible, reused by S-03 | Plan |
| API surface | New `/api/workouts/plan` route | Keeps each route's date rule + redirect clean vs multiplexing | Plan |
| Date rule | Strictly future (tomorrow onward) | Clean split from logging (today/past); FR-004 "future day" | Plan |
| Placement | Extend `/workouts` with a log/plan toggle | Single entry destination; toggle lives in the island | Plan |
| Read split | Status filter on `getRecentWorkouts` + new `getPlannedWorkouts` | Each view queries exactly its rows, tuned ordering | Plan |
| One plan/day | DB partial unique index on `(user, date) where status='planned'` | DB-guaranteed, matches the project's RLS-defense posture | Plan |
| Out of scope | No transition/edit/delete/calendar | Keeps S-02 a pure create+read slice; those are S-05/S-06 | Plan |

## Scope

**In scope:** partial unique index migration (one plan/day); `createWorkout` status param + duplicate-day handling; `getRecentWorkouts` status filter + new `getPlannedWorkouts`; `/api/workouts/plan` route with future-date validation; mode toggle in `WorkoutLogForm`; "Planned workouts" list on `/workouts`; contract-surfaces update.

**Out of scope:** auto-transition planned→logged / completion; edit/delete (S-06); calendar view (S-05); multiple plans per day; JSON API / tests / type generation; any RLS or logging-flow change.

## Architecture / Approach

Maximal reuse along the S-01 grain. The schema and RLS already support `planned`; one additive partial unique index enforces "one plan per day" at the DB. `src/lib/workouts.ts` stays the single access contract — it gains a `status` write param and a planned-specific read helper. The `WorkoutLogForm` island becomes mode-aware (toggle flips copy, date bounds, status, and POST target); a sibling API route owns the future-date rule. Presentation reuses the existing list pattern in a planned-specific section.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Migration | Partial unique index: one `planned` per `(user, date)` | Wrong/over-broad index restricting logged history |
| 2. Data layer | `status` write param + duplicate handling; status filter + `getPlannedWorkouts` | Breaking an existing caller; status leaking across lists |
| 3. Entry path (core) | `/api/workouts/plan` + mode toggle; can create a plan | Future-date timezone grace; regressing the log flow |
| 4. Presentation | Separate "Planned workouts" list | Planned rows leaking into the logged list |

**Prerequisites:** F-01 (catalog, done) + S-01 (merged); cloud Supabase access (PAT for `db push`).
**Estimated effort:** ~2–3 after-hours sessions; Phase 3 is the core must-have, Phase 4 completes the UX.

## Open Risks & Assumptions

- **Timezone grace for future dates**: the server backstop must accept `submitted >= today (UTC)` (not strictly greater), or behind-UTC users planning their genuine local "tomorrow" get falsely rejected — symmetric to the S-01 log-side grace. Form `min` enforces the strict UX.
- **Duplicate-day error surfacing**: `createWorkout` must catch the Postgres unique-violation (`23505`) and return the friendly message, else the user sees a generic save error.
- **No edit/delete in scope** means a mistaken plan can't be removed yet — accepted for this slice.

## Success Criteria (Summary)

- A user plans a future-dated workout via the toggle and sees it in "Planned workouts" (soonest first), not in "Recent workouts".
- A second plan for the same date is refused with a clear message; past/today dates are refused in Plan mode.
- The logging flow is unchanged; planned data is private per user; build and lint show no new errors.
