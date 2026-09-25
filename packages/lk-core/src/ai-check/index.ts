/**
 * A test kit for the prompts behind your AI ports.
 *
 * The SDK cannot test your model, and will not try. What it can do is make the
 * calls a learner's questions would make — on items whose answers it knows —
 * and run the same checks it runs before a learner sees anything. What comes
 * back is a count of what would have been shown and what would have been
 * refused, and why.
 *
 * Run it where you change a prompt or a model, in your own CI, with your own
 * key. It is a separate entry point (`@intellectif/lk-core/ai-check`) because
 * it is for your test run, not for a learner's browser: nothing here is
 * imported by anything a page renders.
 *
 * ```ts
 * import { aiCheckCases, formatAiCheckReport, runAiCheck } from '@intellectif/lk-core/ai-check';
 *
 * const report = await runAiCheck({
 *   explain: (request) => callMyModel(EXPLAIN_PROMPT, request),
 *   hint: (request) => callMyModel(HINT_PROMPT, request),
 *   writingFeedback: (request) => callMyModel(FEEDBACK_PROMPT, request),
 *   pronunciationCoaching: (request) => callMyModel(COACHING_PROMPT, request),
 *   critique: (request) => callMyModel(CRITIQUE_PROMPT, request),
 *   drafts: (request) => callMyModel(DRAFTS_PROMPT, request),
 * });
 * console.log(formatAiCheckReport(report));
 * if (report.refused > 0 || report.errors > 0) {
 *   process.exitCode = 1;
 * }
 * ```
 *
 * A refusal is a real failure, not a warning: it is an answer a learner would
 * have asked for and not received. `reveals-answer` on a hint case is the one
 * to take most seriously — that prompt gives answers away. Next come
 * `misquotes-answer` on a writing case — that prompt corrects words the learner
 * never wrote — and `contradicts-marks` on a coaching case: that prompt coaches
 * words the engine heard as right, or sounds it never reported.
 */
import { checkAiExplanation, checkAiHint } from '../ai.js';
import { checkAiCoaching } from '../ai-coaching.js';
import { checkAiCritique } from '../ai-critique.js';
import { checkAiDrafts } from '../ai-drafts.js';
import { checkAiWritingFeedback } from '../ai-writing.js';
import type {
  AiCoaching,
  AiCoachingRequest,
  AiCritique,
  AiCritiqueRequest,
  AiDrafts,
  AiDraftsRequest,
  AiExplanationRequest,
  AiHintRequest,
  AiRefusal,
  AiTextResult,
  AiWritingFeedback,
  AiWritingFeedbackRequest,
} from '../types/ai.js';
import { type AiCheckCase, aiCheckCases } from './cases.js';

export { type AiCheckCase, aiCheckCases } from './cases.js';

/**
 * Your ports, as this kit calls them. The same functions
 * `<LkAiProvider ai={…}>` takes, minus the `AbortSignal` a browser passes —
 * nothing here abandons a call.
 *
 * Leave one out and its cases are skipped rather than failed.
 */
export interface AiCheckPorts {
  explain?(request: AiExplanationRequest): Promise<unknown> | unknown;
  hint?(request: AiHintRequest): Promise<unknown> | unknown;
  writingFeedback?(request: AiWritingFeedbackRequest): Promise<unknown> | unknown;
  pronunciationCoaching?(request: AiCoachingRequest): Promise<unknown> | unknown;
  /** Reviews an item for its author: the port an editor's "Review with AI" calls. */
  critique?(request: AiCritiqueRequest): Promise<unknown> | unknown;
  /** Drafts items from a source, for an author to approve. */
  drafts?(request: AiDraftsRequest): Promise<unknown> | unknown;
}

