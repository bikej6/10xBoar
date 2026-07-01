---
date: 2026-07-01T00:00:00Z
researcher: bikej6
git_commit: a2d421b51a9512732e2f0319f4efcf8f60556891
branch: master
repository: 10xBoar (boar)
topic: "Phase 1 test rollout — bootstrap runner + workout save integrity (Risks #2, #4)"
tags: [research, codebase, testing, workouts, save-integrity, validation, vitest]
status: complete
last_updated: 2026-07-01
last_updated_by: bikej6
---

# Research: Phase 1 — Bootstrap + save integrity (Risks #2, #4)

**Date**: 2026-07-01
**Researcher**: bikej6
**Git Commit**: a2d421b51a9512732e2f0319f4efcf8f60556891
**Branch**: master
**Repository**: 10xBoar (boar)

## Research Question

For test-plan §3 Phase 1, produce the oracle (what the workout write path *should* do — from PRD/US, not from the code) and bind it to the actual implementation, so `/10x-plan` can decide the cheapest test layer per risk. Cover Risk #2 (silent data loss on multi-row save) and Risk #4 (server-side input-validation gap), and establish the Vitest bootstrap constraints.

## Summary

**Risk #2 — the multi-row save is NON-ATOMIC by design.** `createWorkout` does two independent inserts (`workouts` parent → `workout_exercises` children) with a **best-effort compensating delete** of the parent if the child insert fails. There is no transaction, no RPC, no stored procedure anywhere in the repo. On child-insert failure the function returns `{ ok: false }` and both endpoints redirect with `?error=` — **the user is never falsely told "saved."** The one residual hole: the compensating delete's result is **not checked** (`src/lib/workouts.ts:119`), so if that delete itself fails (or the process dies between the two inserts) an orphaned parent workout with zero exercises survives.

→ Per CLAUDE.md's two-layer rule, a non-atomic sequence means the **partial-failure branch is a hermetic (stub) test**, not an integration test that forces a mid-sequence error. This *refines* the test-plan's initial "likely cheapest layer = integration" guess for #2 (§1 principle #3: research is ground truth). Integration still earns its keep for the **positive** assertion (parent + child rows actually persist) and DB-level guarantees (cascade, unique-planned-per-day).

**Risk #4 — server-side validation is solid, with exactly ONE trust gap.** All numeric/date rules are re-validated server-side in `src/lib/workout-submission.ts` (hand-rolled, no zod). The single gap: **exercise-id catalog membership (FR-001) is not checked in code** — it relies solely on the DB foreign key `exercise_id → exercises(id)`. A crafted payload with a positive-integer id not in the catalog (e.g. `999999`) passes all code validation and is caught only by the FK (Postgres `23503`), surfaced as the generic "Could not save the workout exercises."

**Two oracle ambiguities must be resolved before writing assertions** (see Open Questions): (a) **weight = 0** — the test-plan lists "negative/zero weights" as invalid, but both code and DB deliberately allow `weight >= 0`; and (b) whether FR-001 catalog membership must be enforced in **code** or an FK-only guarantee is acceptable.

**Runner state — greenfield.** Zero test files, zero test tooling. Vitest confirmed via Context7 as the Astro-official runner using `getViteConfig()` from `astro/config`.

## Detailed Findings

### The workout write path (Risk #2)

Two Astro `POST` form handlers (no JSON API — they consume `formData` and redirect), both funnelling into one service:

- **Log** — `src/pages/api/workouts.ts:27` → `createWorkout(..., status: "logged")` at `:52`; success → `/workouts?saved=1` (`:57`), failure → `?error=` (`:53-55`).
- **Plan** — `src/pages/api/workouts/plan.ts:26` → `createWorkout(..., status: "planned")` at `:50`; success → `/workouts?planned=1` (`:55`), failure → `?error=`.
- Both read exactly two body fields: `workout_date` and a hidden JSON `exercises` string. `user_id` comes from `context.locals.user` server-side, never the body (`workouts.ts:35`, `plan.ts:34`).
- The "Propose → Accept as plan" flow also POSTs to `/api/workouts/plan` (`src/components/workouts/WorkoutLogForm.tsx:612-625`). The only writing component is `WorkoutLogForm.tsx`; it uses native HTML `<form method="POST">`, not `fetch`.

**`createWorkout` — `src/lib/workouts.ts:80-124`** (the single write path):

1. Parent insert (`:92-97`): `supabase.from("workouts").insert({ user_id, workout_date, status }).select("id").single()`.
   - Error handling (`:99-104`): `23505` → `{ ok:false, error:"You already have a plan for that day." }`; any other → `{ ok:false, error:"Could not save the workout." }`. Returns before touching children.
2. Child insert (`:114`): `supabase.from("workout_exercises").insert(childRows)` — single multi-row array of `{ workout_id, exercise_id, sets, reps, weight }` (`:106-112`).
3. Compensation (`:116-121`):
   ```js
   if (exercisesError) {
     // Best-effort cleanup of the orphaned parent.
     await supabase.from("workouts").delete().eq("id", workout.id);
     return { ok: false, error: "Could not save the workout exercises." };
   }
   ```

