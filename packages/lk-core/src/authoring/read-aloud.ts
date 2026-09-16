import type { ActivityTypeAuthoring } from '../registry/registry.js';
import { READ_ALOUD_DIMENSIONS, ReadAloudSlowMediaSchema } from '../schemas/read-aloud.js';
import { containsUnspacedScript, dictationNormalizer } from '../scoring/dictation/normalize.js';
import {
  READ_ALOUD_MAX_DIMENSION_WEIGHT,
  READ_ALOUD_MAX_REFERENCE_LENGTH,
  READ_ALOUD_MAX_SECONDS,
  READ_ALOUD_MAX_TAKES,
} from '../scoring/speech/limits.js';
import { CANONICAL_LOCALE_RE } from '../scoring/speech/locale.js';
import type { ReadAloudData } from '../types/activity.js';
import type { DraftIssue } from '../types/authoring.js';
import {
  checkIdentity,
  checkMedia,
  checkSharedOptional,
  type DraftFields,
  isRecord,
  issue,
  isUnset,
  isUnwritten,
  isWholeNumber,
} from './issues.js';

/**
 * Draft support for `read-aloud`.
 *
 * A new draft is an empty title, an empty text to read, no locale, no recording
 * limit and no weighted dimensions: `recording.maxSeconds: 0` reads as "not set
 * yet", the way `written-response` reads `maxWords: 0`, and the dimension list
 * starts empty because which of accuracy, fluency, completeness and prosody a
 * grade counts — and what each is worth — is a teaching decision the SDK must
 * not make. A defaulted set would let an author write the text, never open the
 * scoring control, and hold a `complete` item graded on weights nobody chose.
 *
 * The rules that make a draft `invalid` are the ones writing more cannot fix: a
 * text too long to be marked whole, a text nothing survives of once its
 * punctuation and spacing are ignored, a script whose words have no spaces
 * between them, a locale that is not canonical, bounds outside their range, a
 * dimension weighed twice or not at all, and the model-recording rules.
 */
export const readAloudAuthoring: ActivityTypeAuthoring<ReadAloudData> = {
  createDraft: ({ newId }) => ({
    schemaVersion: '1.0',
    type: 'read-aloud',
    id: newId(),
    title: '',
    referenceText: '',
    locale: '',
    recording: { maxSeconds: 0 },
    scoring: { dimensions: [] },
  }),
  checkDraft: checkReadAloudDraft,
};

function checkReadAloudDraft(draft: DraftFields): DraftIssue[] {
  const issues = checkIdentity(draft, 'read-aloud');
  issues.push(...checkReferenceText(draft.referenceText));
  issues.push(...checkLocale(draft.locale));
  issues.push(...checkRecording(draft.recording));
  issues.push(...checkDimensions(draft.scoring));
  issues.push(...checkModelRecording(draft.media));
  issues.push(...checkSlowRecording(draft));
  issues.push(...checkSharedOptional(draft));
  return issues;
}

function checkReferenceText(referenceText: unknown): DraftIssue[] {
  if (isUnwritten(referenceText)) {
    return [
      issue('ra_reference_text_required', ['referenceText'], 'Write the text to be read aloud.'),
    ];
  }
  if (typeof referenceText !== 'string') {
    // A value of another type is the schema's to refuse.
    return [];
  }
  const issues: DraftIssue[] = [];
  // One measurement for both rules; a text too long to normalise has no
  // normalised form to be empty, so only one of them can fire.
  const measured = dictationNormalizer(undefined).measure(referenceText);
  if (measured.tooLong) {
    issues.push(
      issue(
        'ra_reference_text_too_long',
        ['referenceText'],
        `The text is longer than ${READ_ALOUD_MAX_REFERENCE_LENGTH} characters, before or after normalisation. A read-aloud item is a sentence or a short paragraph.`,
      ),
    );
  }
  if (measured.normalized === '') {
    issues.push(
      issue(
        'ra_reference_text_unreadable',
        ['referenceText'],
        'The text has no word to read: once punctuation and spacing are ignored, nothing is left. A reading of it would be marked against no word at all.',
      ),
    );
  }
  if (containsUnspacedScript(referenceText)) {
    issues.push(
      issue(
        'ra_reference_text_unspaced_script',
        ['referenceText'],
        'The text is written in a script that does not separate its words with spaces. Each word is marked on its own, and a run of Han, kana, Thai, Lao, Khmer or Myanmar letters would be marked as one word.',
      ),
    );
  }
  return issues;
}

