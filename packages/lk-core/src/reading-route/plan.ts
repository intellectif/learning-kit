/**
 * Planning a route: from what the author said about each question — where
 * its evidence is, its key words, its traps — to the steps a learner is
 * walked through, in the order a skilled candidate takes them. Pure and
 * deterministic: the same group and levels always give the same plan.
 */

import type { ItemGroup } from '../types/item-group.js';
import type {
  PassageLayout,
  PlannedPair,
  PlannedQuestion,
  PlannedTrap,
  QuotedRange,
  RouteLevel,
  RouteMoveId,
  RoutePlan,
  RouteQuestion,
  RouteQuestionPart,
  RouteStep,
  RouteStrategyId,
  TextRange,
} from '../types/reading-route.js';
import { passageLayout, sentencesTouching } from './layout.js';
import { choicesOf, itemQuestions, questionKey } from './questions.js';
import { findQuote } from './quotes.js';
import { isRouteStrategyId, ROUTE_STRATEGIES } from './strategies.js';

export interface PlanRouteOptions {
  /** The level each strategy is presented at, as `routeLevels` resolves it. Unnamed strategies are `walkthrough`. */
  levels?: Partial<Record<RouteStrategyId, RouteLevel>>;
  /** One level for every strategy, over `levels`. */
  level?: RouteLevel;
}

type Fields = Record<string, unknown>;

const isFields = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function quoted(body: string, quote: unknown): QuotedRange | undefined {
  const match = findQuote(body, quote);
  return match.found
    ? { ...match.range, text: body.slice(match.range.start, match.range.end) }
    : undefined;
}

const byStart = (a: TextRange, b: TextRange): number => a.start - b.start || a.end - b.end;

function sentenceRanges(layout: PassageLayout, indices: readonly number[]): TextRange[] {
  return indices.map((index) => {
    const sentence = layout.sentences[index] as TextRange;
    return { start: sentence.start, end: sentence.end };
  });
}

function planQuestion(
  body: string,
  layout: PassageLayout,
  item: unknown,
  entry: RouteQuestion,
  key: string,
  number: number,
  level: RouteLevel,
): PlannedQuestion {
  const evidence = (Array.isArray(entry.evidence) ? entry.evidence : [])
    .map((quote) => quoted(body, quote))
    .filter((range): range is QuotedRange => range !== undefined)
    .map(({ start, end }) => ({ start, end }))
    .sort(byStart);
  const evidenceSentences = [
    ...new Set(evidence.flatMap((range) => sentencesTouching(layout, range))),
  ].sort((a, b) => a - b);

  const pairs: PlannedPair[] = [];
  for (const keyword of entry.keywords ?? []) {
    const passage = keyword.passage === undefined ? undefined : quoted(body, keyword.passage);
    pairs.push({
      index: pairs.length + 1,
      question: keyword.question,
      ...(passage ? { passage } : {}),
    });
  }
  for (const link of entry.links ?? []) {
    const from = quoted(body, link.from);
    const to = quoted(body, link.to);
    if (from !== undefined && to !== undefined) {
      pairs.push({ index: pairs.length + 1, from, to });
    }
  }

  const choices = choicesOf(item, entry.partId);
  const traps: PlannedTrap[] = (entry.traps ?? []).map((trap) => {
    const option = choices.find((choice) => choice.id === trap.optionId)?.text;
    const lure = trap.lure === undefined ? undefined : quoted(body, trap.lure);
    return {
      optionId: trap.optionId,
      kind: trap.kind,
      ...(option !== undefined ? { option } : {}),
      ...(lure !== undefined ? { lure } : {}),
    };
  });

  return {
    key,
    itemId: entry.itemId,
    ...(entry.partId !== undefined ? { partId: entry.partId } : {}),
    number,
    strategy: entry.strategy,
    // A redacted route carries no evidence, and there is nothing to guide by.
    level: evidence.length === 0 ? 'solo' : level,
    evidence,
    evidenceMatch: entry.evidenceMatch ?? 'any',
    evidenceSentences,
    pairs,
    traps,
    ...(entry.wordLimit !== undefined ? { wordLimit: entry.wordLimit } : {}),
    notes: isFields(entry.notes) ? { ...entry.notes } : {},
  };
}

