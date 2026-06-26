import type { createClient } from "@/lib/supabase";
import type { LoggedWorkout } from "@/lib/workouts";
import { getRecentWorkouts } from "@/lib/workouts";
import { getExercises, getMuscleGroups } from "@/lib/catalog";

/**
 * History-based workout proposal (S-03). Turns a user's own logged history for
 * one muscle group into a proposed plan — their most-recent set per exercise
 * with a small progressive weight bump — or signals that history is too thin.
 *
 * The module is split into a pure core (`buildProposal`) that holds the only new
 * business logic in this change, plus a thin async wrapper (`generateProposal`)
 * that reuses the existing catalog/history helpers. There is no new backend
 * route: an `ok` proposal is accepted by POSTing its rows to the existing
 * `/api/workouts/plan`, whose `WorkoutExerciseInput` shape the rows map onto 1:1.
 */

type ProposalClient = NonNullable<ReturnType<typeof createClient>>;

/** Minimum distinct logged sessions for a group before a proposal is offered. */
export const MIN_SESSIONS = 3;

/** Progressive-overload multiplier applied to the last logged weight. */
export const PROGRESSION_FACTOR = 1.025;

export interface ProposalExercise {
  exerciseId: number;
  exerciseName: string;
  sets: number;
  reps: number;
  /** Bumped + rounded weight to propose (always ≥ `previousWeight`). */
  weight: number;
  /** Historical weight the bump was derived from (for "was X → propose Y"). */
  previousWeight: number;
}

export type ProposalResult =
  | { kind: "ok"; muscleGroupName: string; exercises: ProposalExercise[] }
  | { kind: "insufficient-history"; muscleGroupName: string; sessionCount: number };

/**
 * Progressive-overload bump: scale the historical weight by `PROGRESSION_FACTOR`
 * and round to the nearest 0.5 kg. Never regresses and stays DB-valid
 * (`weight ≥ 0`): if the rounded value lands at or below a positive historical
 * weight, nudge by +0.5; a bodyweight (0) exercise stays 0.
 */
function bumpWeight(previousWeight: number): number {
  if (previousWeight <= 0) {
    return 0;
  }
  const rounded = Math.round((previousWeight * PROGRESSION_FACTOR) / 0.5) * 0.5;
  return rounded > previousWeight ? rounded : previousWeight + 0.5;
}

/**
 * Pure derivation core. Counts the distinct logged workouts that touch the group
 * (a "session" is a workout containing ≥ 1 group exercise, not a single row); if
 * below `MIN_SESSIONS`, returns `insufficient-history`. Otherwise emits one
 * `ProposalExercise` per group exercise that appears in history, carrying its
 * most-recent set with a bumped weight. `loggedWorkouts` must be newest-first
 * (as `getRecentWorkouts(..., "logged")` returns), so the first occurrence of an
 * `exerciseId` is its latest set. Group exercises with no history are skipped.
 */
export function buildProposal(
  loggedWorkouts: LoggedWorkout[],
  groupExerciseIds: Set<number>,
  muscleGroupName: string,
): ProposalResult {
  let sessionCount = 0;
  const latestByExercise = new Map<number, ProposalExercise>();

  for (const workout of loggedWorkouts) {
    let touchesGroup = false;
    for (const exercise of workout.exercises) {
      if (!groupExerciseIds.has(exercise.exerciseId)) {
        continue;
      }
      touchesGroup = true;
      // Newest-first iteration: keep only the first (latest) set per exercise.
      if (!latestByExercise.has(exercise.exerciseId)) {
        latestByExercise.set(exercise.exerciseId, {
          exerciseId: exercise.exerciseId,
          exerciseName: exercise.exerciseName,
          sets: exercise.sets,
          reps: exercise.reps,
          weight: bumpWeight(exercise.weight),
          previousWeight: exercise.weight,
        });
      }
    }
    if (touchesGroup) {
      sessionCount += 1;
    }
  }

  if (sessionCount < MIN_SESSIONS) {
    return { kind: "insufficient-history", muscleGroupName, sessionCount };
  }

  return { kind: "ok", muscleGroupName, exercises: [...latestByExercise.values()] };
}

/**
 * Async wrapper around `buildProposal`. Resolves the muscle group and its
 * exercise ids via the catalog helpers, fetches the user's logged history, and
 * delegates. Returns `null` on a null client or unknown slug — the page treats
 * that as "no proposal requested" rather than an error. Never throws.
 */
export async function generateProposal(
  supabase: ProposalClient | null,
  userId: string,
  muscleGroupSlug: string,
): Promise<ProposalResult | null> {
  if (!supabase || !muscleGroupSlug) {
    return null;
  }

  const muscleGroups = await getMuscleGroups(supabase);
  const group = muscleGroups.find((g) => g.slug === muscleGroupSlug);
  if (!group) {
    return null;
  }

  const groupExercises = await getExercises(supabase, muscleGroupSlug);
  const groupExerciseIds = new Set(groupExercises.map((exercise) => exercise.id));

  const loggedWorkouts = await getRecentWorkouts(supabase, userId, 100, "logged");

  return buildProposal(loggedWorkouts, groupExerciseIds, group.name);
}
