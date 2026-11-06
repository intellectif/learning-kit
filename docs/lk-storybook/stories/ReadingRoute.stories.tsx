import type { ActivityData, ItemGroup } from '@intellectif/lk-core';
import { ReadingRoute } from '@intellectif/lk-react/components/ReadingRoute';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

/*
 * Two passages written for this storybook, in the shape of the exam tasks the
 * strategies serve: an IELTS-style passage with True/False/Not Given, multiple
 * choice, note completion and matching headings, and a Cambridge-style gapped
 * text. Neither is taken from any exam.
 */

const TRAMS = [
  'In the middle of the twentieth century, most European and North American cities tore up their tram lines. Buses were cheaper to buy, needed no rails and could be rerouted overnight. By 1960, only a handful of British cities still ran trams at all.',
  'Planners began to reconsider in the 1980s. Congestion had become severe, and studies showed that drivers who would never take a bus were willing to use a tram. Researchers called this the "rail factor": passengers trusted a vehicle that could not change its route without warning.',
  'The first modern system in Britain opened in Manchester in 1992. Its builders reused old railway lines wherever possible, which kept the cost to around £145 million. Within five years, the network carried 14 million passengers a year, roughly double the original forecast.',
  "Not every scheme has been a success. Edinburgh's line, approved in 2007, opened seven years late and at almost twice its planned budget. Critics argued that the city had underestimated the difficulty of moving the pipes and cables buried beneath its streets.",
  'Today, supporters point less to speed than to the effect on city centres. Shops near tram stops in several French cities reported higher sales after lines opened, although economists caution that these towns were investing in pavements and parks at the same time.',
].join('\n\n');

const tfng = (id: string, question: string, answer: 't' | 'f' | 'ng'): ActivityData => ({
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id,
  title: `Statement ${id}`,
  instructions:
    'Do the following statements agree with the information given in the passage? Choose TRUE, FALSE or NOT GIVEN.',
  question,
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  options: [
    { id: 't', text: 'True', isCorrect: answer === 't' },
    { id: 'f', text: 'False', isCorrect: answer === 'f' },
    { id: 'ng', text: 'Not Given', isCorrect: answer === 'ng' },
  ],
});

