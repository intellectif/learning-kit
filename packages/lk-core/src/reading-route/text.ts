/**
 * The words of each step, in English. Exported so a host that draws its own
 * route, or translates this one, starts from what the SDK says; lk-react's
 * `routeStep` string is this function by default.
 */

import type { PlannedTrap, RouteStep, RouteTrapKind } from '../types/reading-route.js';
import { ROUTE_STRATEGIES } from './strategies.js';

const NUMBER_WORDS = [
  '',
  'ONE',
  'TWO',
  'THREE',
  'FOUR',
  'FIVE',
  'SIX',
  'SEVEN',
  'EIGHT',
  'NINE',
  'TEN',
];

/** "NO MORE THAN TWO WORDS", as the instructions of a paper write it. */
function limitWords(limit: number): string {
  const word = NUMBER_WORDS[limit] ?? String(limit);
  return `${word} WORD${limit === 1 ? '' : 'S'}`;
}

const quote = (words: string): string => `“${words}”`;

function list(words: readonly string[]): string {
  const quoted = words.map(quote);
  if (quoted.length <= 1) {
    return quoted.join('');
  }
  return `${quoted.slice(0, -1).join(', ')} and ${quoted.at(-1) as string}`;
}

/** Why a trapped option attracts, in one sentence. */
export function routeTrapText(trap: PlannedTrap): string {
  const option =
    trap.option !== undefined && trap.option !== '' ? quote(trap.option) : 'This option';
  const texts: Record<RouteTrapKind, string> = {
    'word-match': `${option} repeats words from the text, but the text says something different about them.`,
    opposite: `${option} says the opposite of what the text says.`,
    partial: `${option} is only partly right: the text supports one half of it, not all of it.`,
    'outside-knowledge': `${option} may be true in the real world, but this text does not say it.`,
    'too-general': `${option} is too general: the text is about something narrower.`,
    'too-specific': `${option} is too specific: it matches one detail, not the whole idea.`,
    'not-the-question': `${option} is true, but it does not answer this question.`,
  };
  return texts[trap.kind];
}

/**
 * What the learner reads at a step, in English. An author's note for the step
 * replaces the strategy's words.
 */