function step(
  question: PlannedQuestion,
  move: RouteMoveId,
  fields: Partial<RouteStep> = {},
): RouteStep {
  const note = question.notes[move];
  return {
    id: `${question.key}/${move}`,
    move,
    level: question.level,
    question: question.key,
    number: question.number,
    strategy: question.strategy,
    highlight: [],
    context: [],
    phrases: [],
    pairs: [],
    traps: [],
    params: {},
    ...fields,
    ...(note !== undefined ? { note } : {}),
  };
}

/** The sentences either side of `indices` within their paragraphs, not themselves. */
function neighbours(layout: PassageLayout, indices: readonly number[]): number[] {
  const around = new Set<number>();
  for (const index of indices) {
    const sentence = layout.sentences[index];
    if (sentence === undefined) {
      continue;
    }
    for (const near of [index - 1, index + 1]) {
      if (layout.sentences[near]?.paragraph === sentence.paragraph && !indices.includes(near)) {
        around.add(near);
      }
    }
  }
  return [...around].sort((a, b) => a - b);
}

/** Label of the paragraph or section that holds a question's first evidence. */
function regionOf(layout: PassageLayout, question: PlannedQuestion): string | undefined {
  const first = question.evidenceSentences[0];
  if (first === undefined) {
    return undefined;
  }
  const paragraph = layout.paragraphs[(layout.sentences[first] as { paragraph: number }).paragraph];
  if (paragraph?.section !== undefined) {
    return layout.sections[paragraph.section]?.label;
  }
  return paragraph?.label;
}

function stepsFor(
  body: string,
  layout: PassageLayout,
  item: Fields,
  question: PlannedQuestion,
  previous: PlannedQuestion | undefined,
): RouteStep[] {
  const strategy = ROUTE_STRATEGIES[question.strategy];
  const steps: RouteStep[] = [];
  const evidenceRanges = sentenceRanges(layout, question.evidenceSentences);
  const phrases = question.pairs.flatMap((pair) =>
    pair.question === undefined ? [] : [pair.question],
  );
  const isChoice = item.type !== 'fill-in-the-blanks';
  const answerPart: RouteQuestionPart = item.type === 'multiple-choice' ? 'question' : 'answer';
  const runStart = previous?.strategy !== question.strategy;
  const region = regionOf(layout, question);
  const sameRun = previous !== undefined && !runStart && previous.evidenceSentences.length > 0;
  const lastBefore = sameRun ? (previous.evidenceSentences.at(-1) as number) : undefined;

  for (const move of strategy.moves) {
    switch (move) {
      case 'survey':
        break;
      case 'read-instructions': {
        const hasInstructions =
          typeof item.instructions === 'string' && item.instructions.trim() !== '';
        if (runStart && (hasInstructions || question.wordLimit !== undefined)) {
          steps.push(
            step(question, move, {
              part: hasInstructions ? 'instructions' : answerPart,
              params: question.wordLimit !== undefined ? { wordLimit: question.wordLimit } : {},
            }),
          );
        }
        break;
      }
      case 'keywords':
        steps.push(step(question, move, { part: 'question', phrases }));
        break;
      case 'predict':
        steps.push(step(question, move, { part: answerPart }));
        break;
      case 'locate': {
        let zone: TextRange | undefined;
        if (strategy.followsOrder && lastBefore !== undefined) {
          zone = { start: (layout.sentences[lastBefore] as TextRange).end, end: body.length };
        } else if (
          question.strategy === 'matching-headings' &&
          question.evidenceSentences.length > 0
        ) {
          const paragraph =
            layout.paragraphs[
              (layout.sentences[question.evidenceSentences[0] as number] as { paragraph: number })
                .paragraph
            ];
          if (paragraph !== undefined) {
            zone = { start: paragraph.start, end: paragraph.end };
          }
        }
        steps.push(
          step(question, move, {
            ask: 'locate',
            highlight: evidenceRanges,
            phrases,
            ...(zone !== undefined ? { zone } : {}),
            params: {
              ...(sameRun ? { previous: previous.number } : {}),
              ...(region !== undefined ? { region } : {}),
            },
          }),
        );
        break;
      }
      case 'read-around':
        steps.push(
          step(question, move, {
            highlight: evidenceRanges,
            context: sentenceRanges(layout, neighbours(layout, question.evidenceSentences)),
          }),
        );
        break;
      case 'paraphrase': {
        const keywordPairs = question.pairs.filter((pair) => pair.question !== undefined);
        steps.push(
          step(question, move, {
            part: isChoice && item.type !== 'multiple-choice' ? 'answer' : 'question',
            highlight: keywordPairs.flatMap((pair) => (pair.passage ? [pair.passage] : [])),
            context: evidenceRanges,
            phrases,
            pairs: keywordPairs,
          }),
        );
        break;
      }
      case 'decide':
        steps.push(step(question, move, { part: 'options', highlight: question.evidence }));
        break;
      case 'eliminate':
        steps.push(
          step(question, move, {
            part: item.type === 'multiple-choice' ? 'options' : 'answer',
            highlight: question.evidence,
            context: question.traps.flatMap((trap) => (trap.lure ? [trap.lure] : [])),
            traps: question.traps,
          }),
        );
        break;
      case 'cohesion': {
        const links = question.pairs.filter((pair) => pair.from !== undefined);
        steps.push(
          step(question, move, {
            highlight: links.flatMap((pair) => [pair.from as TextRange, pair.to as TextRange]),
            context: evidenceRanges,
            pairs: links,
          }),
        );
        break;
      }
      case 'check-answer':
        steps.push(
          step(question, move, {
            part: 'answer',
            params: question.wordLimit !== undefined ? { wordLimit: question.wordLimit } : {},
          }),
        );
        break;
      case 'compare-views':
        steps.push(step(question, move, { part: 'options', highlight: question.evidence }));
        break;
    }
  }
  return steps;
}

