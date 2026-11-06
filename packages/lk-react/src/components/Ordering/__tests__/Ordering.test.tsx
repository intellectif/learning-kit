import { evaluate, type OrderingData, orderingStart, redact } from '@intellectif/lk-core';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../test-support/a11y.js';
import { ActivityPreview } from '../../ActivityPreview/index.js';
import { ActivitySequence } from '../../ActivitySequence/index.js';
import { Ordering } from '../index.js';

afterEach(cleanup);

// Right order: k q w e
const data: OrderingData = {
  schemaVersion: '1.0',
  type: 'ordering',
  id: 'or1',
  title: 'Making pasta',
  instructions: 'Put the steps in order.',
  items: [
    { id: 'k', text: 'Fill a pot.' },
    { id: 'q', text: 'Boil the water.', feedback: 'Pasta goes into boiling water.' },
    { id: 'w', text: 'Add the pasta.' },
    { id: 'e', text: 'Drain it.' },
  ],
  scoringStrategy: 'partial',
};

const TEXT = Object.fromEntries(data.items.map((item) => [item.id, item.text]));
const START = orderingStart(data).map((item) => item.id);

/** The items as shown, by id. */
const shown = (): string[] =>
  within(screen.getByRole('list', { name: 'Items to put in order' }))
    .getAllByRole('listitem')
    .map((row) => row.getAttribute('data-item') as string);
const row = (id: string) =>
  screen
    .getByRole('list', { name: 'Items to put in order' })
    .querySelector(`[data-item="${id}"]`) as HTMLElement;
const up = (id: string) => within(row(id)).getByRole('button', { name: 'Move up' });
const down = (id: string) => within(row(id)).getByRole('button', { name: 'Move down' });
const check = () => screen.getByRole('button', { name: 'Check answers' });
const answer = (order: string[]) => ({ type: 'ordering' as const, order });

describe('<Ordering> rendering', () => {
  it('starts in the start order, never the right one, each item with its two buttons', () => {
    render(<Ordering data={data} />);
    expect(shown()).toEqual(START);
    expect(START).not.toEqual(['k', 'q', 'w', 'e']);
    expect(up(START[0] as string)).toHaveAttribute('aria-disabled', 'true');
    expect(down(START[3] as string)).toHaveAttribute('aria-disabled', 'true');
    // Each button is described by its item's text.
    expect(up('w')).toHaveAccessibleDescription('Add the pasta.');
  });

  it('shows a redacted copy in the order it lists', async () => {
    const redacted = redact(data, { reveal: 'none' }) as unknown as OrderingData;
    render(<Ordering data={redacted} renderMode="exam" />);
    expect(shown()).toEqual(redacted.items.map((item) => item.id));
    expect(shown()).toEqual(START);
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<Ordering data={data} />);
    expect(await runAxe(container)).toHaveNoViolations();
  });
});

