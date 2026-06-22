# Contract Surfaces

Registry of load-bearing names that multiple changes depend on. Keep names here
stable; renames here are breaking changes that ripple across slices.

## Exercise catalog (F-01 · seed-exercise-catalog)

Shared, read-only reference data. Introduced by
`supabase/migrations/20260616173529_seed_exercise_catalog.sql`.

### Tables

- `muscle_groups` — columns: `id` (PK), `slug` (text, unique, stable machine key),
  `name` (text, Polish display label). RLS: SELECT for `authenticated`, no writes.
- `exercises` — columns: `id` (PK), `muscle_group_id` (FK → `muscle_groups.id`),
  `name` (text). Unique on `(muscle_group_id, name)`. RLS: SELECT for
  `authenticated`, no writes.

### Muscle-group slug set

`chest`, `back`, `legs`, `shoulders`, `arms`, `core`. (Six groups. "Całe ciało" /
whole-body is a query-time "all groups" selection, not a seeded row.)

### Query helper — `src/lib/catalog.ts`

- `getMuscleGroups(supabase): Promise<MuscleGroup[]>` — all groups, ordered by name.
- `getExercises(supabase, muscleGroupSlug?): Promise<Exercise[]>` — exercises, ordered
  by name; filtered to one group when `muscleGroupSlug` is passed, full catalog otherwise.
- Types: `MuscleGroup { id, slug, name }`, `Exercise { id, muscleGroupId, name }`.
- Both accept the per-request client from `createClient` (`src/lib/supabase.ts`) and
  return `[]` when it is `null` (missing env) rather than throwing.

## Workouts (S-01 · log-a-workout)

Private-per-user domain data. Introduced by
`supabase/migrations/20260619132351_create_workouts.sql`. This is the project's
first private-per-user schema and the RLS precedent (per-user policies keyed to
`auth.uid()`, transitive child ownership) that S-02/S-03/S-04 follow.

### Tables

- `workouts` — columns: `id` (PK), `user_id` (uuid, FK → `auth.users.id`,
  `on delete cascade`), `workout_date` (date), `status` (text, default `logged`),
  `created_at` (timestamptz, default `now()`). Index on `(user_id, workout_date)`.
  RLS: per-user **SELECT / INSERT / DELETE** for `authenticated`, keyed to
  `auth.uid() = user_id`; no UPDATE. The DELETE policy exists to support
  failed-write cleanup (insert parent → insert children → delete parent on child
  failure), **not** an end-user delete feature.
- `workout_exercises` — columns: `id` (PK), `workout_id` (FK → `workouts.id`,
  `on delete cascade`), `exercise_id` (bigint, FK → `exercises.id`), `sets`
  (integer, `> 0`), `reps` (integer, `> 0` — repetitions per set; one value for
  all sets, added by the 2026-06-22 reps scope amendment), `weight` (numeric,
  `>= 0`). Index on `workout_id`. No `user_id` — ownership is **transitive** via
  the parent workout. RLS: a single
  `for all` policy for `authenticated` authorizing rows where an `EXISTS` on
  `workouts w` confirms `w.id = workout_id and w.user_id = auth.uid()`.

### Indexes (uniqueness guard)

- `workouts_one_planned_per_day_idx` — **partial unique** index on
  `(user_id, workout_date) WHERE status = 'planned'` (S-02,
  `supabase/migrations/20260622140500_unique_planned_per_day.sql`). Guarantees at
  most one `planned` workout per user per date. Scoped to planned rows only, so
  logged history is unaffected (a user may log and plan the same date, and keep
  multiple logged rows for one date). A duplicate `planned` insert raises
  Postgres unique-violation `23505`.

### `status` value set

`logged` | `planned` (type `WorkoutStatus` in `src/lib/workouts.ts`). S-01 only
ever writes `logged`; **S-02 introduces `planned`** (manual planning). The column
ships now so S-02 is additive.

### Query helper — `src/lib/workouts.ts`

Typed write/read access for the logging UI and its API route — neither queries
Supabase ad hoc.

- `createWorkout(supabase, { userId, workoutDate, exercises, status? }): Promise<{ ok: true; id: number } | { ok: false; error: string }>`
  — inserts the parent `workouts` row, then its `workout_exercises`; on
  child-insert failure deletes the just-created parent (best-effort cleanup, per
  F1 — not crash-atomic). `status` defaults to `logged`; pass `planned` (S-02) to
  create a future plan. A duplicate-`planned`-per-day insert (`23505`) returns
  `{ ok: false, error: "You already have a plan for that day." }`. `userId` is set
  server-side; never throws. **S-03 reuses this as `createWorkout(..., { status: 'planned' })`** for proposal acceptance.
- `getRecentWorkouts(supabase, userId, limit?, status?): Promise<LoggedWorkout[]>`
  — the caller's workouts ordered by `workout_date` desc then `created_at` desc,
  with their exercises and resolved catalog names. Optional `status` restricts to
  one kind (the `/workouts` page passes `"logged"` to exclude planned rows);
  omitted returns all statuses. Default `limit` 10.
- `getPlannedWorkouts(supabase, userId, limit?): Promise<LoggedWorkout[]>` — the
  caller's `planned` workouts ordered **ascending** (`workout_date` asc then
  `created_at` asc — soonest upcoming first). Default `limit` 10.
- Types: `WorkoutStatus = "logged" | "planned"`,
  `WorkoutExerciseInput { exerciseId, sets, reps, weight }`,
  `LoggedWorkout { id, workoutDate, status, exercises: Array<{ exerciseId, exerciseName, sets, reps, weight }> }`.
- All accept the per-request client from `createClient` (`src/lib/supabase.ts`)
  and return a null-safe result (`{ ok: false }` / `[]`) when it is `null`,
  matching `catalog.ts`.
