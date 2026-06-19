-- S-01: Log a workout — first private-per-user schema
--
-- Introduces the project's first private-per-user domain tables: `workouts`
-- (one dated session per user) and `workout_exercises` (its exercise rows).
-- F-01 seeded a shared, read-only catalog and foreshadowed that "every later
-- table will instead be private-per-user"; this migration establishes that
-- posture and the RLS precedent (per-user policies keyed to `auth.uid()`,
-- transitive ownership for child rows) that S-02/S-03/S-04 follow.
--
-- The schema is purely additive. `status` ships now (default 'logged') so
-- S-02's `planned` workouts are an additive change rather than a reshape.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

create table workouts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  workout_date date not null,
  status text not null default 'logged',
  created_at timestamptz not null default now()
);

comment on table workouts is 'A user''s dated workout session. Private-per-user (RLS keyed to auth.uid()). status is logged | planned; S-01 only writes logged, S-02 introduces planned.';

-- Covers the recent-workouts read (a user''s sessions, newest first).
create index workouts_user_id_workout_date_idx on workouts (user_id, workout_date);

create table workout_exercises (
  id bigint generated always as identity primary key,
  workout_id bigint not null references workouts (id) on delete cascade,
  exercise_id bigint not null references exercises (id),
  sets integer not null check (sets > 0),
  weight numeric not null check (weight >= 0)
);

comment on table workout_exercises is 'Exercise rows of a workout: catalog exercise + set count + weight. Ownership is transitive via the parent workout (no user_id of its own).';

-- Covers the child join when reading a workout''s exercises.
create index workout_exercises_workout_id_idx on workout_exercises (workout_id);

-- ---------------------------------------------------------------------------
-- Row Level Security: private-per-user, keyed to auth.uid()
-- ---------------------------------------------------------------------------

alter table workouts enable row level security;
alter table workout_exercises enable row level security;

-- workouts: a user reads, creates, and deletes only their own sessions. DELETE
-- supports the failed-write cleanup path (insert parent → insert children → on
-- child failure delete the just-created parent); it is not an end-user delete
-- feature. No UPDATE policy — S-01 never edits a workout.
create policy "Users read their workouts"
  on workouts
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users create their workouts"
  on workouts
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users delete their workouts"
  on workouts
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- workout_exercises authorizes through the parent workout''s owner — a single
-- source of ownership truth on the parent.
create policy "Users manage their workout exercises"
  on workout_exercises
  for all
  to authenticated
  using (exists (select 1 from workouts w where w.id = workout_id and w.user_id = auth.uid()))
  with check (exists (select 1 from workouts w where w.id = workout_id and w.user_id = auth.uid()));
