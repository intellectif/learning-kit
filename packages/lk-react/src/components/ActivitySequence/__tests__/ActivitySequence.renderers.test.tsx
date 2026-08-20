import type { ActivityData, MultipleChoiceData, WrittenResponseData } from '@intellectif/lk-core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { checkA11y } from '../../../test-support/a11y.js';
import type { ActivityProps } from '../../types.js';
import { ActivitySequence, type SequenceItemOutcome } from '../index.js';

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

const essay = (id: string, prompt: string): WrittenResponseData => ({
  schemaVersion: '1.0',
  type: 'written-response',
  id,
  title: `Essay ${id}`,
  prompt,
  minWords: 1,
  maxWords: 50,
});

const answerMultipleChoice = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
  await user.click(screen.getByRole('radio', { name: 'Right' }));
  await user.click(screen.getByRole('button', { name: 'Submit' }));
};

const submitEssay = async (
  user: ReturnType<typeof userEvent.setup>,
  text: string,
): Promise<void> => {
  await user.type(screen.getByRole('textbox'), text);
  await user.click(screen.getByRole('button', { name: 'Submit' }));
};

/** Narrows one outcome to the scored variant, failing loudly if it is not. */
function asScored(outcome: SequenceItemOutcome | undefined) {
  if (outcome?.kind !== 'scored') {
    throw new Error(`expected a scored outcome, got ${outcome?.kind ?? 'nothing'}`);
  }
  return outcome;
}

/** Narrows one outcome to the deferred-grading variant. */
function asSubmitted(outcome: SequenceItemOutcome | undefined) {
  if (outcome?.kind !== 'submitted') {
    throw new Error(`expected a submitted outcome, got ${outcome?.kind ?? 'nothing'}`);
  }
  return outcome;
}

/**
 * A consumer-defined renderer for an activity type the SDK does not ship.
 * Deliberately trivial: what is under test is the registry wiring, not the
 * activity.
 */
function MatchingRenderer({ data, onComplete }: ActivityProps) {
  return (
    <div className="fake-matching">
      <p>Custom matching renderer for {data.id}</p>
      <button
        type="button"
        onClick={() =>
          onComplete?.({
            score: 1,
            maxScore: 1,
            passed: true,
            timeSpent: 0,
            xapiStatement: {} as never,
          })
        }
      >
        Finish matching
      </button>
    </div>
  );
}

/** Replaces the bundled multiple-choice renderer. */
function StubMultipleChoice({ data }: ActivityProps) {
  return <p>Overridden multiple-choice renderer for {data.id}</p>;
}

