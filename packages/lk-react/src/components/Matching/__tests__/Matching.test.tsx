import { evaluate, type MatchingData, redact } from '@intellectif/lk-core';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../test-support/a11y.js';
import { ActivityPreview } from '../../ActivityPreview/index.js';
import { ActivitySequence } from '../../ActivitySequence/index.js';
import { Matching } from '../index.js';
import { optionName } from '../Matching.js';

afterEach(cleanup);

/** IELTS matching headings: four headings for three paragraphs, each used once. */
const data: MatchingData = {
  schemaVersion: '1.0',
  type: 'matching',
  id: 'mt1',
  title: 'The return of the tram',
  instructions: 'Choose the correct heading for each paragraph.',
  optionsTitle: 'List of Headings',
  options: [
    { id: 'i', label: 'i', text: 'A costly experiment' },
    { id: 'ii', label: 'ii', text: 'Why the trams disappeared' },
    { id: 'iii', label: 'iii', text: 'A return nobody expected' },
    { id: 'iv', label: 'iv', text: 'The view from the passengers' },
  ],
  prompts: [
    { id: 'pA', text: 'Paragraph A', correctOptionId: 'ii' },
    { id: 'pB', text: 'Paragraph B', correctOptionId: 'iii', feedback: 'Read the dates.' },
    { id: 'pC', text: 'Paragraph C', correctOptionId: 'i' },
  ],
  optionUse: 'once',
  scoringStrategy: 'partial',
};

const select = (prompt: string) => screen.getByRole('combobox', { name: prompt });
const optionTexts = (element: HTMLElement) =>
  [...element.querySelectorAll('option')].map((option) => option.textContent);

async function answer(
  matches: Record<string, string>,
): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  for (const [prompt, option] of Object.entries(matches)) {
    await user.selectOptions(select(prompt), option);
  }
  return user;
}

describe('<Matching> rendering', () => {
  it('shows the list under its title, and a selector named by each prompt', () => {
    render(<Matching data={data} />);
    const list = screen.getByRole('region', { name: 'List of Headings' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'iA costly experiment',
      'iiWhy the trams disappeared',
      'iiiA return nobody expected',
      'ivThe view from the passengers',
    ]);
    expect(screen.getAllByRole('combobox')).toHaveLength(3);
    expect(optionTexts(select('Paragraph A'))).toEqual([
      'Choose…',
      'i A costly experiment',
      'ii Why the trams disappeared',
      'iii A return nobody expected',
      'iv The view from the passengers',
    ]);
    expect(select('Paragraph A')).toHaveValue('');
  });

  it('names a list with no title, and shows a letter once where it is the whole option', () => {
    const letters: MatchingData = {
      ...data,
      optionsTitle: '  ',
      options: [
        { id: 'A', label: 'A', text: 'A' },
        { id: 'B', label: 'B', text: 'B' },
        { id: 'C', text: 'Paragraph C' },
      ],
      prompts: [{ id: 'q1', text: 'a plan that failed', correctOptionId: 'B' }],
      optionUse: 'many',
    };
    render(<Matching data={letters} />);
    const list = screen.getByRole('region', { name: 'Options' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['A', 'B', 'Paragraph C']);
    expect(optionTexts(select('a plan that failed'))).toEqual(['Choose…', 'A', 'B', 'Paragraph C']);
  });

  it('names an option by its label and text', () => {
    expect(optionName({ label: ' iv ', text: 'The view' })).toBe('iv The view');
    expect(optionName({ label: 'a', text: 'A' })).toBe('a');
    expect(optionName({ label: '', text: 'Anna' })).toBe('Anna');
    expect(optionName({ text: 'Ben' })).toBe('Ben');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<Matching data={data} />);
    expect(await runAxe(container)).toHaveNoViolations();
  });
});

