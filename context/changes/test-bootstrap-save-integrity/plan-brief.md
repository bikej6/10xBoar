# Phase 1 — Bootstrap + Save Integrity — Plan Brief

> Full plan: `context/changes/test-bootstrap-save-integrity/plan.md`
> Research: `context/changes/test-bootstrap-save-integrity/research.md`

## What & Why

Stand up the project's first test runner (Vitest) and protect the workout write path against **silent data loss** (Risk #2) and a **server-side validation gap** (Risk #4). This is rollout Phase 1 of the frozen test-plan — the cheapest real signal on the highest-value surface, and the runner every later phase builds on.

## Starting Point

Zero test infrastructure (no runner, no test files, `vite` pinned to ^7.3.2). The write path `createWorkout` (`src/lib/workouts.ts:80-124`) is **non-atomic**: it inserts the workout parent, then the exercise children, then a best-effort compensating delete of the parent if the child insert fails — no transaction. Validation is hand-rolled in `workout-submission.ts` and mostly complete; the one gap is catalog membership, enforced only by a DB foreign key.

## Desired End State

`npm test` runs a fast, green unit + hermetic suite needing no external infra (CI-ready). `npm run test:integration` runs real-Supabase checks on demand. The write path has regression cover for validation, the partial-failure compensation branch, real parent+child persistence, non-catalog rejection, and the duplicate-planned `23505` path. The test-plan cookbook (§6) and stack/gates (§4/§5) reflect the shipped state.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| weight = 0 | Valid; only negative rejected | Bodyweight exercises have zero external load; code + DB already allow it | Research |
| FR-001 catalog membership | FK-only; integration test, no code change | The DB FK already guarantees integrity; a code check is out of a test-only phase | Research |
| Integration environment | Ad-hoc, not in CI | Cloud-Supabase-only, no local Docker; test-plan §4/§5 permit ad-hoc | Research |
| Risk #2 failure layer | Hermetic stub (not integration) | Non-atomic app-code compensation is fully exercisable with a stub | Research |
| Vitest config | `getViteConfig()` from `astro/config` | Astro-official; resolves `@/` alias and `astro:env` without manual mocks | Plan |
| Supabase stub | Reusable typed fake helper | Readable assertions on the fluent chain; becomes cookbook §6.2 pattern | Plan |
| Integration isolation | `*.integration.test.ts` suffix + separate script | Keeps the CI floor to unit+hermetic; explicit split | Plan |
| CI wiring | Deferred to rollout Phase 4 | Phase 4 owns "wire suite into CI"; keep Phase 1 small | Plan |

## Scope

**In scope:** Vitest bootstrap; unit tests for validation + dates; hermetic tests for the save-compensation branch; ad-hoc integration tests for persistence/FK/uniqueness; cookbook + test-plan sync.

**Out of scope:** Cross-user/RLS/anonymous access (Phase 2); proposal + timezone logic (Phases 3–4); any change to `createWorkout`/validation code; GitHub Actions wiring (Phase 4); component/`.astro` rendering tests; Stryker.

## Architecture / Approach

Four test layers by increasing cost/signal — pure-function unit → hermetic stub (injected Supabase fake) → real-DB integration — plus a docs-sync phase. Unit + hermetic need no infra and are CI-gatable; integration is isolated behind a filename suffix and run ad-hoc against cloud Supabase.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Vitest bootstrap | Runner, config, split scripts, green smoke | `astro:env`/alias resolution in tests |
| 2. Unit (validation + dates) | Risk #4 numeric/date cover | Mirror-testing the implementation |
| 3. Hermetic (compensation) | Risk #2 partial-failure cover + reusable fake | Fake too lenient to catch regressions |
| 4. Integration (ad-hoc) | Persistence, FK, `23505` (Risk #2/#4) | Env setup + test-data cleanup |
| 5. Cookbook & sync | §6/§4/§5 updated, rollout status | Docs drifting from shipped tests |

**Prerequisites:** create `feat/test-bootstrap-save-integrity` before `/10x-implement`; real `SUPABASE_URL`/`SUPABASE_KEY` for Phase 4 only.
**Estimated effort:** ~2-3 sessions across 5 phases.

## Open Risks & Assumptions

- Integration tests depend on a reachable cloud Supabase with the current schema; env absence must skip, not fail.
- Windows/CRLF lint noise pre-exists — judge lint by new errors, not exit code.
- No upper bound on weight/sets/reps is asserted (not in the risk map) — flagged, deferred.

## Success Criteria (Summary)

- `npm test` is green and infra-free on a clean checkout; `npm run test:integration` exists and is excluded from it.
- A broken compensation delete turns the hermetic suite red; a non-catalog id leaves no orphan workout in integration.
- Test-plan §6 cookbook and §3 Phase 1 status reflect the shipped suite.
