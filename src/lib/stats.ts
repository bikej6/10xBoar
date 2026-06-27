import type { createClient } from "@/lib/supabase";
import type { LoggedWorkout } from "@/lib/workouts";
import { getRecentWorkouts } from "@/lib/workouts";

/**
 * Weight-progress statistics (S-04). Turns a user's own logged history into a
 * per-exercise, chronologically-ordered series of logged weights, plus the pure
 * SVG geometry used to draw each series as an inline sparkline.
 *
 * Like `src/lib/proposal.ts`, the module is split into a pure core
 * (`buildExerciseProgress`, `sparklineGeometry` — the only new business logic in
 * this change) and a thin async wrapper (`getExerciseProgress`) that reuses the
 * existing read helper. The view is read-only: no schema change, no new route.
 */

type StatsClient = NonNullable<ReturnType<typeof createClient>>;

/**
 * Cap passed to `getRecentWorkouts`: stats needs the user's full history, not
 * the default page of 10. Generous fixed bound, acceptable at the project's
 * stated small scale (F1).
 */
export const STATS_HISTORY_LIMIT = 1000;

/** One logged occurrence of an exercise: its weight on a given workout date. */
export interface ExerciseProgressPoint {
  workoutDate: string;
  weight: number;
}

export interface ExerciseProgress {
  exerciseId: number;
  exerciseName: string;
  /** Chronological, oldest→newest, so the series reads left→right in time. */
  points: ExerciseProgressPoint[];
  /** Weight at the most recent point (single-point hint / endpoint label). */
  latestWeight: number;
}

/**
 * Pure derivation core. Groups every exercise occurrence across `loggedWorkouts`
 * by `exerciseId`, emitting one point (`workoutDate`, `weight`) per occurrence
 * with each exercise's points ordered oldest→newest, and orders the returned
 * exercises most-recently-trained first.
 *
 * `getRecentWorkouts(..., "logged")` returns workouts newest-first, so the input
 * is reversed to chronological order before points are collected; `latestWeight`
 * is then the last (most recent) point written. Returns `[]` for empty input.
 */
export function buildExerciseProgress(loggedWorkouts: LoggedWorkout[]): ExerciseProgress[] {
  const byExercise = new Map<number, ExerciseProgress>();

  // Reverse newest-first input to chronological so points read oldest→newest.
  const chronological = [...loggedWorkouts].reverse();

  for (const workout of chronological) {
    for (const exercise of workout.exercises) {
      let progress = byExercise.get(exercise.exerciseId);
      if (!progress) {
        progress = {
          exerciseId: exercise.exerciseId,
          exerciseName: exercise.exerciseName,
          points: [],
          latestWeight: exercise.weight,
        };
        byExercise.set(exercise.exerciseId, progress);
      }
      progress.points.push({ workoutDate: workout.workoutDate, weight: exercise.weight });
      // Chronological iteration: the last write is the most recent set.
      progress.latestWeight = exercise.weight;
      progress.exerciseName = exercise.exerciseName;
    }
  }

  // Most-recently-trained first: by each exercise's latest point date, desc.
  return [...byExercise.values()].sort((a, b) => {
    const aLast = a.points[a.points.length - 1].workoutDate;
    const bLast = b.points[b.points.length - 1].workoutDate;
    if (aLast < bLast) return 1;
    if (aLast > bLast) return -1;
    return 0;
  });
}

/**
 * Pure SVG geometry for a sparkline. Maps `weights` (already chronological) to
 * coordinates in a `width`×`height` box: x evenly spaced by index, y scaled to
 * `[min,max]` with the top of the box being the max weight.
 *
 * Guards the degenerate cases so coordinates are always finite: a single weight
 * is centered horizontally, and an all-equal series (zero range, including a
 * bodyweight `0` series) renders as a horizontal mid-line rather than dividing
 * by zero. `points` is the `polyline` coordinate string; `lastX`/`lastY` locate
 * the latest-point marker.
 */
export function sparklineGeometry(
  weights: number[],
  width: number,
  height: number,
): { points: string; lastX: number; lastY: number } {
  const n = weights.length;
  if (n === 0) {
    return { points: "", lastX: 0, lastY: 0 };
  }

  const max = Math.max(...weights);
  const min = Math.min(...weights);
  const range = max - min;
  const midY = height / 2;

  const xAt = (i: number): number => (n === 1 ? width / 2 : (i / (n - 1)) * width);
  // Top of the box (y=0) is the max weight; zero range clamps to the mid-line.
  const yAt = (weight: number): number => (range === 0 ? midY : height - ((weight - min) / range) * height);

  const coords = weights.map((weight, i) => `${xAt(i)},${yAt(weight)}`);
  const lastIndex = n - 1;

  return {
    points: coords.join(" "),
    lastX: xAt(lastIndex),
    lastY: yAt(weights[lastIndex]),
  };
}

/**
 * Async wrapper around `buildExerciseProgress`. Fetches the user's full logged
 * history via `getRecentWorkouts` and delegates. Returns `[]` on a null client
 * (matching the convention in `generateProposal`). Never throws.
 */
export async function getExerciseProgress(supabase: StatsClient | null, userId: string): Promise<ExerciseProgress[]> {
  if (!supabase) {
    return [];
  }

  const loggedWorkouts = await getRecentWorkouts(supabase, userId, STATS_HISTORY_LIMIT, "logged");

  return buildExerciseProgress(loggedWorkouts);
}
