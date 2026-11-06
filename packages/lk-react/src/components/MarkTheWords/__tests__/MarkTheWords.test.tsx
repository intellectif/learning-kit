import { evaluate, type MarkTheWordsData, redact } from '@intellectif/lk-core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../test-support/a11y.js';
import { ActivityPreview } from '../../ActivityPreview/index.js';
import { ActivitySequence } from '../../ActivitySequence/index.js';
import { MarkTheWords } from '../index.js';

afterEach(cleanup);

// Words: 0 She 1 went 2 home 3 and 4 had 5 gone 6 to 7 bed
const data: MarkTheWordsData = {
  schemaVersion: '1.0',
  type: 'mark-the-words',
  id: 'mw1',
  title: 'The past',
  instructions: 'Mark every verb in the past.',
  text: 'She went home,\nand had gone to bed.',
  targets: [{ text: 'went', feedback: 'Past of go.' }, { text: 'had gone' }],
  scoringStrategy: 'partial',
};

const word = (text: string) => screen.getByRole('option', { name: new RegExp(`^${text}\\b`) });
const check = () => screen.getByRole('button', { name: 'Check answers' });

describe('<MarkTheWords> rendering', () => {
  it('draws the text as written, each word an option of one listbox, punctuation not', () => {
    render(<MarkTheWords data={data} />);
    const text = screen.getByRole('listbox', { name: 'Words to mark' });
    expect(text).toHaveAttribute('aria-multiselectable', 'true');
    expect(text).toHaveAttribute('aria-describedby', 'mw1-instructions');
    expect(text.textContent).toBe('She went home,\nand had gone to bed.');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'She',
      'went',
      'home',
      'and',
      'had',
      'gone',
      'to',
      'bed',
    ]);
    // One tab stop: the first word.
    expect(screen.getAllByRole('option').filter((option) => option.tabIndex === 0)).toHaveLength(1);
    expect(screen.getByText('0 words marked')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<MarkTheWords data={data} />);
    expect(await runAxe(container)).toHaveNoViolations();
  });
});

describe('<MarkTheWords> marking', () => {
  it('marks and unmarks a word on a click, and reports each', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onInteraction = vi.fn();
    render(<MarkTheWords data={data} onChange={onChange} onInteraction={onInteraction} />);
    await user.click(word('went'));
    await user.click(word('She'));
    expect(word('went')).toHaveAttribute('aria-selected', 'true');
    expect(onChange).toHaveBeenLastCalledWith({ type: 'mark-the-words', marked: [0, 1] });
    expect(screen.getByText('2 words marked')).toBeInTheDocument();
    await user.click(word('She'));
    expect(word('She')).toHaveAttribute('aria-selected', 'false');
    expect(onInteraction).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'word-unmarked', payload: { index: 0, word: 'She' } }),
    );
    expect(screen.getByText('1 word marked')).toBeInTheDocument();
  });

  it('moves between words with the arrow keys and marks with Space or Enter, never submitting', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<MarkTheWords data={data} onSubmit={onSubmit} />);
    await user.tab();
    expect(word('She')).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(word('went')).toHaveFocus();
    await user.keyboard(' ');
    expect(word('went')).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{End}');
    expect(word('bed')).toHaveFocus();
    await user.keyboard('{ArrowDown}{ArrowLeft}{ArrowUp}');
    expect(word('gone')).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(word('gone')).toHaveAttribute('aria-selected', 'true');
    expect(onSubmit).not.toHaveBeenCalled();
    await user.keyboard('{Home}{ArrowLeft}a');
    expect(word('She')).toHaveFocus();
    // Tab leaves the text: one stop for every word.
    await user.tab();
    expect(check()).toHaveFocus();
  });

  it('scores locally and marks each word right, wrong or missed, read out as well as drawn', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<MarkTheWords data={data} onComplete={onComplete} />);
    await user.click(word('went'));
    await user.click(word('had'));
    await user.click(word('home'));
    await user.click(check());
    // went found, had gone half-marked, home wrong: (1 − 1) / 2.
    expect(onComplete.mock.calls[0]?.[0]).toMatchObject({ score: 0, passed: false });
    expect(onComplete.mock.calls[0]?.[0].xapiStatement.result.response).toBe('1[,]2[,]4');
    expect(word('went')).toHaveAttribute('data-mark', 'correct');
    expect(word('went')).toHaveAccessibleName('went (right)');
    expect(word('home')).toHaveAttribute('data-mark', 'wrong');
    expect(word('home')).toHaveAccessibleName('home (not one to mark)');
    expect(word('had')).toHaveAttribute('data-mark', 'correct');
    expect(word('gone')).toHaveAttribute('data-mark', 'missed');
    expect(word('gone')).toHaveAccessibleName('gone (one to mark, left unmarked)');
    expect(word('She')).not.toHaveAttribute('data-mark');
    expect(screen.getByRole('note')).toHaveTextContent('went Past of go.');
    await user.click(screen.getByRole('button', { name: 'Hide feedback' }));
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    // Checked: clicking marks nothing more.
    await user.click(word('bed'));
    expect(word('bed')).toHaveAttribute('aria-selected', 'false');
  });

  it('shows no missed word where answers are withheld, and no mark without feedback', async () => {
    const user = userEvent.setup();
    render(<MarkTheWords data={data} delivery={{ solutions: false }} />);
    await user.click(word('went'));
    await user.click(check());
    expect(word('went')).toHaveAttribute('data-mark', 'correct');
    expect(word('had')).not.toHaveAttribute('data-mark');
    cleanup();

    render(<MarkTheWords data={data} delivery={{ feedback: false }} />);
    await user.click(word('went'));
    await user.click(check());
    expect(word('went')).not.toHaveAttribute('data-mark');
  });

  it('keeps the marks for another try, and shows what was missed only once the tries close', async () => {
    const user = userEvent.setup();
    render(<MarkTheWords data={data} scoring={{ retries: 1 }} />);
    await user.click(word('went'));
    await user.click(check());
    expect(word('had')).not.toHaveAttribute('data-mark');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(word('went')).toHaveAttribute('aria-selected', 'true');
    expect(word('went')).toHaveFocus();
    await user.click(check());
    expect(word('had')).toHaveAttribute('data-mark', 'missed');
  });

  it('follows a controlled value, and starts over when the item changes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <MarkTheWords
        data={data}
        value={{ type: 'mark-the-words', marked: [2] }}
        onChange={onChange}
      />,
    );
    expect(word('home')).toHaveAttribute('aria-selected', 'true');
    await user.click(word('bed'));
    expect(word('bed')).toHaveAttribute('aria-selected', 'false');
    expect(onChange).toHaveBeenLastCalledWith({ type: 'mark-the-words', marked: [2, 7] });
    rerender(<MarkTheWords data={data} value={{ type: 'matching', matches: {} }} />);
    expect(word('home')).toHaveAttribute('aria-selected', 'false');
    cleanup();

    const { rerender: again } = render(
      <MarkTheWords data={data} defaultValue={{ type: 'mark-the-words', marked: [7] }} />,
    );
    expect(word('bed')).toHaveAttribute('aria-selected', 'true');
    await user.click(check());
    again(<MarkTheWords data={{ ...data, id: 'mw2' }} />);
    expect(word('bed')).toHaveAttribute('aria-selected', 'false');
    expect(check()).toBeEnabled();
  });
});

