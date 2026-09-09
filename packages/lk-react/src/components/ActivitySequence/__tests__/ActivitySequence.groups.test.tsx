import {
  type FillInTheBlanksData,
  flattenSequence,
  type ItemGroup,
  type ItemOutcome,
  type LearnerResponse,
  type MultipleChoiceData,
  type SequenceEntry,
} from '@intellectif/lk-core';
import { fireEvent, render, render as rtlRender, screen, waitFor } from '@testing-library/react';
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

describe('ActivitySequence resume', () => {
  const three: SequenceEntry[] = [mc('a', 'A?'), mc('b', 'B?'), mc('c', 'C?')];

  it('reopens on the stored position instead of question 1', () => {
    render(<ActivitySequence activities={three} defaultIndex={2} />);
    expect(screen.getByText('Question 3 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('clamps a stored position the paper no longer has', () => {
    // A paper that lost its last question would otherwise reopen on a slot
    // that is not there — an empty shell with no way forward.
    render(<ActivitySequence activities={three} defaultIndex={99} />);
    expect(screen.getByText('Question 3 of 3')).toBeInTheDocument();
    render(<ActivitySequence activities={three} defaultIndex={-4} />);
    expect(screen.getAllByText('Question 1 of 3').length).toBeGreaterThan(0);
  });

  it('reports every move, so the position can be persisted at all', () => {
    const onIndexChange = vi.fn();
    render(<ActivitySequence activities={three} onIndexChange={onIndexChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onIndexChange.mock.calls.map((call) => call[0])).toEqual([1, 2, 1]);
  });

  it('restores a saved answer into its own slot, keyed by slotId', () => {
    render(
      <ActivitySequence
        activities={three}
        responses={{ '1': { type: 'multiple-choice', selectedOptionIds: ['a'] } }}
        defaultIndex={1}
      />,
    );
    // Question 2 comes back answered…
    expect(screen.getByRole('radio', { name: 'Yes' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    // …and question 1, which had no saved answer, comes back blank.
    expect(screen.getByRole('radio', { name: 'Yes' })).not.toBeChecked();
  });

  it('restores into the right slot when a group shifts the ids', () => {
    render(
      <ActivitySequence
        activities={[fib, passageGroup]}
        responses={{ '1.1': { type: 'multiple-choice', selectedOptionIds: ['a'] } }}
        defaultIndex={2}
      />,
    );
    // Slot "1.1" is the group's SECOND question, presented third.
    expect(screen.getByText('Tides question two?')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Yes' })).toBeChecked();
  });

  it('leaves a restored answer editable — resume is not a freeze', async () => {
    const user = userEvent.setup();
    render(
      <ActivitySequence
        activities={three}
        responses={{ '0': { type: 'multiple-choice', selectedOptionIds: ['a'] } }}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Yes' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'No' }));
    expect(screen.getByRole('radio', { name: 'No' })).toBeChecked();
  });

  it('ignores a response whose slot id is a prototype key', () => {
    // TypeScript resolves a `constructor` key against Object.prototype rather
    // than the index signature, so the map is built through fromEntries. The
    // point of the test is the RUNTIME lookup, which must not walk the
    // prototype chain and hand a function to a slot.
    const answer: LearnerResponse = { type: 'multiple-choice', selectedOptionIds: ['a'] };
    const hostile: Record<string, LearnerResponse> = Object.fromEntries([['constructor', answer]]);
    expect(() => render(<ActivitySequence activities={three} responses={hostile} />)).not.toThrow();
    expect(screen.getByRole('radio', { name: 'Yes' })).not.toBeChecked();
  });
});

describe('ActivitySequence resume — the cases that make it safe', () => {
  const three: SequenceEntry[] = [mc('a', 'A?'), mc('b', 'B?'), mc('c', 'C?')];
  const answerA: LearnerResponse = { type: 'multiple-choice', selectedOptionIds: ['a'] };

  it('a NaN defaultIndex opens question 1, not an empty shell', () => {
    // NaN passes through Math.min/Math.max untouched, so it survived every
    // clamp and indexed the slots with NaN. `Number(row.last_index)` on a NULL
    // column produces exactly that, and the learner got a blank page.
    const { container } = render(<ActivitySequence activities={three} defaultIndex={Number.NaN} />);
    expect(screen.getByText('Question 1 of 3')).toBeInTheDocument();
    expect(container.querySelector('.lk-seq-nav')).toBeInTheDocument();
  });

  it('reports a position it had to correct, so storage stops disagreeing with the screen', () => {
    const onIndexChange = vi.fn();
    render(<ActivitySequence activities={three} defaultIndex={99} onIndexChange={onIndexChange} />);
    expect(screen.getByText('Question 3 of 3')).toBeInTheDocument();
    expect(onIndexChange).toHaveBeenCalledWith(2);
  });

  it('stays quiet at mount when the requested position was honoured', () => {
    const onIndexChange = vi.fn();
    render(<ActivitySequence activities={three} defaultIndex={1} onIndexChange={onIndexChange} />);
    expect(onIndexChange).not.toHaveBeenCalled();
  });

  it('reports the reset a set change performs', () => {
    const onIndexChange = vi.fn();
    const props = { onIndexChange };
    const { rerender } = rtlRender(<ActivitySequence activities={three} {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    onIndexChange.mockClear();
    rerender(<ActivitySequence activities={[mc('x', 'X?'), mc('y', 'Y?')]} {...props} />);
    // The pager jumped to question 1; storage must be told, or the next
    // autosave writes a position the new paper does not have.
    expect(onIndexChange).toHaveBeenCalledWith(0);
  });

  it('does NOT seed one paper’s answers onto another paper’s questions', () => {
    // Slot ids are short and repeat across papers, so re-applying `responses`
    // after a set change drops paper A's answer under paper B's question 1.
    const props = { responses: { '0': answerA } };
    const { rerender } = rtlRender(<ActivitySequence activities={three} {...props} />);
    expect(screen.getByRole('radio', { name: 'Yes' })).toBeChecked();

    rerender(<ActivitySequence activities={[mc('x', 'X?'), mc('y', 'Y?')]} {...props} />);
    expect(screen.getByText('X?')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Yes' })).not.toBeChecked();
  });

  it('keeps a restored answer when the parent re-creates the activity objects', async () => {
    // `activities={raw.map(redact)}` — the documented exam pattern — hands over
    // new objects every render. Clearing to empty wiped every restored answer
    // on the first unrelated re-render (a timer tick), silently.
    const fresh = (): SequenceEntry[] => [mc('a', 'A?'), mc('b', 'B?')];
    const props = { responses: { '0': answerA } };
    const { rerender } = rtlRender(<ActivitySequence activities={fresh()} {...props} />);
    expect(screen.getByRole('radio', { name: 'Yes' })).toBeChecked();

    // Same content, brand-new objects — a parent re-render, nothing more.
    rerender(<ActivitySequence activities={fresh()} {...props} />);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Yes' })).toBeChecked();
    });
  });

  it('reopens an already-submitted question as submitted, not re-answerable', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <ActivitySequence
        activities={three}
        renderMode="exam"
        responses={{ '0': answerA }}
        submittedSlotIds={['0']}
        onSubmit={onSubmit}
      />,
    );

    // The learner committed this one before the crash; it must stay committed.
    expect(screen.getByRole('radio', { name: 'Yes' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: 'No' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('leaves an unsubmitted question answerable', async () => {
    const user = userEvent.setup();
    render(
      <ActivitySequence
        activities={three}
        renderMode="exam"
        responses={{ '0': answerA }}
        submittedSlotIds={['1']}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Yes' })).toBeEnabled();
    await user.click(screen.getByRole('radio', { name: 'No' }));
    expect(screen.getByRole('radio', { name: 'No' })).toBeChecked();
  });
});

describe('ActivitySequence resume — every activity type, not just the easy one', () => {
  const fibAnswered: LearnerResponse = { type: 'fill-in-the-blanks', answers: { x: 'blue' } };

  // `written-response` belongs here precisely because it is the branch that
  // does not share the others' prop spread — it has been the type left behind
  // three separate times, and a two-row list of the two easy types is how that
  // kept happening.
  const essay = {
    schemaVersion: '1.0',
    type: 'written-response',
    id: 'w1',
    title: 'Essay',
    prompt: 'Describe your last holiday.',
    minWords: 1,
    maxWords: 100,
  } as unknown as SequenceEntry;

  it.each([
    ['fill-in-the-blanks', fib, () => screen.getByRole('textbox')],
    [
      'multiple-choice',
      mc('m1', 'Q?') as SequenceEntry,
      () => screen.getByRole('radio', { name: 'Yes' }),
    ],
    ['written-response', essay, () => screen.getByRole('textbox')],
  ])('keeps a submitted %s locked after resume', (_label, entry, control) => {
    // The Req 3.7 data-change effect ran right after the first paint and reset
    // to idle, undoing the seed it had just been given — so `defaultSubmitted`
    // was a no-op for every type without a mount identity guard.
    render(
      <ActivitySequence
        activities={[entry] as SequenceEntry[]}
        renderMode="exam"
        responses={{
          '0':
            entry === fib
              ? fibAnswered
              : entry === essay
                ? ({ type: 'written-response', text: 'My essay', wordCount: 2 } as LearnerResponse)
                : { type: 'multiple-choice', selectedOptionIds: ['a'] },
        }}
        submittedSlotIds={['0']}
      />,
    );
    expect(control()).toBeDisabled();
    // Locked is only half of it: the committed answer has to still be there.
    // A branch that dropped `defaultValue` would lock an EMPTY control, and
    // asserting only `toBeDisabled()` would call that a pass.
    if (entry === essay) {
      expect(control()).toHaveValue('My essay');
    }
  });

  it('a parent re-render does not unlock a submitted item', async () => {
    const fresh = (): SequenceEntry[] => [{ ...fib }];
    const props = {
      renderMode: 'exam' as const,
      responses: { '0': fibAnswered },
      submittedSlotIds: ['0'],
    };
    const { rerender } = rtlRender(<ActivitySequence activities={fresh()} {...props} />);
    expect(screen.getByRole('textbox')).toBeDisabled();

    // Structurally identical entries, brand-new objects — the documented
    // `activities={raw.map(redact)}` pattern.
    rerender(<ActivitySequence activities={fresh()} {...props} />);
    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeDisabled();
    });
  });

  it('can still finish a resumed attempt — onFinished fires on the last slot', async () => {
    const user = userEvent.setup();
    const onFinished = vi.fn();
    render(
      <ActivitySequence
        activities={[mc('m1', 'Q1?'), mc('m2', 'Q2?')]}
        renderMode="exam"
        responses={{ '0': { type: 'multiple-choice', selectedOptionIds: ['a'] } }}
        submittedSlotIds={['0']}
        onFinished={onFinished}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('radio', { name: 'Yes' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    // Slot "0" was seeded as `restored`; leaving it null meant the set could
    // never complete and a consumer marking the attempt done never heard.
    expect(onFinished).toHaveBeenCalledTimes(1);
    const items = onFinished.mock.calls[0]?.[0] as { kind: string; slotId: string }[];
    expect(items.map((i) => [i.kind, i.slotId])).toEqual([
      ['restored', '0'],
      ['responded', '1'],
    ]);
  });

  it('does not announce completion at mount when the whole attempt was already submitted', () => {
    const onFinished = vi.fn();
    render(
      <ActivitySequence
        activities={[mc('m1', 'Q1?')]}
        renderMode="exam"
        submittedSlotIds={['0']}
        onFinished={onFinished}
      />,
    );
    expect(onFinished).not.toHaveBeenCalled();
  });

  it('reproduces the OPTION order the learner sat, not a fresh one', () => {
    const shuffled: MultipleChoiceData = {
      ...mc('m1', 'Q?'),
      shuffle: true,
      options: [
        { id: 'a', text: 'Alpha', isCorrect: true },
        { id: 'b', text: 'Bravo', isCorrect: false },
        { id: 'c', text: 'Charlie', isCorrect: false },
        { id: 'd', text: 'Delta', isCorrect: false },
      ],
    };
    const order = () =>
      screen
        .getAllByRole('radio')
        .map((r) => (r as HTMLInputElement).value)
        .join(',');

    const sitting = rtlRender(
      <ActivitySequence activities={[shuffled]} renderMode="exam" shuffleSeed="attempt-1" />,
    );
    const sat = order();
    sitting.unmount();

    // The review render must show the same arrangement, or an appeal about
    // "the second option" is about a different option.
    render(<ActivitySequence activities={[shuffled]} renderMode="exam" shuffleSeed="attempt-1" />);
    expect(order()).toBe(sat);
  });
});

describe('ActivitySequence review', () => {
  const scoredOutcome = (score: number): ItemOutcome => ({
    status: 'scored',
    score,
    maxScore: 1,
    passed: score >= 0.7,
    feedback: null,
    details: [
      {
        itemId: 'a',
        correct: score === 1,
        outcome: 'correct',
        learnerResponse: 'Yes',
        correctResponse: 'Yes',
      },
    ],
  });

  it('forwards each slot’s outcome so a review render can mark it', () => {
    const { container } = render(
      <ActivitySequence
        activities={[mc('a', 'A?'), mc('b', 'B?')]}
        renderMode="review"
        outcomes={{ '0': scoredOutcome(1), '1': scoredOutcome(0) }}
        responses={{
          '0': { type: 'multiple-choice', selectedOptionIds: ['a'] },
          '1': { type: 'multiple-choice', selectedOptionIds: ['b'] },
        }}
      />,
    );
    // Review is read-only: nothing is submittable.
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
    expect(container.querySelector('.lk-seq-slot')).toBeInTheDocument();
  });

  it('renders review without outcomes rather than inventing one', () => {
    render(<ActivitySequence activities={[mc('a', 'A?')]} renderMode="review" />);
    expect(screen.getByText('A?')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
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
