import {
  type FillInTheBlanksData,
  type GapSelectData,
  type ItemGroup,
  type MultipleChoiceData,
  redact,
} from '@intellectif/lk-core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { checkA11y } from '../../test-support/a11y.js';
import { ActivitySequence } from '../ActivitySequence/index.js';
import { FillInTheBlanks } from '../FillInTheBlanks/index.js';
import { GapSelect } from '../GapSelect/index.js';
import { MultipleChoice } from '../MultipleChoice/index.js';

/**
 * A question's own instructions: the task, drawn before the media and the
 * question — a learner reads what to do before listening or answering — and
 * named by the question's fieldset, so a screen reader announces it on
 * entering the question.
 */

const picture = { type: 'image' as const, url: '/map.png', alt: 'A map of the town' };

const mc: MultipleChoiceData = {
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'mc-greeting',
  title: 'Greetings',
  instructions: 'Choose the correct option to complete the conversation.',
  question: 'Leo: _____ are you today?',
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  media: picture,
  options: [
    { id: 'how', text: 'How', isCorrect: true },
    { id: 'what', text: 'What', isCorrect: false },
  ],
};

const fib: FillInTheBlanksData = {
  schemaVersion: '1.0',
  type: 'fill-in-the-blanks',
  id: 'fib-mei',
  title: 'Introductions',
  instructions: 'Complete the sentence. Use ONE word.',
  passage: 'Hi! I’m Mei, and I {{b1}} from Japan.',
  blanks: [{ id: 'b1', acceptedAnswers: ['am'] }],
  scoringStrategy: 'all-or-nothing',
  media: picture,
};

const gs: GapSelectData = {
  schemaVersion: '1.0',
  type: 'gap-select',
  id: 'gs-weather',
  title: 'The weather',
  instructions: 'Choose the word that completes the sentence.',
  passage: 'It is {{g1}} today, so take an umbrella.',
  gaps: [
    {
      id: 'g1',
      choices: [
        { id: 'rainy', text: 'rainy' },
        { id: 'sunny', text: 'sunny' },
      ],
      correctChoiceId: 'rainy',
    },
  ],
  scoringStrategy: 'all-or-nothing',
  media: picture,
};

const cases = [
  {
    name: 'multiple choice',
    className: 'lk-mc-instructions',
    item: mc,
    stem: () => screen.getByText('Leo: _____ are you today?'),
    view: (data: typeof mc) => <MultipleChoice data={data} />,
    exam: (data: unknown) => <MultipleChoice data={data as typeof mc} renderMode="exam" />,
  },
  {
    name: 'fill in the blanks',
    className: 'lk-fib-instructions',
    item: fib,
    stem: () => screen.getByText(/I’m Mei, and I/),
    view: (data: typeof fib) => <FillInTheBlanks data={data} />,
    exam: (data: unknown) => <FillInTheBlanks data={data as typeof fib} renderMode="exam" />,
  },
  {
    name: 'gap select',
    className: 'lk-gs-instructions',
    item: gs,
    stem: () => screen.getByText(/It is/),
    view: (data: typeof gs) => <GapSelect data={data} />,
    exam: (data: unknown) => <GapSelect data={data as typeof gs} renderMode="exam" />,
  },
] as const;

/** Whether `first` comes before `second` in the document. */
const precedes = (first: Element, second: Element) =>
  Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);

describe.each(cases)('$name', ({ className, item, stem, view, exam }) => {
  // One renderer per case: the union of views is not callable on the union of items.
  const draw = (data: unknown) => render((view as (d: unknown) => React.JSX.Element)(data));

  it('draws the instructions first: before the media and the question', () => {
    const { container } = draw(item);
    const instructions = screen.getByText(item.instructions as string);
    expect(instructions).toHaveClass(className);
    expect(instructions.tagName).toBe('P');
    expect(precedes(instructions, screen.getByRole('img', { name: 'A map of the town' }))).toBe(
      true,
    );
    expect(precedes(instructions, stem())).toBe(true);
    expect(container.querySelector(`.${className}`)).toBe(instructions);
  });

  it('names them as the description of the question’s fieldset', () => {
    const { container } = draw(item);
    const fieldset = container.querySelector('fieldset') as HTMLFieldSetElement;
    const id = fieldset.getAttribute('aria-describedby');
    expect(id).toBe(`${item.id}-instructions`);
    expect(document.getElementById(id as string)).toHaveTextContent(item.instructions as string);
  });

  it('draws nothing, and describes nothing, without instructions or with blank ones', () => {
    for (const instructions of [undefined, '', '  \n ']) {
      const { container, unmount } = draw({ ...item, instructions });
      expect(container.querySelector(`.${className}`)).toBeNull();
      expect(container.querySelector('fieldset')).not.toHaveAttribute('aria-describedby');
      unmount();
    }
  });

  it('trims what it draws', () => {
    draw({ ...item, instructions: '  Use ONE word.\n' });
    expect(screen.getByText('Use ONE word.').textContent).toBe('Use ONE word.');
  });

  it('draws them in an exam, from the redacted item', () => {
    const { container } = render(exam(redact(item)));
    expect(container.querySelector(`.${className}`)).toHaveTextContent(item.instructions as string);
  });

  it('passes an accessibility check with them', async () => {
    const { container } = draw(item);
    await checkA11y(container);
  });
});

describe('a question with instructions inside a group', () => {
  it('shows the group’s material, then the question’s own instructions', async () => {
    const { media: _, ...fibAlone } = fib;
    const group: ItemGroup = {
      schemaVersion: '1.0',
      type: 'item-group',
      id: 'part-1',
      title: 'Part 1',
      stimulus: { id: 'p1', kind: 'text', title: 'At the station', body: 'Read the dialogue.' },
      items: [fibAlone],
    };
    const user = userEvent.setup();
    render(<ActivitySequence activities={[mc, group]} />);
    await user.click(screen.getByRole('button', { name: 'Next' }));

    const material = screen.getByRole('region', { name: 'At the station' });
    const instructions = screen.getByText('Complete the sentence. Use ONE word.');
    expect(precedes(material, instructions)).toBe(true);
    expect(precedes(instructions, screen.getByText(/I’m Mei, and I/))).toBe(true);
  });
});
