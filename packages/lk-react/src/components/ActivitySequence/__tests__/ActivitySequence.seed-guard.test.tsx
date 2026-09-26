import type { GapSelectData, MultipleChoiceData } from '@intellectif/lk-core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActivitySequence } from '../index.js';

/**
 * The seed guard refuses an order the server cannot rebuild. It watched two of
 * the three doors.
 *
 * `needsSeed` considered `shuffle="entries"` and a group's
 * `shuffle: 'within-group'`, but never an ACTIVITY's own `data.shuffle` — and
 * `<MultipleChoice>` invents a per-mount seed when none reaches it, in every
 * render mode. So a single multiple-choice item with `shuffle: true`, rendered
 * under `exam` with no `shuffleSeed`, rendered without complaint and produced a
 * different option order on every mount: four distinct orders across four
 * mounts, none of them reproducible from the attempt record. That is precisely
 * the failure this guard exists to prevent, arriving through the one door it
 * did not watch.
 */
const shufflingItem = (over: Partial<MultipleChoiceData> = {}): MultipleChoiceData =>
  ({
    schemaVersion: '1.0',
    type: 'multiple-choice',
    id: 'q1',
    title: 'Q',
    question: 'Pick one',
    mode: 'single',
    scoringStrategy: 'all-or-nothing',
    shuffle: true,
    options: [
      { id: 'a', text: 'Alpha', isCorrect: true },
      { id: 'b', text: 'Bravo', isCorrect: false },
      { id: 'c', text: 'Charlie', isCorrect: false },
      { id: 'd', text: 'Delta', isCorrect: false },
    ],
    ...over,
  }) as MultipleChoiceData;

const optionOrder = (): string =>
  screen
    .getAllByRole('radio')
    .map((radio) => (radio as HTMLInputElement).value)
    .join(',');

describe('ActivitySequence seed guard — an item that shuffles its own options', () => {
  it.each(['exam', 'review'] as const)(
    'throws in %s mode when an item shuffles and no shuffleSeed is given',
    (renderMode) => {
      expect(() =>
        render(
          <ActivitySequence
            activities={[shufflingItem()]}
            renderMode={renderMode}
            onSubmit={vi.fn()}
          />,
        ),
      ).toThrow(/shuffleSeed/);
    },
  );

  // Here the item is the ONLY shuffle, so a message naming just the sequence's
  // own causes (`shuffle="entries"`, `within-group`) sends the reader looking
  // for settings they never wrote. `\b` keeps `data.shuffleChoices` from
  // passing for `data.shuffle`.
  it('names the item-level cause when an item shuffle is the only shuffle', () => {
    expect(() =>
      render(
        <ActivitySequence activities={[shufflingItem()]} renderMode="exam" onSubmit={vi.fn()} />,
      ),
    ).toThrow(/data\.shuffle\b/);
  });

  it('names a gap select item shuffle (`data.shuffleChoices`) the same way', () => {
    const gapSelect: GapSelectData = {
      schemaVersion: '1.0',
      type: 'gap-select',
      id: 'gs1',
      title: 'Prepositions',
      passage: 'I am {{a}} Spain.',
      banks: [
        {
          id: 'prep',
          choices: [
            { id: 'from', text: 'from' },
            { id: 'to', text: 'to' },
            { id: 'on', text: 'on' },
          ],
        },
      ],
      gaps: [{ id: 'a', bankId: 'prep', correctChoiceId: 'from' }],
      scoringStrategy: 'partial',
      shuffleChoices: true,
    };

    expect(() =>
      render(<ActivitySequence activities={[gapSelect]} renderMode="exam" onSubmit={vi.fn()} />),
    ).toThrow(/data\.shuffleChoices\b/);
  });

  it('throws when the shuffling item is inside a group that does not itself shuffle', () => {
    const group = {
      schemaVersion: '1.0',
      id: 'g1',
      type: 'item-group',
      title: 'Reading',
      stimulus: { id: 's1', kind: 'text', title: 'Passage', body: 'text' },
      items: [shufflingItem()],
    } as never;

    expect(() =>
      render(<ActivitySequence activities={[group]} renderMode="exam" onSubmit={vi.fn()} />),
    ).toThrow(/shuffleSeed/);
  });

  it('renders a reproducible order once a seed is supplied', () => {
    const first = render(
      <ActivitySequence
        activities={[shufflingItem()]}
        renderMode="exam"
        shuffleSeed="attempt-1"
        onSubmit={vi.fn()}
      />,
    );
    const firstOrder = optionOrder();
    first.unmount();

    const second = render(
      <ActivitySequence
        activities={[shufflingItem()]}
        renderMode="exam"
        shuffleSeed="attempt-1"
        onSubmit={vi.fn()}
      />,
    );
    expect(optionOrder()).toBe(firstOrder);
    second.unmount();
  });

  it('leaves practice alone — an unreproducible order is a practice affordance', () => {
    expect(() =>
      render(<ActivitySequence activities={[shufflingItem()]} onComplete={vi.fn()} />),
    ).not.toThrow();
  });

  it('does not demand a seed for an item that does not shuffle', () => {
    expect(() =>
      render(
        <ActivitySequence
          activities={[shufflingItem({ shuffle: false })]}
          renderMode="exam"
          onSubmit={vi.fn()}
        />,
      ),
    ).not.toThrow();
  });
});