const trams: ItemGroup = {
  schemaVersion: '1.0',
  type: 'item-group',
  id: 'sb-rr-trams',
  title: 'The Return of the Tram',
  stimulus: { id: 'sb-rr-trams-text', kind: 'text', title: 'The Return of the Tram', body: TRAMS },
  items: [
    tfng('tf1', 'By 1960, most British cities had stopped running trams.', 't'),
    tfng('tf2', 'Passengers preferred trams because they were faster than buses.', 'ng'),
    tfng('tf3', 'The Manchester network attracted fewer passengers than expected.', 'f'),
    {
      schemaVersion: '1.0',
      type: 'multiple-choice',
      id: 'mc1',
      title: 'Edinburgh',
      question: "What does the writer give as the main cause of Edinburgh's problems?",
      mode: 'single',
      scoringStrategy: 'all-or-nothing',
      options: [
        { id: 'a', text: 'The line was approved too late.', isCorrect: false },
        { id: 'b', text: 'Work under the streets was harder than expected.', isCorrect: true },
        { id: 'c', text: 'The trams cost too much to run.', isCorrect: false },
        { id: 'd', text: 'Critics opposed the project.', isCorrect: false },
      ],
    },
    {
      schemaVersion: '1.0',
      type: 'fill-in-the-blanks',
      id: 'fib1',
      title: 'Manchester',
      instructions:
        'Complete the notes. Choose NO MORE THAN THREE WORDS from the passage for each answer.',
      passage:
        "Manchester's builders kept costs down by reusing {{b1}}. Five years after opening, the network carried {{b2}} passengers a year.",
      scoringStrategy: 'partial',
      blanks: [
        { id: 'b1', acceptedAnswers: ['old railway lines', 'railway lines'] },
        { id: 'b2', acceptedAnswers: ['14 million'] },
      ],
    },
    {
      schemaVersion: '1.0',
      type: 'gap-select',
      id: 'gs1',
      title: 'Headings',
      instructions: 'Choose the correct heading for paragraphs B and E from the list of headings.',
      passage: 'Paragraph B {{g1}}\nParagraph E {{g2}}',
      scoringStrategy: 'partial',
      banks: [
        {
          id: 'headings',
          choices: [
            { id: 'h1', text: 'Why passengers came back to rails' },
            { id: 'h2', text: 'A benefit beyond the journey' },
            { id: 'h3', text: 'The high price of digging' },
            { id: 'h4', text: 'Faster than the bus' },
            { id: 'h5', text: 'The end of an era' },
          ],
        },
      ],
      gaps: [
        { id: 'g1', bankId: 'headings', correctChoiceId: 'h1' },
        { id: 'g2', bankId: 'headings', correctChoiceId: 'h2' },
      ],
    },
  ],
  route: {
    routeVersion: '1.0',
    paragraphLabels: ['A', 'B', 'C', 'D', 'E'],
    questions: [
      {
        itemId: 'tf1',
        strategy: 'tfng',
        evidence: ['By 1960, only a handful of British cities still ran trams at all.'],
        keywords: [
          { question: 'By 1960' },
          {
            question: 'stopped running trams',
            passage: 'only a handful of British cities still ran trams',
          },
        ],
      },
      {
        itemId: 'tf2',
        strategy: 'tfng',
        evidence: ['passengers trusted a vehicle that could not change its route without warning'],
        keywords: [
          { question: 'Passengers preferred trams', passage: 'passengers trusted a vehicle' },
        ],
        traps: [{ optionId: 't', kind: 'outside-knowledge' }],
      },
      {
        itemId: 'tf3',
        strategy: 'tfng',
        evidence: ['roughly double the original forecast'],
        keywords: [
          { question: 'Manchester network', passage: 'the network carried 14 million passengers' },
          {
            question: 'fewer passengers than expected',
            passage: 'roughly double the original forecast',
          },
        ],
        traps: [{ optionId: 't', kind: 'opposite' }],
      },
      {
        itemId: 'mc1',
        strategy: 'multiple-choice',
        evidence: [
          'the city had underestimated the difficulty of moving the pipes and cables buried beneath its streets',
        ],
        keywords: [
          { question: 'Edinburgh', passage: "Edinburgh's line" },
          {
            question: 'Work under the streets',
            passage: 'pipes and cables buried beneath its streets',
          },
        ],
        traps: [
          { optionId: 'a', kind: 'word-match', lure: 'approved in 2007' },
          { optionId: 'c', kind: 'partial', lure: 'almost twice its planned budget' },
          { optionId: 'd', kind: 'word-match', lure: 'Critics argued' },
        ],
      },
      {
        itemId: 'fib1',
        partId: 'b1',
        strategy: 'completion',
        wordLimit: 3,
        evidence: ['reused old railway lines wherever possible'],
        keywords: [
          { question: 'kept costs down', passage: 'kept the cost to around £145 million' },
        ],
      },
      {
        itemId: 'fib1',
        partId: 'b2',
        strategy: 'completion',
        wordLimit: 3,
        evidence: ['the network carried 14 million passengers a year'],
        keywords: [{ question: 'Five years after opening', passage: 'Within five years' }],
      },
      {
        itemId: 'gs1',
        partId: 'g1',
        strategy: 'matching-headings',
        evidence: [
          'studies showed that drivers who would never take a bus were willing to use a tram',
        ],
      },
      {
        itemId: 'gs1',
        partId: 'g2',
        strategy: 'matching-headings',
        evidence: ['supporters point less to speed than to the effect on city centres'],
        traps: [{ optionId: 'h4', kind: 'word-match', lure: 'supporters point less to speed' }],
      },
    ],
  },
} as ItemGroup;

