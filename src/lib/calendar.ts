import type { LoggedWorkout } from "@/lib/workouts";

/**
 * Pure, dependency-free calendar helpers for the workout-calendar view (S-05).
 * No I/O, native `Date` only — so the React island stays thin and the date logic
 * is verifiable in isolation.
 *
 * Conventions:
 * - `month` is **0-indexed** (0 = January … 11 = December), matching `Date.getMonth()`.
 * - The week starts on **Monday** (European audience); `WEEKDAY_LABELS` and the grid
 *   produced by `buildMonthGrid` agree on this ordering.
 * - All date keys are local `YYYY-MM-DD` strings built from local getters (never
 *   `toISOString`, which would shift to UTC and can be off-by-one near midnight). This
 *   matches `workout_date`, which Postgres stores and returns as a plain `YYYY-MM-DD`.
 */

/** A single cell in the month grid. Out-of-month cells (`inMonth: false`) come from
 * the leading/trailing weeks and should be visually dimmed. */
export interface DayCell {
  /** Local `YYYY-MM-DD` for this cell — the join key against grouped workouts. */
  dateKey: string;
  /** Day of the month (1–31), for rendering the cell label. */
  day: number;
  /** Whether the cell belongs to the requested month (vs. an adjacent month). */
  inMonth: boolean;
}

/** Weekday header labels, Monday-first to match `buildMonthGrid`'s week start. */
export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Whether a day has logged history and/or a planned future session — for marker styling. */
export interface DayMarkers {
  hasLogged: boolean;
  hasPlanned: boolean;
}

/** Local `YYYY-MM-DD` for the given date, built from local getters (not `toISOString`). */
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Build a month grid of full weeks (Monday-first). Leading days from the previous
 * month and trailing days from the next month are included and flagged
 * `inMonth: false` so the grid is always a whole number of 7-day rows with no gaps.
 * `month` is 0-indexed.
 */
export function buildMonthGrid(year: number, month: number): DayCell[] {
  const firstOfMonth = new Date(year, month, 1);
  // Date.getDay(): Sun=0..Sat=6. Shift so Monday=0..Sunday=6.
  const leadingDays = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Total cells rounded up to a whole number of weeks.
  const totalCells = Math.ceil((leadingDays + daysInMonth) / 7) * 7;

  const cells: DayCell[] = [];
  for (let i = 0; i < totalCells; i++) {
    // Day-of-month offset: cell 0 is `1 - leadingDays` (may be negative → prev month).
    const cellDate = new Date(year, month, 1 - leadingDays + i);
    cells.push({
      dateKey: toDateKey(cellDate),
      day: cellDate.getDate(),
      inMonth: cellDate.getFullYear() === year && cellDate.getMonth() === month,
    });
  }

  return cells;
}

/**
 * Group workouts by their `workoutDate` (already a `YYYY-MM-DD` string), preserving
 * input order within each day. Keyed identically to `DayCell.dateKey` so markers land
 * on the right cell.
 */
export function groupWorkoutsByDate(workouts: LoggedWorkout[]): Map<string, LoggedWorkout[]> {
  const byDate = new Map<string, LoggedWorkout[]>();
  for (const workout of workouts) {
    const existing = byDate.get(workout.workoutDate);
    if (existing) {
      existing.push(workout);
    } else {
      byDate.set(workout.workoutDate, [workout]);
    }
  }
  return byDate;
}

/**
 * Month navigation with year rollover. `delta` may be negative. Returns a normalized
 * 0-indexed `{ year, month }`. Delegates to `Date` so e.g. month 11 + 1 → next Jan.
 */
export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/** Derive logged/planned presence for a day's workouts (undefined = no workouts). */
export function dayMarkers(workouts: LoggedWorkout[] | undefined): DayMarkers {
  let hasLogged = false;
  let hasPlanned = false;
  for (const workout of workouts ?? []) {
    if (workout.status === "planned") {
      hasPlanned = true;
    } else {
      hasLogged = true;
    }
  }
  return { hasLogged, hasPlanned };
}
