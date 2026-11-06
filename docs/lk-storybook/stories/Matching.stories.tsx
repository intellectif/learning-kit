import type { MatchingData } from '@intellectif/lk-core';
import { Matching } from '@intellectif/lk-react/components/Matching';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn, userEvent, within } from 'storybook/test';

/** IELTS matching headings: more headings than paragraphs, each used once. */
const headings: MatchingData = {
  schemaVersion: '1.0',
  type: 'matching',
  id: 'sb-mt-headings',
  title: 'The return of the tram',
  instructions:
    'The reading passage has four paragraphs, A–D. Choose the correct heading for each paragraph from the list of headings below.',
  optionsTitle: 'List of Headings',
  options: [
    { id: 'i', label: 'i', text: 'A costly experiment' },
    { id: 'ii', label: 'ii', text: 'Why the trams disappeared' },
    { id: 'iii', label: 'iii', text: 'A return nobody expected' },
    { id: 'iv', label: 'iv', text: 'The view from the passengers' },
    { id: 'v', label: 'v', text: 'Lessons from France' },
    { id: 'vi', label: 'vi', text: 'Digging under the city' },
  ],
  prompts: [
    { id: 'pA', text: 'Paragraph A', correctOptionId: 'ii' },
    { id: 'pB', text: 'Paragraph B', correctOptionId: 'iii' },
    { id: 'pC', text: 'Paragraph C', correctOptionId: 'vi', feedback: 'Pipes and cables.' },
    { id: 'pD', text: 'Paragraph D', correctOptionId: 'v' },
  ],
  optionUse: 'once',
  scoringStrategy: 'partial',
};

/** IELTS matching features: statements to people, a letter usable more than once. */
const features: MatchingData = {
  schemaVersion: '1.0',
  type: 'matching',
  id: 'sb-mt-features',
  title: 'Who said it?',
  instructions:
    'Match each statement with the correct person, A–C. NB You may use any letter more than once.',
  optionsTitle: 'List of People',
  options: [
    { id: 'a', label: 'A', text: 'Anna Lee, a city planner' },
    { id: 'b', label: 'B', text: 'Ben Ortiz, an economist' },
    { id: 'c', label: 'C', text: 'Carla Diaz, a passenger' },
  ],
  prompts: [
    { id: 'q1', text: 'Tram lines raise the value of nearby shops.', correctOptionId: 'b' },
    { id: 'q2', text: 'Routes that never change make people feel safe.', correctOptionId: 'c' },
    { id: 'q3', text: 'Old railway lines keep building costs down.', correctOptionId: 'a' },
    { id: 'q4', text: 'Sales figures can mislead.', correctOptionId: 'b' },
  ],
  scoringStrategy: 'partial',
};

const meta: Meta<typeof Matching> = {
  title: 'Activities/Matching',
  component: Matching,
  args: { data: headings, onComplete: fn(), onInteraction: fn() },
};
export default meta;

type Story = StoryObj<typeof Matching>;

/** Each heading used once: picking one again moves it, and says so. */
export const Headings: Story = {};

/** Checked, with one wrong match and the right heading beside it. */
export const Checked: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const pick = (prompt: string, option: string) =>
      userEvent.selectOptions(canvas.getByRole('combobox', { name: prompt }), option);
    await pick('Paragraph A', 'ii');
    await pick('Paragraph B', 'iii');
    await pick('Paragraph C', 'i');
    await pick('Paragraph D', 'v');
    await userEvent.click(canvas.getByRole('button', { name: 'Check answers' }));
  },
};

/** Statements to people, a letter usable more than once. */
export const Features: Story = { args: { data: features } };
