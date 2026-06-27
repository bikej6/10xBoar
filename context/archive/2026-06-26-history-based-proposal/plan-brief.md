# History-Based Workout Proposal (S-03) — Plan Brief

> Full plan: `context/changes/history-based-proposal/plan.md`
> Research: `context/changes/history-based-proposal/research.md`

## What & Why

Give a logged-in user a workout **proposal** for a chosen muscle group and target day, derived entirely from their **own logged history** — their most-recent set per exercise with a small progressive weight bump. This is the product's north-star differentiator (PRD US-01 / FR-005): proposals come from the user's real data, not a generic template.

## Starting Point

Everything downstream of the derivation already exists: history reads (`getRecentWorkouts(..., "logged")`), the catalog (`getExercises`/`getMuscleGroups`), the plan-create route (`POST /api/workouts/plan` + `createWorkout(status:"planned")`), RLS, and the planned-workout render. `WorkoutLogForm.tsx` already has a Log/Plan tab island. No domain table is missing; `reps` is a real column.

## Desired End State

A third **Propose** tab on `/workouts`: pick a muscle group + day → see a read-only proposed plan ("was X kg → propose Y kg" at the carried sets×reps) → **Accept as plan** (materializes a planned workout, visible immediately) or **Ignore**. Users with < 3 logged sessions for the group see an empty-state prompting them to log first.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Minimum history | ≥ 3 logged sessions for the group | Below that, a proposal harms trust (closes roadmap OQ-1) | change.md |
| Empty-state | Prompt to log first | Don't fall back to manual planning or hide the group (US-01 AC) | change.md |
| Progression heuristic | Last weight + ~2.5% bump | Simplest credible progression; matches research v1 recommendation | Plan |
| Library | Native `src/lib/proposal.ts`, no dep | Honors lessons.md "prefer native, don't add deps" for one-line math | Plan |
| Sets/reps source | Carry historical sets & reps | Grounded in the user's actual pattern; DB-valid as-is | Plan |
| Exercise selection | All group exercises with history | Fully history-driven, honors US-01 framing | Plan |
| Accept collision | Surface friendly error, block | Reuses existing non-destructive `23505` message; no replace | Plan |
| UI placement | Third tab in WorkoutLogForm | Reuses island, selectors, date logic, row render | Plan |

## Scope

**In scope:** derivation module; server-side proposal generation from query params; Propose tab (request + read-only preview + accept + ignore + empty-state).

**Out of scope:** inline editing of the proposal (that's manual planning, S-02); any new dependency; schema/migration/RLS change; changes to `/api/workouts/plan` or `createWorkout`; 1RM %/trend models; JSON/fetch API; "replace plan" on collision.

## Architecture / Approach

SSR via query params (no client fetch — keeps the app's "page-load + form-POST, no JSON API" convention). `src/lib/proposal.ts` has a pure `buildProposal(history, groupExerciseIds, groupName) → ProposalResult` (`ok` rows | `insufficient-history`) plus an async `generateProposal` wrapper over the existing helpers. `workouts.astro` reads `?propose=1&muscleGroup=…&date=…`, computes the result, passes it into `WorkoutLogForm`. Accept POSTs the proposal to the **unchanged** plan route.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Derivation + server generation | `proposal.ts` + `workouts.astro` wiring producing a `ProposalResult` from a propose URL | Session-count semantics (distinct workouts, not rows); weight-bump rounding edge cases |
| 2. Propose tab UI | Restructured `WorkoutLogForm` with request + preview + accept/ignore + empty-state | Moving the tab bar out of the POST form without regressing Log/Plan |

**Prerequisites:** F-01, S-01, S-02 (all done/archived); blocking product decisions resolved in `change.md`.
**Estimated effort:** ~1–2 sessions across 2 phases. Small, additive, zero schema/route changes.

## Open Risks & Assumptions

- A failed accept (day already has a plan) redirects to a clean `/workouts?error=…` and does **not** re-show the proposal — user re-requests. Accepted v1 limitation (avoids changing the shared plan route).
- Weight-bump rounding for light loads needs the "never regress" guard (e.g. 20 kg) — covered in the plan's Critical Implementation Details.
- No automated test harness exists; correctness leans on the pure core's simplicity + manual verification.

## Success Criteria (Summary)

- A user with ≥ 3 logged sessions for a group gets a history-based proposal with weights nudged above their last set, and can accept it into a planned workout in one step.
- A user with < 3 qualifying sessions sees a clear "log first" empty-state, never an empty or generic plan.
- No regressions to logging or manual planning; no schema or backend-route changes.
