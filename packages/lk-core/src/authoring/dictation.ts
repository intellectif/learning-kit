import type { ActivityTypeAuthoring } from '../registry/registry.js';
import { DictationSlowMediaSchema, DictationToleranceSchema } from '../schemas/dictation.js';
import {
  DICTATION_MAX_ACCEPTED_TRANSCRIPTS,
  DICTATION_MAX_EQUIVALENCES,
  DICTATION_MAX_TRANSCRIPT_LENGTH,
  type DictationNormalizer,
  dictationNormalizer,
  isBlankBeforeRules,
  isLongerThan,
  normalizeDictationText,
  preStripNormalize,
  revealsCandidate,
  WORKING_LENGTH,
} from '../scoring/dictation/normalize.js';
import type { DictationData, DictationTolerance } from '../types/activity.js';
import type { DraftIssue } from '../types/authoring.js';
import {
  checkIdentity,
  checkMedia,
  checkSharedOptional,
  coveredPathsOf,
  type DraftFields,
  isRecord,
  issue,
  isUnset,
  isUnwritten,
  pathKey,
  refusesEmpty,
} from './issues.js';

/**
 * Draft support for `dictation`.
 *
 * A new draft is an empty title and an empty transcript: no recording, no
 * hints, no tolerances, no accepted alternatives, and no `scoringStrategy`,
 * because the type has one strategy. The transcript is the answer key, so it
 * starts unwritten and the draft stays `incomplete` until somebody writes it.
 *
 * The rules that make a draft `invalid` are the ones writing more cannot fix:
 * a transcript nothing survives of once normalised, a recording that is not
 * audio, captions on a recording (the captions are the answer), a title that
 * gives the answer away or is too long to check, a slow recording beside a
 * play budget.
 */
export const dictationAuthoring: ActivityTypeAuthoring<DictationData> = {
  createDraft: ({ newId }) => ({
    schemaVersion: '1.0',
    type: 'dictation',
    id: newId(),
    title: '',
    transcript: '',
  }),
  checkDraft: checkDictationDraft,
};

function checkDictationDraft(draft: DraftFields): DraftIssue[] {
  const issues = checkIdentity(draft, 'dictation');
  const tolerance = isRecord(draft.tolerance)
    ? (draft.tolerance as unknown as DictationTolerance)
    : undefined;
  // One normalisation per string for every check below.
  const normalizer = dictationNormalizer(tolerance);

  issues.push(...checkTranscript(draft.transcript, normalizer));
  issues.push(...checkAcceptedTranscripts(draft, normalizer));
  issues.push(...checkRecording(draft.media));
  issues.push(...checkSlowRecording(draft));
  issues.push(...checkRevealed(draft, normalizer));
  issues.push(...checkHints(draft.hints));
  issues.push(...checkTolerance(draft.tolerance));
  issues.push(...checkSharedOptional(draft));
  return issues;
}

/**
 * Not written yet: absent, `null`, or nothing but what the normaliser removes
 * before it reads a word — spaces, line breaks, format and control characters,
 * variation selectors. A text over the cap is written, whatever it holds: 3,000
 * spaces are too long, as 3,000 zero-width spaces are.
 */
function isUnwrittenTranscript(value: unknown): boolean {
  if (typeof value === 'string' && isLongerThan(value, DICTATION_MAX_TRANSCRIPT_LENGTH)) {
    return false;
  }
  return isUnwritten(value) || (typeof value === 'string' && isBlankBeforeRules(value));
}

/**
 * The accepted transcripts the checks normalise and search the shown text for:
 * the first `DICTATION_MAX_ACCEPTED_TRANSCRIPTS`, as the scorer reads them.
 * More is `dc_accepted_transcripts_too_many`, and measuring and searching for
 * every entry past the cap would let a pasted list take seconds to check.
 */
function acceptedTranscriptsRead(accepted: readonly unknown[]): readonly unknown[] {
  return accepted.slice(0, DICTATION_MAX_ACCEPTED_TRANSCRIPTS);
}

