import {
  evaluate,
  type ItemOutcome,
  type LearnerResponse,
  type MultipleChoiceData,
  redact,
} from '@intellectif/lk-core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { checkA11y } from '../../../test-support/a11y.js';
import type { Renderable } from '../../types.js';
import { MultipleChoice } from '../index.js';

const single = (over: Partial<MultipleChoiceData> = {}): MultipleChoiceData => ({
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'q1',
  title: 'Quiz',
  question: 'What is 2 + 2?',
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  feedback: { correct: 'Well done.', incorrect: 'Review addition.' },
  options: [
    { id: 'a', text: 'Three', isCorrect: false, feedback: 'Not quite.' },
    { id: 'b', text: 'Four', isCorrect: true, feedback: 'Correct!' },
  ],
  ...over,
});

const multi = (): MultipleChoiceData => ({
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'm1',
  title: 'Multi',
  question: 'Pick the even numbers',
  mode: 'multi',
  scoringStrategy: 'all-or-nothing',
  options: [
    { id: 'x', text: 'Two', isCorrect: true },
    { id: 'y', text: 'Four', isCorrect: true },
    { id: 'z', text: 'Five', isCorrect: false },
  ],
});

const response = (...ids: string[]): LearnerResponse => ({
  type: 'multiple-choice',
  selectedOptionIds: ids,
});

/**
 * A real `redact()` projection, cast to the prop type. `redact()` returns
 * `RedactedActivityData` (index-signature typed), so a consumer feeding a
 * server projection straight into a component needs this cast today.
 */
const projectionOf = (data: MultipleChoiceData): Renderable<MultipleChoiceData> =>
  redact(data) as unknown as Renderable<MultipleChoiceData>;

/**
 * Options are looked up by id rather than by accessible name: once per-option
 * feedback is revealed it becomes part of the radio's accessible name, which
 * would make these queries mode-dependent.
 */
const inputFor = (optionId: string): HTMLInputElement => {
  const input = document.querySelector<HTMLInputElement>(
    `.lk-mc-option input[value="${optionId}"]`,
  );
  if (input === null) {
    throw new Error(`No option input with value "${optionId}"`);
  }
  return input;
};

const labelFor = (optionId: string): HTMLElement => {
  const label = inputFor(optionId).closest('label');
  if (label === null) {
    throw new Error(`No label wrapping option "${optionId}"`);
  }
  return label;
};

