import { describe, expect, it } from 'vitest';
import { redactItemGroup } from '../../redact.js';
import type { ItemGroup } from '../../types/item-group.js';
import type { RouteStep } from '../../types/reading-route.js';
import { planRoute } from '../plan.js';
import { ROUTE_STRATEGIES, ROUTE_STRATEGY_IDS } from '../strategies.js';
import { routeStepText, routeTrapText } from '../text.js';
import { PASSAGE, tramGroup } from './fixture.js';

const slice = (range: { start: number; end: number }): string =>
  PASSAGE.slice(range.start, range.end);
const stepsOf = (steps: RouteStep[], question: string): string[] =>
  steps.filter((step) => step.question === question).map((step) => step.move);

describe('planRoute', () => {
  it('numbers questions as on the paper and resolves every quote', () => {
    const plan = planRoute(tramGroup());
    expect(plan.questions.map((question) => [question.key, question.number])).toEqual([
      ['tf1', 1],
      ['tf2', 2],
      ['tf3', 3],
      ['mc1', 4],
      ['fib1#b1', 5],
      ['fib1#b2', 6],
      ['gs1#g1', 7],
      ['gs1#g2', 8],
    ]);
    const tf3 = plan.questions[2];
    expect(tf3?.evidence.map(slice)).toEqual(['roughly double the original forecast']);
    expect(tf3?.evidenceSentences).toEqual([8]);
    expect(tf3?.pairs.map((pair) => [pair.index, pair.question, pair.passage?.text])).toEqual([
      [1, 'Manchester network', 'the network carried 14 million passengers'],
      [2, 'fewer passengers than expected', 'roughly double the original forecast'],
    ]);
    expect(
      plan.questions[3]?.traps.map((trap) => [trap.optionId, trap.option, trap.lure?.text]),
    ).toEqual([
      ['a', 'The line was approved too late.', 'approved in 2007'],
      ['c', 'The trams cost too much to run.', 'almost twice its planned budget'],
      ['d', 'Critics opposed the project.', 'Critics argued'],
    ]);
  });

  it('walks each strategy through its steps, surveying once before a gist task', () => {
    const plan = planRoute(tramGroup());
    expect(plan.steps[0]?.id).toBe('survey');
    expect(plan.steps[0]?.highlight.map(slice)).toEqual([
      'In the middle of the twentieth century, most European and North American cities tore up their tram lines.',
      'Planners began to reconsider in the 1980s.',
      'The first modern system in Britain opened in Manchester in 1992.',
      'Not every scheme has been a success.',
      'Today, supporters point less to speed than to the effect on city centres.',
    ]);
    // The instructions are read once, at the start of a run of one strategy.
    expect(stepsOf(plan.steps, 'tf1')).toEqual([
      'read-instructions',
      'keywords',
      'locate',
      'read-around',
      'paraphrase',
      'decide',
    ]);
    expect(stepsOf(plan.steps, 'tf2')).toEqual([
      'keywords',
      'locate',
      'read-around',
      'paraphrase',
      'decide',
    ]);
    expect(stepsOf(plan.steps, 'mc1')).toEqual([
      'keywords',
      'predict',
      'locate',
      'read-around',
      'paraphrase',
      'eliminate',
    ]);
    expect(stepsOf(plan.steps, 'fib1#b1')).toEqual([
      'read-instructions',
      'keywords',
      'predict',
      'locate',
      'read-around',
      'check-answer',
    ]);
    expect(stepsOf(plan.steps, 'gs1#g1')).toEqual(['locate', 'paraphrase', 'eliminate']);
    expect(new Set(plan.steps.map((step) => step.id)).size).toBe(plan.steps.length);
  });

  it('starts each search after the previous answer when answers follow the text', () => {
    const plan = planRoute(tramGroup());
    const locate = (key: string) => plan.steps.find((step) => step.id === `${key}/locate`);
    expect(locate('tf1')?.zone).toBeUndefined();
    expect(locate('tf2')?.params.previous).toBe(1);
    expect(locate('tf2')?.zone?.start).toBe(
      PASSAGE.indexOf('trams at all.') + 'trams at all.'.length,
    );
    expect(locate('tf2')?.ask).toBe('locate');
    // A heading's search is its paragraph.
    expect(slice(locate('gs1#g2')?.zone as { start: number; end: number })).toMatch(
      /^Today, supporters/,
    );
    expect(locate('gs1#g2')?.params.region).toBe('E');
  });

  it('shows the sentences around the evidence when reading around it', () => {
    const step = planRoute(tramGroup()).steps.find(
      (candidate) => candidate.id === 'tf1/read-around',
    );
    expect(step?.highlight.map(slice)).toEqual([
      'By 1960, only a handful of British cities still ran trams at all.',
    ]);
    expect(step?.context.map(slice)).toEqual([
      'Buses were cheaper to buy, needed no rails and could be rerouted overnight.',
    ]);
  });

  it('plans no steps for a strategy at solo, and plans a redacted route at solo throughout', () => {
    const plan = planRoute(tramGroup(), { levels: { tfng: 'solo' } });
    expect(plan.steps.some((step) => step.strategy === 'tfng')).toBe(false);
    expect(plan.levels).toEqual({
      tfng: 'solo',
      'multiple-choice': 'walkthrough',
      completion: 'walkthrough',
      'matching-headings': 'walkthrough',
    });
    const pinned = planRoute(tramGroup(), { level: 'coached', levels: { tfng: 'solo' } });
    expect(pinned.steps.every((step) => step.level === 'coached')).toBe(true);
    const redacted = planRoute(redactItemGroup(tramGroup()) as unknown as ItemGroup);
    expect(redacted.steps).toEqual([]);
    expect(redacted.questions.every((question) => question.level === 'solo')).toBe(true);
  });

  it('plans a group with no route as nothing to guide', () => {
    const group = tramGroup();
    delete group.route;
    expect(planRoute(group).questions).toEqual([]);
  });

  it('carries an author note onto its step', () => {
    const group = tramGroup();
    const first = group.route?.questions[0];
    if (first !== undefined) {
      first.notes = { locate: 'Dates are the fastest thing to scan for.' };
    }
    const step = planRoute(group).steps.find(
      (candidate) => candidate.id === 'tf1/locate',
    ) as RouteStep;
    expect(routeStepText(step)).toBe('Dates are the fastest thing to scan for.');
  });

  it('plans links for a gapped text, sections for a cross-text task', () => {
    const body =
      'The old system failed. [1]\n\nThis change saved money. It was popular.\n\nNobody noticed.';
    const group: ItemGroup = {
      schemaVersion: '1.0',
      type: 'item-group',
      id: 'gt',
      stimulus: { id: 's', kind: 'text', body },
      items: [
        {
          schemaVersion: '1.0',
          type: 'multiple-choice',
          id: 'gap1',
          title: 'Gap 1',
          question: 'Which paragraph fits gap 1?',
          mode: 'single',
          scoringStrategy: 'all-or-nothing',
          options: [
            { id: 'A', text: 'A', isCorrect: true },
            { id: 'B', text: 'B', isCorrect: false },
          ],
        },
      ],
      route: {
        routeVersion: '1.0',
        sections: [
          { label: 'Main text', paragraphs: 1 },
          { label: 'Paragraphs', paragraphs: 2 },
        ],
        paragraphLabels: ['', 'A', 'B'],
        questions: [
          {
            itemId: 'gap1',
            strategy: 'gapped-text',
            evidence: ['This change saved money.'],
            links: [{ from: 'This change', to: 'The old system failed.' }],
          },
        ],
      },
    };
    const plan = planRoute(group);
    expect(plan.steps.map((step) => step.move)).toEqual([
      'survey',
      'locate',
      'cohesion',
      'eliminate',
    ]);
    // The gap marker is no opening to skim.
    expect(plan.steps[0]?.highlight.map((range) => body.slice(range.start, range.end))).toEqual([
      'The old system failed.',
      'This change saved money.',
      'Nobody noticed.',
    ]);
    const cohesion = plan.steps[2] as RouteStep;
    expect(cohesion.pairs.map((pair) => [pair.from?.text, pair.to?.text])).toEqual([
      ['This change', 'The old system failed.'],
    ]);
    expect(routeStepText(cohesion)).toContain('“This change” points to “The old system failed.”');
    expect(plan.steps[1]?.params.region).toBe('Paragraphs');
  });
});

