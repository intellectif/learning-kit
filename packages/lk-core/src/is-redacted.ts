/**
 * True when `data` is a `redact()` projection rather than full activity data.
 * Grading a redacted item is always a bug: the answer key is gone by design, so
 * any "score" computed from it is meaningless — for a type whose projection
 * drops the key it used to come out `NaN`, and for one whose projection keeps
 * everything the grade reads it comes out as a plausible number with the
 * authored feedback silently missing.
 *
 * Internal, and its own module so that every grading entry point can ask the
 * same question: `score()` and `evaluate()` in `scoring/index.ts`, and
 * `gradeReadAloud` under `scoring/speech/`, which must not import the barrel
 * it is itself exported from.
 */
export function isRedacted(data: unknown): boolean {
  return (
    typeof data === 'object' && data !== null && (data as { redacted?: unknown }).redacted === true
  );
}
