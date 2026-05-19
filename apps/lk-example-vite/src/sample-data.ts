import type { FillInTheBlanksData, MultipleChoiceData } from '@intellectif/lk-core';

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
  passage:
    'Liquid water becomes vapour through {{evaporation}}, then returns to the ground as {{precipitation}}.',
  blanks: [
    { id: 'evaporation', acceptedAnswers: ['evaporation'], hint: 'Starts with the letter E' },
    { id: 'precipitation', acceptedAnswers: ['precipitation', 'rain'] },
  ],
  scoringStrategy: 'partial',
};
