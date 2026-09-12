import type { ActivityTypeAuthoring } from '../registry/registry.js';
import type { WrittenResponseData } from '../types/activity.js';
import type { DraftIssue } from '../types/authoring.js';
import {
  checkIdentity,
  checkSharedOptional,
  type DraftFields,
  isRecord,
  issue,
  isTooLarge,
  isUnset,
  isUnwritten,
  isWholeNumber,
} from './issues.js';

/**
 * Draft support for `written-response`.
 *
 * A new draft has no prompt, no rubric, `minWords: 0` and `maxWords: 0`. The
 * SDK picks no word limits and no rubric criteria: those are teaching decisions.
 *
 * - `minWords: 0` is a real setting — no lower limit, which `<WrittenResponse>`
 *   renders as "up to N words" — so it is never reported.
 * - `maxWords: 0` is not. The schema requires at least 1, and 0 is what a
 *   cleared number field produces, so it reads as "not set yet" (`incomplete`)
 *   rather than as a wrong value.
 *
 * Stricter than the schema in four places:
 *
 * - A blank `prompt` is `incomplete` even when `promptHtml` is set. The plain
 *   prompt is what `<WrittenResponse>` renders when no sanitiser is supplied, so
 *   a rich-text-only prompt shows the learner nothing there.
 * - A rubric criterion whose name is only whitespace is `incomplete`.
 * - A rubric whose weights are all 0 is `incomplete`: `gradeFromRubric` cannot
 *   compute a weighted total from them.
 * - A rubric whose weights add up to more than a number can hold is `invalid`,
 *   for the same reason.
 */
export const writtenResponseAuthoring: ActivityTypeAuthoring<WrittenResponseData> = {
  createDraft: ({ newId }) => ({
    schemaVersion: '1.0',
    type: 'written-response',
    id: newId(),
    title: '',
    prompt: '',
    minWords: 0,
    maxWords: 0,
  }),
  checkDraft: checkWrittenResponseDraft,
};

function checkWrittenResponseDraft(draft: DraftFields): DraftIssue[] {
  const issues = checkIdentity(draft, 'written-response');
  if (isUnwritten(draft.prompt)) {
    issues.push(
      issue(
        'wr_prompt_required',
        ['prompt'],
        isUnwritten(draft.promptHtml)
          ? 'Write the prompt.'
          : 'Write the prompt as plain text too. The rich-text prompt is shown only where a sanitiser is supplied; the plain text is shown everywhere else.',
      ),
    );
  }

  const min = draft.minWords;
  const max = draft.maxWords;
  if (isUnset(min)) {
    issues.push(
      issue(
        'wr_min_words_required',
        ['minWords'],
        'Set the minimum number of words. Use 0 for no minimum.',
      ),
    );
  } else if (!(isWholeNumber(min) && min >= 0)) {
    issues.push(
      issue(
        'wr_min_words_invalid',
        ['minWords'],
        isTooLarge(min)
          ? 'The minimum word count is too large.'
          : 'The minimum word count must be a whole number, 0 or more.',
      ),
    );
  }
  if (isUnset(max) || max === 0) {
    issues.push(issue('wr_max_words_required', ['maxWords'], 'Set the maximum number of words.'));
  } else if (!(isWholeNumber(max) && max >= 1)) {
    issues.push(
      issue(
        'wr_max_words_invalid',
        ['maxWords'],
        isTooLarge(max)
          ? 'The maximum word count is too large.'
          : 'The maximum word count must be a whole number, 1 or more.',
      ),
    );
  } else if (typeof min === 'number' && max < min) {
    // Reported at `maxWords`, where the schema reports the same rule.
    issues.push(
      issue(
        'wr_word_bounds_order',
        ['maxWords'],
        'The maximum word count cannot be lower than the minimum.',
      ),
    );
  }

  const rubric = draft.rubric;
  if (isRecord(rubric)) {
    const criteria = isUnset(rubric.criteria) ? [] : rubric.criteria;
    if (Array.isArray(criteria)) {
      issues.push(...checkCriteria(criteria));
    }
  }

  issues.push(...checkSharedOptional(draft));
  return issues;
}

function checkCriteria(criteria: readonly unknown[]): DraftIssue[] {
  const issues: DraftIssue[] = [];
  if (criteria.length === 0) {
    issues.push(
      issue(
        'wr_rubric_criteria_required',
        ['rubric', 'criteria'],
        'Add at least one rubric criterion, or remove the rubric.',
      ),
    );
    return issues;
  }
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
        issue('wr_criterion_name_required', [...path, 'name'], `Name rubric criterion ${ordinal}.`),
      );
    }
    const weight = criterion.weight;
    if (isUnset(weight)) {
      everyWeightUsable = false;
      issues.push(
        issue(
          'wr_criterion_weight_required',
          [...path, 'weight'],
          `Give rubric criterion ${ordinal} a weight.`,
        ),
      );
    } else if (!(typeof weight === 'number' && Number.isFinite(weight) && weight >= 0)) {
      everyWeightUsable = false;
      issues.push(
        issue(
          'wr_criterion_weight_invalid',
          [...path, 'weight'],
          'A rubric weight must be a number, 0 or more.',
        ),
      );
    } else {
      totalWeight += weight;
    }
  }
  if (everyWeightUsable && totalWeight === 0) {
    issues.push(
      issue(
        'wr_rubric_weights_zero',
        ['rubric', 'criteria'],
        'Give at least one rubric criterion a weight above 0. With every weight at 0, no weighted total can be computed.',
      ),
    );
  } else if (totalWeight === Number.POSITIVE_INFINITY) {
    // Each weight is finite, and their sum still overflows: `gradeFromRubric`
    // would divide by Infinity and produce no grade. No weight is negative, so
    // the sum stays overflowed whatever a weight not yet set turns out to be.
    issues.push(
      issue(
        'wr_rubric_weights_too_large',
        ['rubric', 'criteria'],
        'The rubric weights add up to more than can be calculated with. Use smaller weights.',
      ),
    );
  }
  return issues;
}