/**
 * The planned route of `group`: its passage laid out, each question with its
 * quotes found, and the steps of every question not at `solo`. A group with
 * no route, or with a redacted one, plans every question at `solo`.
 */
export function planRoute(group: ItemGroup, options: PlanRouteOptions = {}): RoutePlan {
  const body = typeof group.stimulus.body === 'string' ? group.stimulus.body : '';
  const route = group.route;
  const layout = passageLayout(body, route);
  const entries = new Map<string, RouteQuestion>();
  for (const entry of route?.questions ?? []) {
    entries.set(questionKey(entry.itemId, entry.partId), entry);
  }
  const itemsById = new Map(group.items.map((item) => [item.id, item as unknown as Fields]));
  const startAt = route?.startAt ?? 1;

  const questions: PlannedQuestion[] = [];
  for (const found of itemQuestions(group.items)) {
    const entry = entries.get(found.key);
    if (entry === undefined || !isRouteStrategyId(entry.strategy)) {
      continue;
    }
    const level = options.level ?? options.levels?.[entry.strategy] ?? 'walkthrough';
    questions.push(
      planQuestion(
        body,
        layout,
        itemsById.get(found.itemId),
        entry,
        found.key,
        startAt + found.position,
        level,
      ),
    );
  }

  const steps: RouteStep[] = [];
  const guided = questions.filter((question) => question.level !== 'solo');
  const surveying = guided.find((question) =>
    ROUTE_STRATEGIES[question.strategy].moves.includes('survey'),
  );
  if (surveying !== undefined) {
    // The first sentence of each paragraph that has words: a gap's "[ 1 ]" is not one to read.
    const openings = layout.paragraphs.flatMap((paragraph) => {
      const first = layout.sentences.find(
        (sentence) =>
          sentence.paragraph === paragraph.index &&
          /\p{L}/u.test(body.slice(sentence.start, sentence.end)),
      );
      return first === undefined ? [] : [{ start: first.start, end: first.end }];
    });
    steps.push({
      id: 'survey',
      move: 'survey',
      level: surveying.level,
      strategy: surveying.strategy,
      highlight: openings,
      context: [],
      phrases: [],
      pairs: [],
      traps: [],
      params: {},
    });
  }
  let previous: PlannedQuestion | undefined;
  for (const question of questions) {
    if (question.level !== 'solo') {
      steps.push(
        ...stepsFor(body, layout, itemsById.get(question.itemId) ?? {}, question, previous),
      );
    }
    previous = question;
  }

  const levels: Partial<Record<RouteStrategyId, RouteLevel>> = {};
  for (const question of questions) {
    levels[question.strategy] ??= question.level;
  }
  return { layout, questions, steps, levels };
}
