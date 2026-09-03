import {
  type FillInTheBlanksData,
  flattenSequence,
  type ItemGroup,
  type MultipleChoiceData,
  type SequenceEntry,
} from '@intellectif/lk-core';
import { render, render as rtlRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { checkA11y } from '../../../test-support/a11y.js';
import { ActivitySequence } from '../index.js';

const mc = (id: string, question: string): MultipleChoiceData => ({
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id,
  title: id,
  question,
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  options: [
    { id: 'a', text: 'Yes', isCorrect: true },
    { id: 'b', text: 'No', isCorrect: false },
  ],
});

const fib: FillInTheBlanksData = {
  schemaVersion: '1.0',
  type: 'fill-in-the-blanks',
  id: 'f1',
  title: 'F1',
  passage: 'Sky is {{x}}.',
  blanks: [{ id: 'x', acceptedAnswers: ['blue'] }],
  scoringStrategy: 'partial',
};

const passageGroup: ItemGroup = {
  schemaVersion: '1.0',
  type: 'item-group',
  id: 'g1',
  title: 'Reading 1',
  stimulus: { id: 'p1', kind: 'text', title: 'Tides', body: 'The tide comes in twice a day.' },
  items: [mc('r1', 'Tides question one?'), mc('r2', 'Tides question two?')],
};

const entries: SequenceEntry[] = [fib, passageGroup, mc('loose', 'A loose question?')];

describe('ActivitySequence with item groups', () => {
  it('flattens groups into consecutive questions and counts them all', () => {
    render(<ActivitySequence activities={entries} />);
    expect(screen.getByText('Question 1 of 4')).toBeInTheDocument();
  });

  it('shows the stimulus only alongside its group’s questions, as one persistent node', async () => {
    const user = userEvent.setup();
    render(<ActivitySequence activities={entries} />);

    // Q1 is loose: no passage.
    expect(screen.queryByRole('region', { name: 'Tides' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    const panel = screen.getByRole('region', { name: 'Tides' });
    expect(panel).toBeVisible();
    expect(screen.getByText('Questions 2–3')).toBeInTheDocument();
    expect(screen.getByText('Tides question one?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    // The SAME element — not a re-rendered copy — so a recording keeps playing.
    expect(screen.getByRole('region', { name: 'Tides' })).toBe(panel);
    expect(screen.getByText('Tides question two?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.queryByRole('region', { name: 'Tides' })).not.toBeInTheDocument();
    expect(screen.getByText('A loose question?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByRole('region', { name: 'Tides' })).toBe(panel);
  });

  it('reports lk-core slot ids in onFinished', async () => {
    const user = userEvent.setup();
    const onFinished = vi.fn();
    render(<ActivitySequence activities={[passageGroup]} onFinished={onFinished} />);

    await user.click(screen.getByRole('radio', { name: 'Yes' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('radio', { name: 'Yes' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(onFinished).toHaveBeenCalledTimes(1);
    const items = onFinished.mock.calls[0]?.[0] as { slotId: string; activityId: string }[];
    expect(items.map((item) => [item.slotId, item.activityId])).toEqual([
      ['0.0', 'r1'],
      ['0.1', 'r2'],
    ]);
  });

  it('shuffle="entries" with a seed presents the order lk-core derives, with the group intact', () => {
    const many: SequenceEntry[] = [mc('a', 'A?'), mc('b', 'B?'), passageGroup, mc('c', 'C?')];
    const expected = flattenSequence(many, { shuffleEntries: true, seed: 'attempt-9' });
    // Sanity: this seed really does move things, or the test proves nothing.
    expect(expected.map((slot) => slot.activity.id)).not.toEqual(['a', 'b', 'r1', 'r2', 'c']);

    const { container } = render(
      <ActivitySequence activities={many} shuffle="entries" shuffleSeed="attempt-9" />,
    );
    const rendered = [...container.querySelectorAll('.lk-seq-slot')];
    expect(rendered).toHaveLength(expected.length);
    expected.forEach((slot, i) => {
      expect(rendered[i]).toHaveTextContent((slot.activity as MultipleChoiceData).question);
    });
  });

  it('a within-group shuffle without shuffleSeed still renders (per-mount seed)', () => {
    const shuffled: ItemGroup = { ...passageGroup, shuffle: 'within-group' };
    render(<ActivitySequence activities={[shuffled]} />);
    expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Tides' })).toBeVisible();
  });

  it('forwards sanitizeHtml to the stimulus panel', async () => {
    const user = userEvent.setup();
    const rich: ItemGroup = {
      ...passageGroup,
      stimulus: { ...passageGroup.stimulus, bodyHtml: '<p><em>Tide</em> facts.</p>' },
    };
    const { container } = render(
      <ActivitySequence activities={[fib, rich]} sanitizeHtml={(html) => html} />,
    );
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(container.querySelector('.lk-stimulus em')).toHaveTextContent('Tide');
  });

  it('has no axe violations with a group visible', async () => {
    const { container } = render(<ActivitySequence activities={[passageGroup, fib]} />);
    expect(await checkA11y(container)).toHaveNoViolations();
  });
});

const audioGroup: ItemGroup = {
  schemaVersion: '1.0',
  type: 'item-group',
  id: 'listening',
  title: 'Listening',
  stimulus: {
    id: 'rec',
    kind: 'audio',
    title: 'Station announcement',
    media: { type: 'audio', url: 'https://cdn.example.com/announcement.mp3' },
  },
  items: [mc('l1', 'Listening question one?'), mc('l2', 'Listening question two?')],
};

describe('ActivitySequence media in a hidden pane', () => {
  // jsdom implements no playback, so drive the two things the component reads.
  let pause: MockInstance<() => void>;
  let originalPaused: PropertyDescriptor | undefined;

  beforeEach(() => {
    pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    originalPaused = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'paused');
    // Report "playing", so the component's already-paused short-circuit is not
    // what makes this test pass.
    Object.defineProperty(HTMLMediaElement.prototype, 'paused', {
      configurable: true,
      get: () => false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalPaused !== undefined) {
      Object.defineProperty(HTMLMediaElement.prototype, 'paused', originalPaused);
    }
  });

  it('keeps a recording running BETWEEN questions of its own group', async () => {
    const user = userEvent.setup();
    render(<ActivitySequence activities={[audioGroup, fib]} />);

    expect(pause).not.toHaveBeenCalled();
    // Q1 to Q2, both inside the group: the panel never hides, so nothing stops.
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('region', { name: 'Station announcement' })).toBeVisible();
    expect(pause).not.toHaveBeenCalled();
  });

  it('pauses the recording when the learner leaves the group', async () => {
    const user = userEvent.setup();
    render(<ActivitySequence activities={[audioGroup, fib]} />);

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // `hidden` is display:none, which does NOT stop playback on its own.
    expect(pause).toHaveBeenCalled();
  });

  it('does not restart the recording when the learner comes back', async () => {
    const user = userEvent.setup();
    render(<ActivitySequence activities={[audioGroup, fib]} />);
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Previous' }));

    expect(screen.getByRole('region', { name: 'Station announcement' })).toBeVisible();
    expect(play).not.toHaveBeenCalled();
  });
});

describe('ActivitySequence focus and landmarks with a group', () => {
  it('focuses the question region, and the stimulus is NOT inside it', async () => {
    const user = userEvent.setup();
    const { container } = render(<ActivitySequence activities={[fib, passageGroup]} />);

    await user.click(screen.getByRole('button', { name: 'Next' }));

    const region = container.querySelector('.lk-seq-question');
    expect(region).toHaveFocus();
    // The region promises "Question 2 of 3"; its content must start at the
    // question, not at the whole passage.
    expect(region?.querySelector('.lk-stimulus')).toBeNull();
    expect(region?.textContent ?? '').toContain('Tides question one?');
    expect(region?.textContent ?? '').not.toContain('The tide comes in twice a day.');
  });

  it('keeps the stimulus a sibling landmark the learner can still reach', async () => {
    const user = userEvent.setup();
    const { container } = render(<ActivitySequence activities={[fib, passageGroup]} />);
    await user.click(screen.getByRole('button', { name: 'Next' }));

    const panel = screen.getByRole('region', { name: 'Tides' });
    expect(panel).toBeVisible();
    // Sibling, not nested: a region inside a region is a landmark the learner
    // has to escape before reaching the question.
    expect(container.querySelector('.lk-seq-question')?.contains(panel)).toBe(false);
    // Still rendered ahead of the question, so the passage reads first.
    const stimulus = container.querySelector('.lk-seq-stimulus') as Node;
    const question = container.querySelector('.lk-seq-question') as Node;
    expect(stimulus.compareDocumentPosition(question)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});

describe('ActivitySequence seed contract', () => {
  const shuffledGroup: ItemGroup = { ...passageGroup, shuffle: 'within-group' };

  it.each([
    'exam',
    'review',
  ] as const)('throws in %s mode when shuffling without a shuffleSeed', (renderMode) => {
    // An order nobody can reproduce cannot be reconciled with the attempt the
    // server recorded. Fail before the learner sits the paper.
    expect(() =>
      render(<ActivitySequence activities={[shuffledGroup]} renderMode={renderMode} />),
    ).toThrow(/requires a `shuffleSeed`/);
  });

  it('accepts a seed in exam mode', () => {
    render(
      <ActivitySequence activities={[shuffledGroup]} renderMode="exam" shuffleSeed="attempt-1" />,
    );
    expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();
  });

  it('does not throw in exam mode when nothing shuffles', () => {
    render(<ActivitySequence activities={[passageGroup]} renderMode="exam" />);
    expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();
  });

  it('still allows the unreproducible per-mount seed in practice', () => {
    render(<ActivitySequence activities={[shuffledGroup]} />);
    expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();
  });
});

describe('ActivitySequence exam response channel', () => {
  const examSet: SequenceEntry[] = [mc('e1', 'Exam question one?'), passageGroup];

  it('reports every submitted response with its slot identity', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ActivitySequence activities={examSet} renderMode="exam" onSubmit={onSubmit} />);

    await user.click(screen.getByRole('radio', { name: 'Yes' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    // In exam mode nothing grades, so this is the ONLY channel a runner has.
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'multiple-choice', selectedOptionIds: ['a'] }),
      { slotId: '0', index: 0, activityId: 'e1' },
    );
  });

  it('never grades in exam mode, so onActivityComplete stays silent', async () => {
    const user = userEvent.setup();
    const onActivityComplete = vi.fn();
    render(
      <ActivitySequence
        activities={examSet}
        renderMode="exam"
        onActivityComplete={onActivityComplete}
      />,
    );
    await user.click(screen.getByRole('radio', { name: 'Yes' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(onActivityComplete).not.toHaveBeenCalled();
  });

  it('completes an exam set through `responded` outcomes', async () => {
    const user = userEvent.setup();
    const onFinished = vi.fn();
    render(<ActivitySequence activities={examSet} renderMode="exam" onFinished={onFinished} />);

    for (let i = 0; i < 3; i += 1) {
      await user.click(screen.getAllByRole('radio', { name: 'Yes' })[0] as HTMLElement);
      await user.click(screen.getByRole('button', { name: 'Submit' }));
      if (i < 2) {
        await user.click(screen.getByRole('button', { name: 'Next' }));
      }
    }

    expect(onFinished).toHaveBeenCalledTimes(1);
    const items = onFinished.mock.calls[0]?.[0] as { kind: string; slotId: string }[];
    expect(items.map((item) => [item.kind, item.slotId])).toEqual([
      ['responded', '0'],
      ['responded', '1.0'],
      ['responded', '1.1'],
    ]);
  });

  it('still reports the raw response in practice mode, alongside the grade', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onActivityComplete = vi.fn();
    render(
      <ActivitySequence
        activities={examSet}
        onSubmit={onSubmit}
        onActivityComplete={onActivityComplete}
      />,
    );
    await user.click(screen.getByRole('radio', { name: 'Yes' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    // Practice records the SCORED outcome, not a bare `responded` one.
    expect(onActivityComplete).toHaveBeenCalledWith(expect.anything(), 0, '0');
  });
});

describe('ActivitySequence set-change reset', () => {
  it('resets children along with outcomes on a reorder, so the set can still finish', async () => {
    const user = userEvent.setup();
    const onFinished = vi.fn();
    const pair: SequenceEntry[] = [mc('a', 'A?'), mc('b', 'B?')];
    // These two seeds present the same slots in opposite orders, so `setKey`
    // changes while each slot's own id and activity id do not.
    const props = { activities: pair, shuffle: 'entries' as const, onFinished };
    const { rerender } = rtlRender(<ActivitySequence {...props} shuffleSeed="seed-a" />);

    await user.click(screen.getByRole('radio', { name: 'Yes' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    rerender(<ActivitySequence {...props} shuffleSeed="seed-b" />);
    onFinished.mockClear();

    // Every slot must be answerable again. Previously the outcomes were
    // cleared while the children kept their keys — and their `completed`
    // state — so a slot could never be re-answered and the set never finished.
    await user.click(screen.getByRole('radio', { name: 'Yes' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('radio', { name: 'Yes' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(onFinished).toHaveBeenCalledTimes(1);
  });
});

describe('ActivitySequence per-item persistence identity', () => {
  it('passes the slotId to onActivityComplete, not just the presented index', async () => {
    const user = userEvent.setup();
    const onActivityComplete = vi.fn();
    render(
      <ActivitySequence activities={[fib, passageGroup]} onActivityComplete={onActivityComplete} />,
    );

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('radio', { name: 'Yes' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    // Presented index 1, but slot "1.0" — the identity composeAssessmentScore
    // needs. Persisting the index instead cannot be reconciled with it.
    expect(onActivityComplete).toHaveBeenCalledWith(expect.anything(), 1, '1.0');
  });
});
