import {
  containsWords,
  fold,
  isShort,
  numberedPassage,
  passageWithoutPlaceholders,
  placeholderOrder,
  revealsAnswer,
} from '../answer-leak.js';
import { countWords } from '../count-words.js';
import { policyFor } from '../scoring/activity-scorers/fill-in-the-blanks.js';
import { matchText } from '../scoring/text-match.js';
import type { BlankConfig } from '../types/activity.js';
import type { ItemFinding } from '../types/authoring.js';
import { finding } from './findings.js';
import { type DraftFields, isRecord, isUnwritten } from './issues.js';

/**
 * The built-in item critic: what an experienced item writer points out on
 * review, as far as a rule can see it without a model.
 *
 * Every rule reads a draft, finished or not: it looks only at the fields that
 * are there, never throws, and never judges what `validateDraft` already
 * judges. A finding is advice about a valid item — see `ItemFindingSeverity`.
 */

// ── Shared ─────────────────────────────────────────────────────────────

/** A string with something written in it, or `undefined`. */
const written = (value: unknown): string | undefined =>
  typeof value === 'string' && !isUnwritten(value) ? value : undefined;

/** A text as the leak check reads it: folded words, joined. */
const folded = (text: string): string => fold(text).join(' ');

/** A list field, or none. */
const listOf = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

/** Code points, the unit a learner sees, of a text without its outer spacing. */
const lengthOf = (text: string): number => [...text.trim()].length;

const ordinal = (index: number): number => index + 1;

/**
 * Pairs of entries in a list whose texts fold alike, each reported once, at the
 * later entry. `textOf` returns `undefined` for an entry to leave out.
 */
function duplicates(
  entries: readonly unknown[],
  textOf: (entry: unknown) => string | undefined,
): { first: number; second: number }[] {
  const seen = new Map<string, number>();
  const pairs: { first: number; second: number }[] = [];
  entries.forEach((entry, index) => {
    const text = textOf(entry);
    if (text === undefined) {
      return;
    }
    const key = folded(text);
    if (key === '') {
      return;
    }
    const first = seen.get(key);
    if (first === undefined) {
      seen.set(key, index);
    } else {
      pairs.push({ first, second: index });
    }
  });
  return pairs;
}

/**
 * Whether a passage, its gaps taken out, prints `answer` as whole words. An
 * answer of one short word ("is", "26") is not looked for: a passage is full
 * of them.
 */
function printedIn(passage: string, answer: string): boolean {
  const needle = fold(answer);
  return (
    needle.length > 0 &&
    !isShort(needle) &&
    containsWords(fold(passageWithoutPlaceholders(passage)), needle)
  );
}

// ── Multiple choice ────────────────────────────────────────────────────

/**
 * An option that points at the others by where they stand: "all of the
 * above", "both A and C". Shuffling moves them, and the option then points at
 * options that are not above it, or not A and C. Matched on folded text.
 */
const POSITIONAL =
  /(^| )(the above|las anteriores|los anteriores|as anteriores|os anteriores|[a-h] (and|or|y|o|e|ou) [a-h])( |$)/;

/**
 * "All of the above" and "none of the above": the options item-writing
 * guidelines advise against. A learner who recognises two right options can
 * pick "all of the above" without knowing the third, and "none of the above"
 * tests only that a learner knows what is wrong.
 */
const AGGREGATE =
  /(^| )(all of the above|none of the above|todas las anteriores|ninguna de las anteriores|todas as anteriores|nenhuma das anteriores)( |$)/;

/** How much longer than every other option the right one must be for the length to give it away. */
const KEY_LONGEST_RATIO = 1.5;
const KEY_LONGEST_MARGIN = 10;

