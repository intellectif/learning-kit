import type { ActivityTypeAuthoring } from '../registry/registry.js';
import type { MultipleChoiceData } from '../types/activity.js';
import type { DraftIssue } from '../types/authoring.js';
import {
  checkIdentity,
  checkScoringStrategy,
  checkSharedOptional,
  type DraftFields,
  isMissingId,
  isRecord,
  issue,
  isUnset,
  isUnwritten,
} from './issues.js';

/** Mirrors `MultipleChoiceDataSchema`: `options` is `.min(2).max(26)`. */
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 26;

/**
 * Draft support for `multiple-choice`.
 *
 * A new draft has two empty options and NO option marked correct. Pre-marking
 * one is the obvious convenience, and it is a trap: an author writes both
 * options, never touches the correctness control, and holds a `complete`
 * question whose answer key is whichever option happened to be marked by
 * default. Leaving it unmarked keeps the question `incomplete` until somebody
 * says which answer is right.
 *
 * `scoringStrategy` starts at `all-or-nothing`, the less generous strategy:
 * partial credit is something an author chooses to give.
 */
export const multipleChoiceAuthoring: ActivityTypeAuthoring<MultipleChoiceData> = {
  createDraft: ({ newId }) => ({
    schemaVersion: '1.0',
    type: 'multiple-choice',
    id: newId(),
    title: '',
    question: '',
    mode: 'single',
    scoringStrategy: 'all-or-nothing',
    options: [
      { id: newId(), text: '', isCorrect: false },
      { id: newId(), text: '', isCorrect: false },
    ],
  }),
  checkDraft: checkMultipleChoiceDraft,
};

function checkMultipleChoiceDraft(draft: DraftFields): DraftIssue[] {
  const issues = checkIdentity(draft, 'multiple-choice');
  if (isUnwritten(draft.question)) {
    issues.push(issue('mc_question_required', ['question'], 'Write the question.'));
  }
  if (isUnwritten(draft.mode)) {
    issues.push(
      issue('mc_mode_required', ['mode'], 'Choose whether learners select one option or several.'),
    );
  }
  issues.push(...checkScoringStrategy(draft));

  const options = isUnset(draft.options) ? [] : draft.options;
  if (Array.isArray(options)) {
    // Every option-set rule is reported at `options`, where the schema reports
    // its refinements, so none of them is repeated as a second failure.
    if (options.length < MIN_OPTIONS) {
      issues.push(issue('mc_options_too_few', ['options'], 'Add at least two options.'));
    }
    if (options.length > MAX_OPTIONS) {
      issues.push(
        issue('mc_options_too_many', ['options'], `Use no more than ${MAX_OPTIONS} options.`),
      );
    }
    const seen = new Set<string>();
    const repeated = new Set<string>();
    let correct = 0;
    for (const [index, option] of options.entries()) {
      if (!isRecord(option)) {
        continue;
      }
      const ordinal = index + 1;
      if (isMissingId(option.id)) {
        issues.push(
          issue('mc_option_id_required', ['options', index, 'id'], `Option ${ordinal} has no id.`),
        );
      } else if (typeof option.id === 'string') {
        if (seen.has(option.id)) {
          repeated.add(option.id);
        }
        seen.add(option.id);
      }
      if (isUnwritten(option.text)) {
        issues.push(
          issue(
            'mc_option_text_required',
            ['options', index, 'text'],
            `Write the text of option ${ordinal}.`,
          ),
        );
      }
      // The schema requires the flag on every option. An editor that has not
      // asked yet — or one that stores only the options marked correct — leaves
      // it unset, which is a decision still to make, not a wrong one.
      if (isUnset(option.isCorrect)) {
        issues.push(
          issue(
            'mc_option_correctness_required',
            ['options', index, 'isCorrect'],
            `Say whether option ${ordinal} is correct.`,
          ),
        );
      }
      if (option.isCorrect === true) {
        correct += 1;
      }
    }
    for (const id of repeated) {
      issues.push(
        issue('mc_option_id_duplicate', ['options'], `More than one option has the id "${id}".`),
      );
    }
    if (correct === 0) {
      issues.push(
        issue(
          'mc_correct_option_required',
          ['options'],
          draft.mode === 'multi'
            ? 'Mark at least one option as correct.'
            : 'Mark the correct option.',
        ),
      );
    } else if (draft.mode === 'single' && correct > 1) {
      issues.push(
        issue(
          'mc_single_mode_one_correct',
          ['options'],
          'Only one option can be marked correct when learners select one option.',
        ),
      );
    }
  }

  issues.push(...checkSharedOptional(draft));
  return issues;
}
