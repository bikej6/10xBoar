# Library research — S-03 history-based-proposal

> Researched 2026-06-26 via web_search_exa. Goal: find libraries to implement S-03
> ("propozycja treningu z własnej historii") compatible with `context/foundation/tech-stack.md`.

## Constraints (from roadmap.md + tech-stack.md)

- **Not AI/LLM**: `has_ai: false`; PRD Non-Goal rules out AI-generated exercises — proposal
  operates on the existing catalog, derived from the user's own logged history.
- **Cloudflare Workers edge runtime** (Astro v6 SSR via `@astrojs/cloudflare`): no Node
  native modules. Pure-JS zero-dependency libs are safe; WASM needs extra bundling care.
- **Data in Supabase Postgres**.

## What S-03 actually needs

Two computational pieces, libraries are optional helpers for each:

1. **Aggregate history** (last weight/reps/sets per exercise for a muscle group) → mostly a
   **Supabase Postgres query**, no library needed.
2. **Derive the proposal** (progression: estimate 1RM, suggest next weight/reps) → where a
   small formula library saves boilerplate.

⚠️ No library does "recommend a workout from history" out of the box — that domain logic is
ours to write. Libraries only remove formula boilerplate.

## A. Progression / 1RM formula helpers

| Library | Fit | Workers-safe | Notes |
| --- | --- | --- | --- |
| `@finegym/fitness-calc` | ★ Best | ✅ Pure TS, zero-dep | 7 1RM formulas (Epley/Brzycki/…), `estimateRepsAtWeight`, percentage tables. |
| `@nathaliem/one-rep-max` | Good | ✅ Pure TS | Focused, MIT, 7 formulas, average/compare. Leaner. |
| `fitness-calc` (Swafox) | OK | ✅ Pure JS | Older, mixes in diet formulas we don't need. |
| `FitnessJS` (dpfens) | OK | ⚠️ | Script-tag oriented, friction with modern ESM bundling. |

## B. Trend / progression analysis (optional, for "is the user progressing")

| Library | Fit | Workers-safe | Notes |
| --- | --- | --- | --- |
| `simple-statistics` | ★ Best | ✅ Pure JS, zero-dep ~30KB | Mature, ESM named exports, linear regression + descriptive stats. |
| `ml-regression-simple-linear` | Good | ✅ Pure JS | 120K weekly downloads, linear regression + `predict()`. |
| `regression-js` | Good | ✅ Pure JS | Linear/exponential/polynomial curve fitting. |
| `trendline` | Niche | ✅ ~1KB zero-dep | Tiny, takes objects directly; linear only. |
| `micro-ml` | Overkill | ⚠️ WASM | Powerful but WASM under `@astrojs/cloudflare` is fiddly. Skip for MVP. |

## Recommendation (given main_goal: speed, top_blocker: time)

- Do the **aggregation in SQL** (Supabase) — no library.
- Add **`@finegym/fitness-calc`** (or leaner `@nathaliem/one-rep-max`) for 1RM/progression math.
- **Skip stats/ML libs for v1.** A "last weight + small progression" heuristic from history is
  enough to prove the hypothesis. Add `simple-statistics` later only for genuine trend-based proposals.

## Open follow-up

- Verify each chosen package's `exports`/`module` fields + dependency tree for true edge-runtime
  compatibility before committing.
- Blocking open question (roadmap): minimum number of logged sessions before a sensible proposal
  is generated; empty-state behaviour when no history exists for a muscle group.
