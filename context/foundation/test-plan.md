# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-07-01

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team
   is worried about X, and the failure would surface somewhere in <area>"
   carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents _what
   could fail_ and _why we believe it's likely_ — drawn from documents,
   interview, and codebase _signal_ (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the _evidence that surfaced
this risk_ — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| #   | Risk (failure scenario)                                                                                                                                                          | Impact | Likelihood | Source (evidence — not anchor)                                                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Cross-user data leakage — a logged-in user reads or writes another user's workouts/exercises (broken ownership check / RLS gap).                                                 | High   | High       | PRD NFR (per-user data isolation); interview Q1; roadmap S-01 unknown ("isolation enforced at query level or DB rules?"); hot-spot dir `src/pages/api/` (7 commits/30d) |
| 2   | Silent data loss on multi-row save — the workout parent row commits but child exercise rows are dropped (no transaction across writes); the UI still reports "saved".            | High   | High       | interview Q1 + Q2 (lived incident); PRD Guardrail (saved workout must persist to next login); hot-spot dirs `src/components/workouts/` (11 commits/30d), `src/lib/`     |
| 3   | Proposal violates history rules — returns a plan from insufficient/zero history, or a generic plan not derived from _this user's_ data, instead of the defined empty-state.      | High   | Medium     | interview Q3 ("roulette" on every history-read tweak); US-01 acceptance criteria; FR-005; PRD Open Question (min history); hot-spot dir `src/lib/`                      |
| 4   | Server-side input validation gap — the write path trusts the client: negative/zero weights, missing fields, exercise IDs outside the catalog, or disallowed dates get persisted. | Medium | Medium     | abuse lens (untrusted input — has_auth, accepts user input); hot-spot dirs `src/pages/api/` (7 commits/30d), `src/components/workouts/` (11 commits/30d)                |
| 5   | Unauthenticated access — a protected route or workout API endpoint is reachable without a session (middleware / `PROTECTED_ROUTES` gap).                                         | High   | Medium     | abuse lens (authorization); CLAUDE.md route-protection convention; hot-spot `src/middleware.ts` (4 commits/30d), dir `src/components/auth/` (8 commits/30d)             |
| 6   | Timezone day-assignment drift — a workout is filed under the wrong calendar day (Workers UTC clock vs the user's local day), corrupting calendar and stats.                      | Medium | Medium     | roadmap S-05 unknown (UTC vs local day attribution)                                                                                                                     |

**Impact × Likelihood rubric.** Both axes scored High / Medium / Low. High
impact = user loses access, data, or money; High likelihood = area changes
weekly or we have already been burned here.

Risks #1 and #2 are High × High — protect first. The abuse lens added
Risks #1, #4, #5 (the product has auth and accepts user input, so the happy
path excludes the attacker). No High-impact × Low-likelihood scenarios were
padded into the map; cloud-provider/runtime outages belong to observability,
which is absent today (roadmap Baseline) and out of scope for this rollout.

### Risk Response Guidance

| Risk | What would prove protection                                                                                                                                              | Must challenge                                                                | Context `/10x-research` must ground                                                                               | Likely cheapest layer                                                 | Anti-pattern to avoid                                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| #1   | User B cannot read or mutate User A's rows via any workout endpoint — even with a valid session and an owned-looking or guessed ID                                       | "Logged-in == authorized for this row"; "RLS is enabled so the query is safe" | Where ownership is enforced (RLS policy vs query filter vs `locals.user`); the per-request client's user identity | integration / contract with **two real users** against local Supabase | IDOR test that only exercises the own-data happy path; over-mocking the DB so RLS never actually runs                              |
| #2   | A write that fails partway leaves **no** "successful" workout with missing exercises — it either fully rolls back or the API reports failure                             | "Parent insert succeeded == workout saved"; "HTTP 200 == complete write"      | How the multi-row write is sequenced; rollback / compensation behavior when a child insert fails                  | integration test that forces a child-insert failure                   | happy-path-only save test; asserting on status code without verifying child rows persisted                                         |
| #3   | No history → explicit empty-state (not a plan); insufficient history → defined behavior; a returned plan contains only exercises traceable to this user's logged history | "A returned plan is a correct plan"; "empty response == no history"           | The history-read query; the minimum-history threshold (PRD Open Question); the empty-state contract from US-01    | unit / integration with **synthetic history fixtures**                | **oracle problem** — asserting the expected plan by copying the proposal code's own output instead of deriving it from US-01 rules |
| #4   | Invalid payloads (negative/zero weight, missing fields, non-catalog exercise id, disallowed date) are rejected server-side regardless of client behavior                 | "Client-side validation is enough"; "the form prevents bad input"             | The server validation boundary on the write endpoint; the catalog-membership check                                | unit / integration on the API handler                                 | testing only the React form; assuming the server mirrors client rules without proving it                                           |
| #5   | An anonymous request to a protected route or workout API gets redirected / 401, not data                                                                                 | "Page guard implies API guard"                                                | Which paths are in `PROTECTED_ROUTES`; whether API routes enforce `locals.user` independently of page guards      | integration test hitting endpoints with no session                    | testing only page redirects and never the API endpoints                                                                            |
| #6   | A workout logged near local midnight lands on the user's intended day consistently across calendar and stats                                                             | "Server date == the user's day"                                               | Where the day is derived (UTC vs local); the current behavior (still an open unknown)                             | unit test on the date-derivation logic                                | asserting against the test machine's timezone; snapshotting a single timezone                                                      |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| #   | Phase name                 | Goal (one line)                                                                                           | Risks covered | Test types                    | Status      | Change folder                   |
| --- | -------------------------- | --------------------------------------------------------------------------------------------------------- | ------------- | ----------------------------- | ----------- | ------------------------------- |
| 1   | Bootstrap + save integrity | Stand up the test runner; prove the workout write path cannot silently lose data or persist invalid input | #2, #4        | unit + hermetic + integration | complete    | `test-bootstrap-save-integrity` |
| 2   | Access isolation           | Prove no cross-user leakage and no anonymous access (the abuse layer)                                     | #1, #5        | integration + contract        | not started | —                               |
| 3   | Proposal correctness       | Prove the proposal honors history rules and never fabricates a plan                                       | #3            | unit + integration            | not started | —                               |
| 4   | Edge + quality gate        | Lock day-assignment correctness and wire the suite into CI so the floor cannot regress                    | #6            | unit + gates                  | not started | —                               |

**Status vocabulary** (fixed): `not started` → `change opened` →
`researched` → `planned` → `implementing` → `complete`.

Order rationale: Risks #1 and #2 are both High × High. Phase 1 bootstraps
the runner on the cheapest real signal — #2 and #4 share the workout write
surface. Phase 2 takes the second High × High block (access isolation), which
needs a two-user Supabase harness and so follows the runner. Phase 3 defends
the trust-critical proposal (deterministic, oracle from US-01). Phase 4 locks
the remaining edge plus the CI gate once a suite exists to gate on.

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.

| Layer                      | Tool                   | Version | Notes                                                                                                                                                                                                                                                                                           |
| -------------------------- | ---------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| unit + hermetic            | Vitest                 | 4.1.9   | Installed in §3 Phase 1. Plain `vitest.config.ts` replicating the `@/` alias (NOT `getViteConfig()` — its Cloudflare adapter plugin rejects Vitest env options); unit/hermetic tests never import `astro:env/server`. `npm test` = default CI suite. checked: 2026-07-01                        |
| API / Supabase integration | Vitest (ad-hoc)        | 4.1.9   | `*.integration.test.ts`, excluded from `npm test`; run via `npm run test:integration` (`vitest.integration.config.ts`, loads `.env`). Exercises the real client with a signed-in test user so RLS runs; env-guarded skip. Not in CI (cloud-Supabase only, no local Docker). checked: 2026-07-01 |
| e2e                        | none yet — see Phase 4 | —       | No browser/Playwright MCP exposed this session; e2e would be a local dependency, deferred unless a failure mode needs the full deployed shape.                                                                                                                                                  |
| accessibility              | not planned            | —       | Presentational UI is negative space (§7).                                                                                                                                                                                                                                                       |
| (optional) AI-native       | not planned            | —       | No cost × signal case in the brief; deterministic tests cover the top risks.                                                                                                                                                                                                                    |

If a row reads "none yet — see Phase <N>", that gap is addressed by the
named rollout phase.

**Stack grounding tools (current session):**

- Docs: Context7 MCP — available; will ground Vitest / Supabase / Astro test setup and current APIs in Phase 1; checked: 2026-06-28
- Search: Exa MCP — available; for discovery of current Astro+Vitest+Cloudflare test patterns only, preferring official docs as evidence; checked: 2026-06-28
- Runtime/browser: none exposed this session — e2e would be a local Playwright dependency, not MCP-driven; checked: 2026-06-28
- Provider/platform: Supabase MCP + GitHub `gh` — relevant for RLS verification (Phase 2) and CI test-gate wiring (Phase 4); checked: 2026-06-28

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required after §3 Phase <N>" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate                         | Where        | Required?                                                                                    | Catches                                                       |
| ---------------------------- | ------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| lint + typecheck             | local + CI   | required                                                                                     | syntactic / type drift (already wired)                        |
| unit + hermetic (`npm test`) | local + CI   | active — local now (`npm test`, exits non-zero on fail); GitHub Actions wiring in §3 Phase 4 | logic regressions on the write path                           |
| write-path integration       | local ad-hoc | ad hoc — NOT CI (cloud-Supabase, no local Docker); run when the write path changes           | real persistence, catalog FK, unique-planned-per-day index    |
| access-isolation integration | local + CI   | required after §3 Phase 2                                                                    | cross-user leakage, anonymous access                          |
| proposal correctness suite   | local + CI   | required after §3 Phase 3                                                                    | proposal returning a plan it should not                       |
| e2e on critical flows        | CI on PR     | optional — see §3 Phase 4                                                                    | broken critical user paths if integration proves insufficient |

Every row corresponds to a gate that either is wired (lint+build, per CI)
or will be wired by a named rollout phase.

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase <N>."

### 6.1 Adding a unit test

- Pure-function pattern (shipped §3 Phase 1 → `test-bootstrap-save-integrity`). Co-locate `*.test.ts` next to the module; import via the `@/` alias. Derive every assertion from the oracle (PRD/FR + the resolved decisions in the change's `research.md`), never by re-running the implementation (no mirror tests). Parameterise multi-input properties with `it.each` — one case per regression, no redundant copies — and assert the user-facing error **message** where it is a contract. Inject "today" (or any clock) so date rules are not machine-date-dependent. Example: `src/lib/workout-submission.test.ts` (weight ≥ 0, sets/reps ≥ 1, exerciseId positive int, ISO + log/plan date boundaries).

### 6.2 Adding an integration test

- Two shipped patterns (§3 Phase 1 → `test-bootstrap-save-integrity`):
  - **Hermetic (stub) — for partial-failure branches** that real infra cannot easily trigger (e.g. the second op in a non-atomic sequence fails). Use the reusable typed fake `src/lib/test-support/supabase-fake.ts`: configure each `(table, op)` result and assert the recorded calls — e.g. that the compensating `delete().eq("id", <parentId>)` fired and no false success was returned. Example: `src/lib/workouts.test.ts`. Do **not** stub FK / unique constraints — a stub would lie about them.
  - **Real-DB write-path — for what a stub cannot honour** (actual persistence, the catalog FK, the unique index). Suffix `*.integration.test.ts` (excluded from `npm test`; run via `npm run test:integration`). Sign in a real test user so the RLS write path (`auth.uid() = user_id`) is exercised; env-guard the whole suite (`describe.skipIf`) so a bare checkout skips it; clean up test rows per-test using obviously-synthetic dates. Example: `src/lib/workouts.integration.test.ts`.

### 6.3 Adding an access-isolation test

- TBD — see §3 Phase 2. Will cover the two-user pattern: User B must not read or mutate User A's rows, and anonymous requests must be rejected (Risks #1, #5).

### 6.4 Adding a test for a new API endpoint

- Server-side validation parity (shipped §3 Phase 1). Every rule the client enforces must be re-asserted server-side and unit-tested against the oracle (Risk #4) — the server must not trust the form. Test the exported parse/validate helpers directly (as in `workout-submission.test.ts`) rather than the `.astro` handler shell. Note the one deliberate asymmetry: catalog membership (FR-001) is FK-only by design, so it is proven by the integration suite (non-catalog id → rejected, no orphan row), not by a code check.

### 6.5 Adding a proposal / history-logic test

- TBD — see §3 Phase 3. Will cover the synthetic-history-fixture pattern with the oracle derived from US-01 rules, not from the proposal code (Risk #3).

### 6.6 Per-rollout-phase notes

(Optional. After each phase lands, `/10x-implement` appends a 2-3 line note
here capturing anything surprising the rollout phase taught.)

**Phase 1 — Bootstrap + save integrity (`test-bootstrap-save-integrity`, 2026-07-01)**

- The workout write path is **non-atomic by design**: parent insert → child insert → best-effort compensating `delete` of the parent on child failure (`src/lib/workouts.ts`). Per CLAUDE.md's two-layer rule this made the partial-failure branch a **hermetic** (stub) test, not integration — refining the risk map's initial "integration" guess for Risk #2. The residual hole: the compensating delete's result is unchecked, so a failed delete leaves an orphan.
- `getViteConfig()` was avoided (its Cloudflare adapter plugin rejects Vitest's env options); a plain config replicating the `@/` alias suffices because unit/hermetic tests never import `astro:env/server` and `workouts.ts` imports `supabase.ts` type-only.
- Oracle decision carried forward: `weight === 0` is **valid** (bodyweight); catalog membership stays FK-only (integration assertion, no code check).

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Pure presentational UI** (Tailwind markup, layout/styling, component snapshots) — high churn, low signal; breaks constantly and catches nothing. Re-evaluate if a visual regression ever causes a user-facing incident. (Source: Phase 2 interview Q5.)
- **The static exercise catalog seed** — it is seed data; the seed script is the test. Re-evaluate if the catalog gains user-editable or dynamic behavior (e.g. FR-002 CSV import leaves the backlog). (Source: Phase 2 interview Q5.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-06-28
- Stack versions last verified: 2026-07-01 (Vitest 4.1.9, §3 Phase 1)
- AI-native tool references last verified: 2026-06-28

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
