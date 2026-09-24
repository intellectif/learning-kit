import { z } from 'zod/v4';
import {
  codePointLength,
  DICTATION_MAX_ACCEPTED_TRANSCRIPTS,
  DICTATION_MAX_EQUIVALENCE_LENGTH,
  DICTATION_MAX_EQUIVALENCES,
  DICTATION_MAX_TRANSCRIPT_LENGTH,
  type DictationNormalizer,
  dictationNormalizer,
  type MeasuredTranscript,
  normalizeDictationText,
  preStripNormalize,
  revealsCandidate,
  WORKING_LENGTH,
} from '../scoring/dictation/normalize.js';
import { checkEvenAfterIssues, parsedFields } from './after-issues.js';
import { AiPermissionsSchema } from './ai.js';
import { FeedbackSchema } from './feedback.js';
import { MediaSchema, MediaUrlSchema } from './media.js';

/**
 * Zod schema for the slower second recording of a dictation. Loose like every
 * content schema (a sidecar survives), audio only, and — deliberately — with no
 * `captionsUrl` and no `playback` of its own; the activity-level guards below
 * refuse both if an author writes them anyway.
 */
export const DictationSlowMediaSchema = z.looseObject({
  type: z.literal('audio'),
  url: MediaUrlSchema,
  alt: z.string().min(1).optional(),
});

/**
 * A rule's `from` or `to`. The cap is enforced in code points by the rule's
 * refinements; the metadata states it in the JSON Schema export, whose
 * `maxLength` counts code points too.
 */
const RuleTextSchema = z.string().min(1).meta({ maxLength: DICTATION_MAX_EQUIVALENCE_LENGTH });

/** A transcript or an accepted transcript: the raw cap, stated the same way. */
const TranscriptTextSchema = z.string().min(1).meta({ maxLength: DICTATION_MAX_TRANSCRIPT_LENGTH });

/**
 * Zod schema for one whole-word rewrite rule. Both halves are bounded: `to`
 * because a rule expands text, `from` because it is compiled into the pattern
 * every attempt is searched with.
 */
export const DictationEquivalenceSchema = z
  .looseObject({
    from: RuleTextSchema,
    to: RuleTextSchema,
  })
  .refine((rule) => codePointLength(rule.from) <= DICTATION_MAX_EQUIVALENCE_LENGTH, {
    error: `A rule rewrites at most ${DICTATION_MAX_EQUIVALENCE_LENGTH} characters.`,
    path: ['from'],
  })
  .refine((rule) => codePointLength(rule.to) <= DICTATION_MAX_EQUIVALENCE_LENGTH, {
    error: `A rewrite is at most ${DICTATION_MAX_EQUIVALENCE_LENGTH} characters.`,
    path: ['to'],
  });

/** Zod schema for a dictation's grading tolerances. At most `DICTATION_MAX_EQUIVALENCES` rules. */
export const DictationToleranceSchema = z.looseObject({
  equivalences: z
    .array(DictationEquivalenceSchema)
    .max(DICTATION_MAX_EQUIVALENCES, {
      error: `A dictation carries at most ${DICTATION_MAX_EQUIVALENCES} equivalence rules.`,
    })
    .optional(),
});

/** The fields every guard below reads. */
interface GuardedDictation {
  transcript: string;
  acceptedTranscripts?: string[] | undefined;
  tolerance?: z.infer<typeof DictationToleranceSchema> | undefined;
}

/**
 * One normaliser per parse. Zod hands every refinement of one parse the same
 * freshly built object, so keying by it shares the work between the guards and
 * can never return a result for data that has since changed.
 */
const normalizers = new WeakMap<object, DictationNormalizer>();

function normalizerFor(data: GuardedDictation): DictationNormalizer {
  let normalizer = normalizers.get(data);
  if (normalizer === undefined) {
    normalizer = dictationNormalizer(data.tolerance);
    normalizers.set(data, normalizer);
  }
  return normalizer;
}

function measure(data: GuardedDictation, text: string): MeasuredTranscript {
  return normalizerFor(data).measure(text);
}

