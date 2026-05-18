import type { FillInTheBlanksData } from '@intellectif/lk-core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { checkA11y } from '../../../test-support/a11y.js';
import { FillInTheBlanks } from '../index.js';

const fib = (over: Partial<FillInTheBlanksData> = {}): FillInTheBlanksData => ({
  schemaVersion: '1.0',
  type: 'fill-in-the-blanks',
  id: 'f1',
  title: 'Capitals',
  passage: 'France = {{a}} and Spain = {{b}}.',
  blanks: [
    { id: 'a', acceptedAnswers: ['Paris'] },
    { id: 'b', acceptedAnswers: ['Madrid'], hint: 'Starts with M' },
  ],
  scoringStrategy: 'partial',
  ...over,
});

describe('FillInTheBlanks', () => {
  it('renders the passage with named inline inputs', () => {
    render(<FillInTheBlanks data={fib()} onComplete={vi.fn()} />);
    expect(screen.getByRole('form', { name: 'Capitals' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Fill in blank 1' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Fill in blank 2' })).toBeInTheDocument();
    expect(screen.getByText(/France =/)).toBeInTheDocument();
  });

  it('records blank input and fires onInteraction', async () => {
    const user = userEvent.setup();
    const onInteraction = vi.fn();
    render(<FillInTheBlanks data={fib()} onComplete={vi.fn()} onInteraction={onInteraction} />);
    const blank1 = screen.getByRole('textbox', { name: 'Fill in blank 1' });
    await user.type(blank1, 'Paris');
    expect(blank1).toHaveValue('Paris');
    expect(onInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'blank-filled', activityId: 'f1' }),
    );
  });

  it('reveals a hint in a tooltip and fires hint-requested; input is described by it', async () => {
    const user = userEvent.setup();
    const onInteraction = vi.fn();
    render(<FillInTheBlanks data={fib()} onComplete={vi.fn()} onInteraction={onInteraction} />);
    const blank2 = screen.getByRole('textbox', { name: 'Fill in blank 2' });
    expect(blank2).toHaveAttribute('aria-describedby', 'f1-hint-b');
    await user.click(screen.getByRole('button', { name: 'Show hint' }));
    expect(document.getElementById('f1-hint-b')).toHaveTextContent('Starts with M');
    expect(onInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'hint-requested', payload: { blankId: 'b' } }),
    );
  });

  it('submits and reports a partial-credit ActivityResult', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<FillInTheBlanks data={fib()} onComplete={onComplete} />);
    await user.type(screen.getByRole('textbox', { name: 'Fill in blank 1' }), 'Paris');
    await user.type(screen.getByRole('textbox', { name: 'Fill in blank 2' }), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Check answers' }));
    const result = onComplete.mock.calls[0]?.[0];
    expect(result.score).toBe(0.5);
    expect(result.maxScore).toBe(1);
    expect(result.xapiStatement.version).toBe('1.0.3');
    expect(screen.getByText(/Score 50%/)).toBeInTheDocument();
  });

  it('showCorrectAnswers replaces an incorrect blank with the first accepted answer', async () => {
    const user = userEvent.setup();
    render(<FillInTheBlanks data={fib()} onComplete={vi.fn()} showCorrectAnswers />);
    await user.type(screen.getByRole('textbox', { name: 'Fill in blank 1' }), 'Paris');
    await user.type(screen.getByRole('textbox', { name: 'Fill in blank 2' }), 'nope');
    await user.click(screen.getByRole('button', { name: 'Check answers' }));
    expect(screen.getByText('Madrid')).toBeInTheDocument();
  });

  it('honours the disabled prop', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<FillInTheBlanks data={fib()} onComplete={onComplete} disabled />);
    const blank1 = screen.getByRole('textbox', { name: 'Fill in blank 1' });
    expect(blank1).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Check answers' }));
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('resets when the data prop changes (Req 3.7)', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<FillInTheBlanks data={fib()} onComplete={vi.fn()} />);
    await user.type(screen.getByRole('textbox', { name: 'Fill in blank 1' }), 'typed');
    rerender(
      <FillInTheBlanks
        data={fib({
          id: 'f2',
          passage: 'New {{a}}.',
          blanks: [{ id: 'a', acceptedAnswers: ['z'] }],
        })}
        onComplete={vi.fn()}
      />,
    );
    expect(screen.getByText(/New/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Fill in blank 1' })).toHaveValue('');
  });

  it('renders the error boundary fallback for invalid data (dev)', () => {
    render(
      <FillInTheBlanks
        data={fib({ passage: 'no placeholder', blanks: [{ id: 'a', acceptedAnswers: ['x'] }] })}
        onComplete={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('has no axe violations before and after submission', async () => {
    const user = userEvent.setup();
    const { container } = render(<FillInTheBlanks data={fib()} onComplete={vi.fn()} />);
    expect(await checkA11y(container)).toHaveNoViolations();
    await user.type(screen.getByRole('textbox', { name: 'Fill in blank 1' }), 'Paris');
    await user.click(screen.getByRole('button', { name: 'Check answers' }));
    expect(await checkA11y(container)).toHaveNoViolations();
  });
});