function checkTranscript(transcript: unknown, normalizer: DictationNormalizer): DraftIssue[] {
  if (isUnwrittenTranscript(transcript)) {
    return [issue('dc_transcript_required', ['transcript'], 'Write the transcript.')];
  }
  if (typeof transcript !== 'string') {
    // A value of another type is the schema's to refuse.
    return [];
  }
  const measured = normalizer.measure(transcript);
  if (measured.tooLong) {
    return [
      issue(
        'dc_transcript_too_long',
        ['transcript'],
        `The transcript is longer than ${DICTATION_MAX_TRANSCRIPT_LENGTH} characters before or after its equivalences are applied, or they grow it past ${WORKING_LENGTH} characters on the way. A dictation is a sentence or two.`,
      ),
    ];
  }
  if (measured.normalized === '') {
    return [
      issue(
        'dc_transcript_unscorable',
        ['transcript'],
        'The transcript has nothing to type: once case, punctuation and spacing are ignored, nothing is left.',
      ),
    ];
  }
  return [];
}

function checkAcceptedTranscripts(
  draft: DraftFields,
  normalizer: DictationNormalizer,
): DraftIssue[] {
  const accepted = draft.acceptedTranscripts;
  if (!Array.isArray(accepted)) {
    return [];
  }
  const issues: DraftIssue[] = [];
  if (accepted.length > DICTATION_MAX_ACCEPTED_TRANSCRIPTS) {
    issues.push(
      issue(
        'dc_accepted_transcripts_too_many',
        ['acceptedTranscripts'],
        `At most ${DICTATION_MAX_ACCEPTED_TRANSCRIPTS} accepted transcripts. Prefer an equivalence for a word that varies.`,
      ),
    );
  }
  for (const [index, text] of accepted.entries()) {
    // A `null` entry is `validateDraft`'s to report, as `null_not_allowed`.
    if (typeof text !== 'string') {
      continue;
    }
    if (index >= DICTATION_MAX_ACCEPTED_TRANSCRIPTS) {
      // Past the cap, only what the schema refuses of each entry is looked for — an empty one.
      if (text === '') {
        issues.push(acceptedTranscriptEmpty(index));
      }
      continue;
    }
    const measured = normalizer.measure(text);
    if (measured.tooLong) {
      issues.push(
        issue(
          'dc_accepted_transcript_too_long',
          ['acceptedTranscripts', index],
          `Accepted transcript ${index + 1} is longer than ${DICTATION_MAX_TRANSCRIPT_LENGTH} characters before or after its equivalences are applied, or they grow it past ${WORKING_LENGTH} characters on the way.`,
        ),
      );
    } else if (measured.normalized === '') {
      issues.push(acceptedTranscriptEmpty(index));
    }
  }

  const candidates = [draft.transcript, ...acceptedTranscriptsRead(accepted)]
    .filter((text): text is string => typeof text === 'string')
    .map((text) => normalizer.measure(text).normalized)
    .filter((text): text is string => text !== null && text !== '');
  if (new Set(candidates).size !== candidates.length) {
    issues.push(
      issue(
        'dc_accepted_transcript_duplicate',
        ['acceptedTranscripts'],
        'An accepted transcript repeats the transcript, or another accepted transcript, once case, punctuation and spacing are ignored. Remove it.',
      ),
    );
  }
  return issues;
}

function acceptedTranscriptEmpty(index: number): DraftIssue {
  return issue(
    'dc_accepted_transcript_empty',
    ['acceptedTranscripts', index],
    `Accepted transcript ${index + 1} has nothing to type. Fill it in or remove it.`,
  );
}

/** The recording. Its address, description and playback are `checkSharedOptional`'s; the kind and the captions are this type's. */
function checkRecording(media: unknown): DraftIssue[] {
  if (!isRecord(media)) {
    return [];
  }
  const issues: DraftIssue[] = [];
  const kind = media.type;
  if (!isUnwritten(kind) && kind !== 'audio') {
    issues.push(
      issue(
        'dc_media_kind',
        ['media', 'type'],
        'A dictation is dictated: its recording must be audio.',
      ),
    );
  }
  if (!isUnset(media.captionsUrl)) {
    issues.push(
      issue('dc_captions_not_allowed', ['media', 'captionsUrl'], CAPTIONS_ARE_THE_ANSWER),
    );
  }
  return issues;
}