export function critiqueMultipleChoice(draft: DraftFields): ItemFinding[] {
  const findings: ItemFinding[] = [];
  const options = listOf(draft.options);
  const texts = options.map((option) => (isRecord(option) ? written(option.text) : undefined));
  const correct = options.map((option) => isRecord(option) && option.isCorrect === true);
  const hasMedia = options.map((option) => isRecord(option) && option.media !== undefined);

  const title = written(draft.title);
  const revealed = options.findIndex(
    (_, index) =>
      correct[index] === true &&
      title !== undefined &&
      texts[index] !== undefined &&
      revealsAnswer(title, texts[index]),
  );
  if (revealed !== -1) {
    findings.push(
      finding(
        'mc_title_reveals_answer',
        ['title'],
        `The title, which the learner sees, contains the right answer ("${texts[revealed]}").`,
      ),
    );
  }

  for (const { first, second } of duplicates(options, (option) =>
    isRecord(option) && option.media === undefined ? written(option.text) : undefined,
  )) {
    findings.push(
      finding(
        'mc_options_duplicate',
        ['options', second, 'text'],
        `Options ${ordinal(first)} and ${ordinal(second)} read the same, so a learner cannot tell them apart.`,
      ),
    );
  }

  const keys = correct.flatMap((isKey, index) => (isKey ? [index] : []));
  if (
    draft.mode === 'single' &&
    options.length >= 3 &&
    keys.length === 1 &&
    texts.every((text) => text !== undefined) &&
    !hasMedia.some(Boolean)
  ) {
    const key = keys[0] as number;
    const keyLength = lengthOf(texts[key] as string);
    const longestOther = Math.max(
      ...texts.flatMap((text, index) => (index === key ? [] : [lengthOf(text as string)])),
    );
    if (
      keyLength >= longestOther * KEY_LONGEST_RATIO &&
      keyLength - longestOther >= KEY_LONGEST_MARGIN
    ) {
      findings.push(
        finding(
          'mc_key_longest',
          ['options', key, 'text'],
          'The right option is much longer than every other, and a test-wise learner picks the longest. Bring the options to a similar length.',
        ),
      );
    }
  }

  if (draft.mode === 'multi' && options.length >= 2 && correct.every(Boolean)) {
    findings.push(
      finding(
        'mc_every_option_correct',
        ['options'],
        'Every option is correct, so a learner who selects them all scores full marks without reading them.',
      ),
    );
  }

  texts.forEach((text, index) => {
    if (text === undefined) {
      return;
    }
    const words = folded(text);
    if (draft.shuffle === true && POSITIONAL.test(words)) {
      findings.push(
        finding(
          'mc_above_option_shuffled',
          ['options', index, 'text'],
          `Option ${ordinal(index)} points at other options by position, and this question shuffles them: after shuffling it points at the wrong ones.`,
        ),
      );
    } else if (AGGREGATE.test(words)) {
      findings.push(
        finding(
          'mc_above_option',
          ['options', index, 'text'],
          `Option ${ordinal(index)} is "all" or "none of the above". A learner who spots two right options can choose "all" without knowing the rest; "none" tests only what is wrong.`,
        ),
      );
    }
  });

  return findings;
}

// ── Fill in the blanks ─────────────────────────────────────────────────

/**
 * Whether the scorer already treats `later` as `earlier`: the blank's own
 * policy with typo tolerance taken out, since two answers within a typo of each
 * other still accept different inputs.
 */
function redundantUnder(blank: DraftFields, earlier: string, later: string): boolean {
  try {
    const { levenshtein: _typos, ...policy } = policyFor(blank as unknown as BlankConfig);
    return matchText(later, earlier, policy).matched;
  } catch {
    // A policy the draft checks already refuse (an unknown locale, say): the
    // matcher cannot say, and this is not the place to report it.
    return false;
  }
}

