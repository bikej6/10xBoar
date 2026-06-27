import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { LoggedWorkout } from "@/lib/workouts";
import { addMonths, buildMonthGrid, dayMarkers, groupWorkoutsByDate, toDateKey, WEEKDAY_LABELS } from "@/lib/calendar";
import { cn } from "@/lib/utils";

interface Props {
  workouts: LoggedWorkout[];
}

/**
 * Read-only monthly workout calendar (S-05). Holds the full workout list and
 * derives the visible month client-side — month paging and day selection happen
 * with no server round-trips. Logged (history) and planned (future) days are
 * marked distinctly; clicking a day expands its details in-page.
 */
export default function WorkoutCalendar({ workouts }: Props) {
  const today = new Date();
  const todayKey = toDateKey(today);

  const [{ year, month }, setView] = useState(() => ({ year: today.getFullYear(), month: today.getMonth() }));
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

  const grouped = useMemo(() => groupWorkoutsByDate(workouts), [workouts]);
  const grid = useMemo(() => buildMonthGrid(year, month), [year, month]);

  const monthLabel = new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const selectedWorkouts = selectedDateKey ? (grouped.get(selectedDateKey) ?? []) : [];

  const goToMonth = (delta: number) => {
    setView((current) => addMonths(current.year, current.month, delta));
    setSelectedDateKey(null);
  };

  return (
    <section className="space-y-4">
      {workouts.length === 0 && (
        <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-4 text-center text-sm text-blue-100/60">
          No workouts yet. Log or plan a workout and it will show up here.
        </p>
      )}

      {/* Month header + navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            goToMonth(-1);
          }}
          aria-label="Previous month"
          className="rounded-lg border border-white/10 bg-white/5 p-2 text-blue-100/80 transition-colors hover:bg-white/10"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h2 className="text-base font-semibold text-white">{monthLabel}</h2>
        <button
          type="button"
          onClick={() => {
            goToMonth(1);
          }}
          aria-label="Next month"
          className="rounded-lg border border-white/10 bg-white/5 p-2 text-blue-100/80 transition-colors hover:bg-white/10"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-blue-100/50">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label}>{label}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {grid.map((cell) => {
          const markers = dayMarkers(grouped.get(cell.dateKey));
          const hasWorkout = markers.hasLogged || markers.hasPlanned;
          const isToday = cell.dateKey === todayKey;
          const isSelected = cell.dateKey === selectedDateKey;

          return (
            <button
              key={cell.dateKey}
              type="button"
              disabled={!cell.inMonth}
              onClick={() => {
                if (cell.inMonth) {
                  setSelectedDateKey(cell.dateKey);
                }
              }}
              className={cn(
                "flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border text-sm transition-colors",
                cell.inMonth
                  ? "border-white/10 bg-white/5 text-white hover:bg-white/10"
                  : "border-transparent text-blue-100/25",
                isToday && "ring-1 ring-purple-300",
                isSelected && "bg-white/15",
              )}
            >
              <span>{cell.day}</span>
              {cell.inMonth && hasWorkout && (
                <span className="flex gap-1">
                  {markers.hasLogged && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                  {markers.hasPlanned && <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-xs text-blue-100/60">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Logged
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-purple-400" /> Planned
        </span>
      </div>

      {/* Day detail panel */}
      {selectedDateKey && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="mb-2 text-sm font-medium text-white">{selectedDateKey}</div>
          {selectedWorkouts.length === 0 ? (
            <p className="text-sm text-blue-100/50">No workout on this day.</p>
          ) : (
            <ul className="space-y-3">
              {selectedWorkouts.map((workout) => (
                <li key={workout.id}>
                  <div className="mb-1 text-xs font-semibold tracking-wide text-blue-100/50 uppercase">
                    {workout.status === "planned" ? "Planned" : "Logged"}
                  </div>
                  <ul className="space-y-1 text-sm text-blue-100/80">
                    {workout.exercises.map((exercise) => (
                      <li key={exercise.exerciseId} className="flex justify-between gap-3">
                        <span>{exercise.exerciseName}</span>
                        <span className="shrink-0 text-blue-100/60">
                          {exercise.sets} × {exercise.reps} @ {exercise.weight} kg
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
