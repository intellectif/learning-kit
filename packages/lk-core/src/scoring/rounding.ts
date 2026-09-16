/**
 * Rounding for assessment scores.
 *
 * Rounding is **two different operations** that must not share one policy, and
 * conflating them silently inverts one of them:
 *
 * - **Grade rounding** decides the number a learner is shown and recorded
 *   against. It rounds to a fixed number of decimal places, conventionally
 *   half-up, so a learner shown "70%" is not recorded as a fail at 69.6.
 * - **Band / level classification** decides which level someone is placed in.
 *   It deliberately **floors**: placing a learner above their real level is
 *   the more harmful error, so a band boundary must not be reached by
 *   rounding up.
 *
 * There is therefore no default `RoundingPolicy` anywhere in this SDK, and
 * `dp` has no default either — an integrator's deliberate choice must never be
 * supplied by us.
 */

/** How a value is rounded to `dp` decimal places. */
export type RoundingMode = 'half-up' | 'half-even' | 'floor' | 'ceil';

/** A rounding policy. Both fields are required — the SDK never guesses either. */
export interface RoundingPolicy {
  mode: RoundingMode;
  /** Decimal places. Load-bearing: `dp: 2` is what stops 69.6 becoming a fail at 70. */
  dp: number;
}

const ROUNDING_MODES: readonly unknown[] = ['half-up', 'half-even', 'floor', 'ceil'];
/** The most decimal places a policy may round to: a scaled grade stays an integer a double holds exactly. */
const MAX_ROUNDING_DP = 15;

/**
 * The rounding policy `value` holds, or `undefined` for none (`undefined` or
 * `null`). A malformed one would reach {@link gte} as `10 ** undefined` and
 * turn a perfect score into a fail with no error, so it throws here instead.
 *
 * Internal. Every function that takes a `rounding` option checks it here, so
 * each refuses the same policies with the same message; `scoring/index.ts`
 * does not re-export it.
 */
export function roundingPolicyOf(value: unknown): RoundingPolicy | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const { mode, dp } = value as { mode?: unknown; dp?: unknown };
  if (
    !ROUNDING_MODES.includes(mode) ||
    typeof dp !== 'number' ||
    !Number.isInteger(dp) ||
    dp < 0 ||
    dp > MAX_ROUNDING_DP
  ) {
    // Described field by field, never serialised: a policy holding a BigInt or
    // a reference to itself would make the message throw a TypeError first.
    const describe = (field: unknown): string =>
      typeof field === 'string'
        ? JSON.stringify(field)
        : typeof field === 'number' || field === undefined
          ? String(field)
          : typeof field === 'object'
            ? 'an object'
            : `a ${typeof field}`;
    throw new RangeError(
      `Invalid rounding policy (mode ${describe(mode)}, dp ${describe(dp)}): expected { mode: 'half-up' | 'half-even' | 'floor' | 'ceil', dp: a whole number from 0 to ${MAX_ROUNDING_DP} }.`,
    );
  }
  // The values just checked, not the object they came from: an accessor could
  // answer differently when the comparison reads it again.
  return { mode, dp } as RoundingPolicy;
}

/**
 * Float-noise guard. Binary floating point makes `1.005 * 100` come out as
 * `100.49999999999999` and `0.29 * 100` come out as `28.999999999999996`;
 * without an allowance both would move a learner's grade a step. It is applied
 * in the direction each mode needs — see {@link roundGrade}.
 */
const EPSILON = 1e-9;

/**
 * Tolerance for deciding "is this exactly halfway?" in half-even mode.
 * Deliberately much larger than {@link EPSILON}: if the tie test shared the
 * nudge's tolerance, the nudge would decide its own outcome. Safe for grades,
 * which live on a [0,1] scale where representation error is far below this.
 */
const TIE_TOLERANCE = 1e-6;

function scaled(value: number, dp: number): number {
  return value * 10 ** dp;
}

/**
 * Normalises `-0` to `0` without touching anything else. `-0` JSON-serialises
 * as `0` but fails `Object.is(-0, 0)`, which surprises a strict-equality
 * gradebook comparison. Deliberately NOT `|| 0`: that also swallowed `NaN`
 * (reachable with an absurd `dp`, where `10 ** dp` overflows to Infinity) and
 * turned a visible failure into a plausible-looking grade of zero.
 */
function noNegZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

/**
 * Rounds `value` to `policy.dp` places under `policy.mode`.
 *
 * Idempotent for every mode: rounding an already-rounded value returns it
 * unchanged. That matters because a composed score is rounded once and then
 * compared through {@link gte}, which rounds again.
 */
export function roundGrade(value: number, policy: RoundingPolicy): number {
  if (!Number.isFinite(value)) {
    return value;
  }
  const factor = 10 ** policy.dp;
  const raw = scaled(value, policy.dp);

  // The nudge must oppose the mode, never point uniformly away from zero.
  // `Math.ceil` on a value that is ALREADY exact at `dp` jumps a whole
  // quantum if you add epsilon first: 0.7 became 0.71, a true 0 became 0.01,
  // and the operation stopped being idempotent (0.7 -> 0.71 -> 0.72). So
  // `ceil` nudges down and `floor` nudges up — just far enough to absorb
  // representation error (0.29 * 100 is 28.999999999999996, which must still
  // floor to 29) without ever moving a value that was already exact.
  // Half modes keep the sign-aware nudge, which is what makes a .5 tie land
  // away from zero.
  switch (policy.mode) {
    case 'floor':
      return noNegZero(Math.floor(raw + EPSILON) / factor);
    case 'ceil':
      return noNegZero(Math.ceil(raw - EPSILON) / factor);
    case 'half-even': {
      // Detect the tie on the RAW value, and with a tolerance decoupled from
      // (and far larger than) the nudge epsilon. Testing the NUDGED value
      // against EPSILON let the nudge itself decide whether a tie was seen:
      // 0.375 was detected but 0.125 was not, so half-even silently degraded
      // to half-up for some exact ties — and only ever in the direction that
      // rounds a learner UP, the opposite of what this mode is chosen for.
      const floored = Math.floor(raw);
      if (Math.abs(raw - floored - 0.5) > TIE_TOLERANCE) {
        return noNegZero(halfAway(raw) / factor);
      }
      // Exactly halfway: pick the even neighbour (banker's rounding).
      const even = floored % 2 === 0 ? floored : floored + 1;
      return noNegZero(even / factor);
    }
    default:
      return noNegZero(halfAway(raw) / factor);
  }
}

/**
 * Half-up on a scaled value, with the sign-aware float-noise nudge.
 * `Math.round` breaks .5 ties toward +Infinity, so negatives are mirrored to
 * keep the tie breaking away from zero in both directions.
 */
function halfAway(raw: number): number {
  const nudged = raw >= 0 ? raw + EPSILON : raw - EPSILON;
  return raw >= 0 ? Math.round(nudged) : -Math.round(-nudged);
}

/**
 * Threshold comparison that rounds **both sides** before comparing.
 *
 * Comparing a raw float against a rounded threshold is how a learner ends up
 * shown one number and recorded against another. Rounding both sides — and
 * allowing an epsilon — makes "what the learner sees" and "what the gradebook
 * decides" the same comparison.
 */
export function gte(value: number, threshold: number, policy: RoundingPolicy): boolean {
  return roundGrade(value, policy) >= roundGrade(threshold, policy) - EPSILON;
}

/** A named band with an inclusive lower bound, e.g. `{ name: 'B1', min: 0.6 }`. */
export interface Band {
  name: string;
  /** Inclusive lower bound on the same scale as the value being classified. */
  min: number;
}

/**
 * Classifies a value into a band by **flooring**: the highest band whose `min`
 * the value actually reaches. Deliberately does NOT round up to a boundary —
 * over-placement is the more harmful error, so a learner just below a boundary
 * stays below it.
 *
 * Returns `null` when the value reaches no band's minimum.
 */
export function classifyBand(value: number, bands: readonly Band[]): Band | null {
  let best: Band | null = null;
  for (const band of bands) {
    if (value >= band.min - EPSILON && (best === null || band.min > best.min)) {
      best = band;
    }
  }
  return best;
}
