---
change_id: history-based-proposal
title: History based proposal
status: impl_reviewed
created: 2026-06-26
updated: 2026-06-27
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

### Resolved blocking decisions (2026-06-26)

Resolves roadmap Open Question 1 (was `Block: yes`) and the research.md Open Question 1 — S-03 is now unblocked for planning.

- **Minimum history to generate a proposal:** **≥ 3 logged sessions** for the chosen muscle group (count `workouts.status = 'logged'` rows that include an exercise in that muscle group). Below the threshold → no proposal.
- **Empty-state (no qualifying history for the muscle group):** **prompt to log first** — explain why and link to logging a workout for that muscle group (do not fall back to manual planning, do not silently hide the group).

Still to settle inside `/10x-plan` (design choices, non-blocking): library `@finegym/fitness-calc` vs. native `one-rep-max.ts`; source of `sets` for a proposed exercise; accept-collision policy when a plan already exists for the target day.
