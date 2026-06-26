import type { WorkoutExerciseInput } from "@/lib/workouts";

/**
 * Shared parsing for the workout form-POST routes (`/api/workouts` logging and
 * `/api/workouts/plan` planning). Both routes accept the same multi-exercise
 * payload and `YYYY-MM-DD` date; only their date *rules* differ (log rejects
 * future dates, plan requires them), so those rules stay in each route while the
 * payload parsing and the UTC-today helper live here.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** ISO `YYYY-MM-DD` for the current UTC day. */
export function todayUtcIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Parse a `YYYY-MM-DD` string to its UTC-midnight epoch ms, or `NaN`. */
export function parseIsoDate(value: string): number {
  if (!ISO_DATE.test(value)) {
    return Number.NaN;
  }
  return Date.parse(`${value}T00:00:00Z`);
}

/** Validate one submitted exercise row into a typed input, or an error string. */
export function parseExerciseRow(item: unknown): WorkoutExerciseInput | string {
  const row = (item ?? {}) as Record<string, unknown>;
  const exerciseId = Number(row.exerciseId);
  const sets = Number(row.sets);
  const reps = Number(row.reps);
  const weight = Number(row.weight);

  if (!Number.isInteger(exerciseId) || exerciseId <= 0) {
    return "Choose an exercise for every row.";
  }
  if (!Number.isInteger(sets) || sets < 1) {
    return "Sets must be a whole number of at least 1.";
  }
  if (!Number.isInteger(reps) || reps < 1) {
    return "Reps must be a whole number of at least 1.";
  }
  if (!Number.isFinite(weight) || weight < 0) {
    return "Weight must be zero or more.";
  }
  return { exerciseId, sets, reps, weight };
}

/**
 * Parse the hidden `exercises` JSON field into typed rows, or an error string.
 * Handles malformed JSON, a non-array / empty payload, and per-row validation.
 */
export function parseExercisesField(raw: string | null): WorkoutExerciseInput[] | string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw ?? "[]");
  } catch {
    return "Could not read the submitted exercises.";
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return "Add at least one exercise.";
  }

  const exercises: WorkoutExerciseInput[] = [];
  for (const item of parsed) {
    const row = parseExerciseRow(item);
    if (typeof row === "string") {
      return row;
    }
    exercises.push(row);
  }
  return exercises;
}
