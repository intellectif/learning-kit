import type { MultipleChoiceData } from '@intellectif/lk-core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { runAxe } from '../../../test-support/a11y.js';
import { MultipleChoice } from '../index.js';

afterEach(cleanup);

const pictureChoice: MultipleChoiceData = {
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'q1',
  title: 'Animals',
  question: 'Which picture shows a cat?',
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  options: [
    {
      id: 'a',
      text: 'Picture 1',
      isCorrect: true,
      media: { type: 'image', url: '/cat.png', alt: 'a small tabby cat' },
    },
    {
      id: 'b',
      text: 'Picture 2',
      isCorrect: false,
      media: { type: 'image', url: '/dog.png', alt: 'a brown dog' },
    },
  ],
};

const listening: MultipleChoiceData = {
  ...pictureChoice,
  id: 'q2',
  question: 'Which recording says "ship"?',
  options: [
    { id: 'a', text: 'Recording 1', isCorrect: true, media: { type: 'audio', url: '/ship.mp3' } },
    {
      id: 'b',
      text: 'Recording 2',
      isCorrect: false,
      media: { type: 'audio', url: '/sheep.mp3', alt: 'the second recording' },
    },
  ],
};

describe('<MultipleChoice> with picture options', () => {
  it('renders each option’s picture with its alt text', () => {
    render(<MultipleChoice data={pictureChoice} />);
    expect(screen.getByAltText('a small tabby cat')).toHaveAttribute('src', '/cat.png');
    expect(screen.getByAltText('a brown dog')).toBeInTheDocument();
  });

  it('names the option by its text AND its picture, so a screen reader gets both', () => {
    render(<MultipleChoice data={pictureChoice} />);
    // The picture is inside the label, so its alt joins the accessible name.
    // An author who writes a revealing alt has changed the item — the SDK makes
    // that visible rather than hiding the picture from assistive technology.
    expect(screen.getByRole('radio', { name: /Picture 1/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /a small tabby cat/ })).toBeInTheDocument();
  });

  it('selects the option when the learner clicks the picture', async () => {
    const user = userEvent.setup();
    render(<MultipleChoice data={pictureChoice} />);
    await user.click(screen.getByAltText('a small tabby cat'));
    expect(screen.getByRole('radio', { name: /Picture 1/ })).toBeChecked();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<MultipleChoice data={pictureChoice} />);
    expect(await runAxe(container)).toHaveNoViolations();
  });
});

describe('<MultipleChoice> with recording options', () => {
  it('renders a player per option, labelled by its alt or its text', () => {
    render(<MultipleChoice data={listening} />);
    // Without an alt the option's own text names the player, so it is never an
    // unlabelled control — it shares the name with its radio, and the role
    // tells them apart.
    expect(screen.getByLabelText('Recording 1', { selector: 'audio' })).toHaveAttribute(
      'src',
      '/ship.mp3',
    );
    expect(screen.getByLabelText('the second recording', { selector: 'audio' })).toHaveAttribute(
      'src',
      '/sheep.mp3',
    );
  });

  it('does NOT select the option when the learner plays its recording', async () => {
    const user = userEvent.setup();
    render(<MultipleChoice data={listening} />);
    // The failure this prevents: a <label> activates its control for any click
    // inside it, so a recording nested in one would commit the learner to an
    // answer the moment they pressed play — before they had heard the others.
    await user.click(screen.getByLabelText('Recording 1', { selector: 'audio' }));
    expect(screen.getByRole('radio', { name: 'Recording 1' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Recording 2' })).not.toBeChecked();

    // And the option is still selectable the ordinary way.
    await user.click(screen.getByRole('radio', { name: 'Recording 1' }));
    expect(screen.getByRole('radio', { name: 'Recording 1' })).toBeChecked();
  });

  it('does not load audio until the learner asks for it', () => {
    render(<MultipleChoice data={listening} />);
    // Four recordings per question, many questions per paper: preloading them
    // all would cost a learner their bandwidth before they read the stem.
    expect(screen.getByLabelText('Recording 1', { selector: 'audio' })).toHaveAttribute(
      'preload',
      'none',
    );
  });

  it('renders a captions track only when the author supplied one', () => {
    const { container } = render(<MultipleChoice data={listening} />);
    expect(container.querySelectorAll('track')).toHaveLength(0);

    cleanup();
    const captioned: MultipleChoiceData = {
      ...listening,
      options: [
        {
          ...listening.options[0],
          media: { type: 'audio', url: '/ship.mp3', captionsUrl: '/ship.vtt' },
        },
        listening.options[1],
      ],
    } as MultipleChoiceData;
    const second = render(<MultipleChoice data={captioned} />);
    expect(second.container.querySelectorAll('track')).toHaveLength(1);
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<MultipleChoice data={listening} />);
    expect(await runAxe(container)).toHaveNoViolations();
  });
});

describe('<MultipleChoice> without option media', () => {
  it('renders exactly the markup it always did', () => {
    const plain: MultipleChoiceData = {
      ...pictureChoice,
      options: [
        { id: 'a', text: 'Yes', isCorrect: true },
        { id: 'b', text: 'No', isCorrect: false },
      ],
    };
    const { container } = render(<MultipleChoice data={plain} />);
    // No wrapper, no image: an option with no media is untouched by this
    // feature, so consumer CSS written against `.lk-mc-option` keeps working.
    expect(container.querySelectorAll('.lk-mc-option-media')).toHaveLength(0);
    expect(container.querySelectorAll('.lk-mc-option-image')).toHaveLength(0);
    expect(container.querySelectorAll('label.lk-mc-option')).toHaveLength(2);
  });
});
