# Phase 1 — Bootstrap + Save Integrity: Implementation Plan

## Overview

Stand up the project's first test runner (Vitest) and cover the workout write path against silent data loss (Risk #2) and the server-side validation gap (Risk #4). Tests are layered by increasing cost/signal: pure-function unit → hermetic stub → real-DB integration. This is rollout **Phase 1** of `context/foundation/test-plan.md` §3.

## Current State Analysis

- **Zero test infrastructure.** No `test` script, no Vitest/Jest, no test files (`research.md` §"Test-runner bootstrap constraints"). `vite` is pinned via `overrides` to `^7.3.2`, so Vitest must be Vite-7-compatible (≥ 3.x). `.nvmrc` = 22.14.0.
- **Write path is non-atomic.** `createWorkout` (`src/lib/workouts.ts:80-124`) inserts the `workouts` parent, then the `workout_exercises` children, then — only on child failure — issues a **best-effort compensating delete** of the parent (`:119`) whose result is not checked. No transaction, no RPC anywhere in the repo. On child failure it returns `{ ok:false }` and both endpoints redirect with `?error=` — the user is never falsely told "saved."
- **Validation is hand-rolled and mostly complete.** `src/lib/workout-submission.ts` re-validates weight (`>= 0`, negatives rejected), sets/reps (`≥1`), exerciseId (positive int), `≥1` row; endpoints validate dates (log ≤ today+1 UTC; plan ≥ today UTC). The single gap: **catalog membership (FR-001) is enforced only by the DB FK** `exercise_id → exercises(id)`, not in code.
- **Astro env plumbing.** `src/lib/supabase.ts` imports the virtual module `astro:env/server` and returns `null` when env is missing. `@/` alias (`tsconfig.json`) must be replicated in tests.

## Desired End State

`npm test` runs a green unit + hermetic suite (CI-ready, no external infra). `npm run test:integration` runs the real-Supabase suite on demand. The workout write path has regression protection for: numeric/date validation, the partial-failure compensation branch, real persistence of parent+child, non-catalog rejection, and the duplicate-planned `23505` path. `test-plan.md` §4/§5/§6 reflect the shipped state.

### Key Discoveries:

- Non-atomic compensation, not a transaction — partial-failure is app logic, fully exercisable with a stub (`src/lib/workouts.ts:114-121`). This is why Risk #2's failure branch is **hermetic**, refining the test-plan's initial "integration" guess (research is ground truth, test-plan §1 principle #3).
- `weight >= 0` is intentional (bodyweight exercises) — oracle resolved: **zero valid, negative rejected** (`workout-submission.ts:43`).
- Catalog membership is FK-only by design — oracle resolved: **integration-only assertion, no code change** (`create_workouts.sql:33`).
- `on delete cascade` on `workout_id` (`create_workouts.sql:32`) means the compensating parent-delete also clears partial children.
- Vitest is Astro's official runner via `getViteConfig()` from `astro/config` (Context7, checked 2026-07-01).

## What We're NOT Doing

