import * as z from 'zod/v4';
import { levelKey } from '../rubric-levels.js';
import { READ_ALOUD_MAX_SECONDS, READ_ALOUD_MAX_TAKES } from '../scoring/speech/limits.js';
import { CANONICAL_LOCALE_RE } from '../scoring/speech/locale.js';
import { checkEvenAfterIssues, parsedFields } from './after-issues.js';
import { AiPermissionsSchema } from './ai.js';
import { FeedbackSchema } from './feedback.js';
import { MediaSchema } from './media.js';

/** The engine measures a speaking criterion can be scored from. */
export const SPEAKING_MEASURES = ['pronunciation', 'fluency', 'prosody'] as const;

/** One criterion: a written-response criterion, and the measure that may score it. Loose: a sidecar survives. */
const SpeakingRubricCriterionSchema = z.looseObject({
  name: z.string().min(1),
  description: z.string().optional(),
  weight: z.number().min(0),
  measure: z.enum(SPEAKING_MEASURES).optional(),
});

const SpeakingRubricSchema = z.looseObject({
  label: z.string().optional(),
  criteria: z.array(SpeakingRubricCriterionSchema).min(1),
});

/** The limits on a take, as a read-aloud's. Loose, like every content object. */
const SpeakingRecordingBoundsSchema = z.looseObject({
  maxSeconds: z.number().gt(0).max(READ_ALOUD_MAX_SECONDS),
  minSeconds: z.number().min(0).optional(),
  maxTakes: z.number().int().min(1).max(READ_ALOUD_MAX_TAKES).optional(),
});

const SpeakingResponseDataShape = z.looseObject({
  schemaVersion: z.literal('1.0'),
  type: z.literal('speaking-response'),
  id: z.string().min(1),
  title: z.string().min(1),
  instructions: z.string().optional(),
  prompt: z.string(),
  promptHtml: z.string().optional(),
  locale: z.string().regex(CANONICAL_LOCALE_RE, {
    error:
      'The locale must be a BCP 47 tag in canonical form, with a region: "en-US", "es-419". Pronunciation is measured against one locale\'s speech, and "en" does not say whose.',
  }),
  media: MediaSchema.optional(),
  recording: SpeakingRecordingBoundsSchema,
  rubric: SpeakingRubricSchema,
  languageTarget: z.string().optional(),
  passThreshold: z.number().min(0).max(1).optional(),
  feedback: FeedbackSchema.optional(),
  learningObjectives: z.array(z.string()).optional(),
  difficultyLevel: z.literal([1, 2, 3, 4, 5]).optional(),
  ai: AiPermissionsSchema.optional(),
});

/**
 * Zod schema validating the full Speaking Response data contract.
 *
 * Four semantic guards, none expressible in JSON Schema, each an authoring
 * error that would otherwise reach a grade:
 *
 * 1. **No two criteria share a name** (case and spacing aside): a judgement
 *    names the criterion it scores, and two of one name leave it unsaid which.
 * 2. **Some criterion carries a weight above 0**, or there is no weighted total
 *    and every answer would be unscorable.
 * 3. **No measure scores two criteria**: the engine reports one fluency, and
 *    two criteria scored from it would weigh it twice under two names.
 * 4. **The shortest take is shorter than the longest.**
 *
 * The guards run even when an unrelated field was refused, but a guard that
 * reads a field zod refused waits until that field parses.
 */
export const SpeakingResponseDataSchema = SpeakingResponseDataShape.check(
  checkEvenAfterIssues<z.output<typeof SpeakingResponseDataShape>>((ctx) => {
    if (ctx.issues.some((issue) => (issue.path?.length ?? 0) === 0)) {
      return;
    }
    const { data, refused } = parsedFields(ctx);
    const report = (path: readonly (string | number)[], input: unknown, message: string) => {
      ctx.issues.push({ code: 'custom', input, message, path: [...path] });
    };

    if (!refused.has('rubric')) {
      const criteria = data.rubric.criteria;
      const names = new Set<string>();
      const measures = new Set<string>();
      for (const [index, criterion] of criteria.entries()) {
        const key = levelKey(criterion.name);
        if (names.has(key)) {
          report(
            ['rubric', 'criteria', index, 'name'],
            criterion.name,
            `Another criterion is already called "${criterion.name}": a judgement names the criterion it scores, and two of one name leave it unsaid which.`,
          );
        }
        names.add(key);
        if (criterion.measure !== undefined) {
          if (measures.has(criterion.measure)) {
            report(
              ['rubric', 'criteria', index, 'measure'],
              criterion.measure,
              `Another criterion is already scored from ${criterion.measure}: the engine reports it once, and two criteria scored from it weigh it twice.`,
            );
          }
          measures.add(criterion.measure);
        }
      }
      if (criteria.every((criterion) => criterion.weight === 0)) {
        report(
          ['rubric', 'criteria'],
          criteria,
          'At least one criterion must carry a weight above 0: with every weight at 0 there is no weighted total, and every answer would be unscorable.',
        );
      }
    }

    if (!refused.has('recording')) {
      const { minSeconds, maxSeconds } = data.recording;
      if (minSeconds !== undefined && minSeconds >= maxSeconds) {
        report(
          ['recording', 'minSeconds'],
          minSeconds,
          'The shortest take must be shorter than the longest.',
        );
      }
    }
  }),
);
