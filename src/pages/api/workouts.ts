import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { createWorkout, type WorkoutExerciseInput } from "@/lib/workouts";

const DAY_MS = 24 * 60 * 60 * 1000;

/** ISO `YYYY-MM-DD` for the current UTC day. */
function todayUtcIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Reject only when the date is clearly in the future — beyond today (UTC) + 1
 * day. The one-day grace (F2) avoids falsely rejecting a valid local "today"
 * for users in positive-UTC offsets, since the Workers clock is UTC while the
 * date input defaults to the browser's local today.
 */
function isAcceptableDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const submitted = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(submitted)) {
    return false;
  }
  const today = Date.parse(`${todayUtcIso()}T00:00:00Z`);
  return submitted <= today + DAY_MS;
}

function redirectError(context: Parameters<APIRoute>[0], message: string) {
  return context.redirect(`/workouts?error=${encodeURIComponent(message)}`);
}

/** Validate one submitted exercise row into a typed input, or an error string. */
function parseExerciseRow(item: unknown): WorkoutExerciseInput | string {
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

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return redirectError(context, "Supabase is not configured");
  }

  const user = context.locals.user;
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const rawDate = (form.get("workout_date") as string | null)?.trim();
  const workoutDate = rawDate && rawDate.length > 0 ? rawDate : todayUtcIso();

  if (!isAcceptableDate(workoutDate)) {
    return redirectError(context, "Pick a date that is not in the future.");
  }

  let parsedRows: unknown;
  try {
    parsedRows = JSON.parse((form.get("exercises") as string | null) ?? "[]");
  } catch {
    return redirectError(context, "Could not read the submitted exercises.");
  }
  if (!Array.isArray(parsedRows) || parsedRows.length === 0) {
    return redirectError(context, "Add at least one exercise.");
  }

  const exercises: WorkoutExerciseInput[] = [];
  for (const item of parsedRows) {
    const parsed = parseExerciseRow(item);
    if (typeof parsed === "string") {
      return redirectError(context, parsed);
    }
    exercises.push(parsed);
  }

  const result = await createWorkout(supabase, { userId: user.id, workoutDate, exercises });
  if (!result.ok) {
    return redirectError(context, result.error);
  }

  return context.redirect("/workouts?saved=1");
};