describe('MultipleChoice controlled / uncontrolled', () => {
  it('fires onChange on every change when uncontrolled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MultipleChoice data={multi()} onChange={onChange} />);
    await user.click(screen.getByRole('checkbox', { name: 'Two' }));
    await user.click(screen.getByRole('checkbox', { name: 'Four' }));
    await user.click(screen.getByRole('checkbox', { name: 'Two' }));
    expect(onChange.mock.calls.map((call) => call[0])).toEqual([
      response('x'),
      response('x', 'y'),
      response('y'),
    ]);
  });

  it('seeds an uncontrolled component from defaultValue', () => {
    render(<MultipleChoice data={single()} defaultValue={response('b')} />);
    expect(screen.getByRole('radio', { name: 'Four' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Three' })).not.toBeChecked();
  });

  it('submits the defaultValue seed without any further interaction', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<MultipleChoice data={single()} defaultValue={response('b')} onComplete={onComplete} />);
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(onComplete.mock.calls[0]?.[0].score).toBe(1);
  });

  it('renders from props.value and never from internal state when controlled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MultipleChoice data={single()} value={response('a')} onChange={onChange} />);
    expect(screen.getByRole('radio', { name: 'Three' })).toBeChecked();

    await user.click(screen.getByRole('radio', { name: 'Four' }));
    // The parent did not update `value`, so the rendered selection must not move.
    expect(onChange).toHaveBeenCalledWith(response('b'));
    expect(screen.getByRole('radio', { name: 'Four' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Three' })).toBeChecked();
  });

  it('scores the controlled value, not a stale internal selection', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(
      <MultipleChoice
        data={single()}
        value={response('b')}
        onChange={vi.fn()}
        onComplete={onComplete}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(onComplete.mock.calls[0]?.[0].score).toBe(1);
  });

  it('round-trips a controlled multi-select through a parent', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    function Harness() {
      const [value, setValue] = useState<LearnerResponse>(response());
      return (
        <MultipleChoice data={multi()} value={value} onChange={setValue} onSubmit={onSubmit} />
      );
    }

    render(<Harness />);
    await user.click(screen.getByRole('checkbox', { name: 'Two' }));
    await user.click(screen.getByRole('checkbox', { name: 'Four' }));
    expect(screen.getByRole('checkbox', { name: 'Two' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Four' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(onSubmit).toHaveBeenCalledWith(response('x', 'y'));
  });

  it('keeps clearing the selection when the data prop changes (uncontrolled)', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<MultipleChoice data={single()} />);
    await user.click(screen.getByRole('radio', { name: 'Four' }));
    rerender(<MultipleChoice data={single({ id: 'q2' })} />);
    expect(screen.getByRole('radio', { name: 'Four' })).not.toBeChecked();
  });
});

describe('MultipleChoice onSubmit', () => {
  it('fires before onComplete in practice mode', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onComplete = vi.fn();
    render(<MultipleChoice data={single()} onSubmit={onSubmit} onComplete={onComplete} />);
    await user.click(screen.getByRole('radio', { name: 'Four' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(onSubmit).toHaveBeenCalledWith(response('b'));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.invocationCallOrder[0] as number).toBeLessThan(
      onComplete.mock.invocationCallOrder[0] as number,
    );
  });

  it('renders and submits with onComplete omitted entirely', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<MultipleChoice data={single()} onSubmit={onSubmit} />);
    await user.click(screen.getByRole('radio', { name: 'Four' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Score 100%/)).toBeInTheDocument();
  });
});

describe('MultipleChoice exam mode', () => {
  it('renders a real redact() projection and submits it without grading', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onComplete = vi.fn();
    const projection = projectionOf(single());

    // The projection genuinely has no answer key: score() would throw on it.
    expect((projection as unknown as { redacted?: unknown }).redacted).toBe(true);
    expect(JSON.stringify(projection)).not.toContain('isCorrect');

    render(
      <MultipleChoice
        data={projection}
        renderMode="exam"
        onSubmit={onSubmit}
        onComplete={onComplete}
      />,
    );

    expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(2);

    await user.click(screen.getByRole('radio', { name: 'Four' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(onSubmit).toHaveBeenCalledWith(response('b'));
    expect(onComplete).not.toHaveBeenCalled();
    expect(labelFor('b')).not.toHaveAttribute('data-correct');
    expect(labelFor('a')).not.toHaveAttribute('data-correct');
    expect(screen.queryByText(/Score/)).not.toBeInTheDocument();
    expect(screen.queryByText('Correct!')).not.toBeInTheDocument();
    expect(screen.getByText('Answer submitted.')).toBeInTheDocument();
  });

  it('reveals nothing even when handed full activity data', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    const onSubmit = vi.fn();
    render(
      <MultipleChoice
        data={single()}
        renderMode="exam"
        onSubmit={onSubmit}
        onComplete={onComplete}
      />,
    );
    await user.click(screen.getByRole('radio', { name: 'Four' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(onSubmit).toHaveBeenCalledWith(response('b'));
    expect(onComplete).not.toHaveBeenCalled();
    // No correctness styling, no per-option feedback, no authored overall
    // feedback, no score summary — before or after submit.
    expect(labelFor('b')).not.toHaveAttribute('data-correct');
    expect(screen.queryByText('Correct!')).not.toBeInTheDocument();
    expect(screen.queryByText('Not quite.')).not.toBeInTheDocument();
    expect(screen.queryByText(/Well done\./)).not.toBeInTheDocument();
    expect(screen.queryByText(/Score/)).not.toBeInTheDocument();
  });

  it('emits a submitted interaction that carries no score', async () => {
    const user = userEvent.setup();
    const onInteraction = vi.fn();
    render(<MultipleChoice data={single()} renderMode="exam" onInteraction={onInteraction} />);
    await user.click(screen.getByRole('radio', { name: 'Four' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    const submitted = onInteraction.mock.calls
      .map((call) => call[0])
      .find((event) => event.type === 'submitted');
    expect(submitted.payload).toEqual({ selectedOptionIds: ['b'] });
  });

  it('locks the item after submit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<MultipleChoice data={projectionOf(single())} renderMode="exam" onSubmit={onSubmit} />);
    await user.click(screen.getByRole('radio', { name: 'Four' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Three' })).toBeDisabled();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('fails loudly when redacted data is wired into the self-grading practice mode', () => {
    render(<MultipleChoice data={projectionOf(single())} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('has no axe violations rendering a redacted projection', async () => {
    const { container } = render(
      <MultipleChoice data={projectionOf(single())} renderMode="exam" onSubmit={vi.fn()} />,
    );
    expect(await checkA11y(container)).toHaveNoViolations();
  });
});

describe('MultipleChoice review mode', () => {
  const scoredOutcome = (...selected: string[]): ItemOutcome =>
    evaluate(single(), response(...selected));

  it('is read-only: no submit control and every input disabled', () => {
    render(
      <MultipleChoice
        data={single()}
        renderMode="review"
        value={response('a')}
        outcome={scoredOutcome('a')}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
    expect(inputFor('a')).toBeDisabled();
    expect(inputFor('b')).toBeDisabled();
  });

  it("renders the learner's submitted response", () => {
    render(<MultipleChoice data={single()} renderMode="review" value={response('a')} />);
    expect(inputFor('a')).toBeChecked();
    expect(inputFor('b')).not.toBeChecked();
  });

  it('marks correctness from a real evaluate() outcome, not from local scoring', () => {
    render(
      <MultipleChoice
        data={single()}
        renderMode="review"
        value={response('a')}
        outcome={scoredOutcome('a')}
      />,
    );
    // "Three" was chosen and is not the answer; "Four" is the answer.
    expect(labelFor('a')).toHaveAttribute('data-correct', 'false');
    expect(labelFor('b')).toHaveAttribute('data-correct', 'true');
    expect(screen.getByText(/Score 0%\. Not passed\./)).toBeInTheDocument();
  });

  it('marks correctness from a 0.2-era detail that carries only the deprecated flag', () => {
    const legacy: ItemOutcome = {
      status: 'scored',
      score: 0,
      maxScore: 1,
      passed: false,
      feedback: null,
      details: [
        { itemId: 'a', correct: false, learnerResponse: ['selected'], correctResponse: [] },
        { itemId: 'b', correct: false, learnerResponse: ['not-selected'], correctResponse: [] },
      ],
    };
    render(
      <MultipleChoice data={single()} renderMode="review" value={response('a')} outcome={legacy} />,
    );
    expect(labelFor('a')).toHaveAttribute('data-correct', 'false');
    expect(labelFor('b')).toHaveAttribute('data-correct', 'true');
  });

  it('marks nothing without an outcome, even though the answer key is in props.data', () => {
    render(<MultipleChoice data={single()} renderMode="review" value={response('a')} />);
    expect(labelFor('a')).not.toHaveAttribute('data-correct');
    expect(labelFor('b')).not.toHaveAttribute('data-correct');
  });

  it('marks nothing for a deferred outcome and never announces 0%', () => {
    render(
      <MultipleChoice
        data={single()}
        renderMode="review"
        value={response('a')}
        outcome={{ status: 'deferred', reason: 'requires_async_grading', maxScore: 1 }}
      />,
    );
    expect(labelFor('a')).not.toHaveAttribute('data-correct');
    expect(screen.getByText('Not graded yet.')).toBeInTheDocument();
    expect(screen.queryByText(/0%/)).not.toBeInTheDocument();
  });

  it('renders a redacted projection with an outcome', () => {
    render(
      <MultipleChoice
        data={projectionOf(single())}
        renderMode="review"
        value={response('a')}
        outcome={scoredOutcome('a')}
      />,
    );
    expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument();
    expect(labelFor('b')).toHaveAttribute('data-correct', 'true');
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <MultipleChoice
        data={single()}
        renderMode="review"
        value={response('a')}
        outcome={scoredOutcome('a')}
      />,
    );
    expect(await checkA11y(container)).toHaveNoViolations();
  });
});

describe('MultipleChoice rich text', () => {
  const rich = () => single({ questionHtml: '<em>What</em> is 2 + 2?' });

  it('renders questionHtml through a caller-supplied sanitizer', () => {
    const sanitizeHtml = vi.fn((html: string) => html);
    const { container } = render(<MultipleChoice data={rich()} sanitizeHtml={sanitizeHtml} />);
    expect(sanitizeHtml).toHaveBeenCalledWith('<em>What</em> is 2 + 2?');
    expect(container.querySelector('legend em')?.textContent).toBe('What');
  });

  it('renders what the sanitizer returned, not the authored html', () => {
    const sanitizeHtml = vi.fn(() => 'scrubbed');
    const { container } = render(
      <MultipleChoice
        data={single({ questionHtml: '<img src=x onerror="alert(1)">' })}
        sanitizeHtml={sanitizeHtml}
      />,
    );
    expect(container.querySelector('legend')?.textContent).toBe('scrubbed');
    expect(container.querySelector('img')).toBeNull();
  });

  it('escapes the plain-text question when no sanitizer is supplied', () => {
    const { container } = render(<MultipleChoice data={single({ question: '<em>2 + 2?</em>' })} />);
    expect(container.querySelector('legend em')).toBeNull();
    expect(screen.getByText('<em>2 + 2?</em>')).toBeInTheDocument();
  });

  it('falls back to plain text when questionHtml is absent', () => {
    const sanitizeHtml = vi.fn((html: string) => html);
    render(<MultipleChoice data={single()} sanitizeHtml={sanitizeHtml} />);
    expect(sanitizeHtml).not.toHaveBeenCalled();
    expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument();
  });

  it('renders rich text in exam mode too', () => {
    const sanitizeHtml = vi.fn((html: string) => html);
    const { container } = render(
      <MultipleChoice
        data={projectionOf(rich())}
        renderMode="exam"
        sanitizeHtml={sanitizeHtml}
        onSubmit={vi.fn()}
      />,
    );
    expect(container.querySelector('legend em')?.textContent).toBe('What');
  });
});
