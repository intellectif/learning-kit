import type { ActivityTypeAuthoring } from '../registry/registry.js';
import { PLACEHOLDER_RE } from '../schemas/fill-in-the-blanks.js';
import type { GapSelectData } from '../types/activity.js';
import type { DraftIssue } from '../types/authoring.js';
import { critiqueGapSelect } from './critique.js';
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

/** Mirrors `GapSelectChoiceSchema` arrays: `.min(2)` on both a gap's own list and a bank. */
const MIN_CHOICES = 2;

/**
 * Draft support for `gap-select`.
 *
 * A new draft is an empty passage with no gaps, like fill-in-the-blanks, and
 * `scoringStrategy` starts at `all-or-nothing`: partial credit is the author's
 * to give.
 *
 * The one thing this type must never do is pre-select a correct choice. A gap
 * whose `correctChoiceId` already points at the first option lets an author
 * write four plausible choices, never open the correctness control, and hold a
 * `complete` question whose answer key is whatever happened to be listed first.
 * `correctChoiceId` therefore starts unwritten and the draft stays `incomplete`
 * until somebody says which choice is right — the same rule multiple-choice
 * follows for `isCorrect`.
 */
export const gapSelectAuthoring: ActivityTypeAuthoring<GapSelectData> = {
  createDraft: ({ newId }) => ({
    schemaVersion: '1.0',
    type: 'gap-select',
    id: newId(),
    title: '',
    passage: '',
    gaps: [],
    scoringStrategy: 'all-or-nothing',
  }),
  checkDraft: checkGapSelectDraft,
  critique: critiqueGapSelect,
};

function checkGapSelectDraft(draft: DraftFields): DraftIssue[] {
  const issues = checkIdentity(draft, 'gap-select');
  const passage = draft.passage;
  if (isUnwritten(passage)) {
    issues.push(issue('gs_passage_required', ['passage'], 'Write the passage.'));
  }
  issues.push(...checkScoringStrategy(draft));

  if (!isUnset(draft.presentation) && draft.presentation !== 'dropdown') {
    issues.push(
      issue(
        'gs_presentation_invalid',
        ['presentation'],
        'The only presentation is "dropdown". Leave it out unless you mean to set it.',
      ),
    );
  }

  const banks = isUnset(draft.banks) ? [] : draft.banks;
  const bankIds = new Set<string>();
  if (Array.isArray(banks)) {
    issues.push(...checkBanks(banks, bankIds));
  }

  const gaps = isUnset(draft.gaps) ? [] : draft.gaps;
  const gapIds: string[] = [];
  if (Array.isArray(gaps)) {
    if (gaps.length === 0) {
      issues.push(
        issue(
          'gs_gaps_required',
          ['gaps'],
          'Add at least one gap, and mark where it goes in the passage with {{id}}.',
        ),
      );
    }
    issues.push(...checkGaps(gaps, banks, bankIds, gapIds));
    // An unwritten passage is already reported; pairing every gap against it
    // would only restate that each one is missing.
    if (typeof passage === 'string' && passage.trim() !== '') {
      issues.push(...checkPairing(passage, gaps, gapIds));
    }
  }

  issues.push(...checkSharedOptional(draft));
  return issues;
}

/** The shared word banks. Reported at `banks`, where the schema reports their uniqueness rule. */
function checkBanks(banks: readonly unknown[], bankIds: Set<string>): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const repeated = new Set<string>();
  for (const [index, bank] of banks.entries()) {
    if (!isRecord(bank)) {
      continue;
    }
    if (isMissingId(bank.id)) {
      issues.push(
        issue('gs_bank_id_required', ['banks', index, 'id'], `Word bank ${index + 1} has no id.`),
      );
    } else if (typeof bank.id === 'string') {
      if (bankIds.has(bank.id)) {
        repeated.add(bank.id);
      }
      bankIds.add(bank.id);
    }
    const name = typeof bank.id === 'string' && bank.id !== '' ? `"${bank.id}"` : index + 1;
    issues.push(...checkChoiceList(bank.choices, ['banks', index, 'choices'], `word bank ${name}`));
  }
  for (const id of repeated) {
    issues.push(
      issue('gs_bank_id_duplicate', ['banks'], `More than one word bank has the id "${id}".`),
    );
  }
  return issues;
}

/**
 * Every gap. The rules the schema states over the whole array — a duplicate id,
 * a missing or doubled choice source, an unknown bank, an answer key naming a
 * choice the gap does not offer — are reported at `gaps`, because that is where
 * the schema reports them and an issue deeper inside would account for the
 * schema's failure while saying something narrower than it.
 */
