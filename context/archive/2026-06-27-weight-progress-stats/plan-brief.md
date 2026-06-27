# Weight Progress Stats (S-04) — Plan Brief

> Full plan: `context/changes/weight-progress-stats/plan.md`

## What & Why

Build a `/stats` page that shows each exercise's logged-weight trend over time as a small
sparkline. This delivers FR-006 (*"użytkownik widzi wykres progresu ciężaru dla każdego
ćwiczenia"*) — a must-have Secondary criterion — because seeing your own weight progress is
the basic motivation in strength training; without it the app is blind to its own data.

## Starting Point

The logged-history data contract already exists: `getRecentWorkouts(supabase, userId,
limit, "logged")` returns each workout's exercises with their weight. Read sections are
server-rendered Astro components (`RecentWorkouts.astro`); derivation logic follows a pure
core + thin async wrapper pattern (`proposal.ts`). There is no charting library and no view
over this data yet.

## Desired End State

A signed-in user opens `/stats` (linked from the dashboard) and sees one block per exercise
they've logged — each with an inline-SVG sparkline of weight across sessions, newest-trained
first. A once-logged exercise shows a "log more" hint; a fresh account sees an empty state;
signed-out visitors are redirected to sign-in.

## Key Decisions Made

| Decision           | Choice                                   | Why (1 sentence)                                                              | Source |
| ------------------ | ---------------------------------------- | ---------------------------------------------------------------------------- | ------ |
| Progress metric    | Logged weight per session                | Directly stored, zero derivation, matches FR-006's literal "progres ciężaru". | Plan   |
| Visualization      | Hand-rolled inline SVG sparkline         | No new dependency (honors lessons.md), SSR-native on Workers, fits the pattern. | Plan   |
| Placement          | New dedicated `/stats` page              | Keeps the already-dense `/workouts` page lean; room to grow.                  | Plan   |
| Exercise scoping   | All exercises in history, each listed    | Matches "dla każdego ćwiczenia" with no selection UI or client state.         | Plan   |
| Thin history       | Show all; single point → current + hint  | Nothing hidden; gentle nudge to keep logging.                                 | Plan   |
| Extra scope        | None — core view only                    | Smallest shippable slice; fastest to review/merge per the `speed` goal.       | Plan   |

## Scope

**In scope:** `/stats` page; pure derivation + sparkline-geometry module (`stats.ts`);
sparkline + section components; route protection; dashboard link.

**Out of scope:** charting library / React island; 1RM or volume metrics; numeric Δ summary;
muscle-group grouping; date-range filter; exercise selector; any schema/RLS change; edit history (S-06).

## Architecture / Approach

`stats.ts` adds a pure `buildExerciseProgress(LoggedWorkout[]) → ExerciseProgress[]` (group
by exercise, order points oldest→newest, exercises newest-trained first) and a pure
`sparklineGeometry(weights,w,h)` (→ SVG coords, zero-range clamp), plus a thin
`getExerciseProgress` wrapper over `getRecentWorkouts`. The `/stats` Astro page fetches and
passes `ExerciseProgress[]` into `WeightProgress.astro`, which renders a `Sparkline.astro`
per exercise. All server-rendered; no client JS.

## Phases at a Glance

| Phase                       | What it delivers                                  | Key risk                                            |
| --------------------------- | ------------------------------------------------- | --------------------------------------------------- |
| 1. Data derivation layer    | `stats.ts`: pure series + SVG geometry + wrapper  | Chronological reversal; zero-range/single-point math |
| 2. Stats page, UI, nav      | Sparkline + section components, `/stats`, protection, dashboard link | Sparkline legibility; empty/thin-history states |

**Prerequisites:** S-01 (logged history + `getRecentWorkouts`) — done and merged.
**Estimated effort:** ~1–2 sessions across 2 phases.

## Open Risks & Assumptions

- No test runner exists in the project; the pure functions are verified by reasoning and
  manual testing rather than automated unit tests.
- Sparkline UX is hand-rolled — single-point and all-equal-weight cases need explicit
  handling to avoid degenerate/empty charts.
- Assumes one weight value per exercise per workout (the existing model); multiple
  same-date occurrences render as multiple points, acceptable at MVP scale.

## Success Criteria (Summary)

- A user with ≥2 logged sessions of an exercise sees its weight trend as a sparkline on `/stats`.
- A once-logged exercise and a no-history account both show sensible states, not errors.
- `/stats` is auth-protected and reachable from the dashboard.
