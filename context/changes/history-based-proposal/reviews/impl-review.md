<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: History-Based Workout Proposal (S-03)

- **Plan**: context/changes/history-based-proposal/plan.md
- **Scope**: Phases 1–2 of 2
- **Date**: 2026-06-27
- **Verdict**: NEEDS ATTENTION → resolved (F1 fixed during triage)
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Propose date defaults to blank, not today (empty-string fallback)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/components/workouts/WorkoutLogForm.tsx:145 (paired with src/pages/workouts.astro:17)
- **Detail**: workouts.astro:17 sets `proposeDate = searchParams.get("date") ?? ""`, so the island receives "" (not undefined) on a load with no `date` param. `useState(proposeDate ?? today)` only substitutes today for null/undefined — "" is not nullish, so the Propose "Target day" input renders blank on a fresh tab open (defeating the default-today contract), and an untouched Accept POSTs `workout_date=""` which plan.ts:41 rejects. Regression introduced when swapping `|| today` for `?? today` to satisfy `prefer-nullish-coalescing`.
- **Fix**: Length-guarded fallback at line 145: `useState(proposeDate && proposeDate.length > 0 ? proposeDate : today)` — robust against "" and undefined, stays lint-clean.
  - Strength: Handles both "" and undefined; one line, contained to the island; compound condition isn't the `a ? a : b` pattern the linter flags.
  - Tradeoff: Slightly wordier than `?? today`.
  - Confidence: HIGH — both call sites traced; matches line-145 intent.
  - Blind spot: None significant.
- **Decision**: FIXED (applied the length-guarded fallback; lint clean)

### F2 — "Never throws" docstring is slightly overstated

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/proposal.ts:109-130
- **Detail**: generateProposal has no try/catch; the "Never throws" guarantee relies on the catalog/history helpers returning [] on query errors (which they do in practice). Consistent with the sibling unguarded awaits in workouts.astro:20-25 — not a regression.
- **Fix**: Optional — soften wording to "never throws for query errors", or leave as-is.
- **Decision**: SKIPPED (contract holds in practice; consistent with siblings)

### F3 — Plan testing-note arithmetic is wrong (60 → 62.5)

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence (plan doc, not code)
- **Location**: context/changes/history-based-proposal/plan.md:177
- **Detail**: The Testing Strategy note writes "60 → 62.5" and "20 → 20.5 → guard", but the binding rule (×1.025, round to 0.5) yields 60 → 61.5 and 20 → 20.5. The code (bumpWeight, proposal.ts:47-53) correctly implements the rule; only the illustrative figure in the plan note is miscalculated. Doc-only.
- **Fix**: Optional — correct the example in the plan note (62.5 → 61.5).
- **Decision**: SKIPPED (code correct; plan note is archived-as-is)
