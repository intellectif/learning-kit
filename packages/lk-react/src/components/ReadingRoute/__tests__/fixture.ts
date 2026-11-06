import type { ActivityData, ItemGroup } from '@intellectif/lk-core';

/**
 * The same passage and questions as lk-core's reading-route fixture: a short
 * exam-style passage written for these tests, with eight questions in
 * four strategies: True/False/Not Given, multiple choice, completion with a
 * word limit, and matching headings.
 */
export const PASSAGE = [
  'In the middle of the twentieth century, most European and North American cities tore up their tram lines. Buses were cheaper to buy, needed no rails and could be rerouted overnight. By 1960, only a handful of British cities still ran trams at all.',
  'Planners began to reconsider in the 1980s. Congestion had become severe, and studies showed that drivers who would never take a bus were willing to use a tram. Researchers called this the "rail factor": passengers trusted a vehicle that could not change its route without warning.',
  'The first modern system in Britain opened in Manchester in 1992. Its builders reused old railway lines wherever possible, which kept the cost to around £145 million. Within five years, the network carried 14 million passengers a year, roughly double the original forecast.',
  "Not every scheme has been a success. Edinburgh's line, approved in 2007, opened seven years late and at almost twice its planned budget. Critics argued that the city had underestimated the difficulty of moving the pipes and cables buried beneath its streets.",
  'Today, supporters point less to speed than to the effect on city centres. Shops near tram stops in several French cities reported higher sales after lines opened, although economists caution that these towns were investing in pavements and parks at the same time.',
].join('\n\n');

const TFNG_INSTRUCTIONS =
  'Do the following statements agree with the information given in the passage? Choose TRUE, FALSE or NOT GIVEN.';

const tfng = (id: string, question: string, answer: 't' | 'f' | 'ng'): ActivityData => ({
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id,
  title: `Statement ${id}`,
  instructions: TFNG_INSTRUCTIONS,
  question,
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  options: [
    { id: 't', text: 'True', isCorrect: answer === 't' },
    { id: 'f', text: 'False', isCorrect: answer === 'f' },
    { id: 'ng', text: 'Not Given', isCorrect: answer === 'ng' },
  ],
});

export function tramGroup(): ItemGroup {
  return {
    schemaVersion: '1.0',
    type: 'item-group',
    id: 'trams',
    title: 'The Return of the Tram',
    stimulus: { id: 'trams-text', kind: 'text', title: 'The Return of the Tram', body: PASSAGE },
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
        instructions:
          'Choose the correct heading for paragraphs B and E from the list of headings.',
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
          evidence: [
            'passengers trusted a vehicle that could not change its route without warning',
          ],
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
            {
              question: 'Manchester network',
              passage: 'the network carried 14 million passengers',
            },
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
}
