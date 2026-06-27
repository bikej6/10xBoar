import type { createClient } from "@/lib/supabase";

/**
 * Typed write/read access to the private-per-user workout schema (see migration
 * `supabase/migrations/20260619132351_create_workouts.sql`). These helpers are
 * the single access contract for the logging UI and its API route — neither
 * should query Supabase ad hoc.
 *
 * Ownership is enforced by RLS (policies keyed to `auth.uid()`), but writes
 * must still populate `user_id` server-side because the `with check` policy
 * requires `user_id = auth.uid()`. The caller passes the authenticated user's
 * id; it is never taken from client input.
 *
 * Each helper accepts the per-request Supabase client returned by
 * `createClient`, which is `null` when env vars are missing. In that case the
 * helpers degrade to a null-safe result (`{ ok: false }` / `[]`) rather than
 * throwing, matching the convention in `src/lib/catalog.ts`.
 */

type WorkoutClient = NonNullable<ReturnType<typeof createClient>>;

/** A workout is either logged history or a planned future session (S-02). */
export type WorkoutStatus = "logged" | "planned";

export interface WorkoutExerciseInput {
  exerciseId: number;
  sets: number;
  reps: number;
  weight: number;
}

export interface LoggedWorkout {
  id: number;
  workoutDate: string;
  status: string;
  exercises: {
    exerciseId: number;
    exerciseName: string;
    sets: number;
    reps: number;
    weight: number;
  }[];
}

export type CreateWorkoutResult = { ok: true; id: number } | { ok: false; error: string };

interface CreateWorkoutInput {
  userId: string;
  workoutDate: string;
  exercises: WorkoutExerciseInput[];
  /** Defaults to `logged`; S-02 passes `planned` to create a future plan. */
  status?: WorkoutStatus;
}

/** Shape of the nested read used by `getRecentWorkouts` (PostgREST embeds). */
interface RecentWorkoutRow {
  id: number;
  workout_date: string;
  status: string;
  workout_exercises: {
    exercise_id: number;
    sets: number;
    reps: number;
    weight: number;
    exercises: { name: string } | null;
  }[];
}

/**
 * Create one dated workout with its exercise rows for the given user. Defaults
 * to status `logged`; pass `status: "planned"` to create a future plan (S-02).
 * Inserts the parent `workouts` row, then its `workout_exercises` children; on
 * child-insert failure, deletes the just-created parent (best-effort cleanup —
 * not crash-atomic, acceptable at small scale per F1).
 *
 * The partial unique index `workouts_one_planned_per_day_idx` allows at most one
 * `planned` row per `(user, date)`; a duplicate insert raises Postgres
 * unique-violation `23505`, surfaced here as a friendly message. Never throws.
 */
export async function createWorkout(
  supabase: WorkoutClient | null,
  { userId, workoutDate, exercises, status = "logged" }: CreateWorkoutInput,
): Promise<CreateWorkoutResult> {
  if (!supabase) {
    return { ok: false, error: "Supabase client unavailable." };
  }

  if (exercises.length === 0) {
    return { ok: false, error: "A workout needs at least one exercise." };
  }

  const { data: workout, error: workoutError } = await supabase
    .from("workouts")
    .insert({ user_id: userId, workout_date: workoutDate, status })
    .select("id")
    .single()
    .overrideTypes<{ id: number }, { merge: false }>();

  if (workoutError) {
    if (workoutError.code === "23505") {
      return { ok: false, error: "You already have a plan for that day." };
    }
    return { ok: false, error: "Could not save the workout." };
  }

  const childRows = exercises.map((exercise) => ({
    workout_id: workout.id,
    exercise_id: exercise.exerciseId,
    sets: exercise.sets,
    reps: exercise.reps,
    weight: exercise.weight,
  }));

  const { error: exercisesError } = await supabase.from("workout_exercises").insert(childRows);

  if (exercisesError) {
    // Best-effort cleanup of the orphaned parent. Runs as the authenticated
    // user and relies on the `workouts` DELETE policy.
    await supabase.from("workouts").delete().eq("id", workout.id);
    return { ok: false, error: "Could not save the workout exercises." };
  }

  return { ok: true, id: workout.id };
}

/** PostgREST embed selected by both workout reads. */
const WORKOUT_SELECT = "id, workout_date, status, workout_exercises(exercise_id, sets, reps, weight, exercises(name))";

/** Map a nested PostgREST row to the `LoggedWorkout` shape. */
function mapWorkoutRow(row: RecentWorkoutRow): LoggedWorkout {
  return {
    id: row.id,
    workoutDate: row.workout_date,
    status: row.status,
    exercises: row.workout_exercises.map((child) => ({
      exerciseId: child.exercise_id,
      exerciseName: child.exercises?.name ?? "",
      sets: child.sets,
      reps: child.reps,
      weight: child.weight,
    })),
  };
}

/**
 * The caller's recent workouts, newest first (`workout_date` desc, then
 * `created_at` desc), with their exercises and resolved catalog names. Pass
 * `status` to restrict to one kind (e.g. `"logged"` to exclude planned rows);
 * omitted returns all statuses. RLS already scopes rows to the caller; the
 * explicit `user_id` filter keeps the intent clear. Returns `[]` on a null
 * client or query error.
 */
export async function getRecentWorkouts(
  supabase: WorkoutClient | null,
  userId: string,
  limit = 10,
  status?: WorkoutStatus,
): Promise<LoggedWorkout[]> {
  if (!supabase) {
    return [];
  }

  let query = supabase.from("workouts").select(WORKOUT_SELECT).eq("user_id", userId);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query
    .order("workout_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit)
    .overrideTypes<RecentWorkoutRow[], { merge: false }>();

  if (error) {
    return [];
  }

  return data.map(mapWorkoutRow);
}

/**
 * All of the caller's workouts — both `logged` and `planned`, uncapped — ordered
 * by `workout_date` ascending (then `created_at` ascending) for determinism. The
 * calendar view (S-05) holds the full dataset client-side and regroups it by date,
 * so order is non-critical; ascending is chosen for stable output. Unlike
 * `getRecentWorkouts`, there is no `limit` and no `status` filter. RLS scopes rows
 * to the caller; the explicit `user_id` filter keeps the intent clear. Returns `[]`
 * on a null client or query error.
 */
export async function getAllWorkouts(
  supabase: WorkoutClient | null,
  userId: string,
): Promise<LoggedWorkout[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("workouts")
    .select(WORKOUT_SELECT)
    .eq("user_id", userId)
    .order("workout_date", { ascending: true })
    .order("created_at", { ascending: true })
    .overrideTypes<RecentWorkoutRow[], { merge: false }>();

  if (error) {
    return [];
  }

  return data.map(mapWorkoutRow);
}

/**
 * The caller's planned (future) workouts, soonest upcoming first
 * (`workout_date` asc, then `created_at` asc), with their exercises and
 * resolved catalog names. Mirrors `getRecentWorkouts` but filtered to
 * `status = 'planned'` with ascending order. Returns `[]` on a null client or
 * query error.
 */
export async function getPlannedWorkouts(
  supabase: WorkoutClient | null,
  userId: string,
  limit = 10,
): Promise<LoggedWorkout[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("workouts")
    .select(WORKOUT_SELECT)
    .eq("user_id", userId)
    .eq("status", "planned")
    .order("workout_date", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(limit)
    .overrideTypes<RecentWorkoutRow[], { merge: false }>();

  if (error) {
    return [];
  }

  return data.map(mapWorkoutRow);
}
