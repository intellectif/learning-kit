import type { ActivityTypeAuthoring } from '../registry/registry.js';
import { levelKey } from '../rubric-levels.js';
import { SPEAKING_MEASURES } from '../schemas/speaking-response.js';
import { READ_ALOUD_MAX_SECONDS, READ_ALOUD_MAX_TAKES } from '../scoring/speech/limits.js';
import { CANONICAL_LOCALE_RE } from '../scoring/speech/locale.js';
import type { SpeakingResponseData } from '../types/activity.js';
import type { DraftIssue } from '../types/authoring.js';
import {
  checkIdentity,
  checkSharedOptional,
  type DraftFields,
  isRecord,
  issue,
  isUnset,
  isUnwritten,
  isWholeNumber,
} from './issues.js';

/**
 * Draft support for `speaking-response`.
 *
 * A new draft has no prompt, no locale, no recording time and a rubric with no
 * criteria: the length of an answer, its language and what it is graded on are
 * teaching decisions, and the SDK picks none of them. Each is reported
 * `incomplete` until it is set.
 *
 * Stricter than the schema in the places written-response is — a blank plain
 * prompt beside a rich one, a criterion named only with spaces, weights that
 * are all 0 or add up past what a number holds — and in the ones read-aloud
 * is: a locale that is not canonical, bounds outside their range.
 */
export const speakingResponseAuthoring: ActivityTypeAuthoring<SpeakingResponseData> = {
  createDraft: ({ newId }) => ({
    schemaVersion: '1.0',
    type: 'speaking-response',
    id: newId(),
    title: '',
    prompt: '',
    locale: '',
    recording: { maxSeconds: 0 },
    rubric: { criteria: [] },
  }),
  checkDraft: checkSpeakingResponseDraft,
};

function checkSpeakingResponseDraft(draft: DraftFields): DraftIssue[] {
  const issues = checkIdentity(draft, 'speaking-response');
  if (isUnwritten(draft.prompt)) {
    issues.push(
      issue(
        'sr_prompt_required',
        ['prompt'],
        isUnwritten(draft.promptHtml)
          ? 'Write the prompt the learner answers.'
          : 'Write the prompt as plain text too. The rich-text prompt is shown only where a sanitiser is supplied; the plain text is shown everywhere else.',
      ),
    );
  }
  issues.push(...checkLocale(draft.locale));
  issues.push(...checkRecording(draft.recording));
  issues.push(...checkRubric(draft.rubric));
  issues.push(...checkSharedOptional(draft));
  return issues;
}

function checkLocale(locale: unknown): DraftIssue[] {
  if (isUnwritten(locale)) {
    return [
      issue(
        'sr_locale_required',
        ['locale'],
        'Choose the language the learner answers in, with its region — "en-US", not "en".',
      ),
    ];
  }
  if (typeof locale !== 'string' || CANONICAL_LOCALE_RE.test(locale)) {
    return [];
  }
  return [
    issue(
      'sr_locale_invalid',
      ['locale'],
      'The language must be a BCP 47 tag in canonical form, with a region: "en-US", "es-419". Pronunciation is measured against one locale\'s speech.',
    ),
  ];
}

function checkRecording(recording: unknown): DraftIssue[] {
  const required = issue(
    'sr_max_seconds_required',
    ['recording', 'maxSeconds'],
    'Set how long an answer may be, in seconds.',
  );
  if (isUnset(recording)) {
    return [required];
  }
  if (!isRecord(recording)) {
    return [];
  }
  const issues: DraftIssue[] = [];
  const max = recording.maxSeconds;
  if (isUnset(max) || max === 0) {
    issues.push(required);
  } else if (
    typeof max === 'number' &&
    !(Number.isFinite(max) && max > 0 && max <= READ_ALOUD_MAX_SECONDS)
  ) {
    issues.push(
      issue(
        'sr_max_seconds_out_of_range',
        ['recording', 'maxSeconds'],
        `An answer is at most ${READ_ALOUD_MAX_SECONDS} seconds long.`,
      ),
    );
  }
  const min = recording.minSeconds;
  const minOut = (message: string) =>
    issue('sr_min_seconds_out_of_range', ['recording', 'minSeconds'], message);
  if (typeof min === 'number' && !(Number.isFinite(min) && min >= 0)) {
    issues.push(minOut('The shortest answer is a number of seconds, 0 or more.'));
  } else if (typeof min === 'number' && typeof max === 'number' && max > 0 && min >= max) {
    issues.push(minOut('The shortest answer must be shorter than the longest.'));
  }
  const takes = recording.maxTakes;
  if (
    typeof takes === 'number' &&
    !(isWholeNumber(takes) && takes >= 1 && takes <= READ_ALOUD_MAX_TAKES)
  ) {
    issues.push(
      issue(
        'sr_max_takes_out_of_range',
        ['recording', 'maxTakes'],
        `How many takes a learner may record is a whole number from 1 to ${READ_ALOUD_MAX_TAKES}.`,
      ),
    );
  }
  return issues;
}

