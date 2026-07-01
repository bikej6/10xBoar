import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { createWorkout } from "@/lib/workouts";
import { isPlannableDate, parseExercisesField } from "@/lib/workout-submission";

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

  if (!isPlannableDate(workoutDate)) {
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