/** What happened on one case. */
export interface AiCheckResult {
  case: AiCheckCase;
  /** Whether a learner would have been shown what came back. */
  ok: boolean;
  /** Why it would not have been shown. */
  refusal?: AiRefusal;
  /** The port threw or rejected. Its message, as a string. */
  error?: string;
  /**
   * What came back, once the SDK had read it — so a refusal can be read beside
   * the text that caused it. Absent when the port failed or answered with
   * nothing the SDK could read.
   */
  result?: AiTextResult;
  /** For a writing case a learner would have been shown: the feedback, as the SDK accepted it. */
  feedback?: AiWritingFeedback;
  /** For a coaching case a learner would have been shown: the coaching, as the SDK accepted it. */
  coaching?: AiCoaching;
  /** For a critique case an author would have been shown: the findings, as the SDK accepted them. */
  critique?: AiCritique;
  /**
   * For a drafts case the SDK read: the drafts, each with what `validateDraft`
   * and the item critic say of it. A reply read is not a good one — check how
   * many came back `complete` and without warnings.
   */
  drafts?: AiDrafts;
  /** How long the call took, in milliseconds. */
  ms: number;
}

/** What a run came to. */
export interface AiCheckReport {
  /** Cases run: the ones a port was supplied for. */
  total: number;
  /** Cases whose answer a learner would have been shown. */
  shown: number;
  /** Cases whose answer the SDK refused. */
  refused: number;
  /** Cases where the port itself failed. */
  errors: number;
  /** Cases skipped because no port was supplied for that feature. */
  skipped: number;
  /** How many refusals of each reason. */
  byRefusal: Record<AiRefusal, number>;
  results: AiCheckResult[];
}

export interface AiCheckOptions {
  /**
   * The cases to run. Defaults to {@link aiCheckCases}. Pass a filtered list to
   * run one type, or your own cases — built with `aiExplanationRequest` and
   * `aiHintRequest` on your own items, which is how you test a prompt against
   * the content your learners actually see.
   */
  cases?: readonly AiCheckCase[];
  /**
   * How many cases to have in flight at once. Default 1: a run in CI hits a
   * rate limit far more often than it runs out of patience.
   */
  concurrency?: number;
}

const REFUSALS: AiRefusal[] = [
  'malformed',
  'empty',
  'too-long',
  'contradicts-grade',
  'reveals-answer',
  'misquotes-answer',
  'contradicts-marks',
  'contradicts-item',
];

/** The port a case is for. */
function portFor(
  ports: AiCheckPorts,
  one: AiCheckCase,
): ((request: never) => Promise<unknown> | unknown) | undefined {
  switch (one.request.feature) {
    case 'explanation':
      return ports.explain as never;
    case 'hint':
      return ports.hint as never;
    case 'pronunciation-coaching':
      return ports.pronunciationCoaching as never;
    case 'item-critique':
      return ports.critique as never;
    case 'draft-generation':
      return ports.drafts as never;
    default:
      return ports.writingFeedback as never;
  }
}

/** Milliseconds, from whichever clock this runtime has. */
const now = (): number => Date.now();

/** Runs one case: calls the port, times it, and checks what came back. */
async function runCase(ports: AiCheckPorts, one: AiCheckCase): Promise<AiCheckResult> {
  const started = now();
  const port = portFor(ports, one);
  if (port === undefined) {
    throw new Error(`ai-check: no port for "${one.id}"`);
  }
  let raw: unknown;
  try {
    raw = await port(one.request as never);
  } catch (error) {
    return {
      case: one,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      ms: now() - started,
    };
  }
  const ms = now() - started;
  if (one.request.feature === 'draft-generation') {
    let next = 0;
    const checked = checkAiDrafts(raw, one.request, {
      newId: () => {
        next += 1;
        return `ai-check-${next}`;
      },
    });
    return checked.ok
      ? { case: one, ok: true, drafts: checked.drafts, ms }
      : refused(one, raw, checked.refusal, ms);
  }
  if (one.request.feature === 'item-critique') {
    const checked = checkAiCritique(raw, one.request);
    return checked.ok
      ? { case: one, ok: true, critique: checked.critique, ms }
      : refused(one, raw, checked.refusal, ms);
  }
  if (one.request.feature === 'pronunciation-coaching') {
    const checked = checkAiCoaching(raw, one.request);
    if (checked.ok) {
      const { text, provenance, usage } = checked.coaching;
      return {
        case: one,
        ok: true,
        result: {
          text,
          ...(provenance !== undefined ? { provenance } : {}),
          ...(usage !== undefined ? { usage } : {}),
        },
        coaching: checked.coaching,
        ms,
      };
    }
    return refused(one, raw, checked.refusal, ms);
  }
  if (one.request.feature === 'writing-feedback') {
    const checked = checkAiWritingFeedback(raw, one.request);
    if (checked.ok) {
      const { text, provenance, usage } = checked.feedback;
      return {
        case: one,
        ok: true,
        result: {
          text,
          ...(provenance !== undefined ? { provenance } : {}),
          ...(usage !== undefined ? { usage } : {}),
        },
        feedback: checked.feedback,
        ms,
      };
    }
    return refused(one, raw, checked.refusal, ms);
  }
  const checked =
    one.request.feature === 'explanation'
      ? checkAiExplanation(raw, one.request)
      : checkAiHint(raw, one.request);
  if (checked.ok) {
    return { case: one, ok: true, result: checked.result, ms };
  }
  return refused(one, raw, checked.refusal, ms);
}

