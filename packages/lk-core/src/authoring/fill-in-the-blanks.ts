import type { ActivityTypeAuthoring } from '../registry/registry.js';
import { PLACEHOLDER_RE, TextMatchPolicySchema } from '../schemas/fill-in-the-blanks.js';
import type { FillInTheBlanksData } from '../types/activity.js';
import type { DraftIssue } from '../types/authoring.js';
import {
  checkIdentity,
  checkScoringStrategy,
  checkSharedOptional,
  type DraftFields,
  isMissingId,
  isRecord,
  issue,
  isTooLarge,
  isUnset,
  isUnwritten,
  isWholeNumber,
  refusesEmpty,
} from './issues.js';

/**
 * Draft support for `fill-in-the-blanks`.
 *
 * A new draft has an empty passage and no blanks, and `scoringStrategy` starts
 * at `all-or-nothing`, as for multiple choice: partial credit is the author's
 * call.
 *
 * The passage and the blanks must pair up one to one. When they do not, the
 * issue says which way. A placeholder with no blank, or a blank with no
 * placeholder, is something still to be written (`incomplete`). The same
 * placeholder twice, or two blanks sharing an id, cannot be fixed by writing
 * more (`invalid`). All of them are reported at `passage`, which is where the
 * schema reports the pairing.
 */
export const fillInTheBlanksAuthoring: ActivityTypeAuthoring<FillInTheBlanksData> = {
  createDraft: ({ newId }) => ({
    schemaVersion: '1.0',
    type: 'fill-in-the-blanks',
    id: newId(),
    title: '',
    passage: '',
    blanks: [],
    scoringStrategy: 'all-or-nothing',
  }),
  checkDraft: checkFillInTheBlanksDraft,
};

function checkFillInTheBlanksDraft(draft: DraftFields): DraftIssue[] {
  const issues = checkIdentity(draft, 'fill-in-the-blanks');
  const passage = draft.passage;
  if (isUnwritten(passage)) {
    issues.push(issue('fib_passage_required', ['passage'], 'Write the passage.'));
  }
  issues.push(...checkScoringStrategy(draft));

  const blanks = isUnset(draft.blanks) ? [] : draft.blanks;
  if (Array.isArray(blanks)) {
    if (blanks.length === 0) {
      issues.push(
        issue(
          'fib_blanks_required',
          ['blanks'],
          'Add at least one blank, and mark where it goes in the passage with {{id}}.',
        ),
      );
    }
    const ids: string[] = [];
    for (const [index, blank] of blanks.entries()) {
      if (!isRecord(blank)) {
        continue;
      }
      const name = typeof blank.id === 'string' && blank.id !== '' ? `"${blank.id}"` : index + 1;
      if (isMissingId(blank.id)) {
        issues.push(
          issue('fib_blank_id_required', ['blanks', index, 'id'], `Blank ${index + 1} has no id.`),
        );
      } else if (typeof blank.id === 'string') {
        ids.push(blank.id);
      }

      const answers = isUnset(blank.acceptedAnswers) ? [] : blank.acceptedAnswers;
      if (Array.isArray(answers)) {
        if (answers.length === 0) {
          issues.push(
            issue(
              'fib_accepted_answers_required',
              ['blanks', index, 'acceptedAnswers'],
              `Add an accepted answer for blank ${name}.`,
            ),
          );
        }
        for (const [position, answer] of answers.entries()) {
          // A `null` entry is `validateDraft`'s to report, as `null_not_allowed`.
          if (typeof answer === 'string' && answer.trim() === '') {
            issues.push(
              issue(
                'fib_accepted_answer_empty',
                ['blanks', index, 'acceptedAnswers', position],
                `An accepted answer for blank ${name} is empty. Fill it in or remove it.`,
              ),
            );
          }
        }
      }

      if (isRecord(blank.match)) {
        issues.push(...checkMatch(blank.match, index));
      }
    }
    // An unwritten passage is already reported, and pairing blanks against it
    // would only restate that every blank is missing from it.
    if (typeof passage === 'string' && passage.trim() !== '') {
      issues.push(...checkPairing(passage, blanks, ids));
    }
  }

  issues.push(...checkSharedOptional(draft));
  return issues;
}

/**
 * A blank's matching tolerances, checked through `TextMatchPolicySchema` so its
 * rules live in one place, plus the one thing the schema cannot see: a locale
 * the runtime refuses. `matchText` hands a non-empty `locale` to
 * `toLocaleLowerCase`, which throws on a tag that is not a language tag, so a
 * draft holding one would be "complete" and still crash the moment it was
 * scored.
 */
