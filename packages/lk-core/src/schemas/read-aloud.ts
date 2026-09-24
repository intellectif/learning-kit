import { z } from 'zod/v4';
import { containsUnspacedScript, dictationNormalizer } from '../scoring/dictation/normalize.js';
import {
  READ_ALOUD_MAX_DIMENSION_WEIGHT,
  READ_ALOUD_MAX_REFERENCE_LENGTH,
  READ_ALOUD_MAX_SECONDS,
  READ_ALOUD_MAX_TAKES,
} from '../scoring/speech/limits.js';
import { CANONICAL_LOCALE_RE } from '../scoring/speech/locale.js';
import { checkEvenAfterIssues, parsedFields } from './after-issues.js';
import { AiPermissionsSchema } from './ai.js';
import { FeedbackSchema } from './feedback.js';
import { MediaSchema, MediaUrlSchema } from './media.js';

/** The dimensions a read-aloud grade can be made of, in the order they are documented. */
export const READ_ALOUD_DIMENSIONS = ['accuracy', 'fluency', 'completeness', 'prosody'] as const;

/** The most dimensions a read-aloud item can weigh: one of each name. */
const READ_ALOUD_MAX_DIMENSIONS = READ_ALOUD_DIMENSIONS.length;

/**
 * Zod schema for the slower model recording of a read-aloud item.
 *
 * STRICT, where every other content schema is loose: these three fields are the
 * whole contract, so the two keys an author reaches for — a `playback` policy
 * and a `captionsUrl` — are refused here rather than by guards of their own. The
 * policy belongs on `media`, which this recording follows; a captions track
 * belongs on `media` too, where it is allowed, because the text being read is
 * public and captions of it give nothing away.
 */
export const ReadAloudSlowMediaSchema = z.strictObject({
  type: z.literal('audio'),
  url: MediaUrlSchema,
  alt: z.string().min(1).optional(),
});

/**
 * The text the learner reads aloud. The cap is enforced in code points by guard
 * 1 below; the metadata states it in the JSON Schema export, whose `maxLength`
 * counts code points too, where zod's `.max()` counts UTF-16 units.
 */
const ReferenceTextSchema = z
  .string()
  .min(1)
  .refine((text) => text.trim() !== '', {
    error: 'The text to read aloud must contain something to read.',
  })
  .meta({ maxLength: READ_ALOUD_MAX_REFERENCE_LENGTH });

/** The limits on a take. Loose, like every content object: a sidecar survives. */
const RecordingBoundsSchema = z.looseObject({
  maxSeconds: z.number().gt(0).max(READ_ALOUD_MAX_SECONDS),
  minSeconds: z.number().min(0).optional(),
  maxTakes: z.number().int().min(1).max(READ_ALOUD_MAX_TAKES).optional(),
});

/** One assessor dimension the grade counts, and its weight. */
const ReadAloudDimensionWeightSchema = z.looseObject({
  name: z.enum(READ_ALOUD_DIMENSIONS),
  weight: z.number().min(0).max(READ_ALOUD_MAX_DIMENSION_WEIGHT),
});

/** What the grade is made of: one to four weighted dimensions. */
const ReadAloudScoringSchema = z.looseObject({
  dimensions: z.array(ReadAloudDimensionWeightSchema).min(1).max(READ_ALOUD_MAX_DIMENSIONS),
});

const ReadAloudDataShape = z.looseObject({
  schemaVersion: z.literal('1.0'),
  type: z.literal('read-aloud'),
  id: z.string().min(1),
  title: z.string().min(1),
  instructions: z.string().optional(),
  referenceText: ReferenceTextSchema,
  locale: z.string().regex(CANONICAL_LOCALE_RE, {
    error:
      'The locale must be a BCP 47 tag in canonical form, with a region: "en-US", "es-419", "zh-Hant-TW". Pronunciation is assessed against one locale\'s speech, and "en" does not say whose.',
  }),
  media: MediaSchema.optional(),
  slowMedia: ReadAloudSlowMediaSchema.optional(),
  recording: RecordingBoundsSchema,
  scoring: ReadAloudScoringSchema,
  passThreshold: z.number().min(0).max(1).optional(),
  feedback: FeedbackSchema.optional(),
  learningObjectives: z.array(z.string()).optional(),
  difficultyLevel: z.literal([1, 2, 3, 4, 5]).optional(),
  ai: AiPermissionsSchema.optional(),
});

