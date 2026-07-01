import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { createWorkout } from "@/lib/workouts";
import { isAcceptableLogDate, parseExercisesField, todayUtcIso } from "@/lib/workout-submission";

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

  const rawDate = (form.get("workout_date") as string | null)?.trim();
  const workoutDate = rawDate && rawDate.length > 0 ? rawDate : todayUtcIso();

  if (!isAcceptableLogDate(workoutDate)) {
    return redirectError(context, "Pick a date that is not in the future.");
  }

  const exercises = parseExercisesField(form.get("exercises") as string | null);
  if (typeof exercises === "string") {
    return redirectError(context, exercises);
  }

  const result = await createWorkout(supabase, { userId: user.id, workoutDate, exercises });
  if (!result.ok) {
    return redirectError(context, result.error);
  }

  return context.redirect("/workouts?saved=1");
};
