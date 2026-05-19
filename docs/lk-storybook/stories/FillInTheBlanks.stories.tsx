import type { FillInTheBlanksData } from '@intellectif/lk-core';
import { FillInTheBlanks } from '@intellectif/lk-react/components/FillInTheBlanks';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn, userEvent, within } from 'storybook/test';

const data: FillInTheBlanksData = {
  schemaVersion: '1.0',
  type: 'fill-in-the-blanks',
  id: 'sb-fib',
  title: 'The Water Cycle',
  passage:
    'Liquid water becomes vapour through {{evaporation}}, then returns to the ground as {{precipitation}}.',
  blanks: [
    { id: 'evaporation', acceptedAnswers: ['evaporation'], hint: 'Starts with the letter E' },
    { id: 'precipitation', acceptedAnswers: ['precipitation', 'rain'] },
  ],
  scoringStrategy: 'partial',
};

const meta: Meta<typeof FillInTheBlanks> = {
  title: 'Activities/FillInTheBlanks',
  component: FillInTheBlanks,
  args: { data, onComplete: fn(), onInteraction: fn() },
};
export default meta;

type Story = StoryObj<typeof FillInTheBlanks>;

export const Default: Story = {};

export const WithHints: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Show hint' }));
  },
};

export const Disabled: Story = { args: { disabled: true } };

export const CompletedWithCorrectAnswers: Story = {
  args: { showCorrectAnswers: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('textbox', { name: 'Fill in blank 1' }), 'evaporation');
    await userEvent.type(canvas.getByRole('textbox', { name: 'Fill in blank 2' }), 'wrong');
    await userEvent.click(canvas.getByRole('button', { name: 'Check answers' }));
  },
};