Facts that decide the test layer:
- **No transaction / no rollback.** Parent is already committed when the child insert runs.
- **The compensating delete's result is ignored** (`:119`) — no `{ error }` destructuring. If it fails, the orphan parent persists permanently. Comment at `:73-74, :116-117` explicitly calls this "best-effort — not crash-atomic."
- **The handler never reports a false success.** Child-insert failure → `{ ok:false }` → `?error=` redirect. HTTP is a 302 in both cases, differentiated only by query string.

### DB schema & constraints (Risk #2 / #4 defense-in-depth)

From `supabase/migrations/` (no generated `database.types.ts`; DB types hand-declared in `src/lib/workouts.ts`):

- **`workouts`** — `20260619132351_create_workouts.sql:17-23`: `id` bigint PK; `user_id uuid not null → auth.users(id) on delete cascade`; `workout_date date not null`; `status text not null default 'logged'` (**no CHECK** on status values); `created_at`. Partial unique index `workouts_one_planned_per_day_idx on (user_id, workout_date) where status='planned'` (`20260622140500_unique_planned_per_day.sql:14-16`) — the source of the `23505` handled at `workouts.ts:100`.
- **`workout_exercises`** — `create_workouts.sql:30-36` + `20260622132912_add_workout_exercise_reps.sql:12-13`: `workout_id bigint not null → workouts(id) on delete cascade`; `exercise_id bigint not null → exercises(id)` (**no ON DELETE clause → RESTRICT**); `sets int not null check (sets > 0)`; `weight numeric not null check (weight >= 0)`; `reps int not null check (reps > 0)`. No `user_id` — ownership is transitive via parent.
- **`on delete cascade` on `workout_id`** means the compensating parent-delete also removes any partial children — so the app-level cleanup is correct *when the delete succeeds*.
- **Catalog** — `20260616173529_seed_exercise_catalog.sql`: `muscle_groups` (slug unique) and `exercises` (unique `(muscle_group_id, name)`), seeded inside the migration (6 groups, 22 exercises). Read-only from clients (SELECT-only RLS `using(true)`).
- **RLS**: `workouts` has SELECT/INSERT/DELETE scoped `auth.uid() = user_id` (no UPDATE); `workout_exercises` a single `FOR ALL` transitive policy. (Full RLS assertions belong to Phase 2, not here.)

### Server-side validation (Risk #4)

All in `src/lib/workout-submission.ts`, invoked by both endpoints via `parseExercisesField`:

- `exerciseId`: `!Number.isInteger || <= 0` → rejected (`:34-36`) — **positive-integer only; NO catalog-membership check.**
- `sets`: `< 1` rejected (`:37-39`); `reps`: `< 1` rejected (`:40-42`).
- `weight`: `!Number.isFinite || < 0` → "Weight must be zero or more." (`:43-45`) — **zero allowed, negatives rejected, no upper bound.**
- `≥ 1 row` and valid JSON (`:53-73`).
- Dates: log path `isAcceptableDate` rejects beyond `today+1` UTC (`workouts.ts:14-21`), empty → today; plan path `isFutureDate` requires `>= today` UTC (`plan.ts:13-20`), empty → rejected. Format gate `ISO_DATE = /^\d{4}-\d{2}-\d{2}$/` (`workout-submission.ts:11`).
- **No validation library** (no zod/valibot/yup anywhere). Client `validate()` in `WorkoutLogForm.tsx:190-230` mirrors these — and the server *does* re-check them, so the client is not blindly trusted, **except** catalog membership (client can only pick ids from the catalog `<select>`, server relies on the FK).

### Test-runner bootstrap constraints

- `package.json`: **no `test` script**, zero test/coverage tooling (no vitest/jest/@testing-library/jsdom/happy-dom/msw). `vite` pinned via `overrides` to `^7.3.2` → **Vitest must be Vite-7-compatible (Vitest ≥ 2.x / 3.x).** `.nvmrc` = 22.14.0.
- Zero existing `*.test.*` / `*.spec.*` / `__tests__` under `src/`.
- `astro.config.mjs`: `output:"server"`, adapter `@astrojs/cloudflare`, `env.schema` declares `SUPABASE_URL`/`SUPABASE_KEY` as **optional server secrets** consumed via `astro:env/server`.
- `tsconfig.json`: path alias `@/* → ./src/*` — Vitest must replicate (via `getViteConfig()` or `vite-tsconfig-paths`).
- `src/lib/supabase.ts` imports `astro:env/server` (a virtual module that **doesn't exist outside the Astro build**) and returns `null` when either env var is missing (`:6-8`). Tests must either use `getViteConfig()` (loads Astro's env plumbing) or mock/alias `astro:env/server`. The null-return branch is directly testable.
- **Context7 (checked 2026-07-01)**: Astro's official testing guide recommends **Vitest**, configured via `getViteConfig()` from `astro/config` in `vitest.config.ts`; since Astro 4.8 it accepts a second inline-Astro-config argument. Also offers the experimental Container API for `.astro` component rendering (not needed for Phase 1 — §7 excludes presentational UI).