describe('ActivitySequence completion across graded and deferred-graded items', () => {
  it('finishes a mixed set of multiple-choice and written-response items', async () => {
    // The live bug: a section containing an essay could never report
    // completion, because the only completion signal promised
    // ActivityResult[] and an ungraded essay has no result to give.
    const user = userEvent.setup();
    const onFinished = vi.fn<(items: SequenceItemOutcome[]) => void>();
    const onComplete = vi.fn();
    const activities = [mc('q1', 'Q one?'), mc('q2', 'Q two?'), essay('e1', 'Write something.')];

    render(
      <ActivitySequence activities={activities} onFinished={onFinished} onComplete={onComplete} />,
    );

    await answerMultipleChoice(user);
    expect(onFinished).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await answerMultipleChoice(user);
    expect(onFinished).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Write something.')).toBeInTheDocument();
    await submitEssay(user, 'Sea otters hold hands while they sleep.');

    expect(onFinished).toHaveBeenCalledTimes(1);
    const items = onFinished.mock.calls[0]?.[0];
    expect(items).toHaveLength(3);

    const first = asScored(items?.[0]);
    expect(first.index).toBe(0);
    expect(first.activityId).toBe('q1');
    expect(first.result.score).toBe(1);
    expect(first.result.maxScore).toBe(1);
    expect(first.result.passed).toBe(true);
    expect(first.result.xapiStatement.object.id).toBe('urn:learning-kit:activity:q1');

    const second = asScored(items?.[1]);
    expect(second.index).toBe(1);
    expect(second.activityId).toBe('q2');
    expect(second.result.score).toBe(1);
    expect(second.result.xapiStatement.object.id).toBe('urn:learning-kit:activity:q2');

    const third = asSubmitted(items?.[2]);
    expect(third.index).toBe(2);
    expect(third.activityId).toBe('e1');
    expect(third.submission.text).toBe('Sea otters hold hands while they sleep.');
    expect(third.submission.wordCount).toBe(7);
    expect(third.submission.withinWordBounds).toBe(true);

    // `onComplete` promises ActivityResult[]; an ungraded essay cannot supply
    // one, so inventing a score (or a 0) to fire it would be the defect.
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('fires both onFinished and onComplete when every item was scored', async () => {
    const user = userEvent.setup();
    const onFinished = vi.fn<(items: SequenceItemOutcome[]) => void>();
    const onComplete = vi.fn();
    const onActivityComplete = vi.fn();

    render(
      <ActivitySequence
        activities={[mc('s1', 'S one?'), mc('s2', 'S two?')]}
        onFinished={onFinished}
        onComplete={onComplete}
        onActivityComplete={onActivityComplete}
      />,
    );

    await answerMultipleChoice(user);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await answerMultipleChoice(user);

    expect(onFinished).toHaveBeenCalledTimes(1);
    const items = onFinished.mock.calls[0]?.[0] ?? [];
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.kind)).toEqual(['scored', 'scored']);

    expect(onComplete).toHaveBeenCalledTimes(1);
    const results = onComplete.mock.calls[0]?.[0];
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual(asScored(items[0]).result);
    expect(results[1]).toEqual(asScored(items[1]).result);

    expect(onActivityComplete).toHaveBeenCalledTimes(2);
    expect(onActivityComplete.mock.calls[0]?.[1]).toBe(0);
    expect(onActivityComplete.mock.calls[1]?.[1]).toBe(1);
  });

  it('fires neither completion callback while a slot is still unanswered', async () => {
    const user = userEvent.setup();
    const onFinished = vi.fn();
    const onComplete = vi.fn();

    render(
      <ActivitySequence
        activities={[mc('p1', 'P one?'), mc('p2', 'P two?')]}
        onFinished={onFinished}
        onComplete={onComplete}
      />,
    );

    await answerMultipleChoice(user);

    expect(onFinished).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });
});

describe('ActivitySequence renderer registry', () => {
  it('renders a consumer-registered type and records its outcome', async () => {
    const user = userEvent.setup();
    const onFinished = vi.fn<(items: SequenceItemOutcome[]) => void>();
    const onComplete = vi.fn();
    const matching = {
      schemaVersion: '1.0',
      type: 'matching',
      id: 'm1',
      title: 'Matching',
    } as unknown as ActivityData;

    render(
      <ActivitySequence
        activities={[mc('r1', 'R one?'), matching]}
        renderers={{ matching: MatchingRenderer }}
        onFinished={onFinished}
        onComplete={onComplete}
      />,
    );

    await answerMultipleChoice(user);
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // The registered component is on screen — not the "no renderer" note.
    expect(screen.getByText('Custom matching renderer for m1')).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Finish matching' }));

    expect(onFinished).toHaveBeenCalledTimes(1);
    const items = onFinished.mock.calls[0]?.[0] ?? [];
    expect(items).toHaveLength(2);
    const custom = asScored(items[1]);
    expect(custom.index).toBe(1);
    expect(custom.activityId).toBe('m1');
    expect(custom.result.score).toBe(1);
    // A registered renderer that scores is indistinguishable from a built-in
    // that scores, so the set completes on the scored-only path too.
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0]?.[0]).toHaveLength(2);
  });

  it('lets a registered renderer override a built-in type', () => {
    render(
      <ActivitySequence
        activities={[mc('o1', 'O one?')]}
        renderers={{ 'multiple-choice': StubMultipleChoice }}
      />,
    );

    expect(screen.getByText('Overridden multiple-choice renderer for o1')).toBeInTheDocument();
    // The bundled renderer is gone entirely, not merely hidden.
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryByText('O one?')).not.toBeInTheDocument();
    // The stub renders no Submit control at all.
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
  });

  it('falls back to a note when an unknown type has no registered renderer', () => {
    const unknown = {
      schemaVersion: '1.0',
      type: 'matching',
      id: 'u1',
      title: 'Unknown',
    } as unknown as ActivityData;

    render(<ActivitySequence activities={[unknown]} />);

    const note = screen.getByRole('note');
    expect(note).toBeInTheDocument();
    expect(note).toHaveTextContent(/renderers/i);
  });
});

