import type { WrittenResponseData } from '@intellectif/lk-core';
import { WrittenResponse } from '@intellectif/lk-react/components/WrittenResponse';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn, userEvent, within } from 'storybook/test';

const data: WrittenResponseData = {
  schemaVersion: '1.0',
  type: 'written-response',
  id: 'sb-wr',
  title: 'Your weekend',
  prompt: 'Describe what you did last weekend, in the past tense.',
  minWords: 20,
  maxWords: 120,
  rubric: {
    criteria: [
      { name: 'Grammar', description: 'Past-tense verbs used correctly', weight: 2 },
      { name: 'Task', description: 'Says what was done, where and with whom', weight: 1 },
    ],
  },
};

const meta: Meta<typeof WrittenResponse> = {
  title: 'Activities/WrittenResponse',
  component: WrittenResponse,
  args: { data, onSubmitted: fn(), onInteraction: fn() },
};
export default meta;

type Story = StoryObj<typeof WrittenResponse>;

export const Default: Story = {};

export const Drafting: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole('textbox'),
      'On Saturday I went to the market with my sister.',
    );
  },
};

/** An answer read back in review while its grade is still being made. */
export const Review: Story = {
  args: {
    renderMode: 'review',
    defaultValue: {
      type: 'written-response',
      text: 'On Saturday I went to the market with my sister and we buyed fresh bread.',
      wordCount: 15,
    },
    outcome: { status: 'deferred', reason: 'requires_async_grading', maxScore: 1 },
  },
};
