# Seed Exercise Catalog (F-01) Implementation Plan

## Overview

Stand up the foundational, read-only **exercise catalog** for 10xBoar: a `muscle_groups` lookup table and an `exercises` table (each exercise filed under exactly one muscle group), seeded with a minimal taxonomy that covers the hobbyist-lifter persona. This is the project's **first database migration**, so it also establishes the `supabase/migrations/` convention. A small typed query helper in `src/lib` makes the catalog verifiably queryable and gives the downstream slices (S-01 logging, S-02 planning, S-03 history-based proposals) a stable access contract. No end-user-facing UI is built in this change.

## Current State Analysis

- **No domain schema exists.** `supabase/` contains only `config.toml`; there are no `migrations/` or `seed.sql` files. The app uses Supabase Auth's `auth.users` only. This change introduces the first migration.
- **`config.toml` is already wired for migrations and seeds.** `[db.migrations] enabled = true` (line 55) and `[db.seed] enabled = true` with `sql_paths = ["./seed.sql"]` (lines 62–65). We will use **migrations** for the catalog (reference data must ship to prod; `seed.sql` runs only on local `db reset`, not on `db push`).
- **Supabase client is per-request and may be null.** `createClient(requestHeaders, cookies)` returns `null` when `SUPABASE_URL`/`SUPABASE_KEY` are missing (`src/lib/supabase.ts:6`). Any query helper must handle the null-client case, mirroring the existing convention.
- **Env vars come from `astro:env/server`**, declared in `astro.config.mjs` (not `process.env`). No new secrets are needed for this change.
- **Shared vs private data distinction.** The catalog is *shared* reference data readable by every authenticated user — unlike every later table (workouts, plans), which will be private-per-user. This is table #1, so the RLS posture we set here is the precedent.
- **No test suite.** CI runs `lint` + `build` only. Verification of the migration is via the Supabase CLI locally; verification of the helper is via `lint`/`build`/typecheck plus a manual query.

## Desired End State

After this plan:

- Running `npx supabase db reset` (or applying migrations to a fresh DB) creates two tables — `muscle_groups` and `exercises` — populated with 6 muscle groups and a minimal set of exercises, each exercise referencing exactly one muscle group.
- Both tables have **RLS enabled** with a policy granting `SELECT` to authenticated users and **no** client-side insert/update/delete.
- The catalog data lives **inside the versioned migration**, so `npx supabase db push` provisions it identically in production.
- `src/lib` exposes typed functions to list muscle groups and list exercises (optionally filtered by group), returning typed rows and degrading gracefully when the Supabase client is null.
- A developer can call the helper from a throwaway/SSR context and get catalog rows back — proving the roadmap's "zasiany i odpytywalny" (seeded and queryable) outcome.

**How to verify:** `npx supabase db reset` succeeds and a `select count(*)` on both tables returns the seeded counts; `npm run lint` and `npm run build` pass; a manual query through the helper returns the seeded groups/exercises.

### Key Discoveries:

- `config.toml:55` / `config.toml:62–65` — migrations and seed are pre-enabled; we lean on migrations, not `seed.sql`.
- `src/lib/supabase.ts:6` — `createClient` returns `null` on missing env; the helper must guard this.
- Roadmap F-01 (`context/foundation/roadmap.md:61–72`) — outcome is "seeded and queryable, no own UI"; risk is taxonomy scope creep ("trzymać minimalny zestaw pokrywający persony").
- PRD FR-001 (`context/foundation/prd.md:61`) — users *select* from a built-in catalog (CSV import is parked nice-to-have, FR-002).
- PRD Business Logic (`prd.md:88`) — proposal input is a muscle group "np. 'Plecy', 'Całe ciało'"; "Całe ciało" is handled as a query-time selection (all groups), not a catalog row.

## What We're NOT Doing

- **No end-user UI** — no catalog browse/select screens; that belongs to S-01/S-02.
- **No workout/plan tables** — `exercises` is referenced by S-01's schema later; we do not create the referencing tables here.
- **No CSV import (FR-002)** — parked nice-to-have.
- **No AI-generated exercises** — PRD Non-Goal; catalog is fixed reference data.
- **No many-to-many muscle mapping** — each exercise has exactly one primary group (decided).
- **No `seed.sql` reliance for prod data** — catalog data lives in the migration; we do not depend on `seed.sql`.
- **No Supabase type generation toolchain** — types are hand-written in `src/lib`; `supabase gen types` is out of scope.
- **No "Całe ciało" catalog row** — it is a downstream query concern, not seeded data.

## Implementation Approach