## Oracle → test-layer binding (the two-layer decision)

| Behaviour the test must prove (oracle) | Source | Bound to | Cheapest real layer |
|---|---|---|---|
| Numeric rules: weight `>= 0` & finite, sets `≥1`, reps `≥1`, exerciseId positive int, `≥1` row | FR-003; test-plan Risk #4 | `workout-submission.ts:27-73` (pure fns) | **Unit** (no DB) |
| Date rules: log ≤ today+1, plan ≥ today, ISO format, empty→default/reject | FR-003/FR-004 | `workouts.ts:14-21`, `plan.ts:13-20`, `workout-submission.ts:11` | **Unit** (pure) — but see Risk #6 timezone (Phase 4) |
| Child-insert failure leaves **no falsely-"saved"** workout; compensation deletes the parent; returns `{ok:false}` | PRD Guardrail; test-plan Risk #2 | `workouts.ts:114-121` | **Hermetic (stub)** — non-atomic app-code compensation |
| Happy path: parent **and** child rows both persist and survive | PRD Guardrail ("available next login") | `workouts.ts:92-114` | **Integration** (real Supabase) |
| Non-catalog `exercise_id` is rejected and leaves **no** orphan workout | FR-001; test-plan Risk #4 | FK `create_workouts.sql:33` + compensation | **Integration** (a stub would lie about the FK) |
| Duplicate planned-per-day rejected as `23505` with the right message | derived (unique index) | `workouts.ts:99-102` | **Integration** |

This yields the natural Phase 1 ordering for `/10x-plan`:
1. **Runner bootstrap** — Vitest via `getViteConfig()`, `@/` alias, `astro:env/server` handling, `test` script. (`/10x-implement` — no red test definable first.)
2. **Unit** — `workout-submission.ts` validators + date logic (most of Risk #4, cheapest signal). TDD-able.
3. **Hermetic** — `createWorkout` compensation branch (Risk #2 partial-failure). TDD-able: *"when the child insert fails, `createWorkout` returns `{ok:false}` and issues a delete on the parent id."*
4. **Integration** — parent+child persistence, non-catalog FK rejection + no orphan, `23505` (Risk #2 positive + Risk #4 catalog). Real Supabase.

## Architecture Insights

- The app deliberately trades DB atomicity for application-level compensation. That is a legitimate MVP choice, but it puts the correctness burden on the *unchecked* delete at `workouts.ts:119` — the single most valuable thing a hermetic test pins here is that the compensation actually fires on child failure.
- Validation is defense-in-depth (code check **and** DB CHECK) for numbers, but **single-layer (DB FK only)** for catalog membership. That asymmetry is the crux of Risk #4.
- Do **not** write a hermetic/stub test for catalog membership or the `23505` path — a stub client can't honour a foreign-key or a unique index, so it would assert a lie (CLAUDE.md two-layer table, "When NOT to use hermetic").

## Historical Context (from prior changes)

- `context/archive/2026-06-19-log-a-workout/` — the original log-a-workout slice (parent+child insert shape originates here).
- `context/archive/2026-06-22-plan-future-workout/` — added the planned status + the partial unique index behind the `23505` path.
- `context/archive/2026-06-16-seed-exercise-catalog/` — the read-only catalog the FR-001 FK points at; test-plan §7 excludes the seed itself from testing.

## Oracle decisions (resolved with user, 2026-07-01)

1. **weight = 0 is VALID; only negative is rejected.** ✅ RESOLVED. The test-plan's "negative/zero weights" phrasing is imprecise; code (`workout-submission.ts:43`) and DB (`check weight >= 0`) intentionally allow zero (bodyweight exercises). Unit test asserts: `weight < 0` → rejected, `weight == 0` → accepted. Do **not** write `weight === 0 → rejected`.
2. **FR-001 catalog membership: FK-only guarantee is acceptable — integration test only, no code change.** ✅ RESOLVED. Phase 1 asserts (integration) that a non-catalog `exercise_id` (e.g. `999999`) fails the insert on the FK and leaves **no orphan workout**. Do **not** add a server-side code check or change the error message in this phase.
3. **Integration gate stays AD HOC (not in CI).** ✅ RESOLVED. Environment is cloud-Supabase-only (no local Docker). Unit + hermetic layers gate in CI immediately; the integration layer (parent+child persistence, FK rejection, `23505`) is run manually against a real Supabase when the write path changes. Mark accordingly in test-plan §4/§5 when Phase 1 lands.

## Still open (non-blocking)

- **No upper bound on weight/sets/reps** (either layer). Not in the test-plan risk map; flag only — out of scope for Phase 1 unless a sanity ceiling is wanted later.

## Related Research

- `context/foundation/test-plan.md` §2 (Risk #2, #4 + Risk Response table), §3 Phase 1, §4 (Vitest "likely fit" — now confirmed), §6.1/6.2/6.4 (cookbook slots this phase fills).

## Next step

`/10x-plan test-bootstrap-save-integrity` — decompose into the four ordered phases above. Resolve Open Questions #1–#3 first (they change what the tests assert).
