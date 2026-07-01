import type { createClient } from "@/lib/supabase";

/**
 * A minimal, typed Supabase fake for hermetic tests of the workout write path.
 *
 * It models exactly the fluent chain that `createWorkout` (`src/lib/workouts.ts`)
 * uses — no more:
 *   from(t).insert(rows).select("id").single().overrideTypes()   (parent insert)
 *   from(t).insert(rows)                                          (child insert)
 *   from(t).delete().eq("id", id)                                (compensation)
 *
 * Each `(table, operation)` returns its configured `{ data, error }` result
 * (defaulting to a no-op success), and every insert/delete is recorded in
 * `calls` in invocation order so a test can assert, e.g., that the compensating
 * delete fired against the just-created parent id.
 *
 * It deliberately does NOT emulate foreign-key or unique-index enforcement: a
 * stub cannot honour those constraints, so catalog-membership and duplicate-day
 * rejection belong to the integration suite, not here (research.md "Architecture
 * Insights"; CLAUDE.md two-layer rule — "When NOT to use hermetic").
 *
 * This is the cookbook §6.2 hermetic pattern.
 */

type WorkoutClient = NonNullable<ReturnType<typeof createClient>>;

/** A configured PostgREST-style result: data on success, error otherwise. */
export interface FakeResult {
  data?: unknown;
  error: { code?: string; message?: string } | null;
}

/** One recorded insert/delete against the fake, in call order. */
export interface RecordedCall {
  table: string;
  op: "insert" | "delete";
  /** Rows passed to `.insert(...)`. */
  args?: unknown;
  /** Column/value passed to a `.delete().eq(...)` filter. */
  eq?: { column: string; value: unknown };
}

/** Results keyed by `"<table>:<op>"`, e.g. `"workouts:insert"`. */
export type FakeResults = Record<string, FakeResult>;

export interface SupabaseFake {
  /** Cast to the real client type so `createWorkout` accepts it verbatim. */
  client: WorkoutClient;
  /** Every insert/delete invocation, in order, for assertions. */
  calls: RecordedCall[];
}

const OK: FakeResult = { data: null, error: null };

/** A chainable, awaitable stand-in that resolves to a single configured result. */
function thenable(result: FakeResult) {
  const chain = {
    select: () => chain,
    single: () => chain,
    overrideTypes: () => chain,
    then: (resolve: (value: FakeResult) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

export function createSupabaseFake(results: FakeResults = {}): SupabaseFake {
  const calls: RecordedCall[] = [];
  const resultFor = (table: string, op: "insert" | "delete") => results[`${table}:${op}`] ?? OK;

  const client = {
    from(table: string) {
      return {
        insert(rows: unknown) {
          calls.push({ table, op: "insert", args: rows });
          return thenable(resultFor(table, "insert"));
        },
        delete() {
          const result = resultFor(table, "delete");
          return {
            eq(column: string, value: unknown) {
              calls.push({ table, op: "delete", eq: { column, value } });
              return thenable(result);
            },
          };
        },
      };
    },
  };

  return { client: client as unknown as WorkoutClient, calls };
}
