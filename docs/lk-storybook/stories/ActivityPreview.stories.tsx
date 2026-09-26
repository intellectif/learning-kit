import { ActivityPreview } from '@intellectif/lk-react/components/ActivityPreview';
import type { Meta, StoryObj } from '@storybook/react-vite';

/** What an editor shows beside its form: the draft as a learner would meet it. */
const meta: Meta<typeof ActivityPreview> = {
  title: 'Authoring/ActivityPreview',
  component: ActivityPreview,
};
export default meta;

type Story = StoryObj<typeof ActivityPreview>;

export const CompleteDraft: Story = {
  args: {
    draft: {
      schemaVersion: '1.0',
      type: 'multiple-choice',
      id: 'sb-preview',
      title: 'Capital',
      question: 'What is the capital of Spain?',
      mode: 'single',
      options: [
        { id: 'madrid', text: 'Madrid', isCorrect: true },
        { id: 'seville', text: 'Seville', isCorrect: false },
      ],
    },
  },
};

/** An unfinished draft: the preview says what is missing instead of rendering it. */
export const UnfinishedDraft: Story = {
  args: {
    draft: {
      schemaVersion: '1.0',
      type: 'multiple-choice',
      id: 'sb-preview-unfinished',
      title: 'Capital',
      question: '',
      mode: 'single',
      options: [{ id: 'madrid', text: 'Madrid', isCorrect: true }],
    },
  },
};