/**
 * Zod schema validating the full Read Aloud data contract.
 *
 * Ten semantic guards, none expressible in JSON Schema, each an authoring
 * error that would otherwise reach a learner or a grade:
 *
 * 1. **The text is bounded**, before and after normalisation (NFC composition
 *    can lengthen it), because it is tokenised as a dictation transcript is and
 *    the normaliser cuts a longer one without saying so — so a grade would be
 *    computed against words the item had silently lost.
 * 2. **The text is written in a script that separates its words with spaces.**
 *    The tokeniser splits on spaces alone, so a run of Han, kana, Thai, Lao,
 *    Khmer or Myanmar letters is one word however many it holds, and every
 *    per-word mark for it would be one mark for the whole sentence.
 * 3. **The model recording is audio.** A read-aloud model is read aloud.
 * 4. **A slow model recording accompanies a recording** — never a stand-in for
 *    it.
 * 5. **The slow recording is a different file.**
 * 6. **A slow recording never sits beside a play budget** — a budget on one
 *    file and a free second file of the same content is no budget.
 * 7. **No dimension is weighed twice**: two entries for one name hide which
 *    weight the grade used.
 * 8. **Some dimension carries a weight above 0**, or there is no weighted total
 *    to compute and every take would be unscorable.
 * 9. **The shortest take is shorter than the longest.**
 * 10. **Something survives normalisation of the text**: a text of nothing but
 *     punctuation is tokenised into no word at all, so a silent take would
 *     record no omission and a perfect reading would align as one insertion
 *     after another — which is what a feedback component renders.
 *
 * The guards run even when an unrelated field was refused, but a guard that
 * reads a field zod refused waits until that field parses: zod leaves a refused
 * optional field — a recording, a slow recording — out of the value the guards
 * read, and a refused required field is kept as it was given, which need not be
 * of the type the guard expects.
 *
 * Guard 4 reports at `media`, where the recording it asks for belongs and where
 * the dictation schema reports the same rule. Guard 10 is checked beside guards
 * 1 and 2, which read the same text, and numbered after them so that every
 * other guard keeps the number it was given.
 */
export const ReadAloudDataSchema = ReadAloudDataShape.check(
  checkEvenAfterIssues<z.output<typeof ReadAloudDataShape>>((ctx) => {
    // Refused at the root: the value is not an object, and there is nothing to guard.
    if (ctx.issues.some((issue) => (issue.path?.length ?? 0) === 0)) {
      return;
    }
    const { data, refused } = parsedFields(ctx);
    const report = (path: readonly (string | number)[], input: unknown, message: string) => {
      ctx.issues.push({ code: 'custom', input, message, path: [...path] });
    };

    if (!refused.has('referenceText')) {
      const text = data.referenceText;
      // One measurement answers both halves of guard 1, and guard 10 besides: a
      // raw text over the cap is reported without being normalised at all — its
      // `normalized` is then `null`, never `''`, so guard 10 cannot fire beside
      // it — and a shorter one is measured again once it is.
      const measured = dictationNormalizer(undefined).measure(text);
      if (measured.tooLong) {
        report(
          ['referenceText'],
          text,
          `The text to read aloud is at most ${READ_ALOUD_MAX_REFERENCE_LENGTH} characters, before and after normalisation.`,
        );
      }
      if (measured.normalized === '') {
        report(
          ['referenceText'],
          text,
          'The text to read aloud must contain a word: after ignoring punctuation and spacing nothing is left, so no word would be marked and every reading would align as one insertion after another.',
        );
      }
      if (containsUnspacedScript(text)) {
        report(
          ['referenceText'],
          text,
          'A read-aloud item needs a script written with spaces between its words. The text is compared word by word, and a run of Han, kana, Thai, Lao, Khmer or Myanmar letters is one word however many it holds.',
        );
      }
    }

    const mediaParses = !refused.has('media');
    const slowParses = !refused.has('slowMedia');
    if (mediaParses && data.media !== undefined && data.media.type !== 'audio') {
      report(
        ['media', 'type'],
        data.media.type,
        'A read-aloud model is read aloud: its recording must be audio.',
      );
    }
    if (mediaParses && slowParses && data.slowMedia !== undefined) {
      if (data.media === undefined) {
        report(
          ['media'],
          data.media,
          'A slow model recording accompanies a recording: add `media` first.',
        );
      }
      if (data.media?.playback?.maxPlays !== undefined) {
        report(
          ['slowMedia'],
          data.slowMedia,
          'A play budget on `media` cannot coexist with an unbudgeted slow recording of the same content. Drop `slowMedia`, or drop `maxPlays`.',
        );
      }
      // Both addresses must be strings before they can be the same file: a
      // missing one is the address rule's failure, reported at its own path.
      if (
        typeof data.slowMedia.url === 'string' &&
        typeof data.media?.url === 'string' &&
        data.slowMedia.url === data.media.url
      ) {
        report(
          ['slowMedia', 'url'],
          data.slowMedia.url,
          'The slow model recording must be a different file from the recording.',
        );
      }
    }

    if (!refused.has('scoring')) {
      const dimensions = data.scoring.dimensions;
      const seen = new Set<string>();
      for (const [index, dimension] of dimensions.entries()) {
        if (seen.has(dimension.name)) {
          report(
            ['scoring', 'dimensions', index, 'name'],
            dimension.name,
            `"${dimension.name}" is already weighed: a dimension counted twice hides which weight the grade used.`,
          );
        }
        seen.add(dimension.name);
      }
      if (dimensions.every((dimension) => dimension.weight === 0)) {
        report(
          ['scoring', 'dimensions'],
          dimensions,
          'At least one dimension must carry a weight above 0: with every weight at 0 there is no weighted total, and every take would be unscorable.',
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
