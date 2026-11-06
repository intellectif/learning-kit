import { describe, expect, it } from 'vitest';
import type { ActivityData } from '../../types/activity.js';
import type { ItemGroup } from '../../types/item-group.js';
import { routeIssues } from '../check.js';
import { planRoute } from '../plan.js';
import { routeAnswers } from '../progress.js';
import { choicesOf, itemQuestions, learnerTextOf, partIdsOf } from '../questions.js';
import { tramGroup } from './fixture.js';

/** The fixture's matching-headings task, written as one matching item instead of a gap select. */
const headings: ActivityData = {
  schemaVersion: '1.0',
  type: 'matching',
  id: 'mh1',
  title: 'Headings',
  instructions: 'Choose the correct heading for paragraphs B and E from the list of headings.',
  optionsTitle: 'List of Headings',
  options: [
    { id: 'h1', label: 'i', text: 'Why passengers came back to rails' },
    { id: 'h2', label: 'ii', text: 'A benefit beyond the journey' },
    { id: 'h3', label: 'iii', text: 'The high price of digging' },
    { id: 'h4', label: 'iv', text: 'Faster than the bus' },
    { id: 'h5', label: 'v', text: 'The end of an era' },
  ],
  prompts: [
    { id: 'pB', text: 'Paragraph B', correctOptionId: 'h1' },
    { id: 'pE', text: 'Paragraph E', correctOptionId: 'h2' },
  ],
  optionUse: 'once',
  scoringStrategy: 'partial',
};

function matchingGroup(): ItemGroup {
  const group = tramGroup();
  group.items = group.items.map((item) => (item.id === 'gs1' ? headings : item));
  for (const question of group.route?.questions ?? []) {
    if (question.itemId === 'gs1') {
      question.itemId = 'mh1';
      question.partId = question.partId === 'g1' ? 'pB' : 'pE';
    }
  }
  return group;
}

const messages = (group: ItemGroup): string[] => routeIssues(group).map((issue) => issue.message);

describe('a matching item in a reading route', () => {
  it('is one question per prompt, in list order, with the list as its choices', () => {
    expect(partIdsOf(headings)).toEqual(['pB', 'pE']);
    expect(partIdsOf({ ...headings, prompts: [{ id: 'x' }, { id: 'x' }, { id: '' }, 3] })).toEqual([
      'x',
    ]);
    expect(itemQuestions([headings]).map((question) => question.key)).toEqual(['mh1#pB', 'mh1#pE']);
    expect(choicesOf(headings, 'pE').filter((choice) => choice.correct)).toEqual([
      { id: 'h2', text: 'A benefit beyond the journey', correct: true },
    ]);
    expect(choicesOf(headings, 'nobody')).toEqual([]);
    expect(learnerTextOf(headings)).toContain('List of Headings\nParagraph B\nParagraph E');
    expect(learnerTextOf(headings)).toContain('The end of an era');
  });

  it('is a valid route under the matching strategies', () => {
    expect(messages(matchingGroup())).toEqual([]);
  });

  it('names a missing or unknown prompt as a prompt', () => {
    const missing = matchingGroup();
    missing.route?.questions.splice(6, 1);
    expect(messages(missing)).toEqual(['Prompt "pB" of "mh1" has no route entry.']);

    const unknown = matchingGroup();
    const question = unknown.route?.questions[6];
    if (question !== undefined) {
      question.partId = 'pZ';
    }
    expect(messages(unknown)).toContain('Item "mh1" has no prompt "pZ".');

    const unnamed = matchingGroup();
    const entry = unnamed.route?.questions[6];
    if (entry !== undefined) {
      delete entry.partId;
    }
    expect(messages(unnamed)).toContain(
      'Name the prompt this question is: each one is a question of its own.',
    );
  });

  it('refuses a strategy no matching task is written in', () => {
    const group = matchingGroup();
    const question = group.route?.questions[6];
    if (question !== undefined) {
      question.strategy = 'tfng';
    }
    expect(routeIssues(group).map((issue) => issue.code)).toContain('ig_route_strategy_item_type');
  });

  it('plans its steps, eliminating over the shared list', () => {
    const plan = planRoute(matchingGroup(), { level: 'walkthrough' });
    expect(plan.questions.slice(-2).map((question) => [question.key, question.number])).toEqual([
      ['mh1#pB', 7],
      ['mh1#pE', 8],
    ]);
    const steps = plan.steps.filter((step) => step.question === 'mh1#pE');
    expect(steps.map((step) => [step.move, step.part])).toEqual([
      ['locate', undefined],
      ['paraphrase', 'answer'],
      ['eliminate', 'options'],
    ]);
    expect(steps.at(-1)?.traps.map((trap) => [trap.optionId, trap.option])).toEqual([
      ['h4', 'Faster than the bus'],
    ]);
  });

  it('reads the option a learner matched, and whether it was right', () => {
    const answers = routeAnswers(matchingGroup(), {
      mh1: { type: 'matching', matches: { pB: 'h1', pE: 'h4' } },
    });
    expect(answers['mh1#pB']).toEqual({ correct: true, chosen: 'h1' });
    expect(answers['mh1#pE']).toEqual({ correct: false, chosen: 'h4' });
    const blank = routeAnswers(matchingGroup(), {
      mh1: { type: 'matching', matches: { pB: '' } },
    });
    expect(blank['mh1#pB']).toEqual({ correct: null });
  });
});
