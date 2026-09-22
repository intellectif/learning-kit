import type { InteractionEvent, MultipleChoiceData } from '@intellectif/lk-core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityProps } from '../../types.js';
import { ActivitySequence, type SequenceItemOutcome, type SequenceQuestion } from '../index.js';

/**
 * What a question a HOST draws is given, beside the shared props: whether it is
 * the one on screen, somewhere to portal, a way to hold the set while its own
 * work is in flight, and calls that keep one identity.
 *
 * The SDK's own components have had all of this through the pager's internals
 * since the pager existed. A `renderers` override had none of it, so a host's
 * read-aloud in a question set could not be told to stop its microphone, and
 * its upload could not stop `onFinished` reporting the set without it.
 */

const mc = (id: string): MultipleChoiceData => ({
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id,
  title: `Title ${id}`,
  question: `Question ${id}?`,
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  options: [
    { id: 'wrong', text: 'Wrong', isCorrect: false },
    { id: 'right', text: 'Right', isCorrect: true },
  ],
});

const result = {
  score: 1,
  maxScore: 1,
  passed: true,
  timeSpent: 0,
  xapiStatement: {} as never,
};

/** Every render of every host question, in order: the props as they were handed over. */
interface Handed {
  id: string;
  question: SequenceQuestion;
  onSubmit: ActivityProps['onSubmit'];
  onComplete: ActivityProps['onComplete'];
}
let handed: Handed[] = [];

/** The last render of one question. */
const last = (id: string): Handed => {
  const found = handed.filter((seen) => seen.id === id).at(-1);
  if (found === undefined) {
    throw new Error(`nothing was rendered for "${id}"`);
  }
  return found;
};

/**
 * A host's own renderer: it records what it was handed, and offers the calls as
 * buttons so a test can press them the way a learner presses a host's own UI.
 */
function Host({
  data,
  question,
  onSubmit,
  onComplete,
}: ActivityProps & { question?: SequenceQuestion }) {
  if (question !== undefined) {
    handed.push({ id: data.id, question, onSubmit, onComplete });
  }
  return (
    <div>
      <p>{`${data.id} is ${question?.active === true ? 'active' : 'inactive'}`}</p>
      <button
        type="button"
        onClick={() => {
          onSubmit?.({ type: 'multiple-choice', selectedOptionIds: ['right'] });
          onComplete?.(result);
        }}
      >
        {`Answer ${data.id}`}
      </button>
      <button type="button" onClick={() => question?.clear()}>{`Withdraw ${data.id}`}</button>
      <button type="button" onClick={() => question?.setPending(true)}>{`Start ${data.id}`}</button>
      <button type="button" onClick={() => question?.setPending(false)}>{`End ${data.id}`}</button>
      <button type="button" onClick={() => question?.emit('hint-requested', { where: 'mine' })}>
        {`Hint ${data.id}`}
      </button>
    </div>
  );
}

const renderers = { 'multiple-choice': Host };

beforeEach(() => {
  handed = [];
});

