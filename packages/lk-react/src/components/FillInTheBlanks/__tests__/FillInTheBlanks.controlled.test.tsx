import type {
  ActivityResult,
  FillInTheBlanksData,
  ItemOutcome,
  LearnerResponse,
} from '@intellectif/lk-core';
import { redact } from '@intellectif/lk-core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { checkA11y } from '../../../test-support/a11y.js';
import { FillInTheBlanks, type FillInTheBlanksProps } from '../index.js';

const fib = (over: Partial<FillInTheBlanksData> = {}): FillInTheBlanksData => ({
  schemaVersion: '1.0',
  type: 'fill-in-the-blanks',
  id: 'f1',
  title: 'Capitals',
  passage: 'France = {{a}} and Spain = {{b}}.',
  blanks: [
    { id: 'a', acceptedAnswers: ['Paris'], feedback: 'Capital of France.' },
    { id: 'b', acceptedAnswers: ['Madrid'], hint: 'Starts with M', feedback: 'Capital of Spain.' },
  ],
  scoringStrategy: 'partial',
  ...over,
});

type RenderableFib = FillInTheBlanksProps['data'];

/**
 * `Renderable<T>` widens only `scoringStrategy`, so a `redact()` projection —
 * whose blanks legitimately have no `acceptedAnswers` — is not assignable to
 * it without a cast. The cast is the point of the exam-mode tests: the
 * component must render a payload that is missing those fields at runtime.
 */
const asRenderable = (payload: unknown): RenderableFib => payload as RenderableFib;

const response = (answers: Record<string, string>): LearnerResponse => ({
  type: 'fill-in-the-blanks',
  answers,
});

const scoredOutcome = (over: Partial<Extract<ItemOutcome, { status: 'scored' }>> = {}) =>
  ({
    status: 'scored',
    score: 0.5,
    maxScore: 1,
    passed: false,
    feedback: 'Nearly there.',
    details: [
      {
        itemId: 'a',
        correct: true,
        outcome: 'correct',
        learnerResponse: ['Paris'],
        correctResponse: ['Paris'],
        weight: 1,
      },
      {
        itemId: 'b',
        correct: false,
        outcome: 'incorrect',
        learnerResponse: ['nope'],
        correctResponse: ['Madrid'],
        weight: 1,
      },
    ],
    ...over,
  }) satisfies ItemOutcome;

/** Minimal real controlled host: parent state is the single source of truth. */
function ControlledHost({
  data,
  initial,
  onChangeSpy,
}: {
  data: FillInTheBlanksData;
  initial: Record<string, string>;
  onChangeSpy?: (r: LearnerResponse) => void;
}) {
  const [value, setValue] = useState<LearnerResponse>(response(initial));
  return (
    <FillInTheBlanks
      data={data}
      value={value}
      onChange={(r) => {
        setValue(r);
        onChangeSpy?.(r);
      }}
    />
  );
}

const dataCorrectOf = (container: Element): (string | null)[] =>
  Array.from(container.querySelectorAll('input')).map((el) => el.getAttribute('data-correct'));

