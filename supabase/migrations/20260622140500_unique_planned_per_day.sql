-- S-02: Plan a future workout — one plan per day guard
--
-- S-02 introduces `planned` workouts (status = 'planned') on top of the S-01
-- schema. The slice's chosen scope boundary is "at most one planned workout
-- per user per date". This migration enforces that rule at the database, in
-- keeping with the project's preference for DB-level guarantees over app-only
-- checks (the same posture as the RLS policies in 20260619132351).
--
-- A PARTIAL unique index — scoped by `WHERE status = 'planned'` — restricts
-- only planned rows. Logged history is untouched: a user may still log and
-- plan the same date, and may keep multiple logged rows for one date. Additive
-- and backward-safe (no `planned` rows exist yet). Rollback = drop the index.

create unique index workouts_one_planned_per_day_idx
  on workouts (user_id, workout_date)
  where status = 'planned';

comment on index workouts_one_planned_per_day_idx is 'S-02: at most one planned workout per (user, date). Partial — scoped to status = planned, so logged rows are unaffected.';
