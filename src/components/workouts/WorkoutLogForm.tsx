import React, { useState } from "react";
import type { ReactNode } from "react";
import {
  Dumbbell,
  Hash,
  Repeat,
  Weight,
  Calendar,
  Save,
  CalendarPlus,
  CircleCheck,
  Plus,
  Trash2,
  Sparkles,
} from "lucide-react";
import type { MuscleGroup, Exercise } from "@/lib/catalog";
import type { ProposalResult } from "@/lib/proposal";
import { MIN_SESSIONS } from "@/lib/proposal";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { cn } from "@/lib/utils";

type Mode = "log" | "plan" | "propose";

interface Props {
  muscleGroups: MuscleGroup[];
  exercises: Exercise[];
  serverError?: string | null;
  saved?: boolean;
  planned?: boolean;
  /** History-based proposal computed server-side, or null when none requested. */
  proposal?: ProposalResult | null;
  /** Echoed propose request params, so a post-request reload lands on the tab. */
  proposeMuscleGroup?: string;
  proposeDate?: string;
}

interface ExerciseRow {
  muscleGroupId: string;
  exerciseId: string;
  sets: string;
  reps: string;
  weight: string;
}

interface RowErrors {
  exercise?: string;
  sets?: string;
  reps?: string;
  weight?: string;
}

const fieldBase =
  "w-full rounded-lg bg-white/10 border px-3 py-2 pl-10 text-white placeholder-white/40 focus:outline-none focus:ring-2 transition-colors";
const fieldOk = "border-white/20 focus:ring-purple-400";
const fieldError = "border-red-400/60 focus:ring-red-400";

// Native option lists render on a light background, so the dark-theme white
// text is invisible without an explicit dark background + light text.
const optionClass = "bg-slate-800 text-white";

function emptyRow(): ExerciseRow {
  return { muscleGroupId: "", exerciseId: "", sets: "", reps: "", weight: "" };
}

function rowIsEmpty(row: ExerciseRow): boolean {
  return !row.exerciseId && !row.sets && !row.reps && !row.weight;
}

// Sets, reps, and weight are never negative — drop any minus sign as it is typed
// so a negative value can't be entered (validation is the backstop).
function stripNegative(value: string): string {
  return value.replace(/-/g, "");
}

/** Local `YYYY-MM-DD` for the browser's today, optionally shifted by `dayOffset`. */
function localDateIso(dayOffset = 0): string {
  const now = new Date();
  now.setDate(now.getDate() + dayOffset);
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

interface NumberFieldProps {
  label: string;
  icon: ReactNode;
  value: string;
  min: number;
  placeholder: string;
  error?: string;
  onChange: (value: string) => void;
}

/**
 * Presentational numeric input with no `name` — row data is submitted via the
 * hidden `exercises` JSON field, not individual inputs.
 */
function NumberField({ label, icon, value, min, placeholder, error, onChange }: NumberFieldProps) {
  return (
    <div>
      <label className="mb-1 block text-sm text-blue-100/80">{label}</label>
      <div className="relative">
        <span className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40">{icon}</span>
        <input
          type="number"
          min={min}
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(stripNegative(e.target.value));
          }}
          className={cn(fieldBase, error ? fieldError : fieldOk)}
        />
      </div>
      {error ? <p className="mt-1 text-xs text-red-300">{error}</p> : null}
    </div>
  );
}