function checkMatch(match: Readonly<Record<string, unknown>>, index: number): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const at = (...rest: (string | number)[]) => ['blanks', index, 'match', ...rest];

  const tolerance = match.levenshtein;
  if (!isUnset(tolerance) && !(isWholeNumber(tolerance) && tolerance >= 0)) {
    issues.push(
      issue(
        'fib_levenshtein_invalid',
        at('levenshtein'),
        isTooLarge(tolerance)
          ? 'Typo tolerance is too large.'
          : 'Typo tolerance must be a whole number, 0 or more.',
      ),
    );
  }

  const locale = match.locale;
  if (typeof locale === 'string' && locale !== '' && !isLanguageTag(locale)) {
    issues.push(
      issue(
        'fib_match_locale_invalid',
        at('locale'),
        `"${locale}" is not a language tag. Use one such as "tr" or "en-US", or leave the locale out.`,
      ),
    );
  }

  const parsed = TextMatchPolicySchema.safeParse(match, { reportInput: true });
  if (!parsed.success) {
    for (const schemaIssue of parsed.error.issues) {
      // `levenshtein` has its own code above, and a refused `null` is
      // `validateDraft`'s to report, as `null_not_allowed`.
      if (schemaIssue.path[0] === 'levenshtein' || refusesEmpty(match, schemaIssue)) {
        continue;
      }
      issues.push(
        issue('fib_match_invalid', at(...schemaIssue.path.map(String)), schemaIssue.message),
      );
    }
  }
  return issues;
}

/** Whether the runtime accepts `tag` as a language tag — the same test `toLocaleLowerCase` applies. */
function isLanguageTag(tag: string): boolean {
  try {
    Intl.getCanonicalLocales(tag);
    return true;
  } catch {
    return false;
  }
}

function checkPairing(passage: string, blanks: readonly unknown[], ids: readonly string[]) {
  const issues: DraftIssue[] = [];
  const placeholders = new Map<string, number>();
  for (const match of passage.matchAll(PLACEHOLDER_RE)) {
    const id = match[1] as string;
    placeholders.set(id, (placeholders.get(id) ?? 0) + 1);
  }
  const blankIds = new Map<string, number>();
  for (const id of ids) {
    blankIds.set(id, (blankIds.get(id) ?? 0) + 1);
  }

  for (const [id, count] of blankIds) {
    if (count > 1) {
      issues.push(
        issue('fib_blank_id_duplicate', ['passage'], `More than one blank has the id "${id}".`),
      );
    }
  }
  for (const [id, count] of placeholders) {
    if (count > 1) {
      issues.push(
        issue(
          'fib_placeholder_duplicate',
          ['passage'],
          `{{${id}}} appears more than once in the passage. Each blank goes in one place.`,
        ),
      );
    }
    if (!blankIds.has(id)) {
      issues.push(
        issue(
          'fib_blank_missing',
          ['passage'],
          `The passage has {{${id}}}, but there is no blank with that id.`,
        ),
      );
    }
  }
  for (const id of blankIds.keys()) {
    if (!placeholders.has(id)) {
      issues.push(
        issue(
          'fib_placeholder_missing',
          ['passage'],
          `Blank "${id}" is not in the passage. Put {{${id}}} where it goes.`,
        ),
      );
    }
  }

  // The schema's own pairing rule, stated exactly as the schema states it. Each
  // code above is one specific way of breaking it. If it is broken in a way none
  // of them names — a blank with no usable id, for one — this says so, rather
  // than leaving the schema's message to be reported as a second failure.
  if (issues.length === 0 && !pairsOneToOne(placeholders, blanks)) {
    issues.push(
      issue(
        'fib_blanks_mismatch',
        ['passage'],
        'The blanks and the {{id}} placeholders in the passage do not pair up one to one.',
      ),
    );
  }
  return issues;
}

/**
 * `FillInTheBlanksDataSchema`'s pairing refinement, over a draft's raw blanks.
 * An entry that is not an object is reported on its own, and the schema never
 * reaches its refinement past one, so it takes no part in the pairing.
 */
function pairsOneToOne(placeholders: ReadonlyMap<string, number>, blanks: readonly unknown[]) {
  const blankIds = blanks.filter(isRecord).map((blank) => blank.id);
  if (new Set(blankIds).size !== blankIds.length) {
    return false;
  }
  if (placeholders.size !== blankIds.length) {
    return false;
  }
  return blankIds.every((id) => typeof id === 'string' && placeholders.get(id) === 1);
}
