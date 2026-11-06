/**
 * What a learner did in a route, read back: which answers were right, where
 * they found — or did not find — the evidence, why each wrong answer went
 * wrong, and how much help each strategy should get next time.
 *
 * None of it is a grade. The questions grade exactly as they do without a
 * route; this is the report beside the grade, and the fading that reads it.
 */

import { fingerprint } from '../content-hash.js';
import { countWords } from '../count-words.js';
import { evaluate } from '../scoring/index.js';
import type { ActivityData, ItemOutcome, LearnerResponse } from '../types/activity.js';
import type { ItemGroup } from '../types/item-group.js';
import type {
  RouteAnswer,
  RouteCause,
  RouteEvent,
  RouteFadingOptions,
  RouteLearnerState,
  RouteLevel,
  RouteQuestionSummary,
  RouteStrategyId,
  RouteStrategySummary,
  RouteSummary,
  RouteTrace,
  RouteTrapKind,
} from '../types/reading-route.js';
import { planRoute } from './plan.js';
import { itemQuestions } from './questions.js';
import { isRouteStrategyId } from './strategies.js';

const LEVELS: readonly RouteLevel[] = ['walkthrough', 'coached', 'solo'];

const isLevel = (value: unknown): value is RouteLevel =>
  (LEVELS as readonly unknown[]).includes(value);

type Fields = Record<string, unknown>;

const isFields = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

const isTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** The fingerprint a trace of this passage carries. */
export function routePassageFingerprint(body: string): string {
  return fingerprint(body);
}

function readLevels(value: unknown): Partial<Record<RouteStrategyId, RouteLevel>> {
  const levels: Partial<Record<RouteStrategyId, RouteLevel>> = {};
  if (isFields(value)) {
    for (const [strategy, level] of Object.entries(value)) {
      if (isRouteStrategyId(strategy) && isLevel(level)) {
        levels[strategy] = level;
      }
    }
  }
  return levels;
}

function readEvent(value: unknown): RouteEvent | null {
  if (!isFields(value) || !isTime(value.at)) {
    return null;
  }
  const { at } = value;
  const question = typeof value.question === 'string' ? value.question : undefined;
  switch (value.type) {
    case 'started':
      return { at, type: 'started', levels: readLevels(value.levels) };
    case 'finished':
      return { at, type: 'finished' };
    case 'step':
      return typeof value.step === 'string'
        ? { at, type: 'step', step: value.step, ...(question !== undefined ? { question } : {}) }
        : null;
    case 'located':
      return question !== undefined && isCount(value.sentence) && typeof value.hit === 'boolean'
        ? { at, type: 'located', question, sentence: value.sentence, hit: value.hit }
        : null;
    case 'shown':
    case 'answered':
      return question !== undefined ? { at, type: value.type, question } : null;
    case 'marked':
      return question !== undefined && isCount(value.sentence) && typeof value.on === 'boolean'
        ? { at, type: 'marked', question, sentence: value.sentence, on: value.on }
        : null;
    default:
      return null;
  }
}

/**
 * A stored trace read back. Never throws: anything that is not a trace is
 * `null`, and an event it cannot read is left out rather than failing the rest.
 */
export function readRouteTrace(value: unknown): RouteTrace | null {
  if (!isFields(value) || value.traceVersion !== '1' || typeof value.passage !== 'string') {
    return null;
  }
  const events = Array.isArray(value.events)
    ? value.events.map(readEvent).filter((event): event is RouteEvent => event !== null)
    : [];
  return { traceVersion: '1', passage: value.passage, events };
}

function answered(response: LearnerResponse | undefined, partId: string | undefined): boolean {
  if (response === undefined) {
    return false;
  }
  switch (response.type) {
    case 'multiple-choice':
      return Array.isArray(response.selectedOptionIds) && response.selectedOptionIds.length > 0;
    case 'fill-in-the-blanks':
      return partId !== undefined && (response.answers?.[partId] ?? '').trim() !== '';
    case 'gap-select':
      return partId !== undefined && (response.selections?.[partId] ?? '') !== '';
    default:
      return false;
  }
}