describe('<MarkTheWords> in an exam and in review', () => {
  it('records the answer in an exam without grading or revealing it', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onComplete = vi.fn();
    const redacted = redact(data, { reveal: 'none' }) as unknown as MarkTheWordsData;
    render(
      <MarkTheWords
        data={redacted}
        renderMode="exam"
        onSubmit={onSubmit}
        onComplete={onComplete}
      />,
    );
    await user.click(word('went'));
    await user.click(screen.getByRole('button', { name: 'Submit answers' }));
    expect(onSubmit).toHaveBeenCalledWith({ type: 'mark-the-words', marked: [1] });
    expect(onComplete).not.toHaveBeenCalled();
    expect(word('went')).not.toHaveAttribute('data-mark');
    expect(screen.getByText('Answer submitted.')).toBeInTheDocument();
  });

  it('marks a review from its scored outcome alone, on a redacted item', () => {
    const response = { type: 'mark-the-words' as const, marked: [1, 3] };
    const outcome = evaluate(data, response);
    const redacted = redact(data, { reveal: 'none' }) as unknown as MarkTheWordsData;
    render(<MarkTheWords data={redacted} renderMode="review" value={response} outcome={outcome} />);
    expect(word('went')).toHaveAttribute('data-mark', 'correct');
    expect(word('and')).toHaveAttribute('data-mark', 'wrong');
    expect(word('had')).toHaveAttribute('data-mark', 'missed');
    expect(screen.queryByRole('button', { name: /Check|Submit/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('reads back an outcome that is not scored without marking anything', () => {
    for (const outcome of [
      { status: 'deferred', reason: 'requires_async_grading' },
      { status: 'graded', score: 3, maxScore: 4, passed: true, feedback: 'Good.' },
      { status: 'graded', score: 0.5, maxScore: 0, passed: false },
      { status: 'unscorable', reason: 'no-grade' },
    ] as const) {
      render(
        <MarkTheWords
          data={data}
          renderMode="review"
          value={{ type: 'mark-the-words', marked: [1] }}
          outcome={outcome as never}
        />,
      );
      expect(word('went')).not.toHaveAttribute('data-mark');
      cleanup();
    }
  });

  it('refuses a redacted item in practice, which has nothing to grade against', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const redacted = redact(data, { reveal: 'none' }) as unknown as MarkTheWordsData;
    render(<MarkTheWords data={redacted} />);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    error.mockRestore();
  });

  it('is drawn by the sequence and the preview', () => {
    render(<ActivitySequence activities={[data]} renderMode="practice" />);
    expect(word('went')).toBeInTheDocument();
    cleanup();
    render(<ActivityPreview draft={data} />);
    expect(word('bed')).toBeInTheDocument();
  });
});
