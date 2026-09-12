import { MediaSchema } from '../schemas/media.js';
import type { DraftIssue, DraftSeverity } from '../types/authoring.js';

/**
 * Every issue code the SDK's draft checks can report, with its severity.
 *
 * A code's severity is part of its contract, so it is fixed here, once: an
 * issue is built from its code, and the same code cannot be `incomplete` in one
 * place and `invalid` in another. `docs/authoring.md` documents this table, and
 * a test holds the two together.
 */
export const DRAFT_ISSUE_SEVERITY = {
  // Every registered type — reported by validateDraft itself
  null_not_allowed: 'invalid',
  // Every built-in activity
  schema_version_invalid: 'invalid',
  type_mismatch: 'invalid',
  id_required: 'invalid',
  title_required: 'incomplete',
  scoring_strategy_required: 'incomplete',
  pass_threshold_invalid: 'invalid',
  difficulty_level_invalid: 'invalid',
  feedback_empty: 'incomplete',
  redacted_data: 'invalid',
  media_type_required: 'incomplete',
  media_url_required: 'incomplete',
  media_url_invalid: 'invalid',
  media_alt_required: 'incomplete',
  media_playback_invalid: 'invalid',
  media_invalid: 'invalid',
  // multiple-choice
  mc_question_required: 'incomplete',
  mc_mode_required: 'incomplete',
  mc_options_too_few: 'incomplete',
  mc_options_too_many: 'invalid',
  mc_option_id_required: 'invalid',
  mc_option_id_duplicate: 'invalid',
  mc_option_text_required: 'incomplete',
  mc_option_correctness_required: 'incomplete',
  mc_correct_option_required: 'incomplete',
  mc_single_mode_one_correct: 'invalid',
  // fill-in-the-blanks
  fib_passage_required: 'incomplete',
  fib_blanks_required: 'incomplete',
  fib_blank_id_required: 'invalid',
  fib_blank_id_duplicate: 'invalid',
  fib_accepted_answers_required: 'incomplete',
  fib_accepted_answer_empty: 'incomplete',
  fib_levenshtein_invalid: 'invalid',
  fib_match_locale_invalid: 'invalid',
  fib_match_invalid: 'invalid',
  fib_blank_missing: 'incomplete',
  fib_placeholder_missing: 'incomplete',
  fib_placeholder_duplicate: 'invalid',
  fib_blanks_mismatch: 'invalid',
  // written-response
  wr_prompt_required: 'incomplete',
  wr_min_words_required: 'incomplete',
  wr_min_words_invalid: 'invalid',
  wr_max_words_required: 'incomplete',
  wr_max_words_invalid: 'invalid',
  wr_word_bounds_order: 'invalid',
  wr_rubric_criteria_required: 'incomplete',
  wr_criterion_name_required: 'incomplete',
  wr_criterion_weight_required: 'incomplete',
  wr_criterion_weight_invalid: 'invalid',
  wr_rubric_weights_zero: 'incomplete',
  wr_rubric_weights_too_large: 'invalid',
} as const satisfies Readonly<Record<string, DraftSeverity>>;

export type DraftIssueCode = keyof typeof DRAFT_ISSUE_SEVERITY;

/** A draft as a check receives it: any plain object. */
export type DraftFields = Readonly<Record<string, unknown>>;

/** A schema library issue, as far as the draft checks read one. */
export interface SchemaIssue {
  readonly code: string;
  readonly path: readonly PropertyKey[];
  readonly input?: unknown;
}

export function issue(
  code: DraftIssueCode,
  path: readonly (string | number)[],
  message: string,
): DraftIssue {
  return { path: path.map(String), message, code, severity: DRAFT_ISSUE_SEVERITY[code] };
}

export function isRecord(value: unknown): value is DraftFields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The value at `path` inside `root`, or `undefined` once the path leaves the
 * data. Used to tell a schema failure caused by `null` from any other.
 */
export function valueAt(root: unknown, path: readonly PropertyKey[]): unknown {
  let node: unknown = root;
  for (const segment of path) {
    if (typeof node !== 'object' || node === null) {
      return undefined;
    }
    node = (node as Record<PropertyKey, unknown>)[segment];
  }
  return node;
}

