import { evaluate, type GapSelectData, redact } from '@intellectif/lk-core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { ActivityPreview } from '../../ActivityPreview/index.js';
import { ActivitySequence } from '../../ActivitySequence/index.js';
import { GapSelect } from '../index.js';

afterEach(cleanup);

const data: GapSelectData = {
  schemaVersion: '1.0',
  type: 'gap-select',
  id: 'gs1',
  title: 'Prepositions',
  passage: "Where are you {{a}}? I'm {{b}} Spain.",
  banks: [
    {
      id: 'prep',
      choices: [
        { id: 'of', text: 'of' },
        { id: 'from', text: 'from' },
        { id: 'to', text: 'to' },
        { id: 'on', text: 'on' },
      ],
    },
  ],
  gaps: [
    { id: 'a', bankId: 'prep', correctChoiceId: 'from', feedback: 'from + place of origin' },
    { id: 'b', bankId: 'prep', correctChoiceId: 'from' },
  ],
  scoringStrategy: 'partial',
};

const gapOne = () => screen.getByRole('combobox', { name: 'Choose the answer for gap 1' });
const gapTwo = () => screen.getByRole('combobox', { name: 'Choose the answer for gap 2' });

describe('<GapSelect> rendering', () => {
  it('renders the passage around a selector per gap', () => {
    render(<GapSelect data={data} />);
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
    expect(screen.getByText(/Where are you/)).toBeInTheDocument();
    expect(screen.getByText(/Spain\./)).toBeInTheDocument();
  });

  it('offers every choice in the bank, behind an empty first entry', () => {
    render(<GapSelect data={data} />);
    const options = [...gapOne().querySelectorAll('option')].map((option) => option.textContent);
    // The empty entry is the unanswered state, and it stays selectable so a
    // learner can take an answer back.
    expect(options).toEqual(['Choose…', 'of', 'from', 'to', 'on']);
    expect(gapOne()).toHaveValue('');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<GapSelect data={data} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('<GapSelect> answering in practice', () => {
  it('scores locally and reports the outcome', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<GapSelect data={data} onComplete={onComplete} />);
    await user.selectOptions(gapOne(), 'from');
    await user.selectOptions(gapTwo(), 'from');
    await user.click(screen.getByRole('button', { name: 'Check answers' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0]?.[0]).toMatchObject({ score: 1, maxScore: 1, passed: true });
  });

  it('marks each gap, and shows the authored per-gap feedback', async () => {
    const user = userEvent.setup();
    render(<GapSelect data={data} onComplete={vi.fn()} />);
    await user.selectOptions(gapOne(), 'from');
    await user.selectOptions(gapTwo(), 'to');
    await user.click(screen.getByRole('button', { name: 'Check answers' }));
    expect(gapOne()).toHaveAttribute('data-correct', 'true');
    expect(gapTwo()).toHaveAttribute('data-correct', 'false');
    expect(screen.getByText('from + place of origin')).toBeInTheDocument();
  });

  it('reports a gap left alone as an omission, not a wrong answer', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<GapSelect data={data} onComplete={onComplete} />);
    await user.selectOptions(gapOne(), 'from');
    await user.click(screen.getByRole('button', { name: 'Check answers' }));
    // Half marks, and the untouched gap is distinguishable downstream — the
    // whole reason the selector's first entry is empty.
    expect(onComplete.mock.calls[0]?.[0]?.score).toBe(0.5);
  });

  it('emits an interaction per selection', async () => {
    const user = userEvent.setup();
    const onInteraction = vi.fn();
    render(<GapSelect data={data} onInteraction={onInteraction} />);
    await user.selectOptions(gapOne(), 'to');
    expect(onInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'gap-selected', payload: { gapId: 'a', choiceId: 'to' } }),
    );
  });

  it('lets a learner take an answer back', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<GapSelect data={data} onChange={onChange} />);
    await user.selectOptions(gapOne(), 'from');
    await user.selectOptions(gapOne(), '');
    expect(gapOne()).toHaveValue('');
    expect(onChange).toHaveBeenLastCalledWith({
      type: 'gap-select',
      selections: { a: '' },
    });
  });
});

describe('<GapSelect> in exam mode', () => {
  it('submits without grading, revealing or emitting a statement', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onComplete = vi.fn();
    render(<GapSelect data={data} renderMode="exam" onSubmit={onSubmit} onComplete={onComplete} />);
    await user.selectOptions(gapOne(), 'from');
    await user.click(screen.getByRole('button', { name: 'Submit answers' }));
    expect(onSubmit).toHaveBeenCalledWith({
      type: 'gap-select',
      selections: { a: 'from' },
    });
    // No local grade, and nothing marked: the server owns both.
    expect(onComplete).not.toHaveBeenCalled();
    expect(gapOne()).not.toHaveAttribute('data-correct');
  });

  it('renders a redacted projection, which still has every choice', () => {
    const projection = redact(data) as unknown as GapSelectData;
    render(<GapSelect data={projection} renderMode="exam" />);
    const options = [...gapOne().querySelectorAll('option')].map((option) => option.textContent);
    expect(options).toEqual(['Choose…', 'of', 'from', 'to', 'on']);
  });

  it('refuses redacted data in practice rather than failing at submit time', () => {
    const projection = redact(data) as unknown as GapSelectData;
    // The boundary catches it, so the host sees a fallback rather than a crash
    // — and the author sees it at render, not after a learner has answered.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<GapSelect data={projection} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    spy.mockRestore();
  });
});