function checkGaps(
  gaps: readonly unknown[],
  banks: unknown,
  bankIds: ReadonlySet<string>,
  gapIds: string[],
): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const atGaps: DraftIssue[] = [];
  const repeated = new Set<string>();
  const seen = new Set<string>();

  for (const [index, gap] of gaps.entries()) {
    if (!isRecord(gap)) {
      continue;
    }
    const ordinal = index + 1;
    const name = typeof gap.id === 'string' && gap.id !== '' ? `"${gap.id}"` : ordinal;

    if (isMissingId(gap.id)) {
      issues.push(issue('gs_gap_id_required', ['gaps', index, 'id'], `Gap ${ordinal} has no id.`));
    } else if (typeof gap.id === 'string') {
      if (seen.has(gap.id)) {
        repeated.add(gap.id);
      }
      seen.add(gap.id);
      gapIds.push(gap.id);
    }

    const hasOwn = !isUnset(gap.choices);
    const hasBank = !isUnwritten(gap.bankId);
    // A `bankId` left blank is the bank selector still on its placeholder. The
    // schema refuses an empty string AT the field, so this is reported there —
    // an issue at `gaps` would not account for it, and zod's own diagnostic
    // would stand beside ours and call an unfinished gap a broken one.
    const bankBlank = typeof gap.bankId === 'string' && gap.bankId.trim() === '';
    if (bankBlank) {
      issues.push(
        issue(
          'gs_choice_source_required',
          ['gaps', index, 'bankId'],
          `Choose a word bank for gap ${name}, or remove the empty field.`,
        ),
      );
    } else if (hasOwn && hasBank) {
      atGaps.push(
        issue(
          'gs_choice_source_conflict',
          ['gaps'],
          `Gap ${name} has both its own choices and a word bank. Use one or the other.`,
        ),
      );
    } else if (!hasOwn && !hasBank) {
      atGaps.push(
        issue(
          'gs_choice_source_required',
          ['gaps'],
          `Give gap ${name} a list of choices, or point it at a word bank.`,
        ),
      );
    }

    if (hasBank && typeof gap.bankId === 'string' && !bankIds.has(gap.bankId)) {
      atGaps.push(
        issue(
          'gs_bank_unknown',
          ['gaps'],
          `Gap ${name} uses the word bank "${gap.bankId}", which does not exist.`,
        ),
      );
    }

    // Checked whenever the list is PRESENT, even alongside a `bankId` the gap
    // should not also have: the schema validates the array either way, so
    // skipping it while the conflict is reported left the schema's own
    // complaint about a too-short list standing on its own.
    if (hasOwn) {
      issues.push(...checkChoiceList(gap.choices, ['gaps', index, 'choices'], `gap ${name}`));
    }

    issues.push(...checkAnswerKey(gap, index, name, banks, bankIds));
  }

  for (const id of repeated) {
    atGaps.push(issue('gs_gap_id_duplicate', ['gaps'], `More than one gap has the id "${id}".`));
  }
  return [...issues, ...atGaps];
}

/** A gap's answer key, against the choices it actually offers. */
function checkAnswerKey(
  gap: Readonly<Record<string, unknown>>,
  index: number,
  name: string | number,
  banks: unknown,
  bankIds: ReadonlySet<string>,
): DraftIssue[] {
  const key = gap.correctChoiceId;
  if (isUnwritten(key)) {
    // At the field, not at `gaps`: the schema requires `correctChoiceId` and
    // reports a missing one HERE, and an issue at `gaps` accounts only for
    // failures AT `gaps` — never for one deeper inside it. Reported at the
    // array, this left zod's raw `invalid_type` standing beside it and made an
    // answer key nobody had chosen yet read as a broken draft.
    return [
      issue(
        'gs_correct_choice_required',
        ['gaps', index, 'correctChoiceId'],
        `Mark the correct choice for gap ${name}.`,
      ),
    ];
  }
  if (typeof key !== 'string') {
    // A value of another type is the schema's to refuse.
    return [];
  }
  const choices = resolveChoices(gap, banks, bankIds);
  if (choices === undefined) {
    // The source is missing, doubled or unknown — already reported, and there is
    // no list to check the key against.
    return [];
  }
  const offered = choices.some((choice) => isRecord(choice) && choice.id === key);
  return offered
    ? []
    : [
        issue(
          'gs_correct_choice_unknown',
          ['gaps'],
          `Gap ${name} is marked correct on "${key}", which is not one of its choices.`,
        ),
      ];
}