/** The transcript and every accepted alternative, in order. */
function candidatesOf(data: GuardedDictation): string[] {
  return [data.transcript, ...(data.acceptedTranscripts ?? [])];
}

/** Written, within the cap, and nothing survives normalisation. */
function isEmpty(measured: MeasuredTranscript): boolean {
  return measured.normalized === '';
}

/**
 * Zod schema validating the full Dictation data contract.
 *
 * Twelve semantic guards, none expressible in JSON Schema, each an authoring
 * error that would otherwise reach a learner or a grade:
 *
 * 1. **The transcript survives normalisation** — the only division by zero the
 *    scorer could meet, refused at authoring time.
 * 2. **The transcript is bounded**, raw and after its rules (a rewrite rule or
 *    NFC composition can lengthen it), and its rules may not grow it past the
 *    working bound on the way, so a valid transcript is never cut by the
 *    normaliser.
 * 3. **So is every accepted transcript**, and each survives normalisation.
 * 4. **No two candidates normalise equal** — a second copy of the transcript
 *    is dead weight that hides an authoring mistake.
 * 5. **The recording is audio.** A dictation is dictated.
 * 6. **The slow recording carries no playback policy**; it follows `media`'s.
 * 7. **A slow recording never sits beside a play budget** — a budget on one
 *    file and a free second file of the same content is no budget.
 * 8. **The slow recording is a different file.**
 * 9. **A slow recording accompanies a recording** — never a stand-in for it,
 *    which would also let a capped group stimulus be bypassed.
 * 10. **A rule rewrites something into something**: `from` must survive case,
 *     quote and whitespace folding (a symbol such as `&` is fine — `from` is
 *     checked BEFORE the punctuation strip, or the remedy for `&` could not
 *     be authored), and `to` must survive full normalisation, so no rule can
 *     empty a word.
 * 11. **No captions on either recording** — the captions are the answer. A
 *     `captionsUrl`, and a non-empty `tracks` list of any kind or language.
 * 12. **The title and the recording descriptions do not contain the
 *     transcript** — they are shown before the learner types — and each is
 *     short enough, raw and once its rules are applied, to be searched in full.
 *
 * Every guard that reads a transcript shares one normalisation of it per
 * parse. Guards 11 and 12 report at the field that is wrong, since either of
 * two or three fields can be. The guards run even when an unrelated field was
 * refused, and read only the fields that parsed (see `parsedFields`): a refused
 * optional field — the rules, the accepted transcripts, a recording — reads as
 * absent, and a guard that needs the transcript or the title waits until it
 * parses.
 */
const DictationDataShape = z.looseObject({
  schemaVersion: z.literal('1.0'),
  type: z.literal('dictation'),
  id: z.string().min(1),
  title: z.string().min(1),
  transcript: TranscriptTextSchema,
  acceptedTranscripts: z
    .array(TranscriptTextSchema)
    .max(DICTATION_MAX_ACCEPTED_TRANSCRIPTS)
    .optional(),
  media: MediaSchema.optional(),
  slowMedia: DictationSlowMediaSchema.optional(),
  hints: z.looseObject({ mode: z.literal('progressive-words') }).optional(),
  tolerance: DictationToleranceSchema.optional(),
  feedback: FeedbackSchema.optional(),
  passThreshold: z.number().min(0).max(1).optional(),
  locale: z.string().optional(),
  learningObjectives: z.array(z.string()).optional(),
  difficultyLevel: z.literal([1, 2, 3, 4, 5]).optional(),
  ai: AiPermissionsSchema.optional(),
});

