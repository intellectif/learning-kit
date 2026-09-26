import type { ItemFinding, ItemFindingSeverity } from '../types/authoring.js';

/**
 * Every finding code the SDK's item critic can report, with its severity.
 *
 * As with draft issues, a code's severity is part of its contract, fixed here
 * once; `docs/authoring.md` documents this table and a test holds the two
 * together. The rule behind a code is advice, and may be refined in a minor.
 */
export const ITEM_FINDING_SEVERITY = {
  // multiple-choice
  mc_title_reveals_answer: 'warning',
  mc_options_duplicate: 'warning',
  mc_key_longest: 'warning',
  mc_every_option_correct: 'warning',
  mc_above_option_shuffled: 'warning',
  mc_above_option: 'advice',
  // fill-in-the-blanks
  fib_title_reveals_answer: 'warning',
  fib_hint_reveals_answer: 'warning',
  fib_answer_in_passage: 'warning',
  fib_accepted_answer_redundant: 'advice',
  // gap-select
  gs_title_reveals_answer: 'warning',
  gs_choices_duplicate: 'warning',
  gs_bank_no_distractor: 'warning',
  gs_answer_in_passage: 'warning',
  // written-response
  wr_criterion_name_duplicate: 'warning',
  // read-aloud
  ra_text_long_for_time: 'warning',
  // a set of items: a quiz, or an item group's items
  set_key_position_same: 'warning',
} as const satisfies Readonly<Record<string, ItemFindingSeverity>>;

export type ItemFindingCode = keyof typeof ITEM_FINDING_SEVERITY;

export function finding(
  code: ItemFindingCode,
  path: readonly (string | number)[],
  message: string,
): ItemFinding {
  return { path: path.map(String), message, code, severity: ITEM_FINDING_SEVERITY[code] };
}

/**
 * A finding as `critiqueDraft` reports it: a documented code carries its
 * documented severity, whichever check reports it; any other code keeps
 * `advice` only when it says so, and is otherwise a `warning` — a misspelled
 * severity is shown, not hidden. Path segments become strings.
 */
export function normaliseFinding(found: ItemFinding): ItemFinding {
  const documented = Object.hasOwn(ITEM_FINDING_SEVERITY, found.code)
    ? ITEM_FINDING_SEVERITY[found.code as ItemFindingCode]
    : undefined;
  return {
    ...found,
    path: found.path.map(String),
    severity: documented ?? (found.severity === 'advice' ? 'advice' : 'warning'),
  };
}
