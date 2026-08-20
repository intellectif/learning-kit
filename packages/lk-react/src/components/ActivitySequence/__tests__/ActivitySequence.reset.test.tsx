import type { MultipleChoiceData, WrittenResponseData } from '@intellectif/lk-core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ActivitySequence } from '../index.js';

const mc = (id: string, question: string): MultipleChoiceData => ({
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id,
  title: `Title ${id}`,
  question,
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  options: [
    { id: 'wrong', text: 'Wrong', isCorrect: false },
    { id: 'right', text: 'Right', isCorrect: true },
  ],
});

const answerCurrentQuestion = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
  await user.click(screen.getByRole('radio', { name: 'Right' }));
  await user.click(screen.getByRole('button', { name: 'Submit' }));
};

describe('ActivitySequence reset on activity-set change (B8)', () => {
  it('resets the pager and completes with only the new set of results', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    const setA = [mc('a1', 'A one?'), mc('a2', 'A two?')];
    const setB = [mc('b1', 'B one?'), mc('b2', 'B two?')];

    const { rerender } = render(<ActivitySequence activities={setA} onComplete={onComplete} />);
    await answerCurrentQuestion(user);
    expect(onComplete).not.toHaveBeenCalled();

    rerender(<ActivitySequence activities={setB} onComplete={onComplete} />);
    expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();
    expect(screen.getByText('B one?')).toBeInTheDocument();

    // The set-A result must not leak into set B: completing just one set-B
    // activity is not "all complete".
    await answerCurrentQuestion(user);
    expect(onComplete).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('B two?')).toBeInTheDocument();
    await answerCurrentQuestion(user);

    expect(onComplete).toHaveBeenCalledTimes(1);
    const results = onComplete.mock.calls[0]?.[0];
    expect(results).toHaveLength(2);
    expect(
      results.map((r: { xapiStatement: { object: { id: string } } }) => r.xapiStatement.object.id),
    ).toEqual(['urn:learning-kit:activity:b1', 'urn:learning-kit:activity:b2']);
  });

  it('resets to question 1 when the new set is shorter than the old index', async () => {
    const user = userEvent.setup();
    const setA = [mc('a1', 'A one?'), mc('a2', 'A two?')];
    const { rerender } = render(<ActivitySequence activities={setA} />);

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Question 2 of 2')).toBeInTheDocument();

    rerender(<ActivitySequence activities={[mc('b1', 'B only?')]} />);
    expect(screen.getByText('Question 1 of 1')).toBeInTheDocument();
    expect(screen.getByText('B only?')).toBeInTheDocument();
  });

  it('renders a written-response activity properly inside a sequence', () => {
    // Previously this rendered a dead-end "not supported" note, so a mixed
    // exam section containing an essay could never complete.
    const writtenResponse: WrittenResponseData = {
      schemaVersion: '1.0',
      type: 'written-response',
      id: 'w1',
      title: 'Essay',
      prompt: 'Write something.',
      minWords: 1,
      maxWords: 10,
    };
    render(<ActivitySequence activities={[writtenResponse]} />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByText('Write something.')).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});

describe('ActivitySequence survives structurally identical fresh arrays (release-review blocker fix)', () => {
  it('keeps progress when a parent re-render passes a new .map()-created array of the same set', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    const items = [
      { id: 's1', question: 'S one?' },
      { id: 's2', question: 'S two?' },
    ];
    // Simulates the common consumer pattern: activities built inline from
    // items on every render, with onActivityComplete triggering parent state.
    function Parent() {
      const [, force] = React.useState(0);
      return (
        <ActivitySequence
          activities={items.map((i) => mc(i.id, i.question))}
          onActivityComplete={() => force((n) => n + 1)}
          onComplete={onComplete}
        />
      );
    }
    render(<Parent />);
    await answerCurrentQuestion(user);
    // The parent re-rendered with a fresh array; progress must survive.
    expect(onComplete).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await answerCurrentQuestion(user);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0]?.[0]).toHaveLength(2);
  });
});

describe('set-identity key cannot collide across different sets (pre-merge review fix)', () => {
  it('treats ["a","bc"] and ["ab","c"] as DIFFERENT sets', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    const first = [mc('a', 'Q a?'), mc('bc', 'Q bc?')];
    const second = [mc('ab', 'Q ab?'), mc('c', 'Q c?')];
    const { rerender } = render(<ActivitySequence activities={first} onComplete={onComplete} />);
    await answerCurrentQuestion(user);
    // A naive join('') key would render these two sets identical and NOT
    // reset, leaking the answer above into the new set.
    rerender(<ActivitySequence activities={second} onComplete={onComplete} />);
    expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();
    expect(screen.getByText('Q ab?')).toBeInTheDocument();
    await answerCurrentQuestion(user);
    expect(onComplete).not.toHaveBeenCalled();
  });
});