/** The choices a gap resolves to, or `undefined` when its source is unusable. */
function resolveChoices(
  gap: Readonly<Record<string, unknown>>,
  banks: unknown,
  bankIds: ReadonlySet<string>,
): readonly unknown[] | undefined {
  const hasOwn = !isUnset(gap.choices);
  const hasBank = !isUnwritten(gap.bankId);
  if (hasOwn === hasBank) {
    return undefined;
  }
  if (hasOwn) {
    return Array.isArray(gap.choices) ? gap.choices : undefined;
  }
  if (typeof gap.bankId !== 'string' || !bankIds.has(gap.bankId) || !Array.isArray(banks)) {
    return undefined;
  }
  const bank = banks.find((entry) => isRecord(entry) && entry.id === gap.bankId);
  return isRecord(bank) && Array.isArray(bank.choices) ? bank.choices : undefined;
}

/** One list of choices — a gap's own or a bank's. Both carry the same rules. */
function checkChoiceList(
  choices: unknown,
  path: readonly (string | number)[],
  owner: string,
): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const list = isUnset(choices) ? [] : choices;
  if (!Array.isArray(list)) {
    return issues;
  }
  if (list.length < MIN_CHOICES) {
    issues.push(
      issue(
        'gs_choices_too_few',
        path,
        `Give ${owner} at least ${MIN_CHOICES} choices to pick from.`,
      ),
    );
  }
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const [index, choice] of list.entries()) {
    if (!isRecord(choice)) {
      continue;
    }
    if (isMissingId(choice.id)) {
      issues.push(
        issue('gs_choice_id_required', [...path, index, 'id'], `Choice ${index + 1} has no id.`),
      );
    } else if (typeof choice.id === 'string') {
      if (seen.has(choice.id)) {
        repeated.add(choice.id);
      }
      seen.add(choice.id);
    }
    if (isUnwritten(choice.text)) {
      issues.push(
        issue(
          'gs_choice_text_required',
          [...path, index, 'text'],
          `Write the text of choice ${index + 1}.`,
        ),
      );
    }
  }
  for (const id of repeated) {
    issues.push(issue('gs_choice_id_duplicate', path, `More than one choice has the id "${id}".`));
  }
  return issues;
}

/**
 * The passage and the gaps, paired one to one. Reported at `passage`, which is
 * where the schema reports its pairing rule — the same split fill-in-the-blanks
 * uses: something still to write is `incomplete`, something writing more cannot
 * fix is `invalid`.
 */
function checkPairing(
  passage: string,
  gaps: readonly unknown[],
  gapIds: readonly string[],
): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const placeholders = new Map<string, number>();
  for (const match of passage.matchAll(PLACEHOLDER_RE)) {
    const id = match[1] as string;
    placeholders.set(id, (placeholders.get(id) ?? 0) + 1);
  }
  const ids = new Set(gapIds);

  for (const [id, count] of placeholders) {
    if (count > 1) {
      issues.push(
        issue(
          'gs_placeholder_duplicate',
          ['passage'],
          `{{${id}}} appears more than once in the passage. Each gap goes in one place.`,
        ),
      );
    }
    if (!ids.has(id)) {
      issues.push(
        issue(
          'gs_gap_missing',
          ['passage'],
          `The passage has {{${id}}}, but there is no gap with that id.`,
        ),
      );
    }
  }
  for (const id of ids) {
    if (!placeholders.has(id)) {
      issues.push(
        issue(
          'gs_placeholder_missing',
          ['passage'],
          `Gap "${id}" is not in the passage. Put {{${id}}} where it goes.`,
        ),
      );
    }
  }

  // The schema's pairing rule stated as the schema states it, for a break none
  // of the codes above names — a gap with no usable id beside correct ones.
  if (issues.length === 0 && !pairsOneToOne(placeholders, gaps)) {
    issues.push(
      issue(
        'gs_gaps_mismatch',
        ['passage'],
        'The gaps and the {{id}} placeholders in the passage do not pair up one to one.',
      ),
    );
  }
  return issues;
}

function pairsOneToOne(placeholders: ReadonlyMap<string, number>, gaps: readonly unknown[]) {
  const ids = gaps.filter(isRecord).map((gap) => gap.id);
  if (new Set(ids).size !== ids.length || placeholders.size !== ids.length) {
    return false;
  }
  return ids.every((id) => typeof id === 'string' && placeholders.get(id) === 1);
}