function correctIn(
  outcome: ItemOutcome | undefined,
  type: string,
  partId: string | undefined,
): boolean | null {
  if (outcome === undefined || (outcome.status !== 'scored' && outcome.status !== 'graded')) {
    return null;
  }
  const details =
    outcome.status === 'scored' ? outcome.details : (outcome as { details?: unknown }).details;
  if (!Array.isArray(details)) {
    return null;
  }
  if (type === 'multiple-choice') {
    return details.every(
      (detail: { outcome?: unknown }) =>
        detail.outcome === 'correct' || detail.outcome === 'correct-omission',
    );
  }
  const detail = details.find((candidate: { itemId?: unknown }) => candidate.itemId === partId) as
    | { outcome?: unknown }
    | undefined;
  return detail === undefined ? null : detail.outcome === 'correct';
}

/**
 * Whether each question of a routed group was answered correctly, keyed by
 * question key. Graded from `outcomes` where given — a review, or a server's
 * grades — and otherwise by `evaluate` on the full item, as the item's own
 * component would grade it. A question that cannot be graded here (a redacted
 * item and no outcome) reads as not answered.
 */
export function routeAnswers(
  group: ItemGroup,
  responses: Readonly<Record<string, LearnerResponse | undefined>>,
  outcomes: Readonly<Record<string, ItemOutcome | undefined>> = {},
): Record<string, RouteAnswer> {
  const itemsById = new Map(group.items.map((item) => [item.id, item]));
  const graded = new Map<string, ItemOutcome | undefined>();
  const outcomeOf = (itemId: string): ItemOutcome | undefined => {
    if (!graded.has(itemId)) {
      let outcome = Object.hasOwn(outcomes, itemId) ? outcomes[itemId] : undefined;
      const response = Object.hasOwn(responses, itemId) ? responses[itemId] : undefined;
      if (outcome === undefined && response !== undefined) {
        try {
          outcome = evaluate(itemsById.get(itemId) as ActivityData, response);
        } catch {
          outcome = undefined;
        }
      }
      graded.set(itemId, outcome);
    }
    return graded.get(itemId);
  };
  const answers: Record<string, RouteAnswer> = {};
  for (const question of itemQuestions(group.items)) {
    const response = Object.hasOwn(responses, question.itemId)
      ? responses[question.itemId]
      : undefined;
    const answer: RouteAnswer = { correct: null };
    if (response?.type === 'multiple-choice' && response.selectedOptionIds?.[0] !== undefined) {
      answer.chosen = response.selectedOptionIds[0];
    } else if (response?.type === 'gap-select' && question.partId !== undefined) {
      const chosen = response.selections?.[question.partId];
      if (chosen !== undefined && chosen !== '') {
        answer.chosen = chosen;
      }
    } else if (response?.type === 'fill-in-the-blanks' && question.partId !== undefined) {
      const written = response.answers?.[question.partId];
      if (written !== undefined && written.trim() !== '') {
        answer.written = written;
      }
    }
    if (answered(response, question.partId)) {
      answer.correct = correctIn(outcomeOf(question.itemId), question.type, question.partId);
    }
    answers[question.key] = answer;
  }
  return answers;
}

/** Sentences a learner has marked for a question by the end of the trace. */
export function markedSentences(trace: RouteTrace, question: string): number[] {
  const marked = new Set<number>();
  for (const event of trace.events) {
    if (event.type === 'marked' && event.question === question) {
      if (event.on) {
        marked.add(event.sentence);
      } else {
        marked.delete(event.sentence);
      }
    }
  }
  return [...marked].sort((a, b) => a - b);
}

/**
 * Whether marked sentences find the evidence: at least one of them holds it,
 * and no more were marked than the evidence spans plus one. Marking a whole
 * paragraph is what weaker readers do, and it is not finding the answer.
 */
export function marksFindEvidence(marked: readonly number[], evidence: readonly number[]): boolean {
  return (
    marked.some((sentence) => evidence.includes(sentence)) &&
    marked.length <= Math.max(2, evidence.length + 1)
  );
}

/**
 * The report of one route: per question, whether the learner found the
 * evidence and with how much help, whether they answered correctly, and the
 * cause of each wrong answer; per strategy, the totals that fading reads.
 * `answers` is `routeAnswers`'s result. The order the learner looked in is
 * never part of it: there is more than one good way to read.
 */