/**
 * Whether a schema issue is the schema refusing an empty value: a `null`, or an
 * `undefined` entry in a list, which JSON writes as `null`. `validateDraft`
 * reports each such refusal as `null_not_allowed`, so a check leaves them to it.
 *
 * It reads the issue's `input`, so parse with `{ reportInput: true }`. The input
 * is the value the failing check was given. A refinement on a whole object that
 * reports at one of its fields carries the object, so a rule that points at an
 * empty field keeps its own code and message. A discriminated union with no
 * member for its discriminator is the one refusal reported with the object as
 * its input.
 */
export function refusesEmpty(root: unknown, schemaIssue: SchemaIssue): boolean {
  const { path } = schemaIssue;
  const value = valueAt(root, path);
  const index = path.at(-1);
  const list = valueAt(root, path.slice(0, -1));
  const empty =
    value === null ||
    (value === undefined &&
      typeof index === 'number' &&
      Array.isArray(list) &&
      index < list.length);
  return empty && (schemaIssue.input === value || schemaIssue.code === 'invalid_union');
}

/** Absent or `null`: a field nobody has set. */
export function isUnset(value: unknown): boolean {
  return value === undefined || value === null;
}

/**
 * Not written yet: absent, `null`, or a string holding nothing but whitespace.
 *
 * Whitespace counts as unwritten even where the schema accepts it — a title of
 * `" "` is a valid string and an unfinished question. So does the empty string
 * a `<select>` placeholder hands over for a field that must be chosen. A value
 * of any other type is left to the schema, which reports it as `invalid`.
 */
export function isUnwritten(value: unknown): boolean {
  return isUnset(value) || (typeof value === 'string' && value.trim() === '');
}

/** An id with nothing in it. Whitespace is an id the schema accepts, so it is one here too. */
export function isMissingId(value: unknown): boolean {
  return isUnset(value) || value === '';
}

/**
 * A whole number JavaScript holds exactly — what the schemas' `.int()` accepts.
 * `2 ** 53` is a whole number, and the schemas refuse it.
 */
export function isWholeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

/** A whole number above what JavaScript holds exactly, so that a message can say so. */
export function isTooLarge(value: unknown): boolean {
  return typeof value === 'number' && value > Number.MAX_SAFE_INTEGER && Number.isInteger(value);
}

/**
 * The envelope, `id` and `title`, which every built-in activity has, and which
 * lead its issues. `schemaVersion` and `type` identify the payload rather than
 * say anything an author wrote, so a wrong or missing one is `invalid`.
 */
export function checkIdentity(draft: DraftFields, type: string): DraftIssue[] {
  const issues: DraftIssue[] = [];
  if (draft.schemaVersion !== '1.0') {
    issues.push(
      issue(
        'schema_version_invalid',
        ['schemaVersion'],
        'The draft must have schemaVersion "1.0". A draft from createDraft has it.',
      ),
    );
  }
  if (draft.type !== type) {
    issues.push(issue('type_mismatch', ['type'], `The draft's type must be "${type}".`));
  }
  if (isMissingId(draft.id)) {
    issues.push(issue('id_required', ['id'], 'The activity has no id.'));
  }
  if (isUnwritten(draft.title)) {
    issues.push(issue('title_required', ['title'], 'Add a title.'));
  }
  return issues;
}

/** `scoringStrategy`, which both synchronously scored built-ins require. */
export function checkScoringStrategy(draft: DraftFields): DraftIssue[] {
  return isUnwritten(draft.scoringStrategy)
    ? [
        issue(
          'scoring_strategy_required',
          ['scoringStrategy'],
          'Choose how the question is scored.',
        ),
      ]
    : [];
}

const DIFFICULTY_LEVELS: readonly unknown[] = [1, 2, 3, 4, 5];

/**
 * The optional fields every built-in activity shares, checked after its own
 * fields. A `null` in any of them is left to `validateDraft`, which reports
 * `null_not_allowed` for every type alike.
 */
