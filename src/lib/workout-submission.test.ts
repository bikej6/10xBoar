import { describe, expect, it } from "vitest";
import {
  isAcceptableLogDate,
  isPlannableDate,
  parseExerciseRow,
  parseExercisesField,
  parseIsoDate,
} from "@/lib/workout-submission";

/**
 * Oracle for these tests: FR-003 (a workout row = exercise + sets + reps +
 * weight), FR-004 (plan a future workout), and the resolved decisions in
 * research.md — weight 0 is VALID (bodyweight), only negative is rejected.
 * Assertions derive from those rules, not from re-running the implementation.
 */

const validRow = { exerciseId: 7, sets: 3, reps: 8, weight: 50 };

describe("parseExerciseRow", () => {
  it("returns a typed row for a valid input", () => {
    expect(parseExerciseRow(validRow)).toEqual({ exerciseId: 7, sets: 3, reps: 8, weight: 50 });
  });

  it("accepts weight 0 (bodyweight exercises)", () => {
    expect(parseExerciseRow({ ...validRow, weight: 0 })).toEqual({
      exerciseId: 7,
      sets: 3,
      reps: 8,
      weight: 0,
    });
  });

  it.each([
    { field: "weight", value: -1, error: "Weight must be zero or more." },
    { field: "weight", value: Number.POSITIVE_INFINITY, error: "Weight must be zero or more." },
    { field: "sets", value: 0, error: "Sets must be a whole number of at least 1." },
    { field: "sets", value: 1.5, error: "Sets must be a whole number of at least 1." },
    { field: "reps", value: 0, error: "Reps must be a whole number of at least 1." },
    { field: "reps", value: 2.5, error: "Reps must be a whole number of at least 1." },
    { field: "exerciseId", value: 0, error: "Choose an exercise for every row." },
    { field: "exerciseId", value: -3, error: "Choose an exercise for every row." },
    { field: "exerciseId", value: 1.5, error: "Choose an exercise for every row." },
  ])("rejects $field = $value", ({ field, value, error }) => {
    expect(parseExerciseRow({ ...validRow, [field]: value })).toBe(error);
  });

  it("treats a missing/empty item as an invalid exercise", () => {
    expect(parseExerciseRow(undefined)).toBe("Choose an exercise for every row.");
    expect(parseExerciseRow({})).toBe("Choose an exercise for every row.");
  });
});

describe("parseExercisesField", () => {
  it("parses a valid multi-row payload", () => {
    const raw = JSON.stringify([validRow, { exerciseId: 2, sets: 4, reps: 10, weight: 0 }]);
    const result = parseExercisesField(raw);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
  });

  it.each([
    { desc: "null payload", raw: null, error: "Add at least one exercise." },
    { desc: "empty array", raw: "[]", error: "Add at least one exercise." },
    { desc: "non-array object", raw: "{}", error: "Add at least one exercise." },
    { desc: "malformed JSON", raw: "{not json", error: "Could not read the submitted exercises." },
  ])("rejects $desc", ({ raw, error }) => {
    expect(parseExercisesField(raw)).toBe(error);
  });

  it("propagates the first invalid row's error", () => {
    const raw = JSON.stringify([validRow, { ...validRow, weight: -5 }]);
    expect(parseExercisesField(raw)).toBe("Weight must be zero or more.");
  });
});

describe("parseIsoDate", () => {
  it("parses a valid ISO date to a finite epoch", () => {
    expect(Number.isFinite(parseIsoDate("2026-07-01"))).toBe(true);
  });

  it("advances by exactly one day (86_400_000 ms) between consecutive dates", () => {
    expect(parseIsoDate("2026-07-02") - parseIsoDate("2026-07-01")).toBe(86_400_000);
  });

  it.each(["2026-7-1", "01-07-2026", "not-a-date", "", "2026-07-01T00:00:00Z"])(
    "returns NaN for malformed input %s",
    (value) => {
      expect(Number.isNaN(parseIsoDate(value))).toBe(true);
    },
  );
});

describe("isAcceptableLogDate (log rule: not beyond today+1 UTC)", () => {
  const today = "2026-07-01";

  it.each([
    { desc: "today", value: "2026-07-01", expected: true },
    { desc: "today + 1 (grace)", value: "2026-07-02", expected: true },
    { desc: "today + 2 (future)", value: "2026-07-03", expected: false },
    { desc: "yesterday (backdate allowed)", value: "2026-06-30", expected: true },
    { desc: "malformed", value: "garbage", expected: false },
  ])("$desc -> $expected", ({ value, expected }) => {
    expect(isAcceptableLogDate(value, today)).toBe(expected);
  });
});

describe("isPlannableDate (plan rule: not in the past UTC)", () => {
  const today = "2026-07-01";

  it.each([
    { desc: "today", value: "2026-07-01", expected: true },
    { desc: "tomorrow", value: "2026-07-02", expected: true },
    { desc: "yesterday", value: "2026-06-30", expected: false },
    { desc: "malformed", value: "garbage", expected: false },
  ])("$desc -> $expected", ({ value, expected }) => {
    expect(isPlannableDate(value, today)).toBe(expected);
  });
});
