# Log a Workout (S-01) — Plan Brief

> Full plan: `context/changes/log-a-workout/plan.md`

## What & Why

Let an authenticated user log a workout for a given day — pick a muscle group, choose a catalog exercise, enter a set count and a weight, add a few more, and save the dated session in under a minute — stored privately so only they can see it. S-01 is the first step on the critical path to the product's north star (S-03, history-based proposals): without logged history there is nothing to analyze.

## Starting Point

F-01 seeded a shared, read-only exercise catalog (`muscle_groups`, `exercises`) with a typed helper (`src/lib/catalog.ts`) and an RLS-read-only posture; its migration explicitly noted "every later table will be private-per-user." Auth is fully wired (form POST → API route → redirect, React islands mounted in `.astro` pages, `PROTECTED_ROUTES` in middleware). No per-user domain table exists yet — S-01 introduces the first one.

## Desired End State

A signed-in user opens `/workouts`, logs one or more exercises for a chosen date (defaulting to today), and sees a confirmation plus a list of their recent sessions. Data persists in `workouts` + `workout_exercises` under RLS keyed to `auth.uid()`; no other user can read it, and a signed-out visit to `/workouts` redirects to sign-in.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Data model | `workouts` (+`status` default `logged`) + `workout_exercises` | Grouped dated sessions, and `status` makes S-02 `planned` / S-03 acceptance additive, not a reshape | Plan |
| Isolation (open unknown) | RLS policies keyed to `auth.uid()` | DB-level defense-in-depth; matches the precedent F-01 foreshadowed | Plan |
| Entry granularity | sets (count) + single weight per exercise | Matches PRD FR-003, fastest to log, clean series for S-04 | Plan |
| Write path | form POST → `/api/workouts` → redirect; island filters server-passed catalog client-side | Mirrors auth exactly, no new JSON-API convention | Plan |
| Read-back | confirmation + recent-workouts list on the page | Visibly proves the persistence + isolation guardrail | Plan |
| Session UX | add several exercise rows, save once | Matches a real training session and the parent+child model | Plan |
| Date | default today, allow past (reject future) | Covers logging + backfill; future dates are S-02's job | Plan |
| Cut line | core write+RLS must-have; multi-row + list deferrable | Protects the foundation S-02/S-03/S-04 inherit under time pressure | Plan |

## Scope

**In scope:** first private-per-user schema + RLS migration; typed `src/lib/workouts.ts` write/read helpers; protected `/workouts` page + island; `/api/workouts` form-POST route; multi-exercise session builder; recent-workouts read-back.

**Out of scope:** S-02 planning / future-dated workouts (only the `status` column is pre-added); S-04 stats/charts; reps or per-set detail; edit/delete; JSON API / Astro Actions; a test suite; Supabase type generation.

## Architecture / Approach

`/workouts` (protected via middleware) server-renders the catalog through the existing `catalog.ts` helpers and mounts a React island that filters exercises client-side and submits a standard form POST. `/api/workouts` resolves the user server-side, validates input (rejecting future dates), and calls `createWorkout` in `src/lib/workouts.ts`, which writes a `workouts` parent + `workout_exercises` children atomically. RLS keyed to `auth.uid()` enforces isolation; `workout_exercises` authorizes transitively through its parent. The page reads back recent workouts via `getRecentWorkouts`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema + per-user RLS | Migration: both tables, RLS keyed to `auth.uid()`, contract surfaces | Wrong RLS posture leaks data or blocks valid writes |
| 2. Typed data layer | `workouts.ts` create/read helpers, null-safe, atomic write | Partial write leaving an orphaned parent |
| 3. Write path + page (core) | `/api/workouts`, protected `/workouts`, island, single-exercise save | Client-supplied `user_id` trust; future-date bypass |
| 4. UX completion | Multi-row session builder + recent-workouts list | Multi-row serialization/parse mismatch |

**Prerequisites:** F-01 (done — catalog seeded & queryable); cloud Supabase access (PAT for `db push`).
**Estimated effort:** ~3–4 after-hours sessions across 4 phases; Phases 1–3 are the must-have, Phase 4 is deferrable.

## Open Risks & Assumptions

- RLS correctness is the highest-stakes item — it's the precedent every later private table inherits; verify isolation with a real second user, not just the happy path.
- Atomic multi-exercise write needs the simplest correct mechanism (transaction/RPC vs parent-then-children with cleanup); decided during Phase 2/3.
- `<1 min` is an acceptance test, not just a goal — the island must default aggressively (today's date, fast group→exercise filtering) to hit it.

## Success Criteria (Summary)

- A signed-in user logs a (multi-exercise) workout for a date in under a minute and immediately sees it persisted.
- The saved workout survives logout/login and is invisible to any other user (isolation + persistence guardrail).
- Signed-out access to `/workouts` redirects to sign-in; build and lint show no new errors.