const CAPTIONS_ARE_THE_ANSWER =
  'A dictation recording cannot carry captions: the captions are the answer. Remove them, and offer an accessible alternative as a different item.';

/**
 * The slow recording: the media rules under `slowMedia`, plus what it may not
 * have. A written kind that is not audio gets this type's own code, and the
 * address and description rules then run as for a recording — `checkMedia`
 * would otherwise report the schema's refusal of the kind a second time, as
 * `media_invalid`, and demand a description an image needs and a recording
 * does not. A slow recording of the wrong kind with no address reports both,
 * each under its own code.
 */
function checkSlowRecording(draft: DraftFields): DraftIssue[] {
  const slow = draft.slowMedia;
  if (!isRecord(slow)) {
    return [];
  }
  const issues: DraftIssue[] = [];
  const kind = slow.type;
  const wrongKind = !isUnwritten(kind) && kind !== 'audio';
  if (wrongKind) {
    issues.push(
      issue('dc_slow_media_kind', ['slowMedia', 'type'], 'The slow recording must be audio.'),
    );
  }
  issues.push(
    ...checkMedia(
      wrongKind ? { ...slow, type: 'audio' } : slow,
      ['slowMedia'],
      DictationSlowMediaSchema,
    ),
  );
  if (!isUnset(slow.captionsUrl)) {
    issues.push(
      issue('dc_captions_not_allowed', ['slowMedia', 'captionsUrl'], CAPTIONS_ARE_THE_ANSWER),
    );
  }
  if (slow.playback !== undefined) {
    issues.push(
      issue(
        'dc_slow_media_playback',
        ['slowMedia', 'playback'],
        'The slow recording has no playback policy of its own. Put the policy on the recording; the slow recording follows it, except the play budget.',
      ),
    );
  }

  const media = draft.media;
  if (isUnset(media)) {
    issues.push(
      issue(
        'dc_slow_media_without_media',
        ['media'],
        'A slow recording accompanies a recording. Add the recording first.',
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
        'dc_slow_media_unbudgeted',
        ['slowMedia'],
        'A play budget on the recording cannot coexist with a slow recording that has none. Remove the slow recording, or remove the play limit.',
      ),
    );
  }
  if (typeof slow.url === 'string' && slow.url !== '' && slow.url === media.url) {
    issues.push(
      issue(
        'dc_slow_media_same_url',
        ['slowMedia', 'url'],
        'The slow recording is the same file as the recording. Point it at the slower render.',
      ),
    );
  }
  return issues;
}

/** The title and the recording descriptions are shown before the learner types. */
function checkRevealed(draft: DraftFields, normalizer: DictationNormalizer): DraftIssue[] {
  const candidates = [
    draft.transcript,
    ...(Array.isArray(draft.acceptedTranscripts)
      ? acceptedTranscriptsRead(draft.acceptedTranscripts)
      : []),
  ]
    .filter((text): text is string => typeof text === 'string')
    .map((text) => normalizer.measure(text));
  const shown: [readonly (string | number)[], unknown][] = [
    [['title'], draft.title],
    [['media', 'alt'], isRecord(draft.media) ? draft.media.alt : undefined],
    [['slowMedia', 'alt'], isRecord(draft.slowMedia) ? draft.slowMedia.alt : undefined],
  ];
  const issues: DraftIssue[] = [];
  for (const [path, text] of shown) {
    if (typeof text !== 'string') {
      continue;
    }
    const { tooLong, forms } = normalizer.shown(text);
    if (tooLong) {
      issues.push(
        issue(
          'dc_shown_text_too_long',
          path,
          `${path[0] === 'title' ? 'The title' : 'The description'} is too long to be checked for the transcript: at most ${WORKING_LENGTH} characters before and after the equivalences are applied, and they may not grow it past that on the way.`,
        ),
      );
    } else if (candidates.some((candidate) => revealsCandidate(forms, candidate))) {
      issues.push(
        issue(
          'dc_transcript_revealed',
          path,
          path[0] === 'title'
            ? 'The title gives the answer away: it contains the transcript. Name the exercise instead ("Listen and type the sentence").'
            : 'The description gives the answer away: it contains the transcript. Describe the recording ("Recording, normal speed"), never transcribe it.',
        ),
      );
    }
  }
  return issues;
}

