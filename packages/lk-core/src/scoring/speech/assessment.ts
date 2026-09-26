import * as z from 'zod/v4';
import { maxUnits } from '../../schemas/text-length.js';
import type { ValidationError, ValidationResult } from '../../types/activity.js';
import type { SpeechAssessment, SpeechWord } from '../../types/speech.js';
import { SPEECH_ASSESSMENT_MAX_TEXT_LENGTH, SPEECH_ASSESSMENT_MAX_WORDS } from './limits.js';
import { CANONICAL_LOCALE_RE } from './locale.js';
import { heardTokens } from './tokens.js';

// Every object below is strict, at every depth. An assessment is written by an
// adapter the application maintains, and an unknown key there is most likely a
// misspelt known one — which a loose schema would pass, and every reader would
// then take for an absent, "not assessed" field.

/** A score on the assessment's 0..100 scale. `z.number()` refuses NaN and both infinities. */
const Score = z.number().min(0).max(100);
/** A confidence, 0..1. */
const Confidence = z.number().min(0).max(1);
/** A time from the start of the recording, or a length of time, in milliseconds. */
const Milliseconds = z.number().min(0);

const PhonemeCandidateSchema = z.strictObject({
  symbol: maxUnits(z.string().min(1), 16),
  score: Score,
});

const PhonemeSchema = z.strictObject({
  symbol: maxUnits(z.string().min(1), 16).optional(),
  accuracy: Score.optional(),
  startMs: Milliseconds.optional(),
  durationMs: Milliseconds.optional(),
  heardAs: z.array(PhonemeCandidateSchema).max(10).optional(),
});

const SyllableSchema = z.strictObject({
  text: maxUnits(z.string().min(1), 64),
  grapheme: maxUnits(z.string(), 64).optional(),
  accuracy: Score.optional(),
  startMs: Milliseconds.optional(),
  durationMs: Milliseconds.optional(),
});

const WordSchema = z.strictObject({
  text: maxUnits(z.string().min(1), 200),
  accuracy: Score.optional(),
  error: z.enum(['none', 'mispronunciation', 'omission', 'insertion']),
  vendorError: maxUnits(z.string(), 64).optional(),
  startMs: Milliseconds.optional(),
  durationMs: Milliseconds.optional(),
  syllables: z.array(SyllableSchema).max(50).optional(),
  phonemes: z.array(PhonemeSchema).max(50).optional(),
  breaks: z
    .strictObject({ unexpected: Confidence.optional(), missing: Confidence.optional() })
    .optional(),
});

const AssessorSchema = z.strictObject({
  kind: z.enum(['auto', 'ai', 'human']),
  id: maxUnits(z.string(), 256).optional(),
  model: maxUnits(z.string(), 256).optional(),
  promptHash: maxUnits(z.string(), 256).optional(),
});

