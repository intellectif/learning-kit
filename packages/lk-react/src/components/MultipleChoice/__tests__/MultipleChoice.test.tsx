import type { MultipleChoiceData } from '@intellectif/lk-core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { checkA11y } from '../../../test-support/a11y.js';
import { MultipleChoice } from '../index.js';

const single = (over: Partial<MultipleChoiceData> = {}): MultipleChoiceData => ({
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'q1',
  title: 'Quiz',
  question: 'What is 2 + 2?',
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  options: [
    { id: 'a', text: 'Three', isCorrect: false },
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

describe('MultipleChoice', () => {
  it('renders activity media above the question when present', () => {
    render(
      <MultipleChoice
        data={single({ media: { type: 'image', url: 'https://x.test/p.png', alt: 'Prompt' } })}
        onComplete={vi.fn()}
      />,
    );
    expect(screen.getByRole('img', { name: 'Prompt' })).toBeInTheDocument();
  });

  it('renders the question and all options as a radiogroup', () => {
    render(<MultipleChoice data={single()} onComplete={vi.fn()} />);
    expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument();
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('single-select replaces the previous selection', async () => {
    const user = userEvent.setup();
    render(<MultipleChoice data={single()} onComplete={vi.fn()} />);
    const three = screen.getByRole('radio', { name: 'Three' });
    const four = screen.getByRole('radio', { name: 'Four' });
    await user.click(three);
    expect(three).toBeChecked();
    await user.click(four);
    expect(four).toBeChecked();
    expect(three).not.toBeChecked();
  });

  it('multi-select allows multiple and uses group role', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<MultipleChoice data={multi()} onComplete={onComplete} />);
    // The fieldset is the (single, non-duplicated) named group.
    expect(screen.getByRole('group', { name: 'Pick the even numbers' })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    await user.click(screen.getByRole('checkbox', { name: 'Two' }));
    await user.click(screen.getByRole('checkbox', { name: 'Four' }));
    expect(screen.getByRole('checkbox', { name: 'Two' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Four' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(onComplete.mock.calls[0]?.[0].score).toBe(1);
  });

  it('submits a correct answer and reports a complete ActivityResult', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    const onInteraction = vi.fn();
    render(
      <MultipleChoice data={single()} onComplete={onComplete} onInteraction={onInteraction} />,
    );
    await user.click(screen.getByRole('radio', { name: 'Four' }));
    expect(onInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'option-selected', activityId: 'q1' }),
    );
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    const result = onComplete.mock.calls[0]?.[0];
    expect(result.score).toBe(1);
    expect(result.maxScore).toBe(1);
    expect(result.passed).toBe(true);
    expect(result.timeSpent).toBeGreaterThanOrEqual(0);
    expect(result.xapiStatement.version).toBe('1.0.3');
    expect(result.xapiStatement.verb.id).toContain('answered');
    expect(onInteraction).toHaveBeenCalledWith(expect.objectContaining({ type: 'submitted' }));
  });

  it('announces the result via the live region and shows per-option feedback', async () => {
    const user = userEvent.setup();
    render(<MultipleChoice data={single()} onComplete={vi.fn()} />);
    await user.click(screen.getByRole('radio', { name: 'Four' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(screen.getByText(/Score 100%/)).toBeInTheDocument();
    expect(screen.getByText('Correct!')).toBeInTheDocument();
  });

  it('is keyboard operable (focus + Space to select, Enter to submit)', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<MultipleChoice data={single()} onComplete={onComplete} />);
    const four = screen.getByRole('radio', { name: 'Four' });
    four.focus();
    await user.keyboard(' ');
    expect(four).toBeChecked();
    const submit = screen.getByRole('button', { name: 'Submit' });
    submit.focus();
    await user.keyboard('{Enter}');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('honours the disabled prop', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<MultipleChoice data={single()} onComplete={onComplete} disabled />);
    const four = screen.getByRole('radio', { name: 'Four' });
    expect(four).toBeDisabled();
    await user.click(four);
    expect(four).not.toBeChecked();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('resets when the data prop changes (Req 3.7)', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<MultipleChoice data={single()} onComplete={vi.fn()} />);
    await user.click(screen.getByRole('radio', { name: 'Four' }));
    expect(screen.getByRole('radio', { name: 'Four' })).toBeChecked();
    rerender(
      <MultipleChoice
        data={single({ id: 'q2', question: 'New question?' })}
        onComplete={vi.fn()}
      />,
    );
    expect(screen.getByText('New question?')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Four' })).not.toBeChecked();
  });

  it('renders the error boundary fallback for invalid data (dev)', () => {
    const bad = single({
      options: [
        { id: 'a', text: 'A', isCorrect: false },
        { id: 'b', text: 'B', isCorrect: false },
      ],
    });
    render(<MultipleChoice data={bad} onComplete={vi.fn()} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  // Feature: learning-kit-sdk, Property 9: Shuffle is deterministic per session
  it('Property 9: shuffle renders a permutation, stable within a session', () => {
    const data = single({
      shuffle: true,
      options: [
        { id: 'o1', text: 'One', isCorrect: true },
        { id: 'o2', text: 'Two', isCorrect: false },
        { id: 'o3', text: 'Three', isCorrect: false },
        { id: 'o4', text: 'Four', isCorrect: false },
      ],
    });
    const { rerender } = render(<MultipleChoice data={data} onComplete={vi.fn()} />);
    const order1 = screen.getAllByRole('radio').map((r) => (r as HTMLInputElement).value);
    rerender(<MultipleChoice data={data} onComplete={vi.fn()} />);
    const order2 = screen.getAllByRole('radio').map((r) => (r as HTMLInputElement).value);
    expect([...order1].sort()).toEqual(['o1', 'o2', 'o3', 'o4']);
    expect(order2).toEqual(order1);
  });

  it('has no axe violations before and after submission', async () => {
    const user = userEvent.setup();
    const { container } = render(<MultipleChoice data={single()} onComplete={vi.fn()} />);
    expect(await checkA11y(container)).toHaveNoViolations();
    await user.click(screen.getByRole('radio', { name: 'Four' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await checkA11y(container)).toHaveNoViolations();
  });
});