export function checkSharedOptional(draft: DraftFields): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const threshold = draft.passThreshold;
  if (!isUnset(threshold) && !(typeof threshold === 'number' && threshold >= 0 && threshold <= 1)) {
    issues.push(
      issue(
        'pass_threshold_invalid',
        ['passThreshold'],
        'The pass threshold must be a number from 0 to 1.',
      ),
    );
  }
  if (!isUnset(draft.difficultyLevel) && !DIFFICULTY_LEVELS.includes(draft.difficultyLevel)) {
    issues.push(
      issue(
        'difficulty_level_invalid',
        ['difficultyLevel'],
        'The difficulty level must be a whole number from 1 to 5.',
      ),
    );
  }
  const feedback = draft.feedback;
  if (isRecord(feedback)) {
    for (const key of ['correct', 'incorrect'] as const) {
      const message = feedback[key];
      if (typeof message === 'string' && message.trim() === '') {
        issues.push(
          issue('feedback_empty', ['feedback', key], 'Write this feedback message, or remove it.'),
        );
      }
    }
  }
  // What `redact()` produces for a learner. Its answer key is gone, and the
  // components refuse it outright in `practice`, so it is never a draft.
  if (draft.redacted === true) {
    issues.push(
      issue(
        'redacted_data',
        ['redacted'],
        'This is a copy prepared for learners, with the answer key removed. Edit the original activity instead.',
      ),
    );
  }
  if (isRecord(draft.media)) {
    issues.push(...checkMedia(draft.media));
  }
  return issues;
}

const URL_POLICY =
  'Use an https:, http:, data: or blob: address, or a path on the same site that starts with a single "/".';
const EMBED_URL =
  "An embed needs the provider's full http(s) embed address, such as https://www.youtube.com/embed/VIDEO_ID.";

/**
 * Media, checked through `MediaSchema` itself, so the URL and playback rules
 * live in one place. What this adds is the split: a kind, an address or a
 * description nobody has given yet is `incomplete`; one that is given and
 * refused is `invalid`.
 */
function checkMedia(media: DraftFields): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const parsed = MediaSchema.safeParse(media, { reportInput: true });
  // A refused `null` inside the media block is `validateDraft`'s to report, as
  // `null_not_allowed` — unless a check below reads it as a field not set yet.
  const schemaIssues = parsed.success
    ? []
    : parsed.error.issues.filter((found) => !refusesEmpty(media, found));
  const refusal = (field: string) => schemaIssues.find((found) => found.path[0] === field);

  const typeUnset = isUnwritten(media.type);
  if (typeUnset) {
    issues.push(
      issue('media_type_required', ['media', 'type'], 'Choose what kind of media this is.'),
    );
  }

  if (isUnwritten(media.url)) {
    issues.push(
      issue('media_url_required', ['media', 'url'], 'Add the address of the media file.'),
    );
  } else {
    const refused = refusal('url');
    if (refused !== undefined) {
      // The only refinement on `url` is the embed rule; every other refusal is
      // the address policy itself, which zod reports only as "Invalid input".
      issues.push(
        issue(
          'media_url_invalid',
          ['media', 'url'],
          refused.code === 'custom' ? EMBED_URL : URL_POLICY,
        ),
      );
    }
  }

  const needsAlt = media.type === 'image' || media.type === 'embed';
  const alt = media.alt;
  if ((needsAlt && isUnwritten(alt)) || (typeof alt === 'string' && alt.trim() === '')) {
    issues.push(
      issue('media_alt_required', ['media', 'alt'], 'Add a text description of the media.'),
    );
  }

  const captions = media.captionsUrl;
  if (typeof captions === 'string' && captions.trim() === '') {
    // Optional, and left blank: unfinished, as a blank description is.
    issues.push(
      issue(
        'media_url_required',
        ['media', 'captionsUrl'],
        'Add the address of the captions file, or remove the captions.',
      ),
    );
  } else if (refusal('captionsUrl') !== undefined) {
    issues.push(issue('media_url_invalid', ['media', 'captionsUrl'], URL_POLICY));
  }

  for (const schemaIssue of schemaIssues) {
    const field = schemaIssue.path[0];
    if (
      field === 'url' ||
      field === 'alt' ||
      field === 'captionsUrl' ||
      (field === 'type' && typeUnset)
    ) {
      continue;
    }
    issues.push(
      issue(
        field === 'playback' ? 'media_playback_invalid' : 'media_invalid',
        ['media', ...schemaIssue.path.map(String)],
        schemaIssue.message,
      ),
    );
  }
  return issues;
}
