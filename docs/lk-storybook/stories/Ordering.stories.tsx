import type { OrderingData } from '@intellectif/lk-core';
import { Ordering } from '@intellectif/lk-react/components/Ordering';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn, userEvent, within } from 'storybook/test';

/** Written in the right order; the learner never sees it that way. */
const paragraph: OrderingData = {
  schemaVersion: '1.0',
  type: 'ordering',
  id: 'sb-or-tram',
  title: 'The return of the tram',
  instructions: 'Put the sentences in order to make a paragraph.',
  items: [
    { id: 'h3k', text: 'By the 1960s, trams had disappeared from most British cities.' },
    {
      id: 'p8w',
      text: 'Buses were cheaper to run, and they needed no rails.',
      feedback: '"They needed no rails" explains why buses replaced trams, so it comes second.',
    },
    { id: 'a2m', text: 'Thirty years later, though, the tram came back.' },
    { id: 'z5q', text: 'Manchester opened a new line in 1992.' },
    { id: 'c7d', text: 'It carried twice the passengers anyone had expected.' },
  ],
  scoringStrategy: 'partial',
};

const meta: Meta<typeof Ordering> = {
  title: 'Activities/Ordering',
  component: Ordering,
  args: { data: paragraph, onComplete: fn(), onInteraction: fn() },
};
export default meta;

type Story = StoryObj<typeof Ordering>;

/** Move a sentence with its arrow buttons; each move is read out. */
export const Paragraph: Story = {};

/**
 * Checked with one sentence moved to the front: three of five in order, the
 * right order shown below.
 */
export const Checked: Story = {
  args: {
    defaultValue: { type: 'ordering', order: ['c7d', 'h3k', 'p8w', 'a2m', 'z5q'] },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Check answers' }));
  },
};
