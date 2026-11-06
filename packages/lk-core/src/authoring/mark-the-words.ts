import { containsWords, fold, isShort } from '../answer-leak.js';
import {
  MARK_THE_WORDS_MAX_WORDS,
  type MarkableWord,
  markableWords,
  resolveMarkTarget,
  wordKey,
} from '../mark-the-words.js';
import type { ActivityTypeAuthoring } from '../registry/registry.js';
import type { MarkTheWordsData } from '../types/activity.js';
import type { DraftIssue, ItemFinding } from '../types/authoring.js';
import { finding } from './findings.js';
import {
  checkIdentity,
  checkScoringStrategy,
  checkSharedOptional,
  type DraftFields,
  isRecord,
  issue,
  isUnset,
  isUnwritten,
} from './issues.js';

/**
 * Draft support for `mark-the-words`.
 *
 * A new draft has an empty text and no targets, and `scoringStrategy` starts
 * at `all-or-nothing`, as on every built-in. An editor usually lets the author
 * click the words to mark; `markTheWordsFromMarkup` turns starred text into
 * the same `text` and `targets`.
 */
export const markTheWordsAuthoring: ActivityTypeAuthoring<MarkTheWordsData> = {
  createDraft: ({ newId }) => ({
    schemaVersion: '1.0',
    type: 'mark-the-words',
    id: newId(),
    title: '',
    text: '',
    targets: [],
    scoringStrategy: 'all-or-nothing',
  }),
  checkDraft: checkMarkTheWordsDraft,
  critique: critiqueMarkTheWords,
};

/** The words of a draft's text, or `null` when there is no usable text to resolve targets in. */
function wordsOf(draft: DraftFields): MarkableWord[] | null {
  if (typeof draft.text !== 'string') {
    return null;
  }
  const words = markableWords(draft.text);
  return words.length === 0 || words.length > MARK_THE_WORDS_MAX_WORDS ? null : words;
}

function checkMarkTheWordsDraft(draft: DraftFields): DraftIssue[] {
  const issues = checkIdentity(draft, 'mark-the-words');
  issues.push(...checkScoringStrategy(draft));

  const text = draft.text;
  if (isUnwritten(text)) {
    issues.push(issue('mw_text_required', ['text'], 'Write the text the learner marks words in.'));
  } else if (typeof text === 'string') {
    const count = markableWords(text).length;
    if (count === 0) {
      issues.push(
        issue('mw_text_required', ['text'], 'The text has no word to mark yet. Write it out.'),
      );
    } else if (count > MARK_THE_WORDS_MAX_WORDS) {
      issues.push(
        issue(
          'mw_text_too_long',
          ['text'],
          `The text has ${count} words; at most ${MARK_THE_WORDS_MAX_WORDS} can be marked in. Split it.`,
        ),
      );
    }
  }

  const targets = isUnset(draft.targets) ? [] : draft.targets;
  if (Array.isArray(targets)) {
    if (targets.length === 0) {
      issues.push(issue('mw_targets_required', ['targets'], 'Choose at least one word to mark.'));
    }
    issues.push(...checkTargets(targets, wordsOf(draft)));
  }

  issues.push(...checkSharedOptional(draft));
  return issues;
}

/**
 * Every target, each at its own path, where the schema reports it. Against
 * the text only when the text is usable: an unwritten one is already
 * reported, and every target would only restate that it is not found.
 */
function checkTargets(targets: readonly unknown[], words: MarkableWord[] | null): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const owner = new Map<number, number>();
  for (const [index, target] of targets.entries()) {
    if (!isRecord(target)) {
      continue;
    }
    const ordinal = index + 1;
    const occurrence = target.occurrence;
    const occurrenceWellFormed =
      isUnset(occurrence) ||
      (typeof occurrence === 'number' && Number.isInteger(occurrence) && occurrence >= 1);
    if (!occurrenceWellFormed) {
      issues.push(
        issue(
          'mw_target_occurrence_invalid',
          ['targets', index, 'occurrence'],
          `Target ${ordinal}'s appearance must be a whole number from 1, or left out.`,
        ),
      );
    }
    if (isUnwritten(target.text)) {
      issues.push(
        issue(
          'mw_target_text_required',
          ['targets', index, 'text'],
          `Write the word or words target ${ordinal} marks.`,
        ),
      );
      continue;
    }
    if (typeof target.text !== 'string' || words === null || !occurrenceWellFormed) {
      continue;
    }
    const found = resolveMarkTarget(words, {
      text: target.text,
      ...(isUnset(occurrence) ? {} : { occurrence }),
    });
    if (!found.ok) {
      issues.push(targetProblem(found.problem, found.found, index, target.text));
      continue;
    }
    if (found.indices.some((word) => owner.has(word))) {
      issues.push(
        issue(
          'mw_target_overlap',
          ['targets', index],
          `Target ${ordinal} shares a word with target ${(owner.get(found.indices.find((word) => owner.has(word)) as number) as number) + 1}. A word belongs to one target at most.`,
        ),
      );
      continue;
    }
    for (const word of found.indices) {
      owner.set(word, index);
    }
  }
  return issues;
}