const SpeechAssessmentSchema = z.strictObject({
  assessmentVersion: z.literal('1.0'),
  status: z.enum(['assessed', 'no_speech']),
  task: z.enum(['scripted', 'unscripted']),
  locale: z.string().regex(CANONICAL_LOCALE_RE),
  referenceText: maxUnits(z.string(), 8000).optional(),
  recordingKey: maxUnits(z.string().min(1), 1024).optional(),
  assessor: AssessorSchema,
  scale: z.literal(100),
  scores: z.strictObject({
    accuracy: Score.optional(),
    fluency: Score.optional(),
    completeness: Score.optional(),
    prosody: Score.optional(),
    overall: Score.optional(),
  }),
  recognizedText: maxUnits(z.string(), 8000).optional(),
  miscue: z.enum(['assessor', 'none']),
  phonemeAlphabet: z.enum(['ipa', 'sapi']).optional(),
  words: z.array(WordSchema).max(SPEECH_ASSESSMENT_MAX_WORDS),
  prosody: z.strictObject({ monotoneConfidence: Confidence.optional() }).optional(),
  signal: z.strictObject({ snrDb: z.number().optional() }).optional(),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Whether any phoneme of any word names a `symbol`, or lists what was `heardAs` instead. */
function namesPhonemes(words: unknown): boolean {
  return (
    Array.isArray(words) &&
    words.some((word) => {
      const phonemes = isRecord(word) ? word.phonemes : undefined;
      return (
        Array.isArray(phonemes) &&
        phonemes.some(
          (phoneme) =>
            isRecord(phoneme) && (phoneme.symbol !== undefined || phoneme.heardAs !== undefined),
        )
      );
    })
  );
}

/** How much text the words are written with between them, in UTF-16 units. */
function rawTextLength(words: readonly SpeechWord[]): number {
  let total = 0;
  for (const word of words) {
    total += word.text.length;
  }
  return total;
}

/**
 * The two rules over the total text of the words, reported at `words`. They run
 * on the value zod parsed — the words as they were read, never as a second read
 * of the argument describes them — because a bound computed from a value the
 * aligner will not see bounds nothing.
 *
 * Both are needed, and neither replaces the other:
 *
 * - the **raw** total is what the words are written with. It is linear and
 *   normalises nothing, so it refuses the 200 000-unit assessment the per-word
 *   caps allow between them without paying the cost it exists to prevent, and
 *   it runs first;
 * - the **normalised** total is what those words spell once they are folded into
 *   tokens, which is what the aligner actually pairs. A compatibility character
 *   can stand for eighteen, so a reading well inside the raw cap can still spell
 *   more text than the aligner reads — and the words past that are dropped in
 *   silence, leaving the learner marked from the noise that came before them.
 *   It is measured by the very function that collects those tokens, so the two
 *   bounds are one bound.
 *
 * Both count every word the assessment carries, so neither can be walked past
 * by tagging text `insertion`: an inserted word gives no token to pair, but the
 * aligner still normalises it and emits it, so its text is text the call holds.
 *
 * One error at most: the second runs only on what the first let through, so it
 * never normalises more than the raw cap allows.
 */
function totalTextErrors(words: readonly SpeechWord[]): ValidationError[] {
  const raw = rawTextLength(words);
  if (raw > SPEECH_ASSESSMENT_MAX_TEXT_LENGTH) {
    return [
      {
        path: ['words'],
        message: `The words of an assessment carry ${raw} characters between them, and at most ${SPEECH_ASSESSMENT_MAX_TEXT_LENGTH} can be aligned against the text of an item.`,
        code: 'too_big',
      },
    ];
  }
  const normalized = heardTokens(words).length;
  if (normalized > SPEECH_ASSESSMENT_MAX_TEXT_LENGTH) {
    return [
      {
        path: ['words'],
        message: `The words of an assessment spell ${normalized} characters between them once they are normalised, and at most ${SPEECH_ASSESSMENT_MAX_TEXT_LENGTH} can be aligned against the text of an item. One character can stand for several.`,
        code: 'too_big',
      },
    ];
  }
  return [];
}

/**
 * The two rules no single field states, and no parsed value can answer: each
 * fires on a field that is ABSENT. They read the value as it was given, not as
 * zod parsed it, so they report beside the field rules instead of waiting for
 * every field to parse — an adapter sees each problem on its first run — and
 * because a field zod refused is missing from what it parsed.
 */
function crossFieldErrors(value: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];
  if (value.task === 'scripted') {
    if (value.referenceText === undefined) {
      errors.push({
        path: ['referenceText'],
        message:
          'A scripted assessment must carry the reference text it was made against, so a grade can confirm it is the text of the item.',
        code: 'scripted_binding_required',
      });
    }
    if (value.recordingKey === undefined) {
      errors.push({
        path: ['recordingKey'],
        message:
          'A scripted assessment must carry the key of the recording it measured, so a grade can confirm it is the recording of the learner.',
        code: 'scripted_binding_required',
      });
    }
  }
  if (value.phonemeAlphabet === undefined && namesPhonemes(value.words)) {
    errors.push({
      path: ['phonemeAlphabet'],
      message:
        'A phoneme names a symbol or what was heard instead, so the assessment must say which phonemeAlphabet those symbols are written in.',
      code: 'phoneme_alphabet_required',
    });
  }
  return errors;
}

/**
 * One validation error as a phrase a developer can act on: the path it was
 * reported at, then the message. A refusal at the root has no path, and the
 * message already names the value.
 *
 * Internal: it is what `alignReadAloud`'s `TypeError` and `gradeReadAloud`'s
 * `invalid_assessment` reason say about the first problem they found, so the
 * two name it the same way.
 */
export function describeValidationError(error: ValidationError): string {
  return error.path.length === 0 ? error.message : `${error.path.join('.')}: ${error.message}`;
}

/**
 * Checks that `value` is a well-formed {@link SpeechAssessment}. It answers
 * rather than throwing: anything that is not one — a non-object, an unknown key
 * at any depth, a score off the 0..100 scale, a time that is negative or not
 * finite — comes back as `{ success: false, errors }`, one error per problem,
 * each with the path, message and code `validateActivity` gives a schema
 * failure. An object that throws when it is read is the one exception, and the
 * throw is its own: an own property getter, or a `Proxy` trap.
 *
 * Three rules span fields:
 * - `scripted_binding_required` — a `scripted` assessment without
 *   `referenceText`, or without `recordingKey`, reported at each missing path;
 * - `phoneme_alphabet_required` — a phoneme names a `symbol` or `heardAs` while
 *   `phonemeAlphabet` is absent, reported once, at `phonemeAlphabet`;
 * - `too_big` at `words` — the words carry more text between them, written or
 *   normalised, than can be aligned against an item's text. Per-word caps bound
 *   no total, and the aligner pairs tokens, of which one word holds as many as
 *   its text spells. Every word counts towards both totals, an insertion
 *   included: the aligner carries one into its answer, so its text is text the
 *   call must hold.
 *
 * The total is measured on the words every field rule accepted, so it says
 * nothing about an assessment that is going back to its adapter anyway.
 *
 * It checks the evidence alone. Whether an assessment belongs to an item and
 * to a learner's recording is decided when it is graded.
 */
export function validateSpeechAssessment(value: unknown): ValidationResult<SpeechAssessment> {
  const result = SpeechAssessmentSchema.safeParse(value);
  const refused: ValidationError[] = result.success
    ? []
    : result.error.issues.map((issue) => ({
        path: issue.path.map(String),
        message: issue.message,
        code: issue.code,
      }));
  const parsed = result.success ? (result.data as SpeechAssessment) : undefined;
  // A value refused at the root has no fields for a cross-field rule to read.
  const errors = isRecord(value)
    ? [
        ...refused,
        ...crossFieldErrors(value),
        ...(parsed !== undefined ? totalTextErrors(parsed.words) : []),
      ]
    : refused;
  if (parsed !== undefined && errors.length === 0) {
    return { success: true, data: parsed };
  }
  return { success: false, errors };
}
