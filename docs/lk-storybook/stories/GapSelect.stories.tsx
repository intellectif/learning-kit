import type { GapSelectData } from '@intellectif/lk-core';
import { GapSelect } from '@intellectif/lk-react/components/GapSelect';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn, userEvent, within } from 'storybook/test';

const data: GapSelectData = {
  schemaVersion: '1.0',
  type: 'gap-select',
  id: 'sb-gs',
  title: 'Prepositions of origin',
  passage: 'Where are you {{g1}}? I am {{g2}} Spain, but I live {{g3}} Italy.',
  banks: [
    {
      id: 'prepositions',
      choices: [
        { id: 'from', text: 'from' },
        { id: 'in', text: 'in' },
        { id: 'at', text: 'at' },
        { id: 'on', text: 'on' },
      ],
    },
  ],
  gaps: [
    { id: 'g1', bankId: 'prepositions', correctChoiceId: 'from' },
    { id: 'g2', bankId: 'prepositions', correctChoiceId: 'from' },
    { id: 'g3', bankId: 'prepositions', correctChoiceId: 'in' },
  ],
  scoringStrategy: 'partial',
};

const meta: Meta<typeof GapSelect> = {
  title: 'Activities/GapSelect',
  component: GapSelect,
  args: { data, onComplete: fn(), onInteraction: fn() },
};
export default meta;

type Story = StoryObj<typeof GapSelect>;

export const Default: Story = {};

export const Checked: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(
      canvas.getByRole('combobox', { name: 'Choose the answer for gap 1' }),
      'from',
    );
    await userEvent.selectOptions(
      canvas.getByRole('combobox', { name: 'Choose the answer for gap 2' }),
      'in',
    );
    await userEvent.selectOptions(
      canvas.getByRole('combobox', { name: 'Choose the answer for gap 3' }),
      'in',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Check answers' }));
  },
};

export const Exam: Story = { args: { renderMode: 'exam' } };
