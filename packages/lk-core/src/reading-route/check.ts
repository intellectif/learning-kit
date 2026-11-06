/**
 * The rules a reading route keeps, beyond its shape: every question of the
 * group has exactly one entry, every quote is in the passage once, the words
 * an author adds never give the answer away, and the strategy fits the item.
 *
 * One list of rules serves the stored schema (every rule refuses) and the
 * draft checks (each code with its own severity), so the two cannot drift.
 * Read defensively: drafts and redacted groups reach it as they are.
 */

import { containsWords, fold, numberedPassage, revealsAnswer } from '../answer-leak.js';
import { countWords } from '../count-words.js';
import { countParagraphs } from './layout.js';
import {
  acceptedAnswersOf,
  choicesOf,
  itemQuestions,
  learnerTextOf,
  partIdsOf,
  placeholderPosition,
  questionKey,
} from './questions.js';
import { containsPhrase, findQuote, quoteText } from './quotes.js';
import {
  isReadingRouteItemType,
  isRouteStrategyId,
  READING_ROUTE_ITEM_TYPES,
  ROUTE_NOTE_MAX_LENGTH,
  ROUTE_STRATEGIES,
} from './strategies.js';

/** The codes a route's rules report. Each one's severity is in `DRAFT_ISSUE_SEVERITY`. */
export type RouteIssueCode =
  | 'ig_route_stimulus_kind'
  | 'ig_route_body_required'
  /**
   * @deprecated Reported by 1.11.0 only, for a route in an interactive video,
   * which 1.12.0 allows: a video's reading quizzes. Never reported since;
   * kept so code that names it still compiles.
   */
  | 'ig_route_with_timeline'
  | 'ig_route_quiz_mixed'
  | 'ig_route_shuffle'
  | 'ig_route_item_type'
  | 'ig_route_question_item_unknown'
  | 'ig_route_question_part_required'
  | 'ig_route_question_part_unknown'
  | 'ig_route_question_part_not_allowed'
  | 'ig_route_question_duplicate'
  | 'ig_route_question_missing'
  | 'ig_route_strategy_required'
  | 'ig_route_strategy_unknown'
  | 'ig_route_strategy_item_type'
  | 'ig_route_evidence_required'
  | 'ig_route_quote_not_found'
  | 'ig_route_quote_ambiguous'
  | 'ig_route_keyword_not_in_question'
  | 'ig_route_trap_option_unknown'
  | 'ig_route_trap_on_answer'
  | 'ig_route_note_move_unknown'
  | 'ig_route_note_too_long'
  | 'ig_route_note_reveals_answer'
  | 'ig_route_word_limit_type'
  | 'ig_route_answer_over_limit'
  | 'ig_route_paragraph_labels'
  | 'ig_route_sections';

export interface RouteIssue {
  code: RouteIssueCode;
  path: (string | number)[];
  message: string;
}

type Fields = Record<string, unknown>;

const isFields = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const unset = (value: unknown): boolean =>
  value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/**
 * Whether an author's note gives a question's answer away. For a choice, a
 * note that names the right option and not every other one; naming them all —
 * "True if it agrees, False if it contradicts, Not Given if it is silent" — is
 * the rule, not the answer.
 */
function noteRevealsAnswer(item: unknown, partId: string | undefined, note: string): boolean {
  const accepted = acceptedAnswersOf(item, partId);
  if (accepted.length > 0) {
    const passage = numberedPassage(
      typeof (item as Fields).passage === 'string' ? ((item as Fields).passage as string) : '',
    );
    const position = placeholderPosition(item, partId);
    return accepted.some((answer) => revealsAnswer(note, answer, passage, position));
  }
  const choices = choicesOf(item, partId);
  const words = fold(note);
  const named = choices.filter((choice) => containsWords(words, fold(choice.text)));
  return named.some((choice) => choice.correct) && named.length < choices.length;
}

/**
 * The quizzes of an interactive video that are reading quizzes: every question
 * in them has a route entry. In practice the player opens each as a reading
 * route over the stimulus's text; in an exam or a review, as an ordinary quiz.
 * Empty for a group with no timeline or no route.
 */
