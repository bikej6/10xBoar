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
