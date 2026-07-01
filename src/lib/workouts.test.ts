import { describe, expect, it } from "vitest";
import { createWorkout } from "@/lib/workouts";
import { createSupabaseFake } from "@/lib/test-support/supabase-fake";

/**
 * Oracle for these tests (Risk #2 — silent data loss on a non-atomic save):
 * PRD guardrail "a saved workout is available next login", refined by research.md
 * — `createWorkout` does two independent inserts with a best-effort compensating
 * delete of the parent when the child insert fails; it must NEVER report a false
 * success. These hermetic tests pin the partial-failure branches an injected fake
 * can exercise deterministically. DB-level guarantees (FK, 23505 from the real
 * unique index, actual persistence) belong to the integration suite.
 */

const input = {
  userId: "user-1",
  workoutDate: "2026-07-01",
  exercises: [{ exerciseId: 7, sets: 3, reps: 8, weight: 50 }],
};

const childInserts = (fake: ReturnType<typeof createSupabaseFake>) =>
  fake.calls.filter((c) => c.table === "workout_exercises" && c.op === "insert");

const parentDeletes = (fake: ReturnType<typeof createSupabaseFake>) =>
  fake.calls.filter((c) => c.table === "workouts" && c.op === "delete");

describe("createWorkout — partial-failure compensation (Risk #2)", () => {
  it("compensates: on child-insert failure it returns {ok:false} and deletes the orphaned parent", async () => {
    const fake = createSupabaseFake({
      "workouts:insert": { data: { id: 42 }, error: null },
      "workout_exercises:insert": { error: { message: "child boom" } },
    });

    const result = await createWorkout(fake.client, input);

    expect(result).toEqual({ ok: false, error: "Could not save the workout exercises." });
    // The compensating delete must fire against the just-created parent id.
    expect(parentDeletes(fake)).toEqual([{ table: "workouts", op: "delete", eq: { column: "id", value: 42 } }]);
  });

  it("maps a 23505 parent-insert violation to the friendly duplicate message and never touches children", async () => {
    const fake = createSupabaseFake({
      "workouts:insert": { data: null, error: { code: "23505" } },
    });

    const result = await createWorkout(fake.client, input);

    expect(result).toEqual({ ok: false, error: "You already have a plan for that day." });
    expect(childInserts(fake)).toHaveLength(0);
    expect(parentDeletes(fake)).toHaveLength(0);
  });

  it("maps a generic parent-insert error to the generic message with no child insert and no delete", async () => {
    const fake = createSupabaseFake({
      "workouts:insert": { data: null, error: { code: "22007", message: "bad date" } },
    });

    const result = await createWorkout(fake.client, input);

    expect(result).toEqual({ ok: false, error: "Could not save the workout." });
    expect(childInserts(fake)).toHaveLength(0);
    expect(parentDeletes(fake)).toHaveLength(0);
  });

  it("happy path: both inserts succeed, returns {ok:true, id} and issues no compensating delete", async () => {
    const fake = createSupabaseFake({
      "workouts:insert": { data: { id: 99 }, error: null },
      "workout_exercises:insert": { error: null },
    });

    const result = await createWorkout(fake.client, input);

    expect(result).toEqual({ ok: true, id: 99 });
    expect(childInserts(fake)).toHaveLength(1);
    expect(parentDeletes(fake)).toHaveLength(0);
  });
});