function checkHints(hints: unknown): DraftIssue[] {
  if (!isRecord(hints)) {
    return [];
  }
  const mode = hints.mode;
  if (isUnwritten(mode)) {
    return [issue('dc_hints_mode_required', ['hints', 'mode'], 'Choose how hints are given.')];
  }
  if (mode !== 'progressive-words') {
    return [
      issue(
        'dc_hints_mode_invalid',
        ['hints', 'mode'],
        'The only hint mode is "progressive-words". Leave hints out unless you mean to offer them.',
      ),
    ];
  }
  return [];
}

/**
 * The tolerances: each rule's two halves, then whatever else the schema
 * refuses, under one code with the schema's message — the way
 * fill-in-the-blanks reports a match policy.
 */
function checkTolerance(tolerance: unknown): DraftIssue[] {
  if (isUnset(tolerance)) {
    return [];
  }
  if (!isRecord(tolerance)) {
    return [
      issue(
        'dc_tolerance_invalid',
        ['tolerance'],
        'The tolerances are an object: `{ equivalences: [{ from, to }] }`.',
      ),
    ];
  }
  const issues: DraftIssue[] = [];
  const rules = tolerance.equivalences;
  if (Array.isArray(rules)) {
    // Counted here, not left to the schema: a rule with a half still to write
    // would otherwise cover the schema's count at its ancestor path, and a
    // draft over the cap would read as merely incomplete.
    if (rules.length > DICTATION_MAX_EQUIVALENCES) {
      issues.push(
        issue(
          'dc_tolerance_invalid',
          ['tolerance', 'equivalences'],
          `A dictation carries at most ${DICTATION_MAX_EQUIVALENCES} equivalence rules.`,
        ),
      );
    }
    for (const [index, rule] of rules.entries()) {
      if (!isRecord(rule)) {
        continue;
      }
      const path = ['tolerance', 'equivalences', index];
      const from = rule.from;
      if (isUnwritten(from) || (typeof from === 'string' && preStripNormalize(from) === '')) {
        issues.push(
          issue(
            'dc_equivalence_from_required',
            [...path, 'from'],
            `Say what rule ${index + 1} rewrites: a word, a phrase or a symbol.`,
          ),
        );
      }
      const to = rule.to;
      if (isUnwritten(to) || (typeof to === 'string' && normalizeDictationText(to) === '')) {
        issues.push(
          issue(
            'dc_equivalence_to_required',
            [...path, 'to'],
            `Say what rule ${index + 1} rewrites to. A rule cannot delete a word or leave only punctuation.`,
          ),
        );
      }
    }
  }

  const parsed = DictationToleranceSchema.safeParse(tolerance, { reportInput: true });
  if (!parsed.success) {
    const covered = coveredPathsOf(issues);
    for (const schemaIssue of parsed.error.issues) {
      const path = ['tolerance', ...schemaIssue.path.map(String)];
      // A refused `null` is `validateDraft`'s to report, as `null_not_allowed`;
      // a half a rule already names, or the rule count, is reported once.
      if (refusesEmpty(tolerance, schemaIssue) || covered.has(pathKey(path))) {
        continue;
      }
      issues.push(issue('dc_tolerance_invalid', path, schemaIssue.message));
      for (const key of coveredPathsOf([{ path }])) {
        covered.add(key);
      }
    }
  }
  return issues;
}