export const DictationDataSchema = DictationDataShape.check(
  checkEvenAfterIssues<z.output<typeof DictationDataShape>>((ctx) => {
    // Refused at the root: the value is not an object, and there is nothing to guard.
    if (ctx.issues.some((issue) => (issue.path?.length ?? 0) === 0)) {
      return;
    }
    // A refused key reads as absent — rules that rescue a transcript, a recording
    // a slow one accompanies — and a guard that depends on a refused required
    // key, which need not be text, waits until it parses.
    const { data, refused } = parsedFields(ctx);
    const report = (path: readonly (string | number)[], input: unknown, message: string) => {
      ctx.issues.push({ code: 'custom', input, message, path: [...path] });
    };
    const rulesParse = !refused.has('tolerance');
    const transcriptParses = !refused.has('transcript');

    if (rulesParse && transcriptParses) {
      const transcript = measure(data, data.transcript);
      if (isEmpty(transcript)) {
        report(
          ['transcript'],
          data.transcript,
          'The transcript must contain something to type: after ignoring case, punctuation and spacing nothing is left.',
        );
      }
      if (transcript.tooLong) {
        report(
          ['transcript'],
          data.transcript,
          `A transcript is at most ${DICTATION_MAX_TRANSCRIPT_LENGTH} characters, before and after its equivalences are applied, and its equivalences may not grow it past ${WORKING_LENGTH} characters on the way.`,
        );
      }
      if (!refused.has('acceptedTranscripts')) {
        const accepted = data.acceptedTranscripts ?? [];
        if (
          accepted.some((entry) => {
            const measured = measure(data, entry);
            return measured.tooLong || isEmpty(measured);
          })
        ) {
          report(
            ['acceptedTranscripts'],
            data.acceptedTranscripts,
            `An accepted transcript must contain something to type and be at most ${DICTATION_MAX_TRANSCRIPT_LENGTH} characters, before and after its equivalences are applied, and its equivalences may not grow it past ${WORKING_LENGTH} characters on the way.`,
          );
        }
        // A candidate too long to normalise is the length guard's failure, not a duplicate.
        const normalized = candidatesOf(data)
          .map((entry) => measure(data, entry).normalized)
          .filter((entry): entry is string => entry !== null);
        if (new Set(normalized).size !== normalized.length) {
          report(
            ['acceptedTranscripts'],
            data.acceptedTranscripts,
            'An accepted transcript must differ from the transcript and from the other accepted transcripts once case, punctuation and spacing are ignored.',
          );
        }
      }
    }

    const mediaParses = !refused.has('media');
    const slowParses = !refused.has('slowMedia');
    if (mediaParses && data.media !== undefined && data.media.type !== 'audio') {
      report(
        ['media', 'type'],
        data.media.type,
        'A dictation is dictated: its recording must be audio.',
      );
    }
    if (slowParses && data.slowMedia?.playback !== undefined) {
      report(
        ['slowMedia', 'playback'],
        data.slowMedia.playback,
        'The slow recording carries no playback policy of its own; put the policy on `media` — the slow recording follows it (except the play budget).',
      );
    }
    if (mediaParses && slowParses && data.slowMedia !== undefined) {
      if (data.media?.playback?.maxPlays !== undefined) {
        report(
          ['slowMedia'],
          data.slowMedia,
          "A play budget on `media` cannot coexist with an unbudgeted slow recording of the same content. Drop `slowMedia`, or drop `maxPlays` (a budgeted recording can still offer the transport's 0.75× speed when `rate` is `allow`).",
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
          'The slow recording must be a different file from the recording.',
        );
      }
      if (data.media === undefined) {
        report(
          ['media'],
          data.media,
          'A slow recording accompanies a recording: add `media` first.',
        );
      }
    }
    if (
      rulesParse &&
      !(data.tolerance?.equivalences ?? []).every(
        (rule) => preStripNormalize(rule.from) !== '' && normalizeDictationText(rule.to) !== '',
      )
    ) {
      report(
        ['tolerance', 'equivalences'],
        data.tolerance?.equivalences,
        'An equivalence must name a word, phrase or symbol to rewrite, and rewrite it to something that survives normalisation (not only punctuation or spaces).',
      );
    }

    for (const field of ['media', 'slowMedia'] as const) {
      const recording = data[field] as { captionsUrl?: unknown; tracks?: unknown } | undefined;
      for (const captions of captionFieldsOf(recording)) {
        report(
          [field, captions],
          recording?.[captions],
          'A dictation recording cannot carry captions: the captions are the answer. Offer an accessible alternative as a different item.',
        );
      }
    }

    if (!rulesParse || !transcriptParses) {
      return;
    }
    const normalizer = normalizerFor(data);
    const candidates = candidatesOf(data).map((entry) => normalizer.measure(entry));
    const shown: [readonly (string | number)[], string | undefined][] = [
      [['title'], refused.has('title') ? undefined : data.title],
      [['media', 'alt'], data.media?.alt],
      [['slowMedia', 'alt'], data.slowMedia?.alt],
    ];
    for (const [path, value] of shown) {
      if (value === undefined) {
        continue;
      }
      const { tooLong, forms } = normalizer.shown(value);
      if (tooLong) {
        report(
          path,
          value,
          `The title and the recording descriptions are searched for the transcript before they are shown: each is at most ${WORKING_LENGTH} characters, before and after the equivalences are applied, and the equivalences may not grow it past that on the way.`,
        );
      } else if (candidates.some((candidate) => revealsCandidate(forms, candidate))) {
        report(
          path,
          value,
          'The title and the recording descriptions are shown to the learner before they type: they must not contain the transcript. Describe the recording ("Recording, normal speed"), never transcribe it.',
        );
      }
    }
  }),
);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The fields of a recording that carry captions, in the order they are
 * reported: `captionsUrl`, and a non-empty `tracks` list.
 *
 * `tracks` counts whatever its `kind` or language. A caption track in the
 * language of the recording transcribes it; a subtitle track translates it —
 * and a translation of the words a dictation asks for gives them away as surely
 * as a transcription does, to a learner who knows both languages or has a
 * dictionary. Before 0.16 only `captionsUrl` was read here, so a recording with
 * `tracks` passed every one of these rules, and redaction — which keeps tracks,
 * because on any other recording they are what a learner is meant to see —
 * shipped them to an exam client.
 *
 * `written` decides what counts as a written `captionsUrl`: the schema counts
 * any value, a draft only a written one. A `tracks` list counts as soon as it
 * has an entry, however unfinished, because an author who added one meant it.
 */