const BAKERY = [
  'Maria Ortiz opened her bakery on a quiet street in 2015, expecting to sell bread to her neighbours and little else.',
  '[ 1 ]',
  'That decision changed everything. Within a year, the queue outside her door started before sunrise.',
  '[ 2 ]',
  'Even so, she refuses to open a second shop. Growing, she says, would mean losing the conversations that made the first one work.',
  'Then a customer asked whether she could bake a loaf without wheat. She had never tried, but she promised to experiment over the weekend.',
  'Today the bakery employs eleven people and supplies four restaurants. Most of its customers still live within walking distance.',
  'The town council has since repaired the street and planted trees along it.',
].join('\n\n');

const gap = (id: string, number: number, answer: 'a' | 'b' | 'c'): ActivityData => ({
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id,
  title: `Gap ${number}`,
  instructions:
    'Choose the paragraph that fits each gap. There is one extra paragraph you do not need.',
  question: `Which paragraph fits gap ${number}?`,
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  options: [
    { id: 'a', text: 'A', isCorrect: answer === 'a' },
    { id: 'b', text: 'B', isCorrect: answer === 'b' },
    { id: 'c', text: 'C', isCorrect: answer === 'c' },
  ],
});

const bakery: ItemGroup = {
  schemaVersion: '1.0',
  type: 'item-group',
  id: 'sb-rr-bakery',
  title: 'A Bakery That Stayed Small',
  stimulus: {
    id: 'sb-rr-bakery-text',
    kind: 'text',
    title: 'A Bakery That Stayed Small',
    body: BAKERY,
  },
  items: [gap('gap1', 1, 'a'), gap('gap2', 2, 'b')],
  route: {
    routeVersion: '1.0',
    sections: [
      { label: 'The text', paragraphs: 5 },
      { label: 'The missing paragraphs', paragraphs: 3 },
    ],
    paragraphLabels: ['', '', '', '', '', 'A', 'B', 'C'],
    questions: [
      {
        itemId: 'gap1',
        strategy: 'gapped-text',
        evidence: ['She had never tried, but she promised to experiment over the weekend.'],
        links: [{ from: 'That decision', to: 'she promised to experiment over the weekend' }],
        traps: [{ optionId: 'c', kind: 'not-the-question', lure: 'repaired the street' }],
      },
      {
        itemId: 'gap2',
        strategy: 'gapped-text',
        evidence: ['Today the bakery employs eleven people and supplies four restaurants.'],
        links: [{ from: 'Even so', to: 'employs eleven people and supplies four restaurants' }],
      },
    ],
  },
} as ItemGroup;

const meta: Meta<typeof ReadingRoute> = {
  title: 'Activities/ReadingRoute',
  component: ReadingRoute,
  args: { group: trams, onFinish: fn(), onTraceChange: fn() },
  parameters: { wide: true },
};
export default meta;

type Story = StoryObj<typeof ReadingRoute>;

/** Every step shown, with a prediction asked before the evidence appears. */
export const Walkthrough: Story = {};

/** Each step named, not located: the learner finds the evidence, or asks to be shown. */
export const Coached: Story = { args: { level: 'coached' } };

/** No guide, an IELTS pace, and evidence marked for each answer; the debrief after Finish. */
export const SoloTimed: Story = { args: { level: 'solo', pace: true } };

/** A learner who already handles True/False/Not Given: that strategy solo, the rest guided. */
export const Faded: Story = {
  args: {
    learnerState: {
      stateVersion: '1',
      strategies: {
        tfng: { level: 'solo', streak: 0 },
        completion: { level: 'coached', streak: 1 },
      },
      seen: [],
    },
  },
};

/** Cambridge-style gapped text: the links that decide which paragraph belongs where. */
export const GappedText: Story = { args: { group: bakery } };