/** A case whose answer was refused, with the text that came back when there was one to read. */
function refused(one: AiCheckCase, raw: unknown, refusal: AiRefusal, ms: number): AiCheckResult {
  const text =
    typeof (raw as { text?: unknown })?.text === 'string' ? (raw as AiTextResult) : undefined;
  return {
    case: one,
    ok: false,
    refusal,
    ...(text !== undefined ? { result: text } : {}),
    ms,
  };
}

/**
 * Calls your ports on every case and reports what a learner would have seen.
 *
 * It never throws for a failing case: a port that rejects is an `error` in the
 * report, so one bad call cannot hide the rest.
 */
export async function runAiCheck(
  ports: AiCheckPorts,
  options: AiCheckOptions = {},
): Promise<AiCheckReport> {
  const all = options.cases ?? aiCheckCases();
  const asked = Math.trunc(options.concurrency ?? 1);
  const lanes = Number.isFinite(asked) && asked >= 1 ? Math.min(asked, 16) : 1;
  const runnable = all.filter((one) => portFor(ports, one) !== undefined);
  const results: AiCheckResult[] = new Array(runnable.length);
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < runnable.length) {
      const mine = next;
      next += 1;
      const one = runnable[mine];
      if (one === undefined) {
        return;
      }
      results[mine] = await runCase(ports, one);
    }
  };
  await Promise.all(Array.from({ length: Math.min(lanes, runnable.length) }, lane));

  const byRefusal = Object.fromEntries(REFUSALS.map((reason) => [reason, 0])) as Record<
    AiRefusal,
    number
  >;
  let shown = 0;
  let refused = 0;
  let errors = 0;
  for (const result of results) {
    if (result.ok) {
      shown += 1;
    } else if (result.refusal !== undefined) {
      refused += 1;
      byRefusal[result.refusal] += 1;
    } else {
      errors += 1;
    }
  }
  return {
    total: results.length,
    shown,
    refused,
    errors,
    skipped: all.length - runnable.length,
    byRefusal,
    results,
  };
}

/**
 * The report as a few lines for a CI log: the counts, then every case that
 * failed, with what came back.
 *
 * The refused text is printed — this is your own test run, not a learner's
 * screen, and a hint that gives the answer away is only fixable if you can
 * read it.
 */
export function formatAiCheckReport(report: AiCheckReport): string {
  const lines: string[] = [];
  const slowest = report.results.reduce((worst, one) => Math.max(worst, one.ms), 0);
  lines.push(
    `ai-check: ${report.shown}/${report.total} shown, ${report.refused} refused, ${report.errors} failed` +
      `${report.skipped > 0 ? `, ${report.skipped} skipped (no port)` : ''} — slowest ${slowest} ms`,
  );
  for (const reason of REFUSALS) {
    const count = report.byRefusal[reason];
    if (count > 0) {
      lines.push(`  ${reason}: ${count}`);
    }
  }
  for (const result of report.results) {
    if (result.ok) {
      continue;
    }
    const why = result.refusal ?? `port failed (${result.error ?? 'no message'})`;
    lines.push(`  ✗ ${result.case.id} [${result.case.feature}] ${result.case.about}: ${why}`);
    if (result.result !== undefined) {
      lines.push(`      ${result.result.text.replace(/\s+/g, ' ').slice(0, 200)}`);
    }
  }
  return lines.join('\n');
}