describe('ActivitySequence: a question the host draws', () => {
  it('tells a question when it is the one on screen, and when it is not', async () => {
    const user = userEvent.setup();
    render(<ActivitySequence activities={[mc('q1'), mc('q2')]} renderers={renderers} />);

    expect(last('q1').question.active).toBe(true);
    expect(last('q2').question.active).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(last('q1').question.active).toBe(false);
    expect(last('q2').question.active).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(last('q1').question.active).toBe(true);
    expect(last('q2').question.active).toBe(false);
  });

  it('holds the set while a host question says work is on its way', async () => {
    const user = userEvent.setup();
    const onFinished = vi.fn<(items: SequenceItemOutcome[]) => void>();
    const onComplete = vi.fn();
    render(
      <ActivitySequence
        activities={[mc('q1')]}
        renderers={renderers}
        onFinished={onFinished}
        onComplete={onComplete}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Start q1' }));
    await user.click(screen.getByRole('button', { name: 'Answer q1' }));
    // Answered, and reported by nothing: the host is still storing it.
    expect(onFinished).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'End q1' }));
    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(onFinished.mock.calls[0]?.[0]?.[0]?.kind).toBe('scored');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('reports a set whose host question was pending and then answered', async () => {
    const user = userEvent.setup();
    const onFinished = vi.fn<(items: SequenceItemOutcome[]) => void>();
    render(
      <ActivitySequence activities={[mc('q1')]} renderers={renderers} onFinished={onFinished} />,
    );

    await user.click(screen.getByRole('button', { name: 'Start q1' }));
    await user.click(screen.getByRole('button', { name: 'End q1' }));
    // Nothing was answered, so ending the work reports nothing.
    expect(onFinished).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Answer q1' }));
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('forgets an answer a host question withdrew, so the set is unfinished again', async () => {
    const user = userEvent.setup();
    const onFinished = vi.fn<(items: SequenceItemOutcome[]) => void>();
    render(
      <ActivitySequence
        activities={[mc('q1'), mc('q2')]}
        renderers={renderers}
        onFinished={onFinished}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Answer q1' }));
    await user.click(screen.getByRole('button', { name: 'Withdraw q1' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Answer q2' }));
    // q1 holds nothing again: a set with a hole is not a finished set.
    expect(onFinished).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Previous' }));
    await user.click(screen.getByRole('button', { name: 'Answer q1' }));
    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(onFinished.mock.calls[0]?.[0]).toHaveLength(2);
  });

  it('keeps one identity for every call, and for the slot, across renders', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ActivitySequence activities={[mc('q1'), mc('q2')]} renderers={renderers} />,
    );
    const first = last('q1');

    // A render for another reason entirely, and one the learner caused.
    rerender(
      <ActivitySequence
        activities={[mc('q1'), mc('q2')]}
        renderers={renderers}
        onInteraction={() => {}}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    await user.click(screen.getByRole('button', { name: 'Answer q1' }));

    const now = last('q1');
    expect(handed.filter((seen) => seen.id === 'q1').length).toBeGreaterThan(1);
    expect(now.question.slot).toBe(first.question.slot);
    expect(now.question.clear).toBe(first.question.clear);
    expect(now.question.setPending).toBe(first.question.setPending);
    expect(now.question.emit).toBe(first.question.emit);
    expect(now.onSubmit).toBe(first.onSubmit);
    expect(now.onComplete).toBe(first.onComplete);
    // The identity to store an answer against, exactly as `onSubmit` reports it.
    expect(now.question.slot).toEqual({ slotId: '0', index: 0, activityId: 'q1' });
  });

  it('gives a question somewhere to portal that is hidden with it', async () => {
    const user = userEvent.setup();
    render(<ActivitySequence activities={[mc('q1'), mc('q2')]} renderers={renderers} />);

    const container = last('q1').question.portalContainer;
    expect(container).not.toBeNull();
    const pane = container?.closest('.lk-seq-slot') as HTMLElement | null;
    // Inside its OWN question's pane: what is portalled into it goes away with
    // the question rather than hanging over the next one.
    expect(pane).not.toBeNull();
    expect(pane?.hidden).toBe(false);
    expect(pane?.contains(screen.getByRole('button', { name: 'Answer q1' }))).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(pane?.hidden).toBe(true);
    // The same element throughout, so a popover is not re-created on every page.
    expect(last('q1').question.portalContainer).toBe(container);
    expect(last('q2').question.portalContainer).not.toBe(container);
  });

  it('fills in the activity and the moment on an interaction a host emits', async () => {
    const user = userEvent.setup();
    const onInteraction = vi.fn<(event: InteractionEvent) => void>();
    render(
      <ActivitySequence
        activities={[mc('q1')]}
        renderers={renderers}
        onInteraction={onInteraction}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Hint q1' }));
    expect(onInteraction).toHaveBeenCalledTimes(1);
    const event = onInteraction.mock.calls[0]?.[0];
    expect(event?.type).toBe('hint-requested');
    expect(event?.activityId).toBe('q1');
    expect(event?.payload).toEqual({ where: 'mine' });
    expect(typeof event?.timestamp).toBe('number');
  });

  it('ignores a call held over from a set no longer on screen', async () => {
    const user = userEvent.setup();
    const onFinished = vi.fn<(items: SequenceItemOutcome[]) => void>();
    const { rerender } = render(
      <ActivitySequence activities={[mc('q1')]} renderers={renderers} onFinished={onFinished} />,
    );
    const stale = last('q1').question;

    rerender(
      <ActivitySequence activities={[mc('q9')]} renderers={renderers} onFinished={onFinished} />,
    );
    // A host that kept the old question and reports against it now: its work
    // belongs to a paper nobody is sitting, and must not hold this one.
    stale.setPending(true);
    stale.emit('hint-requested');
    stale.clear();

    await user.click(screen.getByRole('button', { name: 'Answer q9' }));
    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(onFinished.mock.calls[0]?.[0]?.[0]?.activityId).toBe('q9');
  });

  it('still takes a renderer that knows nothing of `question`', async () => {
    const user = userEvent.setup();
    const onFinished = vi.fn<(items: SequenceItemOutcome[]) => void>();
    // Typed as the contract was before this release, and passed unchanged.
    function Plain({ data, onComplete }: ActivityProps) {
      return (
        <button type="button" onClick={() => onComplete?.(result)}>{`Mark ${data.id}`}</button>
      );
    }
    render(
      <ActivitySequence
        activities={[mc('q1')]}
        renderers={{ 'multiple-choice': Plain }}
        onFinished={onFinished}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Mark q1' }));
    expect(onFinished).toHaveBeenCalledTimes(1);
  });
});