export function critiqueFillInTheBlanks(draft: DraftFields): ItemFinding[] {
  const findings: ItemFinding[] = [];
  const passage = typeof draft.passage === 'string' ? draft.passage : '';
  const numbered = numberedPassage(passage);
  const order = placeholderOrder(passage);
  const blanks = listOf(draft.blanks);

  const answersOf = (blank: unknown): string[] =>
    isRecord(blank) ? listOf(blank.acceptedAnswers).flatMap((answer) => written(answer) ?? []) : [];
  const positionOf = (blank: unknown): number | undefined => {
    const at = isRecord(blank) && typeof blank.id === 'string' ? order.indexOf(blank.id) : -1;
    return at === -1 ? undefined : at + 1;
  };

  const title = written(draft.title);
  if (
    title !== undefined &&
    blanks.some((blank) =>
      answersOf(blank).some((answer) => revealsAnswer(title, answer, numbered, positionOf(blank))),
    )
  ) {
    findings.push(
      finding(
        'fib_title_reveals_answer',
        ['title'],
        'The title, which the learner sees, contains an answer to a blank.',
      ),
    );
  }

  blanks.forEach((blank, index) => {
    if (!isRecord(blank)) {
      return;
    }
    const answers = answersOf(blank);
    const hint = written(blank.hint);
    if (
      hint !== undefined &&
      answers.some((answer) => revealsAnswer(hint, answer, numbered, positionOf(blank)))
    ) {
      findings.push(
        finding(
          'fib_hint_reveals_answer',
          ['blanks', index, 'hint'],
          `The hint for blank ${ordinal(index)} contains its answer.`,
        ),
      );
    }

    const accepted = listOf(blank.acceptedAnswers);
    const printed = accepted.findIndex((answer) => {
      const text = written(answer);
      return text !== undefined && printedIn(passage, text);
    });
    if (printed !== -1) {
      findings.push(
        finding(
          'fib_answer_in_passage',
          ['blanks', index, 'acceptedAnswers', printed],
          `The passage prints "${accepted[printed]}", an answer to blank ${ordinal(index)}, where the learner can copy it.`,
        ),
      );
    }

    accepted.forEach((later, laterIndex) => {
      const laterText = written(later);
      if (laterText === undefined) {
        return;
      }
      const earlier = accepted.slice(0, laterIndex).findIndex((candidate) => {
        const text = written(candidate);
        return text !== undefined && redundantUnder(blank, text, laterText);
      });
      if (earlier !== -1) {
        findings.push(
          finding(
            'fib_accepted_answer_redundant',
            ['blanks', index, 'acceptedAnswers', laterIndex],
            `"${laterText}" is already accepted as "${accepted[earlier]}" under this blank's matching.`,
          ),
        );
      }
    });
  });

  return findings;
}

// ── Gap select ─────────────────────────────────────────────────────────

export function critiqueGapSelect(draft: DraftFields): ItemFinding[] {
  const findings: ItemFinding[] = [];
  const passage = typeof draft.passage === 'string' ? draft.passage : '';
  const numbered = numberedPassage(passage);
  const order = placeholderOrder(passage);
  const gaps = listOf(draft.gaps);
  const banks = listOf(draft.banks);
  const choiceText = (choice: unknown): string | undefined =>
    isRecord(choice) ? written(choice.text) : undefined;

  const choicesOf = (gap: DraftFields): readonly unknown[] => {
    if (Array.isArray(gap.choices)) {
      return gap.choices;
    }
    const bank = banks.find((candidate) => isRecord(candidate) && candidate.id === gap.bankId);
    return isRecord(bank) ? listOf(bank.choices) : [];
  };
  const answerOf = (gap: DraftFields): string | undefined =>
    choiceText(
      choicesOf(gap).find((choice) => isRecord(choice) && choice.id === gap.correctChoiceId),
    );
  const positionOf = (gap: DraftFields): number | undefined => {
    const at = typeof gap.id === 'string' ? order.indexOf(gap.id) : -1;
    return at === -1 ? undefined : at + 1;
  };

  const title = written(draft.title);
  if (
    title !== undefined &&
    gaps.some((gap) => {
      if (!isRecord(gap)) {
        return false;
      }
      const answer = answerOf(gap);
      return answer !== undefined && revealsAnswer(title, answer, numbered, positionOf(gap));
    })
  ) {
    findings.push(
      finding(
        'gs_title_reveals_answer',
        ['title'],
        'The title, which the learner sees, contains the answer to a gap.',
      ),
    );
  }

  const reportDuplicates = (choices: readonly unknown[], path: (string | number)[]): void => {
    for (const { first, second } of duplicates(choices, choiceText)) {
      findings.push(
        finding(
          'gs_choices_duplicate',
          [...path, 'choices', second, 'text'],
          `Choices ${ordinal(first)} and ${ordinal(second)} read the same, so a learner cannot tell them apart.`,
        ),
      );
    }
  };

  gaps.forEach((gap, index) => {
    if (!isRecord(gap)) {
      return;
    }
    if (Array.isArray(gap.choices)) {
      reportDuplicates(gap.choices, ['gaps', index]);
    }
    const answer = answerOf(gap);
    if (answer !== undefined && printedIn(passage, answer)) {
      findings.push(
        finding(
          'gs_answer_in_passage',
          ['gaps', index, 'correctChoiceId'],
          `The passage prints "${answer}", the answer to gap ${ordinal(index)}.`,
        ),
      );
    }
  });

  banks.forEach((bank, index) => {
    if (!isRecord(bank)) {
      return;
    }
    const choices = listOf(bank.choices);
    reportDuplicates(choices, ['banks', index]);
    const drawnOn = gaps.filter((gap) => isRecord(gap) && gap.bankId === bank.id).length;
    if (drawnOn >= 2 && choices.length <= drawnOn) {
      findings.push(
        finding(
          'gs_bank_no_distractor',
          ['banks', index, 'choices'],
          `This bank offers ${choices.length} choices to ${drawnOn} gaps, so the last gap is answered by elimination. Add a choice that answers no gap.`,
        ),
      );
    }
  });

  return findings;
}