describe('FillInTheBlanks — controlled/uncontrolled', () => {
  it('renders from props.value and reports every change (controlled)', async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    render(<ControlledHost data={fib()} initial={{}} onChangeSpy={onChangeSpy} />);

    const blank1 = screen.getByRole('textbox', { name: 'Fill in blank 1' });
    await user.type(blank1, 'Paris');

    expect(blank1).toHaveValue('Paris');
    expect(onChangeSpy).toHaveBeenCalledTimes(5);
    expect(onChangeSpy).toHaveBeenLastCalledWith({
      type: 'fill-in-the-blanks',
      answers: { a: 'Paris' },
    });
  });

  it('never renders from internal state when controlled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    // The parent pins `value` and ignores onChange — a controlled component
    // must reflect the parent, not what was typed.
    render(<FillInTheBlanks data={fib()} value={response({ a: 'Paris' })} onChange={onChange} />);

    const blank1 = screen.getByRole('textbox', { name: 'Fill in blank 1' });
    await user.type(blank1, 'X');

    expect(blank1).toHaveValue('Paris');
    expect(onChange).toHaveBeenCalledWith({
      type: 'fill-in-the-blanks',
      answers: { a: 'ParisX' },
    });
  });

  it('submits the controlled value and fires onSubmit before onComplete', async () => {
    const user = userEvent.setup();
    const order: string[] = [];
    const submitted: LearnerResponse[] = [];
    const completed: ActivityResult[] = [];
    render(
      <FillInTheBlanks
        data={fib()}
        value={response({ a: 'Paris', b: 'Madrid' })}
        onChange={vi.fn()}
        onSubmit={(r) => {
          order.push('submit');
          submitted.push(r);
        }}
        onComplete={(r) => {
          order.push('complete');
          completed.push(r);
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Check answers' }));

    expect(submitted).toEqual([
      { type: 'fill-in-the-blanks', answers: { a: 'Paris', b: 'Madrid' } },
    ]);
    expect(order).toEqual(['submit', 'complete']);
    expect(completed[0]).toMatchObject({ score: 1, passed: true });
  });

  it('seeds an uncontrolled component from defaultValue and still reports changes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FillInTheBlanks data={fib()} defaultValue={response({ a: 'Lyon' })} onChange={onChange} />,
    );

    const blank1 = screen.getByRole('textbox', { name: 'Fill in blank 1' });
    expect(blank1).toHaveValue('Lyon');

    await user.type(blank1, '!');
    expect(blank1).toHaveValue('Lyon!');
    expect(onChange).toHaveBeenLastCalledWith({
      type: 'fill-in-the-blanks',
      answers: { a: 'Lyon!' },
    });
  });

  it('re-seeds from defaultValue when the data prop changes (Req 3.7, uncontrolled)', async () => {
    const user = userEvent.setup();
    const defaultValue = response({ a: 'Lyon' });
    const { rerender } = render(<FillInTheBlanks data={fib()} defaultValue={defaultValue} />);

    await user.type(screen.getByRole('textbox', { name: 'Fill in blank 1' }), '!');
    expect(screen.getByRole('textbox', { name: 'Fill in blank 1' })).toHaveValue('Lyon!');

    rerender(<FillInTheBlanks data={fib({ id: 'f2' })} defaultValue={defaultValue} />);
    expect(screen.getByRole('textbox', { name: 'Fill in blank 1' })).toHaveValue('Lyon');
  });

  it('submits without an onComplete handler (onComplete is optional)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<FillInTheBlanks data={fib()} onSubmit={onSubmit} />);

    await user.type(screen.getByRole('textbox', { name: 'Fill in blank 1' }), 'Paris');
    await user.click(screen.getByRole('button', { name: 'Check answers' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Score 50%/)).toBeInTheDocument();
  });
});

