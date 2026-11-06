import type { MarkTheWordsData } from '@intellectif/lk-core';
import { markTheWordsFromMarkup } from '@intellectif/lk-core';
import { MarkTheWords } from '@intellectif/lk-react/components/MarkTheWords';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn, userEvent, within } from 'storybook/test';

/** Written as starred markup, as an editor or an H5P import would hand it over. */
const { text, targets } = markTheWordsFromMarkup(
  'Trams *disappeared* from most British cities in the 1950s. Buses *were* cheaper and *needed* no rails.\n\nThe first new line *opened* in Manchester in 1992, and it *carried* twice the passengers anyone *had expected*.',
);

const pastTense: MarkTheWordsData = {
  schemaVersion: '1.0',
  type: 'mark-the-words',
  id: 'sb-mw-past',
  title: 'The return of the tram',
  instructions: 'Mark every verb in the past.',
  text,
  targets,
  scoringStrategy: 'partial',
};

const meta: Meta<typeof MarkTheWords> = {
  title: 'Activities/MarkTheWords',
  component: MarkTheWords,
  args: { data: pastTense, onComplete: fn(), onInteraction: fn() },
};
export default meta;

type Story = StoryObj<typeof MarkTheWords>;

/** Click a word, or move with the arrow keys and press Space. */
export const PastTense: Story = {};

/** Checked: two found, one wrong, the rest shown as missed. */
export const Checked: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const word of ['disappeared', 'needed', 'cities']) {
      await userEvent.click(canvas.getByRole('option', { name: word }));
    }
    await userEvent.click(canvas.getByRole('button', { name: 'Check answers' }));
  },
};