describe('<Matching> each option used once', () => {
  it('moves an option picked again, says so, and marks it used everywhere else', async () => {
    const onChange = vi.fn();
    const onInteraction = vi.fn();
    render(<Matching data={data} onChange={onChange} onInteraction={onInteraction} />);
    const user = await answer({ 'Paragraph A': 'ii' });
    expect(optionTexts(select('Paragraph B'))).toContain('ii Why the trams disappeared (used)');
    expect(optionTexts(select('Paragraph A'))).toContain('ii Why the trams disappeared');

    await user.selectOptions(select('Paragraph B'), 'ii');
    expect(select('Paragraph A')).toHaveValue('');
    expect(select('Paragraph B')).toHaveValue('ii');
    expect(
      screen.getByText(
        'ii Why the trams disappeared can be used once, so it was taken from the statement that had it.',
      ),
    ).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith({
      type: 'matching',
      matches: { pA: '', pB: 'ii' },
    });
    expect(onInteraction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'option-matched',
        payload: { promptId: 'pB', optionId: 'ii', movedFrom: 'pA' },
      }),
    );

    // Taking an answer back moves nothing, and the notice goes.
    await user.selectOptions(select('Paragraph B'), '');
    expect(screen.queryByText(/can be used once/)).not.toBeInTheDocument();
  });

  it('lets an option answer several prompts when it may be used more than once', async () => {
    render(<Matching data={{ ...data, optionUse: 'many' }} />);
    await answer({ 'Paragraph A': 'ii', 'Paragraph B': 'ii' });
    expect(select('Paragraph A')).toHaveValue('ii');
    expect(optionTexts(select('Paragraph C'))).not.toContain('ii Why the trams disappeared (used)');
  });
});