export function readingQuizzes(group: unknown): string[] {
  if (!isFields(group) || !isFields(group.route) || !isFields(group.timeline)) {
    return [];
  }
  const routed = new Set(
    list(group.route.questions).flatMap((question) =>
      isFields(question) && typeof question.itemId === 'string' ? [question.itemId] : [],
    ),
  );
  return list(group.timeline.cues).flatMap((cue) => {
    if (!isFields(cue) || typeof cue.id !== 'string') {
      return [];
    }
    const ids = list(cue.itemIds);
    return ids.length > 0 && ids.every((id) => routed.has(id as string)) ? [cue.id] : [];
  });
}

/**
 * Every rule the route of `group` breaks. `scope: 'redacted'` checks only what
 * a learner's copy still carries: the evidence, key words, traps and notes are
 * gone from it.
 */
export function routeIssues(
  group: unknown,
  scope: 'content' | 'redacted' = 'content',
): RouteIssue[] {
  if (!isFields(group) || !isFields(group.route)) {
    return [];
  }
  const route = group.route;
  const issues: RouteIssue[] = [];
  const add = (code: RouteIssueCode, path: (string | number)[], message: string): void => {
    issues.push({ code, path, message });
  };

  const stimulus = isFields(group.stimulus) ? group.stimulus : undefined;
  const body = typeof stimulus?.body === 'string' ? stimulus.body : '';
  // In an interactive video the passage is the video stimulus's `body`, read in
  // the quizzes the route covers (see `readingQuizzes`).
  const timeline = isFields(group.timeline) ? group.timeline : undefined;
  const kinds = timeline === undefined ? ['text', 'mixed'] : ['text', 'mixed', 'video'];
  if (stimulus !== undefined && !unset(stimulus.kind) && !kinds.includes(stimulus.kind as string)) {
    add(
      'ig_route_stimulus_kind',
      ['stimulus', 'kind'],
      'A reading route needs a text to read: make the stimulus a text.',
    );
  } else if (stimulus !== undefined && body.trim() === '') {
    add(
      'ig_route_body_required',
      ['stimulus', 'body'],
      timeline === undefined
        ? 'Add the passage the questions are about.'
        : "Add the passage the video's reading quizzes are about, as the stimulus's text.",
    );
  }
  if (group.shuffle === 'within-group') {
    add(
      'ig_route_shuffle',
      ['shuffle'],
      'A reading route keeps its questions in paper order: many answers follow the order of the text.',
    );
  }

  const items = list(group.items);
  // In a video, only the items of its reading quizzes are the route's; the
  // other quizzes hold whatever a video may.
  const routed = new Set(
    list(route.questions).flatMap((question) =>
      isFields(question) && typeof question.itemId === 'string' ? [question.itemId] : [],
    ),
  );
  const covered = (itemId: unknown): boolean => {
    if (timeline === undefined) {
      return true;
    }
    return list(timeline.cues).some(
      (cue) =>
        isFields(cue) &&
        list(cue.itemIds).includes(itemId) &&
        list(cue.itemIds).some((id) => routed.has(id as string)),
    );
  };
  if (timeline !== undefined) {
    list(timeline.cues).forEach((cue, index) => {
      if (!isFields(cue)) {
        return;
      }
      const ids = list(cue.itemIds);
      const inRoute = ids.filter((id) => routed.has(id as string)).length;
      if (inRoute > 0 && inRoute < ids.length) {
        add(
          'ig_route_quiz_mixed',
          ['timeline', 'cues', index, 'itemIds'],
          'A quiz is a reading quiz when the route covers all of its questions, or an ordinary one when it covers none.',
        );
      }
    });
  }
  items.forEach((item, index) => {
    if (
      isFields(item) &&
      !unset(item.type) &&
      !isReadingRouteItemType(item.type) &&
      covered(item.id)
    ) {
      add(
        'ig_route_item_type',
        ['items', index, 'type'],
        `A reading route holds ${READING_ROUTE_ITEM_TYPES.join(', ')} questions; "${String(item.type)}" is not one of them.`,
      );
    }
  });
  const itemsById = new Map<string, unknown>();
  for (const item of items) {
    if (isFields(item) && typeof item.id === 'string') {
      itemsById.set(item.id, item);
    }
  }

  if (body !== '' && route.paragraphLabels !== undefined) {
    const paragraphs = countParagraphs(body);
    if (!Array.isArray(route.paragraphLabels) || route.paragraphLabels.length !== paragraphs) {
      add(
        'ig_route_paragraph_labels',
        ['route', 'paragraphLabels'],
        `The passage has ${paragraphs} paragraphs (separated by blank lines); give one label for each, or "" to leave one unlabelled.`,
      );
    }
  }
  if (body !== '' && Array.isArray(route.sections)) {
    const paragraphs = countParagraphs(body);
    const covered = route.sections.reduce<number>(
      (total, section) =>
        total +
        (isFields(section) && typeof section.paragraphs === 'number' ? section.paragraphs : 0),
      0,
    );
    if (covered !== paragraphs) {
      add(
        'ig_route_sections',
        ['route', 'sections'],
        `The sections cover ${covered} paragraphs, but the passage has ${paragraphs}.`,
      );
    }
  }

  const seen = new Set<string>();
  const questions = list(route.questions);
  questions.forEach((raw, index) => {
    const at = (...rest: (string | number)[]): (string | number)[] => [
      'route',
      'questions',
      index,
      ...rest,
    ];
    if (!isFields(raw)) {
      return;
    }
    const itemId = typeof raw.itemId === 'string' ? raw.itemId : undefined;
    const item = itemId === undefined ? undefined : itemsById.get(itemId);
    if (itemId === undefined || item === undefined) {
      add(
        'ig_route_question_item_unknown',
        at('itemId'),
        `No item of this group has the id "${String(raw.itemId)}".`,
      );
      return;
    }
    const parts = partIdsOf(item);
    const partId = typeof raw.partId === 'string' && raw.partId !== '' ? raw.partId : undefined;
    if (parts === null && partId !== undefined) {
      add(
        'ig_route_question_part_not_allowed',
        at('partId'),
        'A multiple-choice item is one question: leave out partId.',
      );
      return;
    }
    if (parts !== null && partId === undefined) {
      add(
        'ig_route_question_part_required',
        at('partId'),
        'Name the blank or gap this question is: each one is a question of its own.',
      );
      return;
    }
    if (parts !== null && partId !== undefined && !parts.includes(partId)) {
      add(
        'ig_route_question_part_unknown',
        at('partId'),
        `Item "${itemId}" has no blank or gap "${partId}".`,
      );
      return;
    }
    const key = questionKey(itemId, partId);
    if (seen.has(key)) {
      add('ig_route_question_duplicate', at(), `Question "${key}" has two entries; keep one.`);
      return;
    }
    seen.add(key);

    const type = (item as Fields).type;
    if (unset(raw.strategy)) {
      add(
        'ig_route_strategy_required',
        at('strategy'),
        'Choose the reading strategy this question practises.',
      );
    } else if (!isRouteStrategyId(raw.strategy)) {
      add(
        'ig_route_strategy_unknown',
        at('strategy'),
        `"${String(raw.strategy)}" is not a reading strategy.`,
      );
    } else if (
      isReadingRouteItemType(type) &&
      !ROUTE_STRATEGIES[raw.strategy].itemTypes.includes(type)
    ) {
      add(
        'ig_route_strategy_item_type',
        at('strategy'),
        `The ${ROUTE_STRATEGIES[raw.strategy].title} strategy is written as ${ROUTE_STRATEGIES[raw.strategy].itemTypes.join(' or ')}, not ${String(type)}.`,
      );
    }

    if (raw.wordLimit !== undefined) {
      if (type !== 'fill-in-the-blanks') {
        add(
          'ig_route_word_limit_type',
          at('wordLimit'),
          'Only a question the learner writes has a word limit.',
        );
      } else if (typeof raw.wordLimit === 'number') {
        const limit = raw.wordLimit;
        for (const answer of acceptedAnswersOf(item, partId)) {
          if (countWords(answer) > limit) {
            add(
              'ig_route_answer_over_limit',
              at('wordLimit'),
              `The accepted answer "${answer}" is longer than ${limit} word${limit === 1 ? '' : 's'}: a learner who writes it would lose the mark.`,
            );
          }
        }
      }
    }

    if (scope === 'redacted') {
      return;
    }
    const quote = (value: unknown, path: (string | number)[]): void => {
      if (body === '') {
        return;
      }
      const match = findQuote(body, value);
      if (match.found) {
        return;
      }
      const words = quoteText(value);
      if (match.reason === 'ambiguous') {
        add(
          'ig_route_quote_ambiguous',
          path,
          `"${words}" appears ${match.count} times in the passage. Quote more words, or say which occurrence: { "text": ..., "occurrence": 2 }.`,
        );
      } else {
        add(
          'ig_route_quote_not_found',
          path,
          match.reason === 'occurrence'
            ? `"${words}" appears only ${match.count} time${match.count === 1 ? '' : 's'} in the passage.`
            : `"${words}" is not in the passage. Copy the words exactly as the passage writes them.`,
        );
      }
    };

    const evidence = list(raw.evidence);
    if (evidence.length === 0) {
      add(
        'ig_route_evidence_required',
        at('evidence'),
        'Quote where the passage justifies the answer — for a Not Given answer, where it discusses the topic.',
      );
    }
    evidence.forEach((value, at2) => {
      quote(value, at('evidence', at2));
    });

    const visible = learnerTextOf(item);
    list(raw.keywords).forEach((keyword, at2) => {
      if (!isFields(keyword)) {
        return;
      }
      if (typeof keyword.question === 'string' && !containsPhrase(visible, keyword.question)) {
        add(
          'ig_route_keyword_not_in_question',
          at('keywords', at2, 'question'),
          `"${keyword.question}" is not in the question. Copy the words as the question writes them.`,
        );
      }
      if (keyword.passage !== undefined) {
        quote(keyword.passage, at('keywords', at2, 'passage'));
      }
    });
    list(raw.links).forEach((link, at2) => {
      if (isFields(link)) {
        quote(link.from, at('links', at2, 'from'));
        quote(link.to, at('links', at2, 'to'));
      }
    });

    const choices = choicesOf(item, partId);
    list(raw.traps).forEach((trap, at2) => {
      if (!isFields(trap)) {
        return;
      }
      const choice = choices.find((candidate) => candidate.id === trap.optionId);
      if (choice === undefined) {
        add(
          'ig_route_trap_option_unknown',
          at('traps', at2, 'optionId'),
          `This question has no option or choice "${String(trap.optionId)}".`,
        );
      } else if (choice.correct) {
        add(
          'ig_route_trap_on_answer',
          at('traps', at2, 'optionId'),
          'A trap is a wrong option; this one is the answer.',
        );
      }
      if (trap.lure !== undefined) {
        quote(trap.lure, at('traps', at2, 'lure'));
      }
    });

    if (isFields(raw.notes) && isRouteStrategyId(raw.strategy)) {
      const moves = ROUTE_STRATEGIES[raw.strategy].moves;
      for (const [move, note] of Object.entries(raw.notes)) {
        const path = at('notes', move);
        if (!(moves as readonly string[]).includes(move) || move === 'survey') {
          add(
            'ig_route_note_move_unknown',
            path,
            `The ${ROUTE_STRATEGIES[raw.strategy].title} strategy has no "${move}" step for a question.`,
          );
          continue;
        }
        if (typeof note !== 'string') {
          continue;
        }
        if (note.length > ROUTE_NOTE_MAX_LENGTH) {
          add(
            'ig_route_note_too_long',
            path,
            `Keep a step's note to ${ROUTE_NOTE_MAX_LENGTH} characters.`,
          );
        } else if (noteRevealsAnswer(item, partId, note)) {
          add(
            'ig_route_note_reveals_answer',
            path,
            'This note gives the answer away. Say where to look and why, not what to answer.',
          );
        }
      }
    }
  });

  for (const question of itemQuestions(items)) {
    if (
      !seen.has(question.key) &&
      itemsById.has(question.itemId) &&
      isReadingRouteItemType(question.type) &&
      covered(question.itemId)
    ) {
      add(
        'ig_route_question_missing',
        ['route', 'questions'],
        question.partId === undefined
          ? `Question "${question.itemId}" has no route entry.`
          : `Blank or gap "${question.partId}" of "${question.itemId}" has no route entry.`,
      );
    }
  }
  return issues;
}