export default function WorkoutLogForm({
  muscleGroups,
  exercises,
  serverError,
  saved,
  planned,
  proposal = null,
  proposeMuscleGroup,
  proposeDate,
}: Props) {
  const today = localDateIso(0);
  const tomorrow = localDateIso(1);

  // A propose round-trip (proposal present, or a request echoed back) lands the
  // user on the Propose tab so they see the result they asked for.
  const proposeActive = proposal !== null || Boolean(proposeMuscleGroup);

  const [mode, setMode] = useState<Mode>(proposeActive ? "propose" : "log");
  const [rows, setRows] = useState<ExerciseRow[]>([emptyRow()]);
  const [rowErrors, setRowErrors] = useState<RowErrors[]>([{}]);
  const [date, setDate] = useState(today);
  const [formError, setFormError] = useState<string | null>(null);
  // The Propose request form owns its own group + date (a GET navigation), kept
  // separate from the log/plan POST form's `date`.
  const [proposeGroup, setProposeGroup] = useState(proposeMuscleGroup ?? "");
  const [proposeRequestDate, setProposeRequestDate] = useState(proposeDate ?? today);

  // Switching mode re-bounds the date: plan needs a future day, log needs
  // today-or-past. Snap the current value into the new mode's allowed range.
  // Propose owns its own date, so the log/plan `date` is untouched there.
  function switchMode(next: Mode) {
    if (next === mode) {
      return;
    }
    setMode(next);
    setFormError(null);
    if (next === "plan" && date <= today) {
      setDate(tomorrow);
    } else if (next === "log" && date > today) {
      setDate(today);
    }
  }

  function exercisesForGroup(muscleGroupId: string): Exercise[] {
    if (!muscleGroupId) {
      return exercises;
    }
    return exercises.filter((exercise) => String(exercise.muscleGroupId) === muscleGroupId);
  }

  function updateRow(index: number, patch: Partial<ExerciseRow>, clearedError?: keyof RowErrors) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    if (clearedError) {
      setRowErrors((prev) => prev.map((errs, i) => (i === index ? { ...errs, [clearedError]: undefined } : errs)));
    }
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
    setRowErrors((prev) => [...prev, {}]);
    setFormError(null);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
    setRowErrors((prev) => prev.filter((_, i) => i !== index));
  }

  function validate(): boolean {
    const nextErrors: RowErrors[] = rows.map(() => ({}));
    let filledRows = 0;

    rows.forEach((row, i) => {
      if (rowIsEmpty(row)) {
        return;
      }
      filledRows += 1;
      const errs: RowErrors = {};
      const setsNum = Number(row.sets);
      const repsNum = Number(row.reps);
      const weightNum = Number(row.weight);
      if (!row.exerciseId) {
        errs.exercise = "Choose an exercise";
      }
      if (!row.sets || !Number.isInteger(setsNum) || setsNum < 1) {
        errs.sets = "Sets ≥ 1";
      }
      if (!row.reps || !Number.isInteger(repsNum) || repsNum < 1) {
        errs.reps = "Reps ≥ 1";
      }
      if (row.weight === "" || !Number.isFinite(weightNum) || weightNum < 0) {
        errs.weight = "Weight ≥ 0";
      }
      nextErrors[i] = errs;
    });

    setRowErrors(nextErrors);

    if (filledRows === 0) {
      setFormError("Add at least one exercise.");
      return false;
    }
    if (nextErrors.some((errs) => Object.keys(errs).length > 0)) {
      setFormError(null);
      return false;
    }
    setFormError(null);
    return true;
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
    }
  }

  const payload = rows
    .filter((row) => !rowIsEmpty(row))
    .map((row) => ({
      exerciseId: Number(row.exerciseId),
      sets: Number(row.sets),
      reps: Number(row.reps),
      weight: Number(row.weight),
    }));

  const isPlan = mode === "plan";

  const modeLabel: Record<Mode, string> = { log: "Log", plan: "Plan", propose: "Propose" };

  return (
    <div className="space-y-4">
      {/* The tab bar sits outside the POST form so each mode can own its own form
          element: Propose's request is a GET navigation and its accept is a POST
          to a different action — neither can nest inside the log/plan form. */}
      <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-white/5 p-1" role="tablist">
        {(["log", "plan", "propose"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              switchMode(m);
            }}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              mode === m ? "bg-purple-500/30 text-white" : "text-blue-100/70 hover:text-white",
            )}
          >
            {modeLabel[m]}
          </button>
        ))}
      </div>

      {saved ? (
        <p className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-900/30 px-3 py-2 text-sm text-green-300">
          <CircleCheck className="size-4 shrink-0" />
          Workout saved.
        </p>
      ) : null}

      {planned ? (
        <p className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-900/30 px-3 py-2 text-sm text-green-300">
          <CircleCheck className="size-4 shrink-0" />
          Workout planned.
        </p>
      ) : null}

      {mode === "propose" ? (
        <ProposeView
          muscleGroups={muscleGroups}
          proposal={proposal}
          group={proposeGroup}
          onGroupChange={setProposeGroup}
          requestDate={proposeRequestDate}
          onRequestDateChange={setProposeRequestDate}
          today={today}
          serverError={serverError}
          onLogInstead={() => {
            switchMode("log");
          }}
        />
      ) : (
        <form
          method="POST"
          action={isPlan ? "/api/workouts/plan" : "/api/workouts"}
          className="space-y-4"
          onSubmit={handleSubmit}
          noValidate
        >
          {rows.map((row, index) => {
            const errs = rowErrors[index] ?? {};
            return (
              <div key={index} className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium tracking-wide text-blue-100/60 uppercase">
                    Exercise {index + 1}
                  </span>
                  {rows.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => {
                        removeRow(index);
                      }}
                      className="flex items-center gap-1 text-xs text-red-300 hover:text-red-200"
                      aria-label={`Remove exercise ${String(index + 1)}`}
                    >
                      <Trash2 className="size-3.5" />
                      Remove
                    </button>
                  ) : null}
                </div>

                <div>
                  <label className="mb-1 block text-sm text-blue-100/80">Muscle group</label>
                  <div className="relative">
                    <span className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40">
                      <Dumbbell className="size-4" />
                    </span>
                    <select
                      value={row.muscleGroupId}
                      onChange={(e) => {
                        updateRow(index, { muscleGroupId: e.target.value, exerciseId: "" }, "exercise");
                      }}
                      className={cn(fieldBase, fieldOk)}
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
                  <label className="mb-1 block text-sm text-blue-100/80">Exercise</label>
                  <div className="relative">
                    <span className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40">
                      <Dumbbell className="size-4" />
                    </span>
                    <select
                      value={row.exerciseId}
                      onChange={(e) => {
                        updateRow(index, { exerciseId: e.target.value }, "exercise");
                      }}
                      className={cn(fieldBase, errs.exercise ? fieldError : fieldOk)}
                    >
                      <option value="" className={optionClass}>
                        Choose an exercise…
                      </option>
                      {exercisesForGroup(row.muscleGroupId).map((exercise) => (
                        <option key={exercise.id} value={String(exercise.id)} className={optionClass}>
                          {exercise.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {errs.exercise ? <p className="mt-1 text-xs text-red-300">{errs.exercise}</p> : null}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <NumberField
                    label="Sets"
                    icon={<Hash className="size-4" />}
                    value={row.sets}
                    min={1}
                    placeholder="3"
                    error={errs.sets}
                    onChange={(v) => {
                      updateRow(index, { sets: v }, "sets");
                    }}
                  />
                  <NumberField
                    label="Reps"
                    icon={<Repeat className="size-4" />}
                    value={row.reps}
                    min={1}
                    placeholder="12"
                    error={errs.reps}
                    onChange={(v) => {
                      updateRow(index, { reps: v }, "reps");
                    }}
                  />
                  <NumberField
                    label="Weight"
                    icon={<Weight className="size-4" />}
                    value={row.weight}
                    min={0}
                    placeholder="60"
                    error={errs.weight}
                    onChange={(v) => {
                      updateRow(index, { weight: v }, "weight");
                    }}
                  />
                </div>
              </div>
            );
          })}

          <button
            type="button"
            onClick={addRow}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 px-4 py-2 text-sm text-blue-100/80 transition-colors hover:border-purple-400/60 hover:text-white"
          >
            <Plus className="size-4" />
            Add exercise
          </button>

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
                min={isPlan ? tomorrow : undefined}
                max={isPlan ? undefined : today}
                onChange={(e) => {
                  setDate(e.target.value);
                }}
                className={cn(fieldBase, fieldOk)}
              />
            </div>
            <p className="mt-1 text-xs text-blue-100/50">
              {isPlan ? "Pick a future day." : "Defaults to today; backdating is allowed."}
            </p>
          </div>

          <input type="hidden" name="exercises" value={JSON.stringify(payload)} />

          <ServerError message={serverError} />
          {formError ? <ServerError message={formError} /> : null}

          {isPlan ? (
            <SubmitButton pendingText="Planning…" icon={<CalendarPlus className="size-4" />}>
              Plan workout
            </SubmitButton>
          ) : (
            <SubmitButton pendingText="Saving…" icon={<Save className="size-4" />}>
              Save workout
            </SubmitButton>
          )}
        </form>
      )}
    </div>
  );
}

