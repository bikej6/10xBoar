import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { createWorkout } from "@/lib/workouts";
import { parseExercisesField, parseIsoDate, todayUtcIso } from "@/lib/workout-submission";

/**
 * Accept only dates that are not strictly in the past (UTC) — the grace-inclusive
 * backstop for planning. The form enforces the strict "tomorrow onward" UX via
 * `min`; the server allows `submitted >= today (UTC)` so a *behind*-UTC user
 * (e.g. UTC−8) whose genuine local "tomorrow" still reads as today in UTC isn't
 * falsely rejected. Mirror of the +1-day grace on the logging route, flipped.
 */
function isFutureDate(value: string): boolean {
  const submitted = parseIsoDate(value);
  if (Number.isNaN(submitted)) {
    return false;
  }
  const today = Date.parse(`${todayUtcIso()}T00:00:00Z`);
  return submitted >= today;
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

  const workoutDate = (form.get("workout_date") as string | null)?.trim() ?? "";

  if (!isFutureDate(workoutDate)) {
    return redirectError(context, "Pick a future date to plan a workout.");
  }

  const exercises = parseExercisesField(form.get("exercises") as string | null);
  if (typeof exercises === "string") {
    return redirectError(context, exercises);
  }

  const result = await createWorkout(supabase, { userId: user.id, workoutDate, exercises, status: "planned" });
  if (!result.ok) {
    return redirectError(context, result.error);
  }

  return context.redirect("/workouts?planned=1");
};