export function captionFieldsOf(
  media: unknown,
  written: (captionsUrl: unknown) => boolean = (captionsUrl) => captionsUrl !== undefined,
): ('captionsUrl' | 'tracks')[] {
  if (!isObject(media)) {
    return [];
  }
  const fields: ('captionsUrl' | 'tracks')[] = [];
  if (written(media.captionsUrl)) {
    fields.push('captionsUrl');
  }
  if (Array.isArray(media.tracks) && media.tracks.length > 0) {
    fields.push('tracks');
  }
  return fields;
}

/**
 * The stimulus field whose captions a group plays to a dictation, or
 * `undefined` when it plays none: its stimulus media carries captions — see
 * {@link captionFieldsOf} — while one of its items is a dictation with no
 * recording of its own, which therefore plays the stimulus recording. The
 * captions are then the answer, as they would be on the dictation's own
 * recording. With both fields written, `captionsUrl` is the one reported: one
 * refusal, at the path it has always had.
 */
export function groupCaptionsField(
  group: unknown,
  written?: (captionsUrl: unknown) => boolean,
): 'captionsUrl' | 'tracks' | undefined {
  if (!isObject(group) || !isObject(group.stimulus) || !Array.isArray(group.items)) {
    return undefined;
  }
  const [field] = captionFieldsOf(group.stimulus.media, written);
  if (field === undefined) {
    return undefined;
  }
  const played = group.items.some(
    (item) => isObject(item) && item.type === 'dictation' && item.media === undefined,
  );
  return played ? field : undefined;
}

/** Whether a group plays a captioned recording to a dictation: {@link groupCaptionsField} as a yes or no. */
export function groupCaptionsRevealDictation(
  group: unknown,
  written?: (captionsUrl: unknown) => boolean,
): boolean {
  return groupCaptionsField(group, written) !== undefined;
}

/** The message every validator gives for {@link groupCaptionsRevealDictation}. */
export const GROUP_CAPTIONS_REVEAL_DICTATION =
  'The stimulus recording carries captions, and a dictation in this group plays that recording: the captions are the answer. Remove the captions, or give the dictation its own recording.';
