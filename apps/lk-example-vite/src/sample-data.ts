import type { FillInTheBlanksData, MultipleChoiceData } from '@intellectif/lk-core';

export const sampleMultipleChoice: MultipleChoiceData = {
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'demo-mc-capitals',
  title: 'World Capitals',
  question: 'Which city is the capital of Japan?',
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
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
