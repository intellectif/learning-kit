import type { MultipleChoiceData } from '@intellectif/lk-core';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MultipleChoice } from '../index.js';

const OPTION_IDS = ['o1', 'o2', 'o3', 'o4', 'o5'] as const;

const shuffled = (over: Partial<MultipleChoiceData> = {}): MultipleChoiceData => ({
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'q1',
  title: 'Quiz',
  question: 'Pick one',
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  shuffle: true,
  options: [
    { id: 'o1', text: 'One', isCorrect: true },
    { id: 'o2', text: 'Two', isCorrect: false },
    { id: 'o3', text: 'Three', isCorrect: false },
    { id: 'o4', text: 'Four', isCorrect: false },
    { id: 'o5', text: 'Five', isCorrect: false },
  ],
  ...over,
});

const optionOrder = (): string[] =>
  screen.getAllByRole('radio').map((radio) => (radio as HTMLInputElement).value);

describe('MultipleChoice shuffleSeed', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the identical option order for the same seed across separate mounts', () => {
    const data = shuffled();
    const first = render(<MultipleChoice data={data} onComplete={vi.fn()} shuffleSeed="seed-1" />);
    const firstOrder = optionOrder();
    first.unmount();

    const second = render(<MultipleChoice data={data} onComplete={vi.fn()} shuffleSeed="seed-1" />);
    const secondOrder = optionOrder();
    second.unmount();

    render(<MultipleChoice data={data} onComplete={vi.fn()} shuffleSeed="seed-2" />);
    const otherSeedOrder = optionOrder();

    expect([...firstOrder].sort()).toEqual([...OPTION_IDS]);
    expect(secondOrder).toEqual(firstOrder);
    // A different seed must still render a full permutation. Its order MAY
    // coincide with seed-1's, so no inequality assertion here.
    expect([...otherSeedOrder].sort()).toEqual([...OPTION_IDS]);
  });

  it('still renders when shuffling without a seed and crypto.randomUUID is unavailable', () => {
    // Plain-http origins have no crypto.randomUUID; the Math.random fallback
    // must keep the component from crashing.
    vi.stubGlobal('crypto', {});
    render(<MultipleChoice data={shuffled()} onComplete={vi.fn()} />);
    expect([...optionOrder()].sort()).toEqual([...OPTION_IDS]);
  });

  it('never calls crypto.randomUUID when shuffle is off', () => {
    const randomUUID = vi.fn(() => '00000000-0000-4000-8000-000000000000');
    vi.stubGlobal('crypto', { randomUUID });
    render(<MultipleChoice data={shuffled({ shuffle: false })} onComplete={vi.fn()} />);
    expect(optionOrder()).toEqual([...OPTION_IDS]);
    expect(randomUUID).not.toHaveBeenCalled();
  });
});
