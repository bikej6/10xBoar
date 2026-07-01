import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createWorkout } from "@/lib/workouts";

/**
 * Ad-hoc integration suite (Risks #2, #4). Real Supabase; NOT in CI.
 *
 * Run with `npm run test:integration` after setting, in your `.env`:
 *   SUPABASE_URL, SUPABASE_KEY (anon), SUPABASE_TEST_EMAIL, SUPABASE_TEST_PASSWORD
 * The test user must already exist and be email-confirmed. The whole suite skips
 * when any of those are missing, so a bare checkout can still run `npm test`.
 *
 * Oracle: the PRD guardrail (a saved workout persists / is "available next
 * login"), FR-001 (only catalog exercises), and the unique-planned-per-day index.
 * These assert what a stub cannot honour: real persistence, the `exercise_id` FK,
 * and the `23505` duplicate. Auth uses a real sign-in so the RLS write path
 * (`auth.uid() = user_id`) is genuinely exercised.
 */

const url = process.env.SUPABASE_URL ?? "";
const key = process.env.SUPABASE_KEY ?? "";
const email = process.env.SUPABASE_TEST_EMAIL ?? "";
const password = process.env.SUPABASE_TEST_PASSWORD ?? "";
const missingEnv = !url || !key || !email || !password;

// Obviously-synthetic dates so cleanup can target them without touching real data.
const LOG_DATE = "2999-01-01";
const ORPHAN_DATE = "2999-01-02";
const PLAN_DATE = "2999-01-03";
const TEST_DATES = [LOG_DATE, ORPHAN_DATE, PLAN_DATE];

describe.skipIf(missingEnv)("createWorkout — real Supabase write path (ad-hoc)", () => {
  let client: ReturnType<typeof createClient>;
  let userId: string;
  let catalogExerciseId: number;

  const cleanup = () => client.from("workouts").delete().eq("user_id", userId).in("workout_date", TEST_DATES);

  beforeAll(async () => {
    client = createClient(url, key);

    // The client is untyped (no generated Database types), so PostgREST/Auth
    // responses widen to always-success; annotate the nullable shapes we branch on.
    const {
      data: auth,
      error: authError,
    }: { data: { user: { id: string } | null }; error: { message: string } | null } =
      await client.auth.signInWithPassword({ email, password });
    if (authError || !auth.user) {
      throw new Error(`Test user sign-in failed: ${authError?.message ?? "no user returned"}`);
    }
    userId = auth.user.id;

    const { data: exercise, error: catalogError }: { data: { id: number } | null; error: { message: string } | null } =
      await client.from("exercises").select("id").order("id", { ascending: true }).limit(1).single();
    if (catalogError || !exercise) {
      throw new Error(`Could not read a catalog exercise: ${catalogError?.message ?? "empty catalog"}`);
    }
    catalogExerciseId = exercise.id;

    await cleanup();
  });

  afterEach(async () => {
    await cleanup();
  });

  it("persists the parent workout and its exercise children (Risk #2 positive)", async () => {
    const result = await createWorkout(client, {
      userId,
      workoutDate: LOG_DATE,
      exercises: [{ exerciseId: catalogExerciseId, sets: 3, reps: 8, weight: 50 }],
      status: "logged",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return; // narrow for the reads below
    expect(typeof result.id).toBe("number");

    const { data: parent } = await client.from("workouts").select("workout_date, status").eq("id", result.id).single();
    expect(parent).toMatchObject({ workout_date: LOG_DATE, status: "logged" });

    const { data: children } = await client
      .from("workout_exercises")
      .select("exercise_id, sets, reps, weight")
      .eq("workout_id", result.id);
    expect(children).toEqual([{ exercise_id: catalogExerciseId, sets: 3, reps: 8, weight: 50 }]);
  });

  it("rejects a non-catalog exercise_id and leaves no orphan workout (Risk #4 FK + Risk #2 compensation)", async () => {
    const result = await createWorkout(client, {
      userId,
      workoutDate: ORPHAN_DATE,
      exercises: [{ exerciseId: 999999, sets: 3, reps: 8, weight: 50 }],
      status: "logged",
    });

    expect(result.ok).toBe(false);

    const { data: orphans } = await client
      .from("workouts")
      .select("id")
      .eq("user_id", userId)
      .eq("workout_date", ORPHAN_DATE);
    expect(orphans).toEqual([]);
  });

  it("rejects a duplicate planned workout for the same day with the friendly 23505 message", async () => {
    const exercises = [{ exerciseId: catalogExerciseId, sets: 3, reps: 8, weight: 50 }];

    const first = await createWorkout(client, { userId, workoutDate: PLAN_DATE, exercises, status: "planned" });
    expect(first.ok).toBe(true);

    const second = await createWorkout(client, { userId, workoutDate: PLAN_DATE, exercises, status: "planned" });
    expect(second).toEqual({ ok: false, error: "You already have a plan for that day." });
  });
});