export function routeStepText(step: RouteStep): string {
  if (step.note !== undefined) {
    return step.note;
  }
  const n = step.number ?? 0;
  const strategy = step.strategy;
  const phrases = step.phrases;
  const limit = step.params.wordLimit;
  switch (step.move) {
    case 'survey':
      if (strategy === 'gapped-text') {
        return 'First read the main text, skipping the gaps, to follow its line of thought. Then skim the missing paragraphs to see what each is about.';
      }
      if (strategy === 'cross-text') {
        return "Before the questions, skim each text for its writer's overall opinion. Note where each one stands on the topic.";
      }
      return 'Before the questions, skim: read the title and the first sentence of each paragraph. You want what each part is about, not the details.';
    case 'read-instructions':
      if (limit !== undefined) {
        return `Read the instructions first. Write NO MORE THAN ${limitWords(limit)} from the text: a longer answer loses the mark, even when it is correct.`;
      }
      if (strategy === 'tfng') {
        return 'Read the instructions. True / False / Not Given asks about facts: does the text give this information, contradict it, or not say?';
      }
      if (strategy === 'ynng') {
        return "Read the instructions. Yes / No / Not Given asks about the writer's views and claims, not about facts in general.";
      }
      return 'Read the instructions first: they say exactly what to find and how to answer.';
    case 'keywords':
      if (strategy === 'matching-information') {
        return `Question ${n} asks for a kind of information — an example, a reason, a comparison, a description. Note which kind${phrases.length > 0 ? `, and its key words: ${list(phrases)}` : ''}.`;
      }
      if (phrases.length > 0) {
        return `Find the key words in question ${n}: ${list(phrases)}. Names, numbers, dates and specialist terms are the easiest to scan for, because the text rarely changes them.`;
      }
      return `Find the key words in question ${n}: the words that tell you what to look for. Names, numbers, dates and specialist terms are the easiest to scan for.`;
    case 'predict':
      if (strategy === 'multiple-choice') {
        return `Read the question, not the options. Try to answer question ${n} in your own words before you look at the choices.`;
      }
      if (strategy === 'sentence-endings') {
        return `Read the beginning of sentence ${n} and predict how it could end. The ending must complete it in meaning and in grammar.`;
      }
      return `Before you look, predict the answer to question ${n}: what kind of word fits — a noun, a number, a verb, an adjective? Singular or plural?`;
    case 'locate': {
      const target = phrases.length > 0 ? list(phrases) : 'the key words';
      if (strategy === 'matching-headings') {
        const paragraph =
          step.params.region !== undefined ? `paragraph ${step.params.region}` : 'this paragraph';
        return `Which sentence carries the main idea of ${paragraph}? It is often the first or the last, but read the whole paragraph to be sure.`;
      }
      if (strategy === 'gapped-text') {
        return `Read the sentences just before and just after gap ${n}. Which sentence in the missing paragraphs connects to them?`;
      }
      if (strategy === 'cross-text') {
        return `Find where the texts discuss ${target}. You need what every writer thinks, not just one of them.`;
      }
      if (strategy !== undefined && ROUTE_STRATEGIES[strategy].followsOrder) {
        if (step.params.previous !== undefined) {
          return `Scan for ${target}, or words that mean the same. The answers follow the order of the text, so start after the answer to question ${step.params.previous}.`;
        }
        return `Scan for ${target}, or words that mean the same. The answers follow the order of the text: this is the first question of its set, so its answer comes before the others.`;
      }
      const anywhere =
        strategy === 'matching-information'
          ? ' This information can be anywhere, and one paragraph may hold more than one answer.'
          : ' These answers can come in any order.';
      return `Scan the whole text for ${target}, or words that mean the same.${anywhere}`;
    }
    case 'read-around':
      return 'Now read this sentence carefully, with the one before and the one after it. The answer depends on every word — small ones like "only", "all", "not" and "some" most of all.';
    case 'paraphrase': {
      const shown = step.pairs.filter(
        (pair) => pair.question !== undefined && pair.passage !== undefined,
      );
      if (shown.length > 0) {
        const sayings = shown
          .map(
            (pair) =>
              `the question says ${quote(pair.question as string)}, the text says ${quote(pair.passage?.text as string)}`,
          )
          .join('; ');
        return `Same meaning, different words: ${sayings}. That is how answers are hidden.`;
      }
      return "Compare the question's words with the text's. Look for the same idea in different words, not for the same words.";
    }
    case 'decide':
      if (strategy === 'ynng') {
        return 'Decide. If the writer agrees with the statement, it is Yes. If the writer says the opposite, it is No. If you cannot tell what the writer thinks, it is Not Given.';
      }
      return 'Decide. If the text agrees with the statement, it is True. If it says the opposite, it is False. If it does not say, it is Not Given. Use only the text, never what you know.';
    case 'eliminate': {
      const traps = step.traps.map(routeTrapText).join(' ');
      const tail = traps === '' ? '' : ` ${traps}`;
      if (strategy === 'matching-headings') {
        return `Compare the paragraph's main idea with the headings. A heading that matches a single detail or example is a trap.${tail}`;
      }
      if (strategy === 'sentence-endings') {
        return `Check each ending: it must say what the text says and fit the grammar of the beginning. Some endings are true but belong to another sentence.${tail}`;
      }
      if (strategy === 'gapped-text') {
        return `Test your choice: does its first sentence follow on from the text before the gap, and does its last sentence lead into the text after it? One paragraph fits nowhere.${tail}`;
      }
      return `Check every option against the sentence you found. Reject one that repeats words from the text but changes the meaning, or that is true but does not answer the question.${tail}`;
    }
    case 'cohesion': {
      const links = step.pairs.filter((pair) => pair.from !== undefined && pair.to !== undefined);
      if (links.length > 0) {
        const follow = links
          .map(
            (pair) =>
              `${quote(pair.from?.text as string)} points to ${quote(pair.to?.text as string)}`,
          )
          .join('; ');
        return `Follow the links: ${follow}. Words like these show which paragraph belongs in the gap.`;
      }
      return 'Look for words that point backwards or forwards — this, these, such, it, they; however, as a result, also. They show which paragraph belongs in the gap.';
    }
    case 'check-answer':
      if (strategy === 'summary-word-list') {
        return 'Check your choice fits the grammar of the summary and means what the text says. The list uses different words from the text.';
      }
      return limit !== undefined
        ? `Check your answer: spell it exactly as the text does, make sure it fits the grammar of the sentence, and count the words — no more than ${limit}.`
        : 'Check your answer: spell it exactly as the text does, and make sure it fits the grammar of the sentence.';
    case 'compare-views':
      return 'Compare what the writers say about it. Which of them agree, and which one takes a different view?';
  }
}