describe('routeStepText', () => {
  it('says something for every step of every strategy', () => {
    for (const strategy of ROUTE_STRATEGY_IDS) {
      for (const move of ROUTE_STRATEGIES[strategy].moves) {
        for (const params of [{}, { previous: 2, region: 'C', wordLimit: 2 }]) {
          const text = routeStepText({
            id: 'x',
            move,
            level: 'walkthrough',
            number: 3,
            strategy,
            highlight: [],
            context: [],
            phrases: [],
            pairs: [],
            traps: [],
            params,
          });
          expect(text.length, `${strategy}/${move}`).toBeGreaterThan(20);
        }
      }
    }
  });

  it('names the key words, the paraphrases and the order of the text', () => {
    const plan = planRoute(tramGroup());
    const text = (id: string): string =>
      routeStepText(plan.steps.find((step) => step.id === id) as RouteStep);
    expect(text('tf3/keywords')).toContain(
      '“Manchester network” and “fewer passengers than expected”',
    );
    expect(text('tf3/locate')).toContain('start after the answer to question 2');
    expect(text('tf1/locate')).toContain('the first question of its set');
    expect(text('tf3/paraphrase')).toContain(
      'the question says “fewer passengers than expected”, the text says “roughly double the original forecast”',
    );
    expect(text('fib1#b1/read-instructions')).toContain('NO MORE THAN THREE WORDS');
    expect(text('fib1#b2/check-answer')).toContain('no more than 3');
    expect(text('gs1#g1/locate')).toContain('paragraph B');
    expect(text('mc1/eliminate')).toContain(
      '“Critics opposed the project.” repeats words from the text',
    );
  });

  it('explains every kind of trap', () => {
    for (const kind of [
      'word-match',
      'opposite',
      'partial',
      'outside-knowledge',
      'too-general',
      'too-specific',
      'not-the-question',
    ] as const) {
      expect(routeTrapText({ optionId: 'x', kind, option: 'X' })).toMatch(/^“X” /);
      expect(routeTrapText({ optionId: 'x', kind })).toMatch(/^This option /);
    }
  });
});
