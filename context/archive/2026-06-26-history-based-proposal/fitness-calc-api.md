# `@finegym/fitness-calc` — API docs for S-03

> Fetched 2026-06-26. **Context7 does not index this package** (too small, v1.0.1) — source is
> the package's own published README + `dist/index.d.ts` (the authoritative reference).
> Companion to `library-research.md` (which recommended this lib).

## Package facts

- **`@finegym/fitness-calc` v1.0.1** — zero-dependency, pure TypeScript.
- Repo: `github.com/finegym-io/fitness-calc`. Built by FineGym.
- `exports`: `.` → types `dist/index.d.ts`, import `dist/index.mjs` (ESM), require `dist/index.js`.
- ESM + zero-dep ⇒ Workers-edge safe (matches tech-stack constraint in `library-research.md`).
- Install: `npm install @finegym/fitness-calc`.

## Relevant surface for S-03: Strength Training only

The proposal flow turns the user's logged `(weight, reps)` per exercise into a progression
target. Three functions cover that; everything else in the lib is out of scope (see below).

### `calculateOneRepMax(weight, reps, formula?)`

```typescript
type OneRepMaxFormula =
  | 'epley'    // default
  | 'brzycki' | 'lombardi' | 'mayhew' | 'oconner' | 'wathan' | 'lander';

interface OneRepMaxResult {
  oneRepMax: number;
  formula: OneRepMaxFormula;
  percentages: Record<number, number>;   // e.g. { 100: 116.7, 95: 110.9, ... }
}

declare function calculateOneRepMax(
  weight: number,
  reps: number,
  formula?: OneRepMaxFormula
): OneRepMaxResult;
```

```typescript
// Bench: 100kg × 5 reps
calculateOneRepMax(100, 5);
// → { oneRepMax: 116.7, formula: 'epley', percentages: { 100: 116.7, 95: 110.9, ... } }
```

The `percentages` table is the direct lever for proposing a working weight: pick a % of the
estimated 1RM (e.g. 80%) as the next session's target load.

### `estimateRepsAtWeight(oneRepMax, targetWeight, formula?)`

```typescript
declare function estimateRepsAtWeight(
  oneRepMax: number,
  targetWeight: number,
  formula?: OneRepMaxFormula
): number;
```

Inverse direction — given a 1RM and a chosen weight, how many reps to prescribe. Fills the rep
count of a proposed set.

### `calculateAllFormulas(weight, reps)`

```typescript
declare function calculateAllFormulas(
  weight: number,
  reps: number
): Record<OneRepMaxFormula, number>;
```

Returns all 7 estimates for comparison/averaging if you'd rather not commit to one formula.

## How this maps onto S-03

Per `library-research.md`, the split is:

1. **Aggregate history** (last/best `weight`×`reps` per exercise for the chosen muscle group)
   → **Supabase SQL**, no library.
2. **Derive the proposal** → feed each exercise's recent best set into `calculateOneRepMax`,
   then read a target % from `percentages` (and optionally `estimateRepsAtWeight` for the rep
   target). Output reuses the S-02 plan schema as a proposed workout.

## Out of scope

The library's other 80% — BMI, BMR, TDEE, macros, body-fat, heart-rate zones, calories burned,
pace/speed, ideal weight, water intake, unit conversions — is excluded by PRD Non-Goals
(10xBoar = strength tracking only). Import just the three strength functions to keep the bundle
minimal.

## Caveats (carry-over from `library-research.md`)

- S-03 is still **`blocked`** on the open roadmap question: minimum logged sessions before a
  proposal is meaningful + empty-state when a muscle group has no history. The library is pure
  math on whatever set you pass it — it does not decide this.
- Verify `exports`/`module` + dependency tree for true edge-runtime compatibility before
  committing (zero-dep + ESM looks clean, but confirm at install time).