describe('<Matching> answering in practice', () => {
  it('scores locally, marks each prompt and shows the right option beside a wrong one', async () => {
    const onComplete = vi.fn();
    render(<Matching data={data} onComplete={onComplete} />);
    const user = await answer({ 'Paragraph A': 'ii', 'Paragraph B': 'iv', 'Paragraph C': 'i' });
    await user.click(screen.getByRole('button', { name: 'Check answers' }));
    expect(onComplete.mock.calls[0]?.[0]).toMatchObject({ maxScore: 1, passed: false });
    expect(onComplete.mock.calls[0]?.[0].score).toBeCloseTo(2 / 3);
    expect(onComplete.mock.calls[0]?.[0].xapiStatement.result.response).toBe(
      'pA[.]ii[,]pB[.]iv[,]pC[.]i',
    );
    expect(select('Paragraph A')).toHaveAttribute('data-correct', 'true');
    expect(select('Paragraph B')).toHaveAttribute('data-correct', 'false');
    expect(screen.getByText('Answer: iii A return nobody expected')).toBeInTheDocument();
    expect(screen.getAllByText(/^Answer:/)).toHaveLength(1);
    expect(screen.getByRole('note')).toHaveTextContent('Read the dates.');

    await user.click(screen.getByRole('button', { name: 'Hide feedback' }));
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(
      screen.getAllByRole('combobox').every((element) => element.hasAttribute('disabled')),
    ).toBe(true);
  });

  it('shows no right option where the delivery policy withholds solutions, and nothing without feedback', async () => {
    render(<Matching data={data} delivery={{ solutions: false }} />);
    const user = await answer({ 'Paragraph A': 'i' });
    await user.click(screen.getByRole('button', { name: 'Check answers' }));
    expect(screen.queryByText(/^Answer:/)).not.toBeInTheDocument();
    expect(select('Paragraph A')).toHaveAttribute('data-correct', 'false');
    cleanup();

    render(<Matching data={data} delivery={{ feedback: false }} />);
    const again = await answer({ 'Paragraph A': 'i' });
    await again.click(screen.getByRole('button', { name: 'Check answers' }));
    expect(select('Paragraph A')).not.toHaveAttribute('data-correct');
  });

  it('keeps the matches for another try, and shows the answer only once the tries close', async () => {
    render(<Matching data={data} scoring={{ retries: 1 }} />);
    const user = await answer({ 'Paragraph A': 'i' });
    await user.click(screen.getByRole('button', { name: 'Check answers' }));
    expect(screen.queryByText(/^Answer:/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(select('Paragraph A')).toHaveValue('i');
    expect(select('Paragraph A')).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Check answers' }));
    expect(screen.getByText('Answer: ii Why the trams disappeared')).toBeInTheDocument();
  });

  it('follows a controlled value, and starts from a restored one', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Matching
        data={data}
        value={{ type: 'matching', matches: { pA: 'iii' } }}
        onChange={onChange}
      />,
    );
    expect(select('Paragraph A')).toHaveValue('iii');
    const user = userEvent.setup();
    await user.selectOptions(select('Paragraph C'), 'i');
    // Controlled: the host decides.
    expect(select('Paragraph C')).toHaveValue('');
    expect(onChange).toHaveBeenLastCalledWith({
      type: 'matching',
      matches: { pA: 'iii', pC: 'i' },
    });
    rerender(<Matching data={data} value={{ type: 'multiple-choice', selectedOptionIds: [] }} />);
    expect(select('Paragraph A')).toHaveValue('');
    cleanup();

    render(<Matching data={data} defaultValue={{ type: 'matching', matches: { pB: 'iv' } }} />);
    expect(select('Paragraph B')).toHaveValue('iv');
  });

  it('starts over when the item changes', async () => {
    const { rerender } = render(<Matching data={data} />);
    const user = await answer({ 'Paragraph A': 'ii' });
    await user.click(screen.getByRole('button', { name: 'Check answers' }));
    rerender(<Matching data={{ ...data, id: 'mt2' }} />);
    expect(select('Paragraph A')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Check answers' })).toBeEnabled();
  });

  it('deals the list in one seeded order, in the list and in every selector', () => {
    const shuffled = { ...data, shuffleOptions: true };
    render(<Matching data={shuffled} shuffleSeed="attempt-1" />);
    const order = within(screen.getByRole('region', { name: 'List of Headings' }))
      .getAllByRole('listitem')
      .map((item) => item.getAttribute('data-option-id'));
    expect([...order].sort()).toEqual(['i', 'ii', 'iii', 'iv']);
    const inSelect = [...select('Paragraph B').querySelectorAll('option')]
      .map((option) => option.getAttribute('value'))
      .slice(1);
    expect(inSelect).toEqual(order);
    cleanup();
    render(<Matching data={shuffled} shuffleSeed="attempt-1" />);
    expect(
      within(screen.getByRole('region', { name: 'List of Headings' }))
        .getAllByRole('listitem')
        .map((item) => item.getAttribute('data-option-id')),
    ).toEqual(order);
    cleanup();
    // Unseeded, it still deals every option once.
    render(<Matching data={shuffled} />);
    expect(screen.getAllByRole('listitem').slice(0, 4)).toHaveLength(4);
  });
});

describe('<Matching> in an exam and in review', () => {
  it('records the answer in an exam without grading or revealing it', async () => {
    const onSubmit = vi.fn();
    const onComplete = vi.fn();
    const redacted = redact(data, { reveal: 'none' }) as unknown as MatchingData;
    render(
      <Matching data={redacted} renderMode="exam" onSubmit={onSubmit} onComplete={onComplete} />,
    );
    const user = await answer({ 'Paragraph A': 'ii' });
    await user.click(screen.getByRole('button', { name: 'Submit answers' }));
    expect(onSubmit).toHaveBeenCalledWith({ type: 'matching', matches: { pA: 'ii' } });
    expect(onComplete).not.toHaveBeenCalled();
    expect(select('Paragraph A')).not.toHaveAttribute('data-correct');
    expect(screen.getByText('Answer submitted.')).toBeInTheDocument();
  });

  it('marks a review from its scored outcome, the right option included, on a redacted item', () => {
    const response = { type: 'matching' as const, matches: { pA: 'ii', pB: 'i' } };
    const outcome = evaluate(data, response);
    const redacted = redact(data, { reveal: 'none' }) as unknown as MatchingData;
    render(<Matching data={redacted} renderMode="review" value={response} outcome={outcome} />);
    expect(select('Paragraph A')).toHaveAttribute('data-correct', 'true');
    expect(select('Paragraph B')).toHaveAttribute('data-correct', 'false');
    expect(screen.getByText('Answer: iii A return nobody expected')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Check|Submit/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Score 33%/)).toBeInTheDocument();
  });

  it('reads back an outcome that is not scored without marking anything', () => {
    for (const outcome of [
      { status: 'deferred', reason: 'requires_async_grading' },
      { status: 'graded', score: 3, maxScore: 4, passed: true, feedback: 'Good.' },
      { status: 'graded', score: 0.5, maxScore: 0, passed: false },
      { status: 'unscorable', reason: 'no-grade' },
    ] as const) {
      render(<Matching data={data} renderMode="review" outcome={outcome as never} />);
      expect(select('Paragraph A')).not.toHaveAttribute('data-correct');
      cleanup();
    }
  });

  it('refuses a redacted item in practice, which has nothing to grade against', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const redacted = redact(data, { reveal: 'none' }) as unknown as MatchingData;
    render(<Matching data={redacted} />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    error.mockRestore();
  });

  it('is drawn by the sequence and the preview', async () => {
    render(<ActivitySequence activities={[data]} shuffleSeed="a" renderMode="practice" />);
    expect(select('Paragraph A')).toBeInTheDocument();
    cleanup();
    render(<ActivityPreview draft={data} />);
    expect(select('Paragraph C')).toBeInTheDocument();
  });
});
