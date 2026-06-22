import React, { useMemo, useState } from "react";
import { Dumbbell, Hash, Repeat, Weight, Calendar, Save, CircleCheck } from "lucide-react";
import type { MuscleGroup, Exercise } from "@/lib/catalog";
import { FormField } from "@/components/auth/FormField";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { cn } from "@/lib/utils";

interface Props {
  muscleGroups: MuscleGroup[];
  exercises: Exercise[];
  serverError?: string | null;
  saved?: boolean;
}

const selectBase =
  "w-full rounded-lg bg-white/10 border px-3 py-2 pl-10 text-white focus:outline-none focus:ring-2 transition-colors border-white/20 focus:ring-purple-400";

// Native option lists render on a light background, so the dark-theme white
// text is invisible without an explicit dark background + light text.
const optionClass = "bg-slate-800 text-white";

/** Local `YYYY-MM-DD` for the browser's today (the date input's default + max). */
function localTodayIso(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

export default function WorkoutLogForm({ muscleGroups, exercises, serverError, saved }: Props) {
  const today = localTodayIso();

  const [muscleGroupId, setMuscleGroupId] = useState("");
  const [exerciseId, setExerciseId] = useState("");
  const [sets, setSets] = useState("");
  const [reps, setReps] = useState("");
  const [weight, setWeight] = useState("");
  const [date, setDate] = useState(today);
  const [errors, setErrors] = useState<{ exercise?: string; sets?: string; reps?: string; weight?: string }>({});

  const filteredExercises = useMemo(() => {
    if (!muscleGroupId) {
      return exercises;
    }
    return exercises.filter((exercise) => String(exercise.muscleGroupId) === muscleGroupId);
  }, [exercises, muscleGroupId]);

  function clearError(field: keyof typeof errors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  // Sets, reps, and weight are never negative — drop any minus sign as it is
  // typed so a negative value can't be entered (validation is the backstop).
  function stripNegative(value: string) {
    return value.replace(/-/g, "");
  }

  function validate() {
    const next: typeof errors = {};
    const setsNum = Number(sets);
    const repsNum = Number(reps);
    const weightNum = Number(weight);
    if (!exerciseId) {
      next.exercise = "Choose an exercise";
    }
    if (!sets || !Number.isInteger(setsNum) || setsNum < 1) {
      next.sets = "Sets must be a whole number of at least 1";
    }
    if (!reps || !Number.isInteger(repsNum) || repsNum < 1) {
      next.reps = "Reps must be a whole number of at least 1";
    }
    if (weight === "" || !Number.isFinite(weightNum) || weightNum < 0) {
      next.weight = "Weight must be zero or more";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
    }
  }

  return (
    <form method="POST" action="/api/workouts" className="space-y-4" onSubmit={handleSubmit} noValidate>
      {saved ? (
        <p className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-900/30 px-3 py-2 text-sm text-green-300">
          <CircleCheck className="size-4 shrink-0" />
          Workout saved.
        </p>
      ) : null}

      <div>
        <label htmlFor="muscle_group" className="mb-1 block text-sm text-blue-100/80">
          Muscle group
        </label>
        <div className="relative">
          <span className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40">
            <Dumbbell className="size-4" />
          </span>
          <select
            id="muscle_group"
            value={muscleGroupId}
            onChange={(e) => {
              setMuscleGroupId(e.target.value);
              setExerciseId("");
              clearError("exercise");
            }}
            className={selectBase}
          >
            <option value="" className={optionClass}>
              All groups
            </option>
            {muscleGroups.map((group) => (
              <option key={group.id} value={String(group.id)} className={optionClass}>
                {group.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="exercise_id" className="mb-1 block text-sm text-blue-100/80">
          Exercise
        </label>
        <div className="relative">
          <span className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40">
            <Dumbbell className="size-4" />
          </span>
          <select
            id="exercise_id"
            name="exercise_id"
            value={exerciseId}
            onChange={(e) => {
              setExerciseId(e.target.value);
              clearError("exercise");
            }}
            className={cn(selectBase, errors.exercise && "border-red-400/60 focus:ring-red-400")}
          >
            <option value="" className={optionClass}>
              Choose an exercise…
            </option>
            {filteredExercises.map((exercise) => (
              <option key={exercise.id} value={String(exercise.id)} className={optionClass}>
                {exercise.name}
              </option>
            ))}
          </select>
        </div>
        {errors.exercise ? <p className="mt-1 text-xs text-red-300">{errors.exercise}</p> : null}
      </div>

      <FormField
        id="sets"
        name="sets"
        type="number"
        label="Sets"
        min={1}
        value={sets}
        onChange={(v) => {
          setSets(stripNegative(v));
          clearError("sets");
        }}
        placeholder="3"
        error={errors.sets}
        icon={<Hash className="size-4" />}
      />

      <FormField
        id="reps"
        name="reps"
        type="number"
        label="Reps per set"
        min={1}
        value={reps}
        onChange={(v) => {
          setReps(stripNegative(v));
          clearError("reps");
        }}
        placeholder="12"
        error={errors.reps}
        icon={<Repeat className="size-4" />}
      />

      <FormField
        id="weight"
        name="weight"
        type="number"
        label="Weight (kg)"
        min={0}
        value={weight}
        onChange={(v) => {
          setWeight(stripNegative(v));
          clearError("weight");
        }}
        placeholder="60"
        error={errors.weight}
        icon={<Weight className="size-4" />}
      />

      <div>
        <label htmlFor="workout_date" className="mb-1 block text-sm text-blue-100/80">
          Date
        </label>
        <div className="relative">
          <span className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40">
            <Calendar className="size-4" />
          </span>
          <input
            id="workout_date"
            name="workout_date"
            type="date"
            value={date}
            max={today}
            onChange={(e) => {
              setDate(e.target.value);
            }}
            className={selectBase}
          />
        </div>
        <p className="mt-1 text-xs text-blue-100/50">Defaults to today; backdating is allowed.</p>
      </div>

      <ServerError message={serverError} />

      <SubmitButton pendingText="Saving…" icon={<Save className="size-4" />}>
        Save workout
      </SubmitButton>
    </form>
  );
}