Two phases, smallest-prod-correct first. Phase 1 writes a single migration that creates both tables, enables RLS with read-only policies, and inserts the catalog rows — establishing the migrations convention and shipping reference data to prod the same way schema ships. Phase 2 adds a thin typed access layer in `src/lib` so the catalog is queryable through a stable contract and the end-to-end "queryable" outcome is demonstrable. Manual verification at each phase uses the Supabase CLI (no automated test suite exists).

## Critical Implementation Details

- **Seed data belongs in the migration, not `seed.sql`.** `supabase db push` (and Workers Builds CI) apply migrations to prod but never run `seed.sql`. Putting catalog INSERTs in the migration is what guarantees the catalog exists in production.
- **RLS without a write policy = read-only.** Enabling RLS and adding only a `SELECT` policy means the anon/authenticated key cannot insert/update/delete — exactly the desired immutable-from-clients posture. Do not add write policies.
- **Stable slugs for muscle groups.** Give `muscle_groups` a stable machine `slug` (e.g. `chest`, `back`) plus a Polish display `name`, so downstream UI/query code keys off the slug and is not coupled to display text.

## Phase 1: Schema + seed migration

### Overview

Create the first migration under `supabase/migrations/` that defines `muscle_groups` and `exercises`, enables RLS with authenticated read-only access, and seeds 6 muscle groups plus a minimal exercise set — all in one versioned file so it ships to prod via `db push`/CI.

### Changes Required:

#### 1. First migration file

**File**: `supabase/migrations/<timestamp>_seed_exercise_catalog.sql` (generate via `npx supabase migration new seed_exercise_catalog`)

**Intent**: Define the catalog schema, lock it down with RLS, and seed the reference rows in one migration so a fresh DB (local reset or prod push) ends up fully populated.

**Contract**:
- `muscle_groups` table: `id` (PK), `slug` (text, unique, not null — stable machine key e.g. `chest`/`back`/`legs`/`shoulders`/`arms`/`core`), `name` (text, not null — Polish display label).
- `exercises` table: `id` (PK), `muscle_group_id` (FK → `muscle_groups.id`, not null), `name` (text, not null), with a uniqueness guard preventing duplicate exercise names within a group.
- RLS: `enable row level security` on **both** tables; one `SELECT` policy per table granting access to the `authenticated` role; **no** insert/update/delete policies.
- Seed: INSERT the 6 muscle groups (Klatka piersiowa=`chest`, Plecy=`back`, Nogi=`legs`, Barki=`shoulders`, Ramiona=`arms`, Brzuch=`core`) and a minimal exercise set per group (a handful of canonical lifts each, e.g. Wyciskanie sztangi/Pompki under chest, Martwy ciąg/Wiosłowanie under back, Przysiad/Wykroki under legs, etc.). Insert groups before exercises; reference groups by `slug` (e.g. subselect on `slug`) so exercise INSERTs don't hardcode IDs.

#### 2. Confirm `config.toml` seed path is untouched

**File**: `supabase/config.toml`

**Intent**: No change expected — verify migrations remain enabled and we are NOT relying on `seed.sql` for catalog data.

**Contract**: `[db.migrations] enabled = true` stays true; no edits required. (Listed only as a verification touchpoint.)

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly on a fresh DB: `npx supabase db reset`
- Muscle groups seeded: `select count(*) from muscle_groups;` returns 6 (via `npx supabase db reset` output or `psql`/Studio)
- Exercises seeded and all reference a valid group: `select count(*) from exercises;` > 0 and `select count(*) from exercises e left join muscle_groups g on g.id = e.muscle_group_id where g.id is null;` returns 0
- Lint passes: `npm run lint`

#### Manual Verification:

- In Supabase Studio (`localhost:54323`), both tables show RLS **enabled** with a single SELECT policy each and no write policies
- An anon/authenticated client cannot insert into either table (write is rejected by RLS)
- Muscle-group display names read correctly in Polish; slugs are stable lowercase machine keys
- Exercise distribution per group looks reasonable for the persona (no empty groups, no overly long list)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing (RLS posture in Studio, seed sanity) was successful before proceeding to Phase 2.

---

## Phase 2: Typed catalog query helper

### Overview

Add a thin, typed access layer in `src/lib` so the catalog is queryable through one stable contract, handling the null-client case, and demonstrating the end-to-end "queryable" outcome for downstream slices.

### Changes Required:

#### 1. Catalog query helper + types

**File**: `src/lib/catalog.ts` (new)

**Intent**: Expose typed functions to read the catalog so S-01/S-02/S-03 share one access pattern instead of each re-querying Supabase ad hoc.

