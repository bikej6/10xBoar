# tasks-github

Archived record of the one-off migration that turned `context/foundation/roadmap.md` (v1)
into GitHub issues in [`bikej6/10xBoar`](https://github.com/bikej6/10xBoar).

- **Date:** 2026-06-16
- **Source:** `context/foundation/roadmap.md` (v1) — remains the source of truth
- **Target:** GitHub Issues, repo `bikej6/10xBoar`
- **Decisions:** 5 issues (one per roadmap item), Polish, existing labels only
  (`enhancement`; `question` for the blocked north-star), dependencies as in-body cross-references.

## Tasks created

| Issue | Roadmap | Change ID | Labels | Status | Wymaga | Blokuje |
| ----- | ------- | --------- | ------ | ------ | ------ | ------- |
| [#4](https://github.com/bikej6/10xBoar/issues/4) | F-01 | seed-exercise-catalog | enhancement | ready | — | #5, #6, #7 |
| [#5](https://github.com/bikej6/10xBoar/issues/5) | S-01 | log-a-workout | enhancement | proposed | #4 | #6, #7, #8 |
| [#6](https://github.com/bikej6/10xBoar/issues/6) | S-02 | plan-future-workout | enhancement | proposed | #4, #5 | #7 |
| [#7](https://github.com/bikej6/10xBoar/issues/7) | S-03 | history-based-proposal | enhancement, question | blocked ⭐ | #4, #5, #6 | — |
| [#8](https://github.com/bikej6/10xBoar/issues/8) | S-04 | weight-progress-stats | enhancement | proposed | #5 | — |

⭐ = north star (S-03); `blocked` by the open question on minimum logged sessions before a
proposal is meaningful.

## Notes

- GitHub shares numbering with PRs, so issues start at #4 (#1–#3 were past PRs).
- Status (ready/proposed/blocked) lives in each issue body, not as a filterable label
  (existing-labels-only choice). Add `status:*` labels later if board filtering is needed.
- Roadmap IDs (`[F-01]`…`[S-04]`) in issue titles match `roadmap.md` for cross-walk.
