import type { FillInTheBlanksData, MultipleChoiceData } from '@intellectif/lk-core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { checkA11y } from '../../../test-support/a11y.js';
import { ActivitySequence } from '../index.js';

const mc: MultipleChoiceData = {
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'q1',
  title: 'Q1',
  question: 'What is 2 + 2?',
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  options: [
    { id: 'a', text: 'Three', isCorrect: false },
    { id: 'b', text: 'Four', isCorrect: true },
  ],
};

const fib: FillInTheBlanksData = {
  schemaVersion: '1.0',
  type: 'fill-in-the-blanks',
  id: 'q2',
  title: 'Q2',
  passage: 'Sky is {{x}}.',
  blanks: [{ id: 'x', acceptedAnswers: ['blue'] }],
  scoringStrategy: 'partial',
};

describe('ActivitySequence', () => {
  it('shows one question at a time with progress and bounded navigation', async () => {
    const user = userEvent.setup();
    render(<ActivitySequence activities={[mc, fib]} />);

    expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();
    expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Question 2 of 2')).toBeInTheDocument();
    expect(screen.getByText(/Sky is/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();
  });

  it('reports each completion and fires onComplete when all are done', async () => {
    const user = userEvent.setup();
    const onActivityComplete = vi.fn();
    const onComplete = vi.fn();
    render(
      <ActivitySequence
        activities={[mc, fib]}
        onActivityComplete={onActivityComplete}
        onComplete={onComplete}
        onInteraction={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('radio', { name: 'Four' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(onActivityComplete).toHaveBeenCalledWith(expect.objectContaining({ score: 1 }), 0, '0');
    expect(onComplete).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.type(screen.getByRole('textbox', { name: 'Fill in blank 1' }), 'blue');
    await user.click(screen.getByRole('button', { name: 'Check answers' }));

    expect(onActivityComplete).toHaveBeenCalledWith(expect.objectContaining({ score: 1 }), 1, '1');
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0]?.[0]).toHaveLength(2);
  });

  it('moves focus to the question region on navigation', async () => {
    const user = userEvent.setup();
    const { container } = render(<ActivitySequence activities={[mc, fib]} />);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(container.querySelector('.lk-seq-question')).toHaveFocus();
  });

  it('renders an empty container for an empty set', () => {
    const { container } = render(<ActivitySequence activities={[]} />);
    expect(container.querySelector('.lk-seq')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = render(<ActivitySequence activities={[mc, fib]} />);
    expect(await checkA11y(container)).toHaveNoViolations();
  });
});