**Contract**:
- TS types for a muscle group (`{ id, slug, name }`) and an exercise (`{ id, muscleGroupId, name }`).
- `getMuscleGroups(supabase)` → returns all groups ordered for display.
- `getExercises(supabase, muscleGroupSlug?)` → returns exercises, optionally filtered to one group by slug; no filter returns the full catalog (this is how "Całe ciało" / all-groups is served).
- Each function accepts the per-request Supabase client (the return value of `createClient`) and must handle a `null` client per `src/lib/supabase.ts:6` — return an empty result or a typed error rather than throwing. Match the existing codebase convention for null-client handling.
- Use native JS/TS only — no lodash (`context/foundation/lessons.md`).

#### 2. Register catalog contract names

**File**: `docs/reference/contract-surfaces.md` (create if absent)

**Intent**: Record the load-bearing names introduced here (`muscle_groups`, `exercises`, `slug` set, helper function names) so later slices reference them consistently.

**Contract**: A short entry listing table names, the muscle-group slug set, and the `getMuscleGroups`/`getExercises` signatures. Prose registry — no code.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build` (Astro typecheck) or `npx astro check`
- Lint passes: `npm run lint`
- Helper compiles against the seeded schema (no type errors referencing catalog types)

#### Manual Verification:

- Calling `getMuscleGroups` against the local DB returns the 6 seeded groups
- Calling `getExercises` with a valid slug returns only that group's exercises; with no slug returns the full catalog
- With Supabase env unset (null client), the helper returns an empty/typed result instead of throwing
- `docs/reference/contract-surfaces.md` lists the catalog names accurately

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation that the helper returns correct catalog data before considering the change complete.

---

## Testing Strategy

### Unit Tests:

- None added — no test suite is configured (CI runs lint + build only). Verification is via the Supabase CLI and manual queries.

### Integration Tests:

- Implicit: `npx supabase db reset` exercises the migration end-to-end (DDL + RLS + seed) on a clean DB.

### Manual Testing Steps:

1. Run `npx supabase db reset`; confirm it completes without error.
2. In Studio, verify `muscle_groups` has 6 rows and `exercises` is populated with every row referencing a valid group.
3. Verify RLS is enabled on both tables with only a SELECT policy; attempt a client insert and confirm it is rejected.
4. From an SSR/dev context, call `getMuscleGroups` and `getExercises` (with and without a slug) and confirm typed catalog data returns.
5. Unset Supabase env and confirm the helper returns an empty/typed result rather than throwing.

## Performance Considerations

Negligible. The catalog is a tiny static dataset (6 groups, a few dozen exercises) read infrequently. No indexing beyond the FK and unique constraints is required at MVP scale (`target_scale: small`).

## Migration Notes

- This is the project's first migration; it creates the `supabase/migrations/` directory convention.
- Catalog data is shipped via the migration itself (not `seed.sql`), so `npx supabase db push` provisions it in production identically to local.
- No existing data to migrate; the change is purely additive.

## References

- Roadmap item: `context/foundation/roadmap.md` (F-01, lines 61–72)
- PRD: `context/foundation/prd.md` (FR-001 line 61; Business Logic line 88; per-user isolation NFR line 81)
- Recurring rules: `context/foundation/lessons.md` (no lodash)
- Supabase client convention: `src/lib/supabase.ts:6`
- Supabase config: `supabase/config.toml` (migrations line 55, seed lines 62–65)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema + seed migration

#### Automated

- [x] 1.1 Migration applies cleanly on a fresh DB: `npx supabase db reset`
- [x] 1.2 Muscle groups seeded: `select count(*) from muscle_groups;` returns 6
- [x] 1.3 Exercises seeded and all reference a valid group (no orphan FKs)
- [x] 1.4 Lint passes: `npm run lint` (lint-neutral for this change; pre-existing repo-wide CRLF errors out of scope)

#### Manual

- [x] 1.5 Both tables show RLS enabled with a single SELECT policy and no write policies (Studio)
- [x] 1.6 Client insert is rejected by RLS
- [x] 1.7 Polish display names correct; slugs are stable lowercase machine keys
- [x] 1.8 Exercise distribution per group is reasonable (no empty/oversized groups)

### Phase 2: Typed catalog query helper

#### Automated

- [ ] 2.1 Type checking passes: `npm run build` / `npx astro check`
- [ ] 2.2 Lint passes: `npm run lint`
- [ ] 2.3 Helper compiles against the seeded schema with catalog types

#### Manual

- [ ] 2.4 `getMuscleGroups` returns the 6 seeded groups
- [ ] 2.5 `getExercises` filters by slug; no slug returns the full catalog
- [ ] 2.6 Null Supabase client yields an empty/typed result instead of throwing
- [ ] 2.7 `docs/reference/contract-surfaces.md` lists the catalog names accurately
