-- S-01 scope amendment (2026-06-22): capture repetitions per exercise.
--
-- The original S-01 model was exercise + set-count + weight. Product decision
-- extends it to also record repetitions, so a user can log e.g. "3 sets x 12
-- reps". One reps value per exercise (all sets share it), consistent with the
-- single-weight-per-exercise model — not per-individual-set detail.
--
-- Additive and backward-safe: existing rows get reps = 1 via a temporary
-- default, which is then dropped so future inserts must supply reps explicitly
-- (the app always does).

alter table workout_exercises
  add column reps integer not null default 1 check (reps > 0);

alter table workout_exercises
  alter column reps drop default;

comment on column workout_exercises.reps is 'Repetitions per set for this exercise (one value for all sets). S-01 scope amendment 2026-06-22.';