function targetProblem(
  problem: 'no-words' | 'not-found' | 'ambiguous' | 'no-such-occurrence',
  count: number,
  index: number,
  text: string,
): DraftIssue {
  const ordinal = index + 1;
  switch (problem) {
    case 'no-words':
      return issue(
        'mw_target_no_words',
        ['targets', index, 'text'],
        `Target ${ordinal} has no word in it: punctuation alone cannot be marked.`,
      );
    case 'not-found':
      return issue(
        'mw_target_not_found',
        ['targets', index, 'text'],
        `"${text}" is not in the text as whole words. Copy it from the text, with the same capitals and accents.`,
      );
    case 'ambiguous':
      return issue(
        'mw_target_ambiguous',
        ['targets', index, 'text'],
        `"${text}" appears ${count} times in the text. Say which one target ${ordinal} is, with its appearance (1 to ${count}).`,
      );
    case 'no-such-occurrence':
      return issue(
        'mw_target_occurrence_invalid',
        ['targets', index, 'occurrence'],
        `"${text}" appears ${count === 1 ? 'once' : `${count} times`} in the text, so it has no such appearance.`,
      );
  }
}

// ── Critic ──────────────────────────────────────────────────────────────

/** Whether `text` writes out `answer` as whole words — a short answer never counts. */
function writesOut(text: string, answer: string): boolean {
  const needle = fold(answer);
  return needle.length > 0 && !isShort(needle) && containsWords(fold(text), needle);
}

export function critiqueMarkTheWords(draft: DraftFields): ItemFinding[] {
  const findings: ItemFinding[] = [];
  const words = wordsOf(draft);
  const targets = Array.isArray(draft.targets) ? draft.targets : [];
  if (words === null) {
    return findings;
  }
  const keys = words.map((word) => wordKey(word.text));
  const resolved = targets.map((target) => {
    if (!isRecord(target) || typeof target.text !== 'string') {
      return null;
    }
    const found = resolveMarkTarget(words, {
      text: target.text,
      ...(typeof target.occurrence === 'number' ? { occurrence: target.occurrence } : {}),
    });
    return found.ok ? found.indices : null;
  });
  const marked = new Set(resolved.flatMap((indices) => indices ?? []));

  const title = typeof draft.title === 'string' ? draft.title : '';
  if (
    resolved.some(
      (indices) =>
        indices !== null &&
        writesOut(title, indices.map((word) => (words[word] as MarkableWord).text).join(' ')),
    )
  ) {
    findings.push(
      finding(
        'mw_title_reveals_answer',
        ['title'],
        'The title, which the learner sees, contains a word to mark.',
      ),
    );
  }

  if (marked.size > 0 && marked.size * 2 > words.length) {
    const everything = Math.round(((2 * marked.size - words.length) / marked.size) * 100);
    findings.push(
      finding(
        'mw_targets_dense',
        ['targets'],
        `${marked.size} of the text's ${words.length} words are to be marked, so a learner who marks every word scores ${everything}%. Mark fewer, or use a longer text.`,
      ),
    );
  }

  resolved.forEach((indices, index) => {
    if (indices === null) {
      return;
    }
    const needle = indices.map((word) => keys[word]);
    for (let at = 0; at + needle.length <= keys.length; at += 1) {
      const same = needle.every((key, offset) => keys[at + offset] === key);
      if (same && !indices.includes(at) && !marked.has(at)) {
        findings.push(
          finding(
            'mw_target_elsewhere',
            ['targets', index],
            `"${needle.length === 1 ? (words[indices[0] as number] as MarkableWord).text : indices.map((word) => (words[word] as MarkableWord).text).join(' ')}" also appears where it is not to be marked. A learner who marks it there loses a mark: check that is meant.`,
          ),
        );
        return;
      }
    }
  });

  return findings;
}
