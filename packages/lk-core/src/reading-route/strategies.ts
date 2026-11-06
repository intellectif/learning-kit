/**
 * The strategy library: for each exam reading task, the order in which a
 * skilled candidate looks, and what they do at each look. A leaf module: the
 * schemas, the checks and the planner read it, and it imports none of them.
 *
 * What the steps rest on (the guide, `docs/reading-route.md`, cites each):
 * successful candidates find a small relevant part of the text and read it
 * carefully, where weaker ones read larger chunks for longer; exam reading
 * interleaves fast search with careful reading of what was found; answers are
 * hidden behind paraphrase, and a word-for-word match is the classic
 * distractor; skimming keeps the gist and structure, not details.
 */

import type { RouteMoveId, RouteStrategyId } from '../types/reading-route.js';

/**
 * The item types a reading route may hold: the ones every common exam reading
 * task is written in. CLOSED on purpose, as an interactive video's list is: a
 * type added later is not silently routable.
 */
export const READING_ROUTE_ITEM_TYPES = [
  'multiple-choice',
  'fill-in-the-blanks',
  'gap-select',
  'matching',
] as const;

/** One of {@link READING_ROUTE_ITEM_TYPES}. */
export type ReadingRouteItemType = (typeof READING_ROUTE_ITEM_TYPES)[number];

/** Whether `type` is one of the item types a reading route may hold. */
export function isReadingRouteItemType(type: unknown): type is ReadingRouteItemType {
  return (READING_ROUTE_ITEM_TYPES as readonly unknown[]).includes(type);
}

/** How a strategy is planned. */
export interface RouteStrategy {
  id: RouteStrategyId;
  /** Its name, in English, as a learner meets it. */
  title: string;
  /** The exam tasks it serves, in English, for authors. */
  serves: string;
  /** The item types it can be written in. */
  itemTypes: readonly ReadingRouteItemType[];
  /** Its steps, in order. `survey` is planned once, before the route's first question. */
  moves: readonly RouteMoveId[];
  /** Whether the answers come in the order of the text, so each search starts after the previous answer. */
  followsOrder: boolean;
}

const CHOICE: readonly ReadingRouteItemType[] = ['multiple-choice', 'gap-select'];

/** The tasks that match prompts to a shared list: written one question per item, or as one matching item. */
const MATCHING: readonly ReadingRouteItemType[] = ['multiple-choice', 'gap-select', 'matching'];

/**
 * The built-in strategies. Data, versioned with lk-core: a route stores only
 * a strategy's id, so a learner always meets the current steps.
 */
export const ROUTE_STRATEGIES: Readonly<Record<RouteStrategyId, RouteStrategy>> = Object.freeze({
  tfng: {
    id: 'tfng',
    title: 'True / False / Not Given',
    serves: 'IELTS identifying information.',
    itemTypes: CHOICE,
    moves: ['read-instructions', 'keywords', 'locate', 'read-around', 'paraphrase', 'decide'],
    followsOrder: true,
  },
  ynng: {
    id: 'ynng',
    title: 'Yes / No / Not Given',
    serves: "IELTS identifying the writer's views or claims.",
    itemTypes: CHOICE,
    moves: ['read-instructions', 'keywords', 'locate', 'read-around', 'paraphrase', 'decide'],
    followsOrder: true,
  },
  'multiple-choice': {
    id: 'multiple-choice',
    title: 'Multiple choice',
    serves: 'IELTS multiple choice; Cambridge C1 Advanced and C2 Proficiency Part 5.',
    itemTypes: ['multiple-choice'],
    moves: ['keywords', 'predict', 'locate', 'read-around', 'paraphrase', 'eliminate'],
    followsOrder: true,
  },
  'matching-headings': {
    id: 'matching-headings',
    title: 'Matching headings',
    serves: 'IELTS matching headings.',
    itemTypes: MATCHING,
    moves: ['survey', 'locate', 'paraphrase', 'eliminate'],
    followsOrder: false,
  },
  'matching-information': {
    id: 'matching-information',
    title: 'Matching information',
    serves: 'IELTS matching information ("Which paragraph contains...").',
    itemTypes: MATCHING,
    moves: ['keywords', 'locate', 'read-around', 'paraphrase'],
    followsOrder: false,
  },
  'matching-features': {
    id: 'matching-features',
    title: 'Matching features',
    serves: 'IELTS matching features (people, dates, places to statements).',
    itemTypes: MATCHING,
    moves: ['keywords', 'locate', 'read-around', 'paraphrase'],
    followsOrder: false,
  },
  'multiple-matching': {
    id: 'multiple-matching',
    title: 'Multiple matching',
    serves: 'Cambridge C1 Advanced Part 8 and C2 Proficiency Part 7.',
    itemTypes: MATCHING,
    moves: ['survey', 'keywords', 'locate', 'read-around', 'paraphrase'],
    followsOrder: false,
  },
  'sentence-endings': {
    id: 'sentence-endings',
    title: 'Matching sentence endings',
    serves: 'IELTS matching sentence endings.',
    itemTypes: MATCHING,
    moves: ['keywords', 'predict', 'locate', 'read-around', 'eliminate'],
    followsOrder: true,
  },
  completion: {
    id: 'completion',
    title: 'Completion',
    serves: 'IELTS sentence, note, table and flow-chart completion, and short answers.',
    itemTypes: ['fill-in-the-blanks'],
    moves: ['read-instructions', 'keywords', 'predict', 'locate', 'read-around', 'check-answer'],
    followsOrder: true,
  },
  'summary-word-list': {
    id: 'summary-word-list',
    title: 'Summary completion from a list',
    serves: 'IELTS summary completion with a list of words.',
    itemTypes: ['gap-select'],
    moves: ['keywords', 'predict', 'locate', 'read-around', 'paraphrase', 'check-answer'],
    followsOrder: false,
  },
  'gapped-text': {
    id: 'gapped-text',
    title: 'Gapped text',
    serves: 'Cambridge C1 Advanced Part 7 and C2 Proficiency Part 6.',
    itemTypes: MATCHING,
    moves: ['survey', 'locate', 'cohesion', 'eliminate'],
    followsOrder: false,
  },
  'cross-text': {
    id: 'cross-text',
    title: 'Cross-text matching',
    serves: 'Cambridge C1 Advanced Part 6.',
    itemTypes: MATCHING,
    moves: ['survey', 'keywords', 'locate', 'compare-views'],
    followsOrder: false,
  },
});

/** Every built-in strategy id, in the library's order. */
export const ROUTE_STRATEGY_IDS = Object.freeze(
  Object.keys(ROUTE_STRATEGIES),
) as readonly RouteStrategyId[];

/** Whether `id` names a built-in strategy. */
export function isRouteStrategyId(id: unknown): id is RouteStrategyId {
  return typeof id === 'string' && Object.hasOwn(ROUTE_STRATEGIES, id);
}

/** The most characters an author's note on a step may have. */
export const ROUTE_NOTE_MAX_LENGTH = 280;

/** The longest word limit a completion question may set. */
export const ROUTE_WORD_LIMIT_MAX = 10;