const MEASURES: readonly unknown[] = SPEAKING_MEASURES;

function checkRubric(rubric: unknown): DraftIssue[] {
  if (isUnset(rubric)) {
    return [issue('sr_rubric_required', ['rubric'], 'Add the rubric the answer is graded on.')];
  }
  if (!isRecord(rubric)) {
    return [];
  }
  const criteria = isUnset(rubric.criteria) ? [] : rubric.criteria;
  if (!Array.isArray(criteria)) {
    return [];
  }
  if (criteria.length === 0) {
    return [
      issue(
        'sr_rubric_criteria_required',
        ['rubric', 'criteria'],
        'Add at least one rubric criterion: what the answer is graded on.',
      ),
    ];
  }
  const issues: DraftIssue[] = [];
  const names = new Set<string>();
  const measures = new Set<unknown>();
  let totalWeight = 0;
  let everyWeightUsable = true;
  for (const [index, criterion] of criteria.entries()) {
    if (!isRecord(criterion)) {
      everyWeightUsable = false;
      continue;
    }
    const ordinal = index + 1;
    const path = ['rubric', 'criteria', index];
    if (isUnwritten(criterion.name)) {
      issues.push(
        issue('sr_criterion_name_required', [...path, 'name'], `Name rubric criterion ${ordinal}.`),
      );
    } else if (typeof criterion.name === 'string') {
      const key = levelKey(criterion.name);
      if (names.has(key)) {
        issues.push(
          issue(
            'sr_criterion_name_duplicate',
            [...path, 'name'],
            `Another criterion is already called "${criterion.name}". A judgement names the criterion it scores, so names must differ.`,
          ),
        );
      }
      names.add(key);
    }
    const weight = criterion.weight;
    if (isUnset(weight)) {
      everyWeightUsable = false;
      issues.push(
        issue(
          'sr_criterion_weight_required',
          [...path, 'weight'],
          `Give rubric criterion ${ordinal} a weight.`,
        ),
      );
    } else if (!(typeof weight === 'number' && Number.isFinite(weight) && weight >= 0)) {
      everyWeightUsable = false;
      issues.push(
        issue(
          'sr_criterion_weight_invalid',
          [...path, 'weight'],
          'A rubric weight must be a number, 0 or more.',
        ),
      );
    } else {
      totalWeight += weight;
    }
    const measure = criterion.measure;
    if (measure !== undefined) {
      if (!MEASURES.includes(measure)) {
        issues.push(
          issue(
            'sr_criterion_measure_invalid',
            [...path, 'measure'],
            `A criterion is scored from ${SPEAKING_MEASURES.join(', ')}, or by the judge when it names no measure.`,
          ),
        );
      } else if (measures.has(measure)) {
        issues.push(
          issue(
            'sr_criterion_measure_duplicate',
            [...path, 'measure'],
            `Another criterion is already scored from ${String(measure)}: the engine reports it once, and two criteria scored from it would weigh it twice.`,
          ),
        );
      }
      measures.add(measure);
    }
  }
  if (everyWeightUsable && totalWeight === 0) {
    issues.push(
      issue(
        'sr_rubric_weights_zero',
        ['rubric', 'criteria'],
        'Give at least one rubric criterion a weight above 0. With every weight at 0, no weighted total can be computed.',
      ),
    );
  } else if (totalWeight === Number.POSITIVE_INFINITY) {
    issues.push(
      issue(
        'sr_rubric_weights_too_large',
        ['rubric', 'criteria'],
        'The rubric weights add up to more than can be calculated with. Use smaller weights.',
      ),
    );
  }
  return issues;
}