// ── Written response ───────────────────────────────────────────────────

export function critiqueWrittenResponse(draft: DraftFields): ItemFinding[] {
  const rubric = isRecord(draft.rubric) ? draft.rubric : undefined;
  const criteria = rubric === undefined ? [] : listOf(rubric.criteria);
  return duplicates(criteria, (criterion) =>
    isRecord(criterion) ? written(criterion.name) : undefined,
  ).map(({ first, second }) =>
    finding(
      'wr_criterion_name_duplicate',
      ['rubric', 'criteria', second, 'name'],
      `Criteria ${ordinal(first)} and ${ordinal(second)} have the same name. Feedback and grades name a criterion, so one of them cannot be told apart.`,
    ),
  );
}

// ── Read aloud ─────────────────────────────────────────────────────────

/** 150 words a minute: a fluent adult reading aloud. A learner is slower. */
const WORDS_PER_SECOND = 2.5;

export function critiqueReadAloud(draft: DraftFields): ItemFinding[] {
  const text = written(draft.referenceText);
  const recording = isRecord(draft.recording) ? draft.recording : undefined;
  const maxSeconds = recording?.maxSeconds;
  if (text === undefined || typeof maxSeconds !== 'number' || !(maxSeconds > 0)) {
    return [];
  }
  const words = countWords(text);
  if (words / maxSeconds <= WORDS_PER_SECOND) {
    return [];
  }
  return [
    finding(
      'ra_text_long_for_time',
      ['recording', 'maxSeconds'],
      `${words} words in ${maxSeconds} seconds is faster than a fluent reader reads aloud (${WORDS_PER_SECOND} words a second). Allow at least ${Math.ceil(words / WORDS_PER_SECOND)} seconds, or shorten the text.`,
    ),
  ];
}

// ── A set of items ─────────────────────────────────────────────────────

/** How many single-answer questions must share one key position before it reads as a habit. */
const KEY_POSITION_MINIMUM = 4;

/**
 * Whether every single-answer multiple-choice question in a set that does not
 * shuffle puts its right option in the same place — the author's habit, and a
 * learner's easiest guess. At least four questions, so chance alone is rare.
 */
export function keyPositionFinding(
  items: readonly unknown[],
  path: readonly (string | number)[],
): ItemFinding[] {
  const positions = items.flatMap((item) => {
    if (
      !isRecord(item) ||
      item.type !== 'multiple-choice' ||
      item.mode !== 'single' ||
      item.shuffle === true
    ) {
      return [];
    }
    const keys = listOf(item.options).flatMap((option, index) =>
      isRecord(option) && option.isCorrect === true ? [index] : [],
    );
    return keys.length === 1 ? keys : [];
  });
  if (positions.length < KEY_POSITION_MINIMUM || !positions.every((at) => at === positions[0])) {
    return [];
  }
  return [
    finding(
      'set_key_position_same',
      path,
      `In all ${positions.length} single-answer questions the right option is option ${ordinal(positions[0] as number)}. Vary its position, or shuffle the options.`,
    ),
  ];
}