describe('<Ordering> moving', () => {
  it('moves an item, reports the new order, reads out where it went, and keeps focus on it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onInteraction = vi.fn();
    render(<Ordering data={data} onChange={onChange} onInteraction={onInteraction} />);
    const [first, second] = START as [string, string];
    await user.click(down(first));
    const next = [second, first, ...START.slice(2)];
    expect(shown()).toEqual(next);
    expect(onChange).toHaveBeenLastCalledWith(answer(next));
    expect(onInteraction).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'item-moved', payload: { id: first, from: 0, to: 1 } }),
    );
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent(
      `Moved to 2 of 4: ${TEXT[first]}`,
    );
    expect(down(first)).toHaveFocus();
    // At an edge the button stays focusable and does nothing.
    await user.click(up(second));
    expect(up(second)).toHaveFocus();
    await user.click(up(second));
    expect(shown()).toEqual(next);
  });

  it('is answered with the keyboard alone, and never submits on a move', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Ordering data={data} onSubmit={onSubmit} />);
    await user.tab();
    expect(up(START[0] as string)).toHaveFocus();
    await user.tab();
    await user.keyboard('{Enter}');
    expect(shown()[1]).toBe(START[0]);
    await user.keyboard(' ');
    expect(shown()[2]).toBe(START[0]);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('scores locally and marks each item in or out of order, read out as well as drawn', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(
      <Ordering data={data} defaultValue={answer(['k', 'w', 'q', 'e'])} onComplete={onComplete} />,
    );
    await user.click(check());
    // k first ✓, w after k ✗, q after w ✗, e after q ✗: 1 / 4.
    expect(onComplete.mock.calls[0]?.[0]).toMatchObject({ score: 0.25, passed: false });
    expect(onComplete.mock.calls[0]?.[0].xapiStatement.result.response).toBe('k[,]w[,]q[,]e');
    expect(row('k')).toHaveAttribute('data-mark', 'correct');
    expect(row('k')).toHaveTextContent('in order');
    expect(row('w')).toHaveAttribute('data-mark', 'wrong');
    expect(row('w')).toHaveTextContent('out of order');
    // The right order, where answers are shown.
    const solution = screen.getByRole('list', { name: 'The right order' });
    expect(
      within(solution)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Fill a pot.', 'Boil the water.', 'Add the pasta.', 'Drain it.']);
    expect(screen.getByRole('note')).toHaveTextContent(
      'Boil the water. Pasta goes into boiling water.',
    );
    await user.click(screen.getByRole('button', { name: 'Hide feedback' }));
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    // Checked: nothing moves.
    await user.click(down('k'));
    expect(shown()).toEqual(['k', 'w', 'q', 'e']);
  });

  it('shows no right order when every item is in order, or where answers are withheld', async () => {
    const user = userEvent.setup();
    render(<Ordering data={data} defaultValue={answer(['k', 'q', 'w', 'e'])} />);
    await user.click(check());
    expect(row('e')).toHaveAttribute('data-mark', 'correct');
    expect(screen.queryByRole('list', { name: 'The right order' })).not.toBeInTheDocument();
    cleanup();

    render(
      <Ordering
        data={data}
        defaultValue={answer(['q', 'k', 'w', 'e'])}
        delivery={{ solutions: false }}
      />,
    );
    await user.click(check());
    expect(row('q')).toHaveAttribute('data-mark', 'wrong');
    expect(screen.queryByRole('list', { name: 'The right order' })).not.toBeInTheDocument();
    cleanup();

    render(
      <Ordering
        data={data}
        defaultValue={answer(['q', 'k', 'w', 'e'])}
        delivery={{ feedback: false }}
      />,
    );
    await user.click(check());
    expect(row('q')).not.toHaveAttribute('data-mark');
  });

  it('keeps the order for another try, and shows the right order only once the tries close', async () => {
    const user = userEvent.setup();
    render(
      <Ordering data={data} defaultValue={answer(['q', 'k', 'w', 'e'])} scoring={{ retries: 1 }} />,
    );
    await user.click(check());
    expect(screen.queryByRole('list', { name: 'The right order' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(shown()).toEqual(['q', 'k', 'w', 'e']);
    expect(up('q')).toHaveFocus();
    await user.click(check());
    expect(screen.getByRole('list', { name: 'The right order' })).toBeInTheDocument();
  });

  it('follows a controlled value, fills in what it leaves out, and starts over when the item changes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <Ordering data={data} value={answer(['e', 'zz', 'e', 'k'])} onChange={onChange} />,
    );
    // e and k as given, then the rest where they start.
    const rest = START.filter((id) => id !== 'e' && id !== 'k');
    expect(shown()).toEqual(['e', 'k', ...rest]);
    await user.click(down('e'));
    expect(shown()).toEqual(['e', 'k', ...rest]);
    expect(onChange).toHaveBeenLastCalledWith(answer(['k', 'e', ...rest]));
    rerender(<Ordering data={data} value={{ type: 'matching', matches: {} }} />);
    expect(shown()).toEqual(START);
    cleanup();

    const { rerender: again } = render(
      <Ordering data={data} defaultValue={answer(['k', 'q', 'w', 'e'])} />,
    );
    await user.click(check());
    again(<Ordering data={{ ...data, id: 'or2' }} />);
    expect(shown()).toEqual(orderingStart({ ...data, id: 'or2' }).map((item) => item.id));
    expect(check()).toBeEnabled();
  });
});

describe('<Ordering> in an exam and in review', () => {
  it('records the answer in an exam without grading or revealing it', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onComplete = vi.fn();
    const redacted = redact(data, { reveal: 'none' }) as unknown as OrderingData;
    render(
      <Ordering data={redacted} renderMode="exam" onSubmit={onSubmit} onComplete={onComplete} />,
    );
    await user.click(down(START[0] as string));
    await user.click(screen.getByRole('button', { name: 'Submit answers' }));
    expect(onSubmit).toHaveBeenCalledWith(
      answer([START[1], START[0], ...START.slice(2)] as string[]),
    );
    expect(onComplete).not.toHaveBeenCalled();
    expect(row('k')).not.toHaveAttribute('data-mark');
    expect(screen.getByText('Answer submitted.')).toBeInTheDocument();
  });

  it('marks a review from its scored outcome alone, on a redacted item, with the right order', () => {
    const response = answer(['k', 'w', 'q', 'e']);
    const outcome = evaluate(data, response);
    const redacted = redact(data, { reveal: 'none' }) as unknown as OrderingData;
    render(<Ordering data={redacted} renderMode="review" value={response} outcome={outcome} />);
    expect(shown()).toEqual(['k', 'w', 'q', 'e']);
    expect(row('k')).toHaveAttribute('data-mark', 'correct');
    expect(row('q')).toHaveAttribute('data-mark', 'wrong');
    expect(screen.queryByRole('button', { name: /Move|Check|Submit/ })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'The right order' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Fill a pot.', 'Boil the water.', 'Add the pasta.', 'Drain it.']);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('reads back an outcome that is not scored without marking anything', () => {
    for (const outcome of [
      { status: 'deferred', reason: 'requires_async_grading' },
      { status: 'graded', score: 3, maxScore: 4, passed: true, feedback: 'Good.' },
      { status: 'unscorable', reason: 'no-grade' },
    ] as const) {
      render(
        <Ordering
          data={data}
          renderMode="review"
          value={answer(['k', 'q', 'w', 'e'])}
          outcome={outcome as never}
        />,
      );
      expect(row('k')).not.toHaveAttribute('data-mark');
      cleanup();
    }
  });

  it('refuses a redacted item in practice, which has nothing to grade against', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const redacted = redact(data, { reveal: 'none' }) as unknown as OrderingData;
    render(<Ordering data={redacted} />);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    error.mockRestore();
  });

  it('is drawn by the sequence and the preview', () => {
    render(<ActivitySequence activities={[data]} renderMode="practice" />);
    expect(row('w')).toBeInTheDocument();
    cleanup();
    render(<ActivityPreview draft={data} />);
    expect(row('e')).toBeInTheDocument();
  });
});