function checkLocale(locale: unknown): DraftIssue[] {
  if (isUnwritten(locale)) {
    return [
      issue(
        'ra_locale_required',
        ['locale'],
        'Choose the language the learner reads in, with its region — "en-US", not "en".',
      ),
    ];
  }
  if (typeof locale !== 'string' || CANONICAL_LOCALE_RE.test(locale)) {
    return [];
  }
  return [
    issue(
      'ra_locale_invalid',
      ['locale'],
      'The language must be a BCP 47 tag in canonical form, with a region: "en-US", "es-419", "zh-Hant-TW". Pronunciation is assessed against one locale\'s speech.',
    ),
  ];
}

/**
 * The limits on a take. Every bound is optional to the learner's experience and
 * none of them decides a grade, but the longest take has to be set before a
 * recorder can be shown at all.
 */
function checkRecording(recording: unknown): DraftIssue[] {
  if (isUnset(recording)) {
    return [maxSecondsRequired()];
  }
  if (!isRecord(recording)) {
    return [];
  }
  const issues: DraftIssue[] = [];
  const max = recording.maxSeconds;
  if (isUnset(max) || max === 0) {
    issues.push(maxSecondsRequired());
  } else if (
    typeof max === 'number' &&
    !(Number.isFinite(max) && max > 0 && max <= READ_ALOUD_MAX_SECONDS)
  ) {
    issues.push(
      issue(
        'ra_max_seconds_out_of_range',
        ['recording', 'maxSeconds'],
        `A take is at most ${READ_ALOUD_MAX_SECONDS} seconds long.`,
      ),
    );
  }
  const min = recording.minSeconds;
  if (typeof min === 'number' && !(Number.isFinite(min) && min >= 0)) {
    issues.push(minSecondsOutOfRange('The shortest take is a number of seconds, 0 or more.'));
  } else if (typeof min === 'number' && typeof max === 'number' && max > 0 && min >= max) {
    issues.push(minSecondsOutOfRange('The shortest take must be shorter than the longest.'));
  }
  const takes = recording.maxTakes;
  if (
    typeof takes === 'number' &&
    !(isWholeNumber(takes) && takes >= 1 && takes <= READ_ALOUD_MAX_TAKES)
  ) {
    issues.push(
      issue(
        'ra_max_takes_out_of_range',
        ['recording', 'maxTakes'],
        `How many takes a learner may record is a whole number from 1 to ${READ_ALOUD_MAX_TAKES}.`,
      ),
    );
  }
  return issues;
}

function maxSecondsRequired(): DraftIssue {
  return issue(
    'ra_max_seconds_required',
    ['recording', 'maxSeconds'],
    'Set how long a take may be, in seconds.',
  );
}

function minSecondsOutOfRange(message: string): DraftIssue {
  return issue('ra_min_seconds_out_of_range', ['recording', 'minSeconds'], message);
}

const DIMENSION_NAMES: readonly unknown[] = READ_ALOUD_DIMENSIONS;

