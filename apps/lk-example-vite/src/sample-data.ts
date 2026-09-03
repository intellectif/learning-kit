import type {
  FillInTheBlanksData,
  ItemGroup,
  MultipleChoiceData,
  SequenceEntry,
} from '@intellectif/lk-core';

// Inline SVG data URI so the demo needs no network/asset hosting.
const sampleImage =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="160">' +
      '<rect width="480" height="160" fill="#18181b"/>' +
      '<text x="50%" y="50%" fill="#fafafa" font-family="sans-serif" font-size="20" ' +
      'text-anchor="middle" dominant-baseline="middle">Sample question media</text></svg>',
  );

export const sampleMultipleChoice: MultipleChoiceData = {
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'demo-mc-capitals',
  title: 'World Capitals',
  question: 'Which city is the capital of Japan?',
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  media: { type: 'image', url: sampleImage, alt: 'Illustrative banner for the question' },
  options: [
    { id: 'tokyo', text: 'Tokyo', isCorrect: true },
    { id: 'seoul', text: 'Seoul', isCorrect: false },
    { id: 'beijing', text: 'Beijing', isCorrect: false },
    { id: 'bangkok', text: 'Bangkok', isCorrect: false },
  ],
  shuffle: true,
};

export const sampleFillInTheBlanks: FillInTheBlanksData = {
  schemaVersion: '1.0',
  type: 'fill-in-the-blanks',
  id: 'demo-fib-water-cycle',
  title: 'The Water Cycle',
  // Embedded video the question is based on (provider embed URL — not the
  // watch page; YouTube watch links cannot play in a <video> element).
  media: {
    type: 'embed',
    url: 'https://www.youtube.com/embed/TD3XSIE4ymo',
    alt: 'Video: how the water cycle works',
  },
  passage:
    'Liquid water becomes vapour through {{evaporation}}, then returns to the ground as {{precipitation}}.',
  blanks: [
    {
      id: 'evaporation',
      acceptedAnswers: ['evaporation'],
      hint: 'Starts with the letter E',
      feedback: 'Heat turns liquid water into vapour.',
    },
    {
      id: 'precipitation',
      acceptedAnswers: ['precipitation', 'rain'],
      feedback: 'Rain, snow and hail are all precipitation.',
    },
  ],
  scoringStrategy: 'partial',
  feedback: {
    correct: 'You understand the water cycle!',
    incorrect: 'Review the hints and retry.',
  },
};

export const sampleFillInTheBlanks2: FillInTheBlanksData = {
  schemaVersion: '1.0',
  type: 'fill-in-the-blanks',
  id: 'demo-fib-water-cycle-2',
  title: 'The Water Cycle — Part 2',
  passage:
    'Water collected in clouds is stored as {{condensation}}, and water that soaks into the soil becomes {{groundwater}}.',
  blanks: [
    { id: 'condensation', acceptedAnswers: ['condensation'], hint: 'Opposite of evaporation' },
    { id: 'groundwater', acceptedAnswers: ['groundwater', 'ground water'] },
  ],
  scoringStrategy: 'partial',
};

/** A set of same-kind questions, shown via the in-place ActivitySequence pager. */
export const sampleFibSet: FillInTheBlanksData[] = [sampleFillInTheBlanks, sampleFillInTheBlanks2];

/**
 * A reading-comprehension testlet: one passage serving three questions. The
 * group is a CONTAINER, not an activity — the pager flattens it into
 * consecutive questions and keeps the passage on screen beside each of them.
 */
export const sampleReadingGroup: ItemGroup = {
  schemaVersion: '1.0',
  type: 'item-group',
  id: 'demo-reading-tides',
  title: 'Reading — Tides',
  stimulus: {
    id: 'demo-passage-tides',
    kind: 'text',
    title: 'Tides',
    body:
      'Along most coasts the tide comes in twice a day. It is pulled by the moon: as the Earth turns, ' +
      'the ocean nearest the moon bulges towards it, and so does the ocean on the far side.\n\n' +
      'The highest tides, called spring tides, happen when the sun and the moon line up.',
    attribution: 'Adapted from a public-domain primer on ocean tides',
  },
  items: [
    {
      schemaVersion: '1.0',
      type: 'multiple-choice',
      id: 'demo-tides-q1',
      title: 'Tides — frequency',
      question: 'According to the passage, how often does the tide come in?',
      mode: 'single',
      scoringStrategy: 'all-or-nothing',
      options: [
        { id: 'twice', text: 'Twice a day', isCorrect: true },
        { id: 'once', text: 'Once a day', isCorrect: false },
        { id: 'weekly', text: 'Once a week', isCorrect: false },
      ],
    },
    {
      schemaVersion: '1.0',
      type: 'multiple-choice',
      id: 'demo-tides-q2',
      title: 'Tides — spring tides',
      question: 'When do spring tides happen?',
      mode: 'single',
      scoringStrategy: 'all-or-nothing',
      options: [
        { id: 'aligned', text: 'When the sun and the moon line up', isCorrect: true },
        { id: 'season', text: 'Only in spring', isCorrect: false },
        { id: 'storm', text: 'During storms', isCorrect: false },
      ],
    },
    {
      schemaVersion: '1.0',
      type: 'fill-in-the-blanks',
      id: 'demo-tides-q3',
      title: 'Tides — cause',
      passage: 'The tide is pulled by the {{moon}}.',
      blanks: [{ id: 'moon', acceptedAnswers: ['moon'] }],
      scoringStrategy: 'all-or-nothing',
    },
  ],
};

/** Two loose questions followed by a reading group — what the pager presents. */
export const sampleQuestionSet: SequenceEntry[] = [...sampleFibSet, sampleReadingGroup];
