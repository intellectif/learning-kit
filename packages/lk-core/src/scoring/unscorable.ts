import type { ItemOutcome } from '../types/activity.js';

/**
 * Lifts a result that cannot be graded — a `SpeechUnscorable` from
 * `gradeReadAloud`, or anything else carrying a `code` and a `reason` — into
 * the `unscorable` arm of {@link ItemOutcome}, keeping its code.
 *
 * The code is what an application branches on; the reason is a developer-facing
 * sentence. Stored this way, the result composes exactly as the unscorable
 * outcomes `evaluate` returns do. `evaluate` never writes a code itself.
 */
export function outcomeFromUnscorable(result: { code: string; reason: string }): ItemOutcome {
  return { status: 'unscorable', reason: result.reason, maxScore: 1, code: result.code };
}