describe('FillInTheBlanks — exam mode', () => {
  it('submits without grading: onSubmit only, no onComplete, no score summary', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onComplete = vi.fn();
    const { container } = render(
      <FillInTheBlanks
        data={fib()}
        renderMode="exam"
        onSubmit={onSubmit}
        onComplete={onComplete}
      />,
    );

    await user.type(screen.getByRole('textbox', { name: 'Fill in blank 1' }), 'Paris');
    await user.type(screen.getByRole('textbox', { name: 'Fill in blank 2' }), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Submit answers' }));

    expect(onSubmit).toHaveBeenCalledWith({
      type: 'fill-in-the-blanks',
      answers: { a: 'Paris', b: 'wrong' },
    });
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.queryByText(/Score/)).not.toBeInTheDocument();
    expect(screen.getByText('Answer submitted.')).toBeInTheDocument();
    // No correctness anywhere in the DOM.
    expect(container.querySelectorAll('[data-correct]')).toHaveLength(0);
  });

  it('reveals nothing even when handed FULL data and showCorrectAnswers', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <FillInTheBlanks data={fib()} renderMode="exam" showCorrectAnswers onSubmit={vi.fn()} />,
    );

    await user.type(screen.getByRole('textbox', { name: 'Fill in blank 2' }), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Submit answers' }));

    expect(screen.queryByText('Madrid')).not.toBeInTheDocument();
    expect(screen.queryByText('Capital of France.')).not.toBeInTheDocument();
    expect(screen.queryByText('Capital of Spain.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hide feedback' })).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-correct]')).toHaveLength(0);
  });

  it('does not emit an interaction payload carrying a score', async () => {
    const user = userEvent.setup();
    const onInteraction = vi.fn();
    render(<FillInTheBlanks data={fib()} renderMode="exam" onInteraction={onInteraction} />);

    await user.click(screen.getByRole('button', { name: 'Submit answers' }));

    const submitted = onInteraction.mock.calls
      .map((call) => call[0])
      .find((event) => event.type === 'submitted');
    expect(submitted?.payload).toEqual({ answers: {} });
  });

  it('renders a real redact() projection and submits it', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onComplete = vi.fn();
    const projection = redact(fib());
    // Guard the premise: the key really is gone from what we hand the component.
    expect(projection.blanks).toEqual([{ id: 'a' }, { id: 'b', hint: 'Starts with M' }]);

    const { container } = render(
      <FillInTheBlanks
        data={asRenderable(projection)}
        renderMode="exam"
        showCorrectAnswers
        onSubmit={onSubmit}
        onComplete={onComplete}
      />,
    );

    // Dev-mode validation accepted the redacted payload — no boundary fallback.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Fill in blank 1' })).toBeInTheDocument();
    expect(screen.getByText(/France =/)).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Fill in blank 2' }), 'Madrid');
    // Would throw RedactedScoringError if the component called score().
    await user.click(screen.getByRole('button', { name: 'Submit answers' }));

    expect(onSubmit).toHaveBeenCalledWith({
      type: 'fill-in-the-blanks',
      answers: { b: 'Madrid' },
    });
    expect(onComplete).not.toHaveBeenCalled();
    expect(container.querySelectorAll('[data-correct]')).toHaveLength(0);
  });

  it('keeps hints working on a redacted payload (hint is a public field)', async () => {
    const user = userEvent.setup();
    const onInteraction = vi.fn();
    render(
      <FillInTheBlanks
        data={asRenderable(redact(fib()))}
        renderMode="exam"
        onInteraction={onInteraction}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Show hint' }));
    expect(document.getElementById('f1-hint-b')).toHaveTextContent('Starts with M');
    expect(onInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'hint-requested', payload: { blankId: 'b' } }),
    );
  });

  it('is controllable in exam mode', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FillInTheBlanks
        data={asRenderable(redact(fib()))}
        renderMode="exam"
        value={response({ a: 'Paris' })}
        onChange={onChange}
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Fill in blank 1' })).toHaveValue('Paris');
    await user.type(screen.getByRole('textbox', { name: 'Fill in blank 2' }), 'M');
    expect(onChange).toHaveBeenLastCalledWith({
      type: 'fill-in-the-blanks',
      answers: { a: 'Paris', b: 'M' },
    });
  });

  it('has no axe violations before and after an exam submission', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <FillInTheBlanks data={asRenderable(redact(fib()))} renderMode="exam" onSubmit={vi.fn()} />,
    );
    expect(await checkA11y(container)).toHaveNoViolations();
    await user.click(screen.getByRole('button', { name: 'Submit answers' }));
    expect(await checkA11y(container)).toHaveNoViolations();
  });
});