interface ProposeViewProps {
  muscleGroups: MuscleGroup[];
  proposal: ProposalResult | null;
  group: string;
  onGroupChange: (slug: string) => void;
  requestDate: string;
  onRequestDateChange: (date: string) => void;
  today: string;
  serverError?: string | null;
  onLogInstead: () => void;
}

/**
 * Propose tab. Three states: the request form (GET navigation to
 * `/workouts?propose=1&…` that Phase 1 turns into a `ProposalResult`); a
 * read-only preview of an `ok` result with an Accept POST to the existing
 * `/api/workouts/plan` and an Ignore link; or the insufficient-history
 * empty-state with a CTA back to logging.
 */
function ProposeView({
  muscleGroups,
  proposal,
  group,
  onGroupChange,
  requestDate,
  onRequestDateChange,
  today,
  serverError,
  onLogInstead,
}: ProposeViewProps) {
  return (
    <div className="space-y-4">
      <ServerError message={serverError} />

      <form method="GET" action="/workouts" className="space-y-4">
        <input type="hidden" name="propose" value="1" />

        <div>
          <label htmlFor="propose_group" className="mb-1 block text-sm text-blue-100/80">
            Muscle group
          </label>
          <div className="relative">
            <span className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40">
              <Dumbbell className="size-4" />
            </span>
            <select
              id="propose_group"
              name="muscleGroup"
              required
              value={group}
              onChange={(e) => {
                onGroupChange(e.target.value);
              }}
              className={cn(fieldBase, fieldOk)}
            >
              <option value="" disabled className={optionClass}>
                Choose a muscle group…
              </option>
              {muscleGroups.map((mg) => (
                <option key={mg.id} value={mg.slug} className={optionClass}>
                  {mg.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="propose_date" className="mb-1 block text-sm text-blue-100/80">
            Target day
          </label>
          <div className="relative">
            <span className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40">
              <Calendar className="size-4" />
            </span>
            <input
              id="propose_date"
              name="date"
              type="date"
              value={requestDate}
              min={today}
              onChange={(e) => {
                onRequestDateChange(e.target.value);
              }}
              className={cn(fieldBase, fieldOk)}
            />
          </div>
          <p className="mt-1 text-xs text-blue-100/50">Plan for today or a future day.</p>
        </div>

        <SubmitButton pendingText="Building…" icon={<Sparkles className="size-4" />}>
          Get proposal
        </SubmitButton>
      </form>

      {proposal?.kind === "insufficient-history" ? (
        <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-blue-100/80">
          <p>
            Log at least {MIN_SESSIONS} sessions for{" "}
            <span className="font-medium text-white">{proposal.muscleGroupName}</span> to get a proposal — you have{" "}
            <span className="font-medium text-white">{proposal.sessionCount}</span>.
          </p>
          <button
            type="button"
            onClick={onLogInstead}
            className="flex items-center gap-2 rounded-lg border border-dashed border-white/20 px-4 py-2 text-sm text-blue-100/80 transition-colors hover:border-purple-400/60 hover:text-white"
          >
            <Save className="size-4" />
            Log a workout
          </button>
        </div>
      ) : null}

      {proposal?.kind === "ok" ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="mb-2 text-sm font-medium text-white">
              Proposal for {proposal.muscleGroupName} — {requestDate}
            </div>
            <ul className="space-y-1 text-sm text-blue-100/80">
              {proposal.exercises.map((exercise) => (
                <li key={exercise.exerciseId} className="flex justify-between gap-3">
                  <span>{exercise.exerciseName}</span>
                  <span className="shrink-0 text-blue-100/60">
                    {exercise.sets} × {exercise.reps} @ {exercise.previousWeight} →{" "}
                    <span className="font-semibold text-white">{exercise.weight}</span> kg
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <form method="POST" action="/api/workouts/plan" className="space-y-3">
            <input type="hidden" name="workout_date" value={requestDate} />
            <input
              type="hidden"
              name="exercises"
              value={JSON.stringify(
                proposal.exercises.map((exercise) => ({
                  exerciseId: exercise.exerciseId,
                  sets: exercise.sets,
                  reps: exercise.reps,
                  weight: exercise.weight,
                })),
              )}
            />
            <SubmitButton pendingText="Planning…" icon={<CalendarPlus className="size-4" />}>
              Accept as plan
            </SubmitButton>
          </form>

          <a href="/workouts" className="block text-center text-sm text-blue-100/60 hover:text-white hover:underline">
            Ignore
          </a>
        </div>
      ) : null}
    </div>
  );
}