describe('ActivitySequence forwarding and accessibility', () => {
  it('forwards renderMode so an exam-mode item never reveals correctness', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ActivitySequence activities={[mc('x1', 'X one?')]} renderMode="exam" />,
    );

    await answerMultipleChoice(user);

    // Submit landed (the component announces it) but nothing was graded or
    // revealed: `data-correct` is the built-in's only correctness signal.
    expect(screen.getByText('Answer submitted.')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-correct]')).toHaveLength(0);
  });

  it('reveals correctness in the default practice mode (control for the exam case)', async () => {
    const user = userEvent.setup();
    const { container } = render(<ActivitySequence activities={[mc('x2', 'X two?')]} />);

    await answerMultipleChoice(user);

    expect(container.querySelectorAll('[data-correct]').length).toBeGreaterThan(0);
  });

  it('has no axe violations with a written response in the set', async () => {
    const { container } = render(
      <ActivitySequence activities={[essay('a1', 'Describe your weekend.'), mc('a2', 'A two?')]} />,
    );

    expect(await checkA11y(container)).toHaveNoViolations();
  });
});

describe('back-navigation preserves answers and never double-completes', () => {
  const mc = (id: string, question: string): MultipleChoiceData => ({
    schemaVersion: '1.0',
    type: 'multiple-choice',
    id,
    title: `T ${id}`,
    question,
    mode: 'single',
    scoringStrategy: 'all-or-nothing',
    options: [
      { id: 'wrong', text: `Wrong ${id}`, isCorrect: false },
      { id: 'right', text: `Right ${id}`, isCorrect: true },
    ],
  });

  it('keeps a submitted answer visible and locked when the learner navigates back', async () => {
    const user = userEvent.setup();
    const onFinished = vi.fn();
    const onComplete = vi.fn();
    render(
      <ActivitySequence
        activities={[mc('q1', 'First?'), mc('q2', 'Second?')]}
        onFinished={onFinished}
        onComplete={onComplete}
      />,
    );

    await user.click(screen.getByRole('radio', { name: 'Right q1' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('radio', { name: 'Right q2' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);

    // Go back to the first question: the answer must still be there, and the
    // item must still be locked. Previously the slot was unmounted, so it came
    // back blank and re-submittable — losing the answer and firing completion
    // a second time for one attempt.
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    const chosen = screen.getByRole('radio', { name: 'Right q1' }) as HTMLInputElement;
    expect(chosen.checked).toBe(true);
    expect(chosen).toBeDisabled();
    // The component keeps its Submit control but disables it once submitted.
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();

    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('exposes only the current question to assistive tech and tab order', async () => {
    const user = userEvent.setup();
    render(<ActivitySequence activities={[mc('q1', 'First?'), mc('q2', 'Second?')]} />);

    // Both slots are mounted, but only the visible one is in the a11y tree.
    expect(screen.getByRole('radio', { name: 'Right q1' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Right q2' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('radio', { name: 'Right q2' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Right q1' })).not.toBeInTheDocument();
  });
});