export function summarizeRoute(
  group: ItemGroup,
  trace: RouteTrace,
  answers: Readonly<Record<string, RouteAnswer | undefined>>,
): RouteSummary {
  const started = trace.events.find((event) => event.type === 'started');
  const finished = [...trace.events].reverse().find((event) => event.type === 'finished');
  const plan = planRoute(group, { levels: started?.type === 'started' ? started.levels : {} });
  const firstStep = new Map<string, number>();
  const answeredAt = new Map<string, number>();
  for (const event of trace.events) {
    if (event.type === 'step' && event.question !== undefined && !firstStep.has(event.question)) {
      firstStep.set(event.question, event.at);
    }
    if (event.type === 'answered' && !answeredAt.has(event.question)) {
      answeredAt.set(event.question, event.at);
    }
  }
  // Answering alone, a question's time is the time since the answer before it.
  const answerTimes = [...answeredAt.entries()].sort((a, b) => a[1] - b[1]);
  const sinceBefore = new Map<string, number>();
  answerTimes.forEach(([key, at], index) => {
    const before = index === 0 ? started?.at : answerTimes[index - 1]?.[1];
    if (before !== undefined) {
      sinceBefore.set(key, Math.max(0, at - before));
    }
  });

  const questions: RouteQuestionSummary[] = plan.questions.map((question) => {
    const locates = trace.events.filter(
      (event): event is Extract<RouteEvent, { type: 'located' }> =>
        event.type === 'located' && event.question === question.key,
    );
    const shown = trace.events.some(
      (event) => event.type === 'shown' && event.question === question.key,
    );
    let located: boolean | null = null;
    if (locates[0] !== undefined) {
      located = locates[0].hit;
    } else if (shown) {
      located = false;
    } else {
      const marked = markedSentences(trace, question.key);
      if (marked.length > 0) {
        located = marksFindEvidence(marked, question.evidenceSentences);
      }
    }
    const answer = answers[question.key];
    const correct = answer?.correct ?? null;
    let cause: RouteCause | null = null;
    let trap: RouteTrapKind | undefined;
    if (correct === null) {
      cause = 'unanswered';
    } else if (!correct) {
      trap = question.traps.find((candidate) => candidate.optionId === answer?.chosen)?.kind;
      if (
        question.wordLimit !== undefined &&
        answer?.written !== undefined &&
        countWords(answer.written) > question.wordLimit
      ) {
        cause = 'limit';
      } else if (trap !== undefined) {
        cause = 'trap';
      } else if (located === false) {
        cause = 'search';
      } else if (located === true) {
        cause = 'meaning';
      } else {
        cause = 'unknown';
      }
    }
    const answeredTime = answeredAt.get(question.key);
    const stepTime = firstStep.get(question.key);
    const seconds =
      answeredTime === undefined
        ? null
        : stepTime !== undefined
          ? Math.max(0, answeredTime - stepTime) / 1000
          : (sinceBefore.get(question.key) ?? 0) / 1000;
    return {
      key: question.key,
      itemId: question.itemId,
      ...(question.partId !== undefined ? { partId: question.partId } : {}),
      number: question.number,
      strategy: question.strategy,
      level: question.level,
      located,
      tries: locates.length,
      shown,
      correct,
      cause: correct === true ? null : cause,
      ...(answer?.chosen !== undefined ? { chosen: answer.chosen } : {}),
      ...(trap !== undefined && cause === 'trap' ? { trap } : {}),
      seconds,
    };
  });

  const strategies: RouteStrategySummary[] = [];
  for (const question of questions) {
    let entry = strategies.find((candidate) => candidate.strategy === question.strategy);
    if (entry === undefined) {
      entry = {
        strategy: question.strategy,
        level: question.level,
        questions: 0,
        correct: 0,
        located: 0,
        locatable: 0,
      };
      strategies.push(entry);
    }
    entry.questions += 1;
    entry.correct += question.correct === true ? 1 : 0;
    if (question.located !== null) {
      entry.locatable += 1;
      entry.located += question.located ? 1 : 0;
    }
  }

  return {
    groupId: group.id,
    questions,
    strategies,
    correct: questions.filter((question) => question.correct === true).length,
    total: questions.length,
    seconds:
      started !== undefined && finished !== undefined
        ? Math.max(0, finished.at - started.at) / 1000
        : null,
  };
}