describe('FillInTheBlanks — review mode', () => {
  it('is read-only: renders the response, disables inputs, offers no submit', () => {
    render(
      <FillInTheBlanks
        data={fib()}
        renderMode="review"
        value={response({ a: 'Paris', b: 'nope' })}
        outcome={scoredOutcome()}
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Fill in blank 1' })).toHaveValue('Paris');
    expect(screen.getByRole('textbox', { name: 'Fill in blank 2' })).toHaveValue('nope');
    expect(screen.getByRole('textbox', { name: 'Fill in blank 1' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Fill in blank 2' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Check answers' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit answers' })).not.toBeInTheDocument();
  });

  it('marks correctness from props.outcome and shows the server score', () => {
    const { container } = render(
      <FillInTheBlanks
        data={fib()}
        renderMode="review"
        defaultValue={response({ a: 'Paris', b: 'nope' })}
        outcome={scoredOutcome()}
      />,
    );

    expect(dataCorrectOf(container)).toEqual(['true', 'false']);
    expect(screen.getByText(/Score 50%\. Not passed\. Nearly there\./)).toBeInTheDocument();
  });

  it('accepts a 0.2-era outcome that only carries the deprecated `correct` flag', () => {
    const { container } = render(
      <FillInTheBlanks
        data={fib()}
        renderMode="review"
        value={response({ a: 'Paris', b: 'nope' })}
        outcome={{
          status: 'scored',
          score: 0.5,
          maxScore: 1,
          passed: false,
          feedback: null,
          details: [
            { itemId: 'a', correct: true, learnerResponse: ['Paris'], correctResponse: ['Paris'] },
            { itemId: 'b', correct: false, learnerResponse: ['nope'], correctResponse: ['Madrid'] },
          ],
        }}
      />,
    );

    expect(dataCorrectOf(container)).toEqual(['true', 'false']);
  });

  it('marks nothing when no outcome is supplied (never scores locally)', () => {
    const { container } = render(
      <FillInTheBlanks
        data={fib()}
        renderMode="review"
        value={response({ a: 'Paris', b: 'Madrid' })}
      />,
    );

    // Both answers are in fact correct — an implementation that scored
    // locally would mark them. Review must stay silent without an outcome.
    expect(dataCorrectOf(container)).toEqual([null, null]);
    expect(screen.queryByText(/Score/)).not.toBeInTheDocument();
    expect(screen.queryByText('Capital of France.')).not.toBeInTheDocument();
  });

  it('reports a deferred outcome as ungraded rather than as a zero', () => {
    render(
      <FillInTheBlanks
        data={fib()}
        renderMode="review"
        value={response({ a: 'Paris' })}
        outcome={{ status: 'deferred', reason: 'requires_async_grading', maxScore: 1 }}
      />,
    );

    expect(screen.getByText('Not graded yet.')).toBeInTheDocument();
    expect(screen.queryByText(/Score/)).not.toBeInTheDocument();
    // An ungraded item must not have its authored key material revealed.
    expect(screen.queryByText('Capital of France.')).not.toBeInTheDocument();
  });

  it('shows the correct answer for outcome-marked incorrect blanks with showCorrectAnswers', () => {
    render(
      <FillInTheBlanks
        data={fib()}
        renderMode="review"
        value={response({ a: 'Paris', b: 'nope' })}
        outcome={scoredOutcome()}
        showCorrectAnswers
      />,
    );

    expect(screen.getByText('Madrid')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Fill in blank 1' })).toBeInTheDocument();
    expect(screen.getByText('Capital of France.')).toBeInTheDocument();
  });

  it('survives review over a redacted payload that has no key to show', () => {
    render(
      <FillInTheBlanks
        data={asRenderable(redact(fib()))}
        renderMode="review"
        value={response({ a: 'Paris', b: 'nope' })}
        outcome={scoredOutcome()}
        showCorrectAnswers
      />,
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Fill in blank 2' })).toHaveValue('nope');
    expect(screen.queryByText('Madrid')).not.toBeInTheDocument();
  });

  it('has no axe violations in review mode', async () => {
    const { container } = render(
      <FillInTheBlanks
        data={fib()}
        renderMode="review"
        value={response({ a: 'Paris', b: 'nope' })}
        outcome={scoredOutcome()}
      />,
    );
    expect(await checkA11y(container)).toHaveNoViolations();
  });
});

describe('FillInTheBlanks — rich text', () => {
  it('renders the plain passage and never injects passageHtml', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const sanitizeHtml = vi.fn((html: string) => html);
    const { container } = render(
      <FillInTheBlanks
        data={fib({
          passageHtml: '<p>France = <strong>{{a}}</strong> and Spain = {{b}}.</p>',
        })}
        sanitizeHtml={sanitizeHtml}
      />,
    );

    // The passage hosts the inputs, so it is never rendered as HTML: the
    // sanitiser is not even consulted, and nothing is injected.
    expect(sanitizeHtml).not.toHaveBeenCalled();
    expect(container.querySelector('strong')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Fill in blank 1' })).toBeInTheDocument();
    expect(screen.getByText(/France =/)).toBeInTheDocument();
    // Dev-only: the ignored prop is announced rather than silently dropped.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('passageHtml'));
    warn.mockRestore();
  });
});
