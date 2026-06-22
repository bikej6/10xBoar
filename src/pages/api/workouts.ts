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

  const exerciseId = Number(form.get("exercise_id"));
  const sets = Number(form.get("sets"));
  const reps = Number(form.get("reps"));
  const weight = Number(form.get("weight"));
  const rawDate = (form.get("workout_date") as string | null)?.trim();
  const workoutDate = rawDate && rawDate.length > 0 ? rawDate : todayUtcIso();

  if (!Number.isInteger(exerciseId) || exerciseId <= 0) {
    return redirectError(context, "Choose an exercise.");
  }
  if (!Number.isInteger(sets) || sets < 1) {
    return redirectError(context, "Sets must be a whole number of at least 1.");
  }
  if (!Number.isInteger(reps) || reps < 1) {
    return redirectError(context, "Reps must be a whole number of at least 1.");
  }
  if (!Number.isFinite(weight) || weight < 0) {
    return redirectError(context, "Weight must be zero or more.");
  }
  if (!isAcceptableDate(workoutDate)) {
    return redirectError(context, "Pick a date that is not in the future.");
  }

  const exercises: WorkoutExerciseInput[] = [{ exerciseId, sets, reps, weight }];

  const result = await createWorkout(supabase, { userId: user.id, workoutDate, exercises });
  if (!result.ok) {
    return redirectError(context, result.error);
  }

  return context.redirect("/workouts?saved=1");
};
