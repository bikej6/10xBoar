# Seed Exercise Catalog (F-01) — Plan Brief

> Full plan: `context/changes/seed-exercise-catalog/plan.md`

## What & Why

Seed 10xBoar's foundational, read-only **exercise catalog** — a `muscle_groups` lookup table and an `exercises` table filed one-group-per-exercise — so users can later *select* exercises from a built-in base (PRD FR-001). It is roadmap item F-01, the prerequisite that unlocks S-01 (logging), S-02 (planning), and S-03 (history-based proposals); without a queryable catalog no exercise-selection flow is buildable.

## Starting Point

No domain schema exists — `supabase/` holds only `config.toml`, the app uses `auth.users` only, and there are no migrations. `config.toml` already enables migrations and a seed path. This change introduces the **project's first migration** and the `supabase/migrations/` convention.

## Desired End State

A fresh DB (`supabase db reset` locally, `db push` in prod) ends up with two populated tables — 6 muscle groups and a minimal exercise set, each exercise referencing one group — both RLS-protected as shared read-only reference data. A typed `src/lib/catalog.ts` helper lists groups and exercises, proving the catalog is end-to-end queryable. No end-user UI.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Catalog home | Supabase table (seeded) | Workout rows FK to it and S-03 joins history↔catalog in one query. | Plan |
| Exercise→group cardinality | Exactly one primary group | Simplest schema covering the persona; minimal-taxonomy guidance. | Plan |
| Muscle-group model | Lookup table (`muscle_groups`) | Add groups via INSERT, room for a display label, clean joins. | Plan |
| Access posture | RLS on, authenticated read-only | Sets the RLS habit on table #1; catalog shared-readable, immutable from clients. | Plan |
| Seeding mechanism | Schema + data both in the migration | `seed.sql` doesn't run on prod `db push`; migration ships reference data to prod. | Plan |
| Taxonomy | 6 core groups; "Całe ciało" = query-time | Minimal anatomically-clean set; avoids a junk whole-body bucket under one-group rule. | Plan |
| Query surface | Minimal typed helper in `src/lib` | Proves "queryable"; gives downstream slices a stable contract. | Plan |

## Scope

**In scope:** first migration (DDL + RLS + seed), 6-group taxonomy with stable slugs, minimal exercise set, typed catalog query helper, contract-surfaces registry entry.

**Out of scope:** any end-user UI, workout/plan tables, CSV import (FR-002), AI-generated exercises, many-to-many muscle mapping, a "Całe ciało" catalog row, Supabase type generation, reliance on `seed.sql` for prod data.

## Architecture / Approach

One versioned migration creates `muscle_groups` (id, slug, name) and `exercises` (id, muscle_group_id FK, name), enables RLS with a single authenticated `SELECT` policy on each (no write policies = immutable from clients), and inserts groups-then-exercises (exercises reference groups by slug subselect, not hardcoded IDs). A thin `src/lib/catalog.ts` then exposes `getMuscleGroups` / `getExercises(slug?)` over the per-request Supabase client, guarding the null-client case from `src/lib/supabase.ts:6`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema + seed migration | First migration: tables, RLS, seeded catalog (ships to prod) | RLS misconfig (write left open) or seed in `seed.sql` and missing from prod |
| 2. Typed catalog query helper | `src/lib/catalog.ts` + types + contract-surfaces entry | Null-client handling; helper drifting from schema (hand-written types) |

**Prerequisites:** local Supabase stack runnable (Docker); `.dev.vars` configured for the helper smoke-test.
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- Taxonomy scope creep — roadmap's flagged risk; mitigated by the fixed 6-group set.
- "Całe ciało" is assumed a query-time all-groups selection, not seeded data — downstream must implement it as a query.
- Hand-written TS types can drift from the schema (type generation deferred).
- RLS read-only posture for *shared* reference data is the precedent for table #1; future per-user tables follow a different (owner-scoped) policy.

## Success Criteria (Summary)

- `supabase db reset` yields 6 muscle groups and a seeded exercise set with no orphan FKs.
- Both tables are RLS-enabled, readable by authenticated users, and reject client writes.
- The typed helper returns correct groups/exercises (and an empty/typed result when the client is null), with `lint` + `build` green.