/** A stored learner state read back. Never throws: anything unreadable is a fresh state. */
export function readRouteLearnerState(value: unknown): RouteLearnerState {
  const state: RouteLearnerState = { stateVersion: '1', strategies: {}, seen: [] };
  if (!isFields(value) || value.stateVersion !== '1') {
    return state;
  }
  if (isFields(value.strategies)) {
    for (const [strategy, entry] of Object.entries(value.strategies)) {
      if (isRouteStrategyId(strategy) && isFields(entry) && isLevel(entry.level)) {
        state.strategies[strategy] = {
          level: entry.level,
          streak:
            typeof entry.streak === 'number' && Number.isInteger(entry.streak) ? entry.streak : 0,
        };
      }
    }
  }
  if (Array.isArray(value.seen)) {
    state.seen = value.seen.filter((id): id is string => typeof id === 'string');
  }
  return state;
}

/**
 * The level each strategy of `group` is presented at: the learner's, or
 * `entry` for a strategy they have not met. `level` pins one for all.
 */
export function routeLevels(
  group: ItemGroup,
  state: RouteLearnerState | null | undefined,
  options: { entry?: RouteLevel; level?: RouteLevel } = {},
): Partial<Record<RouteStrategyId, RouteLevel>> {
  const levels: Partial<Record<RouteStrategyId, RouteLevel>> = {};
  for (const question of group.route?.questions ?? []) {
    if (isRouteStrategyId(question.strategy)) {
      levels[question.strategy] =
        options.level ??
        state?.strategies[question.strategy]?.level ??
        options.entry ??
        'walkthrough';
    }
  }
  return levels;
}

const lessHelp = (level: RouteLevel): RouteLevel =>
  LEVELS[Math.min(LEVELS.indexOf(level) + 1, LEVELS.length - 1)] as RouteLevel;
const moreHelp = (level: RouteLevel): RouteLevel =>
  LEVELS[Math.max(LEVELS.indexOf(level) - 1, 0)] as RouteLevel;

/**
 * The learner's next state after a route. Per strategy, a question succeeds
 * when it is right, its evidence was not missed, and the learner did not ask
 * to be shown; `promoteAfter` successes in a row take one level of help away,
 * `demoteAfter` failures in a row give one back, and one passage moves a
 * strategy at most one level. A passage already in `seen` changes nothing:
 * a second attempt is memory of where the answers were.
 */
export function nextRouteLearnerState(
  state: RouteLearnerState | null | undefined,
  summary: RouteSummary,
  options: RouteFadingOptions = {},
): RouteLearnerState {
  const current = readRouteLearnerState(state);
  if (current.seen.includes(summary.groupId)) {
    return current;
  }
  const promoteAfter = Math.max(1, options.promoteAfter ?? 2);
  const demoteAfter = Math.max(1, options.demoteAfter ?? 2);
  const remember = Math.max(1, options.remember ?? 500);
  const strategies = { ...current.strategies };
  for (const totals of summary.strategies) {
    const base = totals.level;
    const stored = strategies[totals.strategy];
    let streak = stored?.level === base ? stored.streak : 0;
    let level = base;
    for (const question of summary.questions) {
      if (question.strategy !== totals.strategy) {
        continue;
      }
      const success = question.correct === true && question.located !== false && !question.shown;
      streak = success ? Math.max(streak, 0) + 1 : Math.min(streak, 0) - 1;
      if (streak >= promoteAfter && lessHelp(level) !== level) {
        level = lessHelp(level);
        streak = 0;
        break;
      }
      if (streak <= -demoteAfter && moreHelp(level) !== level) {
        level = moreHelp(level);
        streak = 0;
        break;
      }
    }
    // A streak only matters up to the next move, so it is kept within reach of one.
    strategies[totals.strategy] = {
      level,
      streak: Math.max(-demoteAfter, Math.min(promoteAfter, streak)),
    };
  }
  return {
    stateVersion: '1',
    strategies,
    seen: [...current.seen, summary.groupId].slice(-remember),
  };
}