describe('<GapSelect> in review mode', () => {
  it('marks from the supplied outcome and offers nothing to submit', () => {
    const outcome = evaluate(data, {
      type: 'gap-select',
      selections: { a: 'from', b: 'to' },
    });
    render(<GapSelect data={data} renderMode="review" outcome={outcome} />);
    expect(gapOne()).toHaveAttribute('data-correct', 'true');
    expect(gapTwo()).toHaveAttribute('data-correct', 'false');
    expect(screen.queryByRole('button', { name: /answers/i })).not.toBeInTheDocument();
  });

  it('marks nothing when the outcome has not been graded', () => {
    render(
      <GapSelect
        data={data}
        renderMode="review"
        outcome={{ status: 'deferred', reason: 'requires_async_grading', maxScore: 1 }}
      />,
    );
    expect(gapOne()).not.toHaveAttribute('data-correct');
  });
});

describe('<GapSelect> choice shuffling', () => {
  const shuffled: GapSelectData = { ...data, shuffleChoices: true };

  it('deals a reproducible order for a given seed', () => {
    const read = () =>
      [...gapOne().querySelectorAll('option')].map((option) => option.textContent).join();
    render(<GapSelect data={shuffled} shuffleSeed="attempt-7" />);
    const first = read();
    cleanup();
    render(<GapSelect data={shuffled} shuffleSeed="attempt-7" />);
    expect(read()).toBe(first);
  });

  it('deals each gap its own order, so a shared bank does not line up', () => {
    render(<GapSelect data={shuffled} shuffleSeed="attempt-7" />);
    const one = [...gapOne().querySelectorAll('option')].map((o) => o.textContent).join();
    const two = [...gapTwo().querySelectorAll('option')].map((o) => o.textContent).join();
    // Same four choices, different arrangement: otherwise the distractors sit
    // in the same row for every gap and the second is easier than the first.
    expect(one).not.toBe(two);
  });

  it('leaves the authored order alone when shuffling is off', () => {
    render(<GapSelect data={data} />);
    expect([...gapOne().querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      'Choose…',
      'of',
      'from',
      'to',
      'on',
    ]);
  });
});

describe('<GapSelect> seeding and reset', () => {
  it('seeds from defaultValue and stays editable', async () => {
    const user = userEvent.setup();
    render(
      <GapSelect data={data} defaultValue={{ type: 'gap-select', selections: { a: 'to' } }} />,
    );
    expect(gapOne()).toHaveValue('to');
    await user.selectOptions(gapOne(), 'from');
    expect(gapOne()).toHaveValue('from');
  });

  it('is controlled when value is supplied', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <GapSelect
        data={data}
        value={{ type: 'gap-select', selections: { a: 'of' } }}
        onChange={onChange}
      />,
    );
    await user.selectOptions(gapOne(), 'from');
    // The caller owns the value: the rendered selection does not move on its own.
    expect(gapOne()).toHaveValue('of');
    expect(onChange).toHaveBeenCalled();
  });

  it('resets when the activity changes, and not when it merely re-renders', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<GapSelect data={data} />);
    await user.selectOptions(gapOne(), 'from');

    rerender(<GapSelect data={data} />);
    expect(gapOne()).toHaveValue('from');

    rerender(<GapSelect data={{ ...data, id: 'gs2' }} />);
    expect(gapOne()).toHaveValue('');
  });
});

describe('gap-select reaches the screen through the SDK’s own renderers', () => {
  it('is dispatched by <ActivitySequence> instead of falling to the unsupported notice', async () => {
    const user = userEvent.setup();
    const onFinished = vi.fn();
    render(<ActivitySequence activities={[data]} onFinished={onFinished} />);
    // The gap this closes: lk-core registered `gap-select` while lk-react had
    // no branch for it, so an authored item rendered "This activity type has
    // no renderer" on a paper that validated and scored perfectly.
    expect(screen.queryByText(/no renderer/i)).not.toBeInTheDocument();
    await user.selectOptions(gapOne(), 'from');
    await user.selectOptions(gapTwo(), 'from');
    await user.click(screen.getByRole('button', { name: 'Check answers' }));
    expect(onFinished).toHaveBeenCalled();
  });

  it('is dispatched by <ActivityPreview> once the draft is complete', () => {
    render(<ActivityPreview draft={data} />);
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
  });

  it('shows an editor the preview notice while the draft is unfinished', () => {
    const { gaps: _gaps, ...rest } = data;
    render(<ActivityPreview draft={{ ...rest, gaps: [] }} />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByRole('note')).toBeInTheDocument();
  });

  it('requires a seed to shuffle its choices in an exam, like every other shuffle', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(
        <ActivitySequence activities={[{ ...data, shuffleChoices: true }]} renderMode="exam" />,
      ),
    ).toThrow(/shuffleSeed/);
    spy.mockRestore();
  });
});
