import type { ActivityTypeAuthoring } from '../registry/registry.js';
import { labelKey } from '../schemas/matching.js';
import type { MatchingData } from '../types/activity.js';
import type { DraftIssue } from '../types/authoring.js';
import { critiqueMatching } from './critique.js';
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

/** Mirrors `MatchingDataSchema`: `options.min(2)`. */
const MIN_OPTIONS = 2;

const OPTION_USES: readonly unknown[] = ['once', 'many'];

/**
 * Draft support for `matching`.
 *
 * A new draft has no prompts and no options, and `scoringStrategy` starts at
 * `all-or-nothing`, as on every built-in: partial credit is the author's to
 * give — though an exam's matching task is marked prompt by prompt, so one
 * copied from a paper wants `partial`.
 *
 * As in gap-select, no answer is pre-selected: a prompt's `correctOptionId`
 * starts unwritten, and the draft stays `incomplete` until someone says which
 * option answers each prompt.
 */
export const matchingAuthoring: ActivityTypeAuthoring<MatchingData> = {
  createDraft: ({ newId }) => ({
    schemaVersion: '1.0',
    type: 'matching',
    id: newId(),
    title: '',
    prompts: [],
    options: [],
    scoringStrategy: 'all-or-nothing',
  }),
  checkDraft: checkMatchingDraft,
  critique: critiqueMatching,
};

function checkMatchingDraft(draft: DraftFields): DraftIssue[] {
  const issues = checkIdentity(draft, 'matching');
  issues.push(...checkScoringStrategy(draft));

  if (!isUnset(draft.optionUse) && !OPTION_USES.includes(draft.optionUse)) {
    issues.push(
      issue(
        'mt_option_use_invalid',
        ['optionUse'],
        'Say whether each option is used "once" or "many" times, or leave it out for "many".',
      ),
    );
  }

  const options = isUnset(draft.options) ? [] : draft.options;
  const optionIds = new Set<string>();
  if (Array.isArray(options)) {
    issues.push(...checkOptions(options, optionIds));
  }

  const prompts = isUnset(draft.prompts) ? [] : draft.prompts;
  if (Array.isArray(prompts)) {
    issues.push(...checkPrompts(prompts, optionIds, draft.optionUse === 'once'));
  }

  issues.push(...checkSharedOptional(draft));
  return issues;
}

/**
 * The shared list. Its uniqueness rules are reported at `options`, where the
 * schema reports them; what is missing from one option, at that option.
 */
function checkOptions(options: readonly unknown[], optionIds: Set<string>): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const atOptions: DraftIssue[] = [];
  if (options.length < MIN_OPTIONS) {
    issues.push(
      issue(
        'mt_options_too_few',
        ['options'],
        `Add at least ${MIN_OPTIONS} options to the list the prompts are matched with.`,
      ),
    );
  }
  const repeatedIds = new Set<string>();
  const labels = new Map<string, string>();
  const repeatedLabels = new Set<string>();

  for (const [index, option] of options.entries()) {
    if (!isRecord(option)) {
      continue;
    }
    const ordinal = index + 1;
    if (isMissingId(option.id)) {
      issues.push(
        issue('mt_option_id_required', ['options', index, 'id'], `Option ${ordinal} has no id.`),
      );
    } else if (typeof option.id === 'string') {
      if (optionIds.has(option.id)) {
        repeatedIds.add(option.id);
      }
      optionIds.add(option.id);
    }
    if (isUnwritten(option.text)) {
      issues.push(
        issue(
          'mt_option_text_required',
          ['options', index, 'text'],
          `Write the text of option ${ordinal}.`,
        ),
      );
    }
    if (typeof option.label === 'string' && option.label.trim() === '') {
      // A blank label is a label field nobody filled in yet. The schema
      // refuses an empty one at the field, so it is reported there.
      issues.push(
        issue(
          'mt_option_label_required',
          ['options', index, 'label'],
          `Write the label of option ${ordinal}, such as "A" or "iv", or remove it.`,
        ),
      );
    } else if (typeof option.label === 'string') {
      const key = labelKey(option.label);
      if (labels.has(key)) {
        repeatedLabels.add(labels.get(key) as string);
      } else {
        labels.set(key, option.label.trim());
      }
    }
  }

  for (const id of repeatedIds) {
    atOptions.push(
      issue('mt_option_id_duplicate', ['options'], `More than one option has the id "${id}".`),
    );
  }
  for (const label of repeatedLabels) {
    atOptions.push(
      issue(
        'mt_option_label_duplicate',
        ['options'],
        `More than one option is labelled "${label}". Learners answer with the label, so each needs its own.`,
      ),
    );
  }
  return [...issues, ...atOptions];
}

/**
 * Every prompt. Its uniqueness rule and its answer key against the list are
 * reported at `prompts`, where the schema reports them; a missing id, text or
 * key, at the prompt's own field.
 */
function checkPrompts(
  prompts: readonly unknown[],
  optionIds: ReadonlySet<string>,
  once: boolean,
): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const atPrompts: DraftIssue[] = [];
  if (prompts.length === 0) {
    issues.push(
      issue('mt_prompts_required', ['prompts'], 'Add at least one prompt to match with an option.'),
    );
  }
  const seen = new Set<string>();
  const repeated = new Set<string>();
  // Option id → the prompts it answers, for `optionUse: 'once'`.
  const answering = new Map<string, string[]>();

  for (const [index, prompt] of prompts.entries()) {
    if (!isRecord(prompt)) {
      continue;
    }
    const ordinal = index + 1;
    const name = typeof prompt.id === 'string' && prompt.id !== '' ? `"${prompt.id}"` : ordinal;
    if (isMissingId(prompt.id)) {
      issues.push(
        issue('mt_prompt_id_required', ['prompts', index, 'id'], `Prompt ${ordinal} has no id.`),
      );
    } else if (typeof prompt.id === 'string') {
      if (seen.has(prompt.id)) {
        repeated.add(prompt.id);
      }
      seen.add(prompt.id);
    }
    if (isUnwritten(prompt.text)) {
      issues.push(
        issue(
          'mt_prompt_text_required',
          ['prompts', index, 'text'],
          `Write the text of prompt ${ordinal}.`,
        ),
      );
    }

    const key = prompt.correctOptionId;
    if (isUnwritten(key)) {
      issues.push(
        issue(
          'mt_correct_option_required',
          ['prompts', index, 'correctOptionId'],
          `Choose the option that answers prompt ${name}.`,
        ),
      );
    } else if (typeof key === 'string') {
      if (!optionIds.has(key)) {
        atPrompts.push(
          issue(
            'mt_correct_option_unknown',
            ['prompts'],
            `Prompt ${name} is answered by "${key}", which is not one of the options.`,
          ),
        );
      }
      answering.set(key, [...(answering.get(key) ?? []), String(name)]);
    }
  }

  for (const id of repeated) {
    atPrompts.push(
      issue('mt_prompt_id_duplicate', ['prompts'], `More than one prompt has the id "${id}".`),
    );
  }
  if (once) {
    for (const [optionId, names] of answering) {
      if (names.length > 1) {
        atPrompts.push(
          issue(
            'mt_option_reused',
            ['prompts'],
            `Option "${optionId}" answers prompts ${names.join(' and ')}, but each option is used once. Choose another answer, or let options be used more than once.`,
          ),
        );
      }
    }
  }
  return [...issues, ...atPrompts];
}
