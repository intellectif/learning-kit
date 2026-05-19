import type { MultipleChoiceData } from '@intellectif/lk-core';
import { MultipleChoice } from '@intellectif/lk-react/components/MultipleChoice';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn, userEvent, within } from 'storybook/test';

const single: MultipleChoiceData = {
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'sb-mc',
  title: 'Arithmetic',
  question: 'What is 2 + 2?',
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  options: [
    { id: 'a', text: 'Three', isCorrect: false },
    { id: 'b', text: 'Four', isCorrect: true, feedback: 'Correct!' },
    { id: 'c', text: 'Five', isCorrect: false },
  ],
};

const meta: Meta<typeof MultipleChoice> = {
  title: 'Activities/MultipleChoice',
  component: MultipleChoice,
  args: { data: single, onComplete: fn(), onInteraction: fn() },
};
export default meta;

type Story = StoryObj<typeof MultipleChoice>;

export const Default: Story = {};

export const MultiSelect: Story = {
  args: {
    data: {
      ...single,
      id: 'sb-mc-multi',
      title: 'Even numbers',
      question: 'Select all even numbers',
      mode: 'multi',
      options: [
        { id: 'x', text: 'Two', isCorrect: true },
        { id: 'y', text: 'Three', isCorrect: false },
        { id: 'z', text: 'Four', isCorrect: true },
      ],
    },
  },
};

export const Shuffled: Story = {
  args: { data: { ...single, id: 'sb-mc-shuffle', shuffle: true } },
};

export const WithMedia: Story = {
  args: {
    data: {
      ...single,
      id: 'sb-mc-media',
      media: {
        type: 'image',
        url:
          'data:image/svg+xml,' +
          encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="120">' +
              '<rect width="480" height="120" fill="#18181b"/><text x="50%" y="50%" ' +
              'fill="#fafafa" font-family="sans-serif" font-size="18" text-anchor="middle" ' +
              'dominant-baseline="middle">Question media</text></svg>',
          ),
        alt: 'Decorative banner',
      },
    },
  },
};

export const Disabled: Story = { args: { disabled: true } };

export const Completed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('radio', { name: 'Four' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Submit' }));
  },
};