/** What the grade is made of. The schema's list rules, reported where it reports them. */
function checkDimensions(scoring: unknown): DraftIssue[] {
  if (isUnset(scoring)) {
    return [dimensionsRequired()];
  }
  if (!isRecord(scoring)) {
    return [];
  }
  const dimensions = scoring.dimensions;
  if (isUnset(dimensions)) {
    return [dimensionsRequired()];
  }
  if (!Array.isArray(dimensions)) {
    return [];
  }
  if (dimensions.length === 0) {
    return [dimensionsRequired()];
  }

  const issues: DraftIssue[] = [];
  const seen = new Set<unknown>();
  // A weight nobody has given yet, or one the range refuses, leaves the total
  // undecided: the "every weight is 0" rule waits until every weight is usable,
  // as the written-response rubric's does.
  let everyWeightUsable = true;
  let totalWeight = 0;
  for (const [index, dimension] of dimensions.entries()) {
    if (!isRecord(dimension)) {
      everyWeightUsable = false;
      continue;
    }
    const path = ['scoring', 'dimensions', index];
    const name = dimension.name;
    if (!DIMENSION_NAMES.includes(name)) {
      issues.push(
        issue(
          'ra_dimension_name_invalid',
          [...path, 'name'],
          `Choose what dimension ${index + 1} measures: ${READ_ALOUD_DIMENSIONS.join(', ')}.`,
        ),
      );
    } else if (seen.has(name)) {
      issues.push(
        issue(
          'ra_dimension_duplicate',
          [...path, 'name'],
          `"${String(name)}" is already weighed. Remove this one, or measure something else.`,
        ),
      );
    } else {
      seen.add(name);
    }
    const weight = dimension.weight;
    if (
      typeof weight === 'number' &&
      Number.isFinite(weight) &&
      weight >= 0 &&
      weight <= READ_ALOUD_MAX_DIMENSION_WEIGHT
    ) {
      totalWeight += weight;
    } else {
      everyWeightUsable = false;
      issues.push(
        issue(
          'ra_dimension_weight_invalid',
          [...path, 'weight'],
          `Give dimension ${index + 1} a weight: a number from 0 to ${READ_ALOUD_MAX_DIMENSION_WEIGHT}.`,
        ),
      );
    }
  }
  if (everyWeightUsable && totalWeight === 0) {
    issues.push(
      issue(
        'ra_dimension_weights_zero',
        ['scoring', 'dimensions'],
        'Give at least one dimension a weight above 0. With every weight at 0 there is no weighted total, and every take would be unscorable.',
      ),
    );
  }
  return issues;
}

function dimensionsRequired(): DraftIssue {
  return issue(
    'ra_dimensions_required',
    ['scoring', 'dimensions'],
    'Choose what the grade measures: at least one of accuracy, fluency, completeness or prosody, with a weight.',
  );
}

/** The model recording. Its address, description and playback are `checkSharedOptional`'s. */
function checkModelRecording(media: unknown): DraftIssue[] {
  if (!isRecord(media)) {
    return [];
  }
  const kind = media.type;
  return isUnwritten(kind) || kind === 'audio'
    ? []
    : [
        issue(
          'ra_media_kind',
          ['media', 'type'],
          'A read-aloud model is read aloud: its recording must be audio.',
        ),
      ];
}

/**
 * The slow model recording: the media rules under `slowMedia`, plus what it may
 * not accompany. Its schema is strict, so a playback policy, a captions track or
 * any other key is refused there and reported under `media_invalid` — there is
 * no separate code, because the recording follows `media`'s policy and the text
 * being read is public, so captions of it withhold nothing.
 *
 * A written kind that is not `audio` is named here rather than left to that
 * refusal, and the rest of the rules then read the recording as the audio it
 * can only be: `checkMedia` decides from the kind whether a description is
 * required, and would otherwise demand of a slow recording the description a
 * picture needs, at a field that can hold nothing but a recording. Dictation
 * substitutes the kind before the same call, for the same reason.
 */
function checkSlowRecording(draft: DraftFields): DraftIssue[] {
  const slow = draft.slowMedia;
  if (!isRecord(slow)) {
    return [];
  }
  const kind = slow.type;
  const wrongKind = !isUnwritten(kind) && kind !== 'audio';
  const issues: DraftIssue[] = wrongKind
    ? [issue('media_invalid', ['slowMedia', 'type'], 'The slow model recording must be audio.')]
    : [];
  issues.push(
    ...checkMedia(
      wrongKind ? { ...slow, type: 'audio' } : slow,
      ['slowMedia'],
      ReadAloudSlowMediaSchema,
    ),
  );

  const media = draft.media;
  if (isUnset(media)) {
    issues.push(
      issue(
        'ra_slow_media_without_media',
        ['media'],
        'A slow model recording accompanies a recording. Add the recording first.',
      ),
    );
    return issues;
  }
  if (!isRecord(media)) {
    return issues;
  }
  if (isRecord(media.playback) && media.playback.maxPlays !== undefined) {
    issues.push(
      issue(
        'ra_slow_media_beside_play_limit',
        ['slowMedia'],
        'A play budget on the recording cannot coexist with a slow recording that has none. Remove the slow recording, or remove the play limit.',
      ),
    );
  }
  if (typeof slow.url === 'string' && slow.url !== '' && slow.url === media.url) {
    issues.push(
      issue(
        'ra_slow_media_same_recording',
        ['slowMedia', 'url'],
        'The slow model recording is the same file as the recording. Point it at the slower reading.',
      ),
    );
  }
  return issues;
}