- **No cross-user / RLS / anonymous-access tests** — that is rollout Phase 2 (Risks #1, #5).
- **No proposal-logic or timezone tests** — rollout Phases 3 and 4.
- **No change to `createWorkout` or validation code** — catalog membership stays FK-only; weight-zero stays valid; no upper-bound guard added.
- **No GitHub Actions wiring** — the CI gate is wired in rollout Phase 4. This phase only adds the npm scripts and a green local suite.
- **No component / `.astro` rendering tests** — presentational UI is test-plan §7 negative space.
- **No mutation-testing (Stryker) run** — optional selective gate, not part of bootstrap.

## Implementation Approach

Four test layers by cost, then a docs-sync phase. Unit and hermetic layers need no external infra and gate in CI (Phase 4 wires the actual workflow); the integration layer is **ad-hoc** (cloud-Supabase-only environment, no local Docker) and isolated behind a `*.integration.test.ts` suffix excluded from the default `test` run. The hermetic layer depends on a small reusable typed Supabase fake that also becomes the cookbook §6.2 pattern.

## Critical Implementation Details

- **`astro:env/server` in tests.** Using `getViteConfig()` loads Astro's env plumbing so imports resolve; the SUPABASE_* fields are `optional: true`, so unit/hermetic tests that never build a real client need no env. Integration tests require real `SUPABASE_URL`/`SUPABASE_KEY` to be present or they must not run under `npm test`.
- **Stub must model the fluent chain.** `createWorkout` calls `supabase.from("workouts").insert(...).select("id").single()` then `supabase.from("workout_exercises").insert(...)` then `supabase.from("workouts").delete().eq("id", …)`. The fake must let each `(table, op)` return a configured `{ data, error }` and record that the `delete().eq()` fired — otherwise the compensation assertion can't be made.
- **Integration ordering.** The non-catalog-id test doubles as a Risk #2 assertion: after the FK rejection, query `workouts` and assert **no orphan row** survives (the compensation ran).

## Phase 1: Vitest Bootstrap

### Overview

Install and configure Vitest so tests can import project modules with the `@/` alias and Astro env, and split the default (CI) run from the ad-hoc integration run.

### Changes Required:

#### 1. Test dependencies

**File**: `package.json`

**Intent**: Add Vitest (Vite-7-compatible) as the runner. No component/DOM libs needed this phase (no `.astro`/React rendering).

**Contract**: `devDependencies` gains `vitest` (≥ 3.x). Scripts gain `"test"` (default run, excludes integration) and `"test:integration"`. `test` must exit non-zero on failure for CI.

#### 2. Vitest configuration

**File**: `vitest.config.ts` (new)

**Intent**: Configure Vitest through Astro so `@/` and `astro:env/server` resolve without manual mocking. Exclude the integration suffix from the default run.

**Contract**: Uses `getViteConfig()` from `astro/config`. `test.exclude` adds `**/*.integration.test.ts` (on top of defaults). Node environment (no jsdom). A separate mechanism (`test:integration` script targeting the suffix, e.g. a second config or `vitest run **/*.integration.test.ts`) runs the excluded files.

```ts
/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";
export default getViteConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.integration.test.ts"],
  },
});
```

#### 3. Smoke test

**File**: `src/lib/__smoke__.test.ts` (new, temporary or trivial)

**Intent**: Prove the runner + alias resolve before real tests land.

**Contract**: A trivial `expect(true).toBe(true)` plus one import via `@/` to confirm alias resolution. May be deleted once Phase 2 lands real tests.

### Success Criteria:

#### Automated Verification:

- `npm test` runs Vitest and passes the smoke test
- `@/`-aliased import resolves inside a test (no module-resolution error)
- `npm run test:integration` is a distinct script and does NOT run under `npm test`
- `npm run lint` passes on new files (no new errors beyond pre-existing CRLF noise)

#### Manual Verification:

- `npm test` completes in a couple seconds with no external infra/env present

---

## Phase 2: Unit — Validation & Dates (Risk #4)

### Overview

Cover the server-side validation boundary with pure-function tests — the cheapest real signal for Risk #4.

### Changes Required:

#### 1. Exercise-row / payload validation

**File**: `src/lib/workout-submission.test.ts` (new)

**Intent**: Pin the validation contract of `parseExerciseRow` and `parseExercisesField` against the oracle (FR-003 + resolved decisions), catching regressions that would let invalid rows persist.

**Contract**: Behavioural assertions on the exported parse functions (`workout-submission.ts:27-73`), parameterised where a property has multiple inputs (use `it.each`, avoid redundant copies):
- weight: `< 0` → rejected; `0` → **accepted**; finite positive → accepted; non-finite → rejected.
- sets `< 1` rejected, `≥ 1` accepted; reps `< 1` rejected, `≥ 1` accepted.
- exerciseId: non-integer / `≤ 0` rejected; positive int accepted (no catalog check here — that's integration).
- payload: non-array / empty → "Add at least one exercise."; malformed JSON → error.
- Assert error **messages** where they are user-facing contracts (e.g. "Weight must be zero or more.").

#### 2. Date validation

**File**: `src/lib/workout-submission.test.ts` (same file) and/or endpoint-level date helpers

**Intent**: Prove the date boundary per endpoint (FR-003 log vs FR-004 plan).

**Contract**: ISO format gate (`ISO_DATE`), log path rejects beyond today+1 (UTC) and defaults empty→today, plan path requires ≥ today (UTC) and rejects empty. Anchor "today" deterministically (inject/fake the clock) so the test is not machine-date-dependent. (Timezone drift itself is Risk #6 / rollout Phase 4 — here only assert the UTC contract as coded.)

### Success Criteria:

#### Automated Verification:

- `npm test` runs the new unit tests and they pass
- Parameterised cases cover weight (neg/zero/pos), sets, reps, exerciseId, empty/malformed payload
- Date cases cover log (≤ today+1), plan (≥ today), bad format, empty
- `npm run lint` passes on the new test file

#### Manual Verification:

- Reviewer confirms each assertion derives from the oracle (PRD/FR + resolved decisions), not from re-running the implementation (no mirror tests)

---

## Phase 3: Hermetic — Save Compensation (Risk #2)

### Overview

Test the non-atomic partial-failure branch of `createWorkout` with an injected Supabase fake — no real DB, deterministic.

### Changes Required:

#### 1. Reusable Supabase fake

**File**: `src/lib/test-support/supabase-fake.ts` (new)

**Intent**: Provide a small typed fake client modelling the fluent chain `createWorkout` uses, letting each `(table, operation)` return a configured `{ data, error }` and recording calls (esp. the compensating `delete().eq()`). Becomes the cookbook §6.2 pattern.

**Contract**: Exposes a builder that supports `from(table)` → `.insert()`, `.insert().select().single()`, `.delete().eq()`, returning caller-configured results and recording invocations for assertions (which table, which op, args).

#### 2. createWorkout compensation tests

**File**: `src/lib/workouts.test.ts` (new)

**Intent**: Prove that a mid-sequence failure never yields a falsely-"saved" workout, and that compensation fires — the core Risk #2 protection.

**Contract**: Using the fake (`workouts.ts:80-124`):
- Child insert returns an error → `createWorkout` returns `{ ok:false, error:"Could not save the workout exercises." }` **and** a `delete().eq("id", <parentId>)` on `workouts` was recorded.
- Parent insert returns `23505` → `{ ok:false, error:"You already have a plan for that day." }` and **no** child insert attempted.
- Parent insert returns a generic error → `{ ok:false, error:"Could not save the workout." }`, no child insert, no delete.
- Happy path (both inserts ok) → `{ ok:true, ... }` and **no** compensating delete.

### Success Criteria:

#### Automated Verification:

- `npm test` runs the hermetic tests and they pass
- The compensation test asserts the `delete` on the parent id was invoked
- The `23505` branch and generic-error branch are each covered
- `npm run lint` passes on new files

#### Manual Verification:

- Reviewer confirms the fake models the real chain faithfully (no assertion that only passes because the fake is too lenient)

---

## Phase 4: Integration — Persistence, FK, Uniqueness (Risks #2, #4) — ad-hoc

### Overview

Real-Supabase tests for what a stub cannot honour: actual persistence, the catalog FK, and the partial-unique index. Ad-hoc (not in CI); requires real `SUPABASE_URL`/`SUPABASE_KEY`.

### Changes Required:

#### 1. Write-path integration tests

**File**: `src/lib/workouts.integration.test.ts` (new)

**Intent**: Prove the guardrail (saved workout persists) and the DB-level protections behind Risks #2/#4.

**Contract**: Against a real Supabase, with per-test cleanup:
- Happy path: after `createWorkout`, both the `workouts` row and all `workout_exercises` children exist and match the payload (Risk #2 positive — "available next login").
- Non-catalog `exercise_id` (e.g. `999999`): `createWorkout` returns `{ ok:false }`, and querying `workouts` shows **no orphan** row survived (Risk #4 catalog FK + Risk #2 compensation).
- Duplicate planned same `(user, date)`: second insert → `{ ok:false, error:"You already have a plan for that day." }` (`23505`, partial unique index).
- Skipped/guarded when SUPABASE_* env is absent so a bare checkout can't fail here.

### Success Criteria:

#### Automated Verification:

- `npm run test:integration` passes with real Supabase env set
- `npm test` (default) does NOT execute this file
- The non-catalog test verifies no orphan `workouts` row remains

#### Manual Verification:

- Run once against the real cloud Supabase project; confirm test data is cleaned up and no residue remains
- Confirm the suite is genuinely optional (documented as ad-hoc; a teammate without env can still run `npm test`)

---

## Phase 5: Cookbook & Test-Plan Sync

### Overview

Record the shipped patterns and update rollout state so the next phase (and future contributors) inherit them.

### Changes Required:

#### 1. Cookbook patterns

**File**: `context/foundation/test-plan.md` (§6)

**Intent**: Replace the TBD slots with the concrete patterns this phase established.

**Contract**: §6.1 (unit) → the pure-function validation pattern; §6.2 (integration) → the reusable Supabase fake + real-DB write-path pattern; §6.4 (new API endpoint) → server-side validation parity note. §6.6 → 2-3 line note on the non-atomic compensation finding.

#### 2. Stack, gates & rollout status

**File**: `context/foundation/test-plan.md` (§3, §4, §5)

**Intent**: Reflect that the runner exists and the integration gate is ad-hoc.

**Contract**: §4 stack rows → Vitest (version, checked 2026-07-01); §5 → mark the unit+hermetic gate active, the integration gate **ad hoc (not CI)**; §3 Phase 1 Status → `complete` with this change folder linked.

### Success Criteria:

#### Automated Verification:

- `context/foundation/test-plan.md` §6.1/§6.2/§6.4 no longer contain "TBD"
- §3 Phase 1 Status shows `complete` and references `test-bootstrap-save-integrity`

#### Manual Verification:

- Reviewer confirms the cookbook entries are accurate to the shipped tests

---

## Testing Strategy

### Unit Tests:

- `workout-submission.ts` validators (weight neg/zero/pos, sets, reps, exerciseId, empty/malformed payload) and date rules (log/plan boundaries, ISO, empty).

### Integration Tests:

- Real-Supabase write path: parent+child persistence, non-catalog FK rejection with no orphan, duplicate-planned `23505`.

### Manual Testing Steps:

1. `npm test` on a clean checkout with no env → green, fast, no external calls.
2. Set `SUPABASE_URL`/`SUPABASE_KEY`, run `npm run test:integration` → green; verify data cleanup.
3. Break `createWorkout`'s compensation delete locally → confirm the hermetic test goes red (kill-the-mutant sanity check).

## Performance Considerations

Unit + hermetic suites must stay sub-second-ish (no I/O). Integration is ad-hoc and network-bound — not on the CI critical path.

## Migration Notes

No data or schema changes. New dev dependency (Vitest) and new test/config files only.

## References

- Research: `context/changes/test-bootstrap-save-integrity/research.md`
- Write path: `src/lib/workouts.ts:80-124`; validation: `src/lib/workout-submission.ts:27-73`
- Schema: `supabase/migrations/20260619132351_create_workouts.sql`
- Test-plan: `context/foundation/test-plan.md` §2 (Risks #2/#4), §3 Phase 1, §4, §6
- Astro+Vitest: `getViteConfig()` from `astro/config` (Context7, 2026-07-01)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Vitest Bootstrap

#### Automated

- [x] 1.1 `npm test` runs Vitest and passes the smoke test
- [x] 1.2 `@/`-aliased import resolves inside a test
- [x] 1.3 `npm run test:integration` is distinct and excluded from `npm test`
- [x] 1.4 `npm run lint` passes on new files

#### Manual

- [x] 1.5 `npm test` completes fast with no external infra/env present

### Phase 2: Unit — Validation & Dates

#### Automated

- [ ] 2.1 New unit tests run under `npm test` and pass
- [ ] 2.2 Parameterised cases cover weight (neg/zero/pos), sets, reps, exerciseId, empty/malformed payload
- [ ] 2.3 Date cases cover log (≤ today+1), plan (≥ today), bad format, empty
- [ ] 2.4 `npm run lint` passes on the new test file

#### Manual

- [ ] 2.5 Reviewer confirms assertions derive from the oracle, not from the implementation (no mirror tests)

### Phase 3: Hermetic — Save Compensation

#### Automated

- [ ] 3.1 Hermetic tests run under `npm test` and pass
- [ ] 3.2 Compensation test asserts the `delete` on the parent id was invoked
- [ ] 3.3 `23505` branch and generic-error branch are each covered
- [ ] 3.4 `npm run lint` passes on new files

#### Manual

- [ ] 3.5 Reviewer confirms the fake models the real chain faithfully

### Phase 4: Integration — Persistence, FK, Uniqueness (ad-hoc)

#### Automated

- [ ] 4.1 `npm run test:integration` passes with real Supabase env set
- [ ] 4.2 `npm test` (default) does NOT execute the integration file
- [ ] 4.3 Non-catalog test verifies no orphan `workouts` row remains

#### Manual

- [ ] 4.4 Run once against real cloud Supabase; confirm test-data cleanup
- [ ] 4.5 Confirm the suite is genuinely optional (teammate without env can run `npm test`)

### Phase 5: Cookbook & Test-Plan Sync

#### Automated

- [ ] 5.1 §6.1/§6.2/§6.4 no longer contain "TBD"
- [ ] 5.2 §3 Phase 1 Status shows `complete` and references the change folder

#### Manual

- [ ] 5.3 Reviewer confirms cookbook entries are accurate to the shipped tests
