import type { SequenceEntry } from '@intellectif/lk-core';
import { ActivitySequence } from '@intellectif/lk-react/components/ActivitySequence';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

/** Two loose questions, then a reading group whose passage stays beside its questions. */
const activities: SequenceEntry[] = [
  {
    schemaVersion: '1.0',
    type: 'multiple-choice',
    id: 'sb-seq-capital',
    title: 'Capital',
    question: 'What is the capital of Spain?',
    mode: 'single',
    scoringStrategy: 'all-or-nothing',
    options: [
      { id: 'madrid', text: 'Madrid', isCorrect: true },
      { id: 'seville', text: 'Seville', isCorrect: false },
    ],
  },
  {
    schemaVersion: '1.0',
    type: 'fill-in-the-blanks',
    id: 'sb-seq-be',
    title: 'To be',
    passage: 'My name {{be}} Rossi.',
    blanks: [{ id: 'be', acceptedAnswers: ['is'] }],
    scoringStrategy: 'partial',
  },
  {
    schemaVersion: '1.0',
    type: 'item-group',
    id: 'sb-seq-tides',
    title: 'Tides',
    stimulus: {
      id: 'sb-seq-tides-text',
      kind: 'text',
      title: 'Tides',
      body: 'The sea rises and falls twice a day, pulled by the moon and, less strongly, by the sun.',
    },
    items: [
      {
        schemaVersion: '1.0',
        type: 'multiple-choice',
        id: 'sb-seq-how-often',
        title: 'How often',
        question: 'How often does the sea rise and fall?',
        mode: 'single',
        scoringStrategy: 'all-or-nothing',
        options: [
          { id: 'twice', text: 'Twice a day', isCorrect: true },
          { id: 'once', text: 'Once a day', isCorrect: false },
        ],
      },
      {
        schemaVersion: '1.0',
        type: 'fill-in-the-blanks',
        id: 'sb-seq-pulled',
        title: 'Pulled by',
        passage: 'The tides are pulled mostly by the {{moon}}.',
        blanks: [{ id: 'moon', acceptedAnswers: ['moon'] }],
        scoringStrategy: 'partial',
      },
    ],
  },
];

const meta: Meta<typeof ActivitySequence> = {
  title: 'Pagers/ActivitySequence',
  component: ActivitySequence,
  args: { activities, onActivityComplete: fn(), onFinished: fn() },
};
export default meta;

type Story = StoryObj<typeof ActivitySequence>;

export const Practice: Story = {};

export const Exam: Story = { args: { renderMode: 'exam', shuffleSeed: 'storybook' } };
