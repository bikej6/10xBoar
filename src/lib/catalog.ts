import type { createClient } from "@/lib/supabase";

/**
 * Typed read access to the built-in exercise catalog (see migration
 * `supabase/migrations/*_seed_exercise_catalog.sql`). The catalog is shared,
 * read-only reference data; these helpers are the single access contract for
 * downstream slices (logging, planning, history-based proposals).
 *
 * Each helper accepts the per-request Supabase client returned by
 * `createClient`, which is `null` when env vars are missing. In that case the
 * helpers degrade to an empty result rather than throwing, matching the
 * null-client convention used across the app.
 */

type CatalogClient = NonNullable<ReturnType<typeof createClient>>;

export interface MuscleGroup {
  id: number;
  slug: string;
  name: string;
}

export interface Exercise {
  id: number;
  muscleGroupId: number;
  name: string;
}

interface ExerciseRow {
  id: number;
  muscle_group_id: number;
  name: string;
}

/** All muscle groups, ordered by display name. */
export async function getMuscleGroups(supabase: CatalogClient | null): Promise<MuscleGroup[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("muscle_groups")
    .select("id, slug, name")
    .order("name")
    .overrideTypes<MuscleGroup[], { merge: false }>();

  if (error) {
    return [];
  }

  return data;
}

/**
 * Exercises from the catalog, ordered by name. Pass a muscle-group `slug` to
 * filter to one group; omit it to return the full catalog (this is how an
 * "all groups" / "Całe ciało" selection is served).
 */
export async function getExercises(supabase: CatalogClient | null, muscleGroupSlug?: string): Promise<Exercise[]> {
  if (!supabase) {
    return [];
  }

  let query = supabase.from("exercises").select("id, muscle_group_id, name, muscle_groups!inner(slug)").order("name");

  if (muscleGroupSlug) {
    query = query.eq("muscle_groups.slug", muscleGroupSlug);
  }

  const { data, error } = await query.overrideTypes<ExerciseRow[], { merge: false }>();

  if (error) {
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    muscleGroupId: row.muscle_group_id,
    name: row.name,
  }));
}
