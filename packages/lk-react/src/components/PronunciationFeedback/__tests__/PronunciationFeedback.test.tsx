import type { GradeRecord, SpeechAssessment } from '@intellectif/lk-core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkA11y } from '../../../test-support/a11y.js';
import { stubMediaElement } from '../../../test-support/media.js';
import { PronunciationFeedback } from '../index.js';
import { PronunciationFeedback as PronunciationFeedbackCore } from '../PronunciationFeedback.js';

afterEach(cleanup);

const data = { referenceText: 'The weather is lovely today.', locale: 'en-US' };

/**
 * One assessment carrying every shape the panel has a branch for: a correct
 * word with nothing else, a word with syllables, phonemes, a candidate it was
 * heard as, timings and a break, an omission, a mispronunciation, and an
 * insertion. The reading is "the weather is lonely today um".
 */
const assessment: SpeechAssessment = {
  assessmentVersion: '1.0',
  status: 'assessed',
  task: 'scripted',
  locale: 'en-US',
  referenceText: 'The weather is lovely today.',
  recordingKey: 'take-1',
  assessor: { kind: 'auto', id: 'engine-1' },
  scale: 100,
  scores: { accuracy: 88, fluency: 72, completeness: 100 },
  recognizedText: 'the weather is lonely today',
  miscue: 'assessor',
  phonemeAlphabet: 'ipa',
  words: [
    { text: 'The', accuracy: 95, error: 'none' },
    {
      text: 'weather',
      accuracy: 90,
      error: 'none',
      startMs: 300,
      durationMs: 400,
      syllables: [
        { text: 'ˈwɛ', grapheme: 'wea', accuracy: 92 },
        { text: 'ðər', accuracy: 88 },
      ],
      phonemes: [
        { symbol: 'w', accuracy: 91 },
        { accuracy: 55, heardAs: [{ symbol: 'v', score: 40 }] },
      ],
      breaks: { unexpected: 0.9, missing: 0.1 },
    },
    { text: 'is', error: 'omission' },
    { text: 'lonely', accuracy: 41, error: 'mispronunciation' },
    { text: 'today', accuracy: 85, error: 'none' },
    { text: 'um', error: 'insertion' },
  ],
  prosody: { monotoneConfidence: 0.9 },
};

const grade: GradeRecord = {
  score: 0.82,
  maxScore: 1,
  passed: true,
  feedback: 'Clear and steady.',
  criteria: [
    { name: 'accuracy', score: 88, maxScore: 100, weight: 3 },
    { name: 'fluency', score: 72, maxScore: 100, weight: 1 },
  ],
};

const words = () => screen.getByRole('list', { name: 'Your reading, word by word' });
const states = () =>
  [...words().querySelectorAll('.lk-pf-word')].map((item) => item.getAttribute('data-state'));
const sentences = () =>
  [...words().querySelectorAll('.lk-visually-hidden')].map((item) => item.textContent);
const dimension = (container: HTMLElement, name: string) => {
  const row = container.querySelector(`[data-dimension="${name}"]`) as HTMLElement;
  return row.querySelector('.lk-pf-dimension-score')?.textContent;
};

describe('<PronunciationFeedback> marks', () => {
  it('marks every reference word, places the insertion, and names each state for a screen reader', async () => {
    const { container } = render(<PronunciationFeedback data={data} assessment={assessment} />);
    expect(states()).toEqual([
      'correct',
      'correct',
      'omitted',
      'mispronounced',
      'correct',
      'inserted',
    ]);
    expect(sentences()).toEqual([
      '“the” was read correctly',
      '“weather” was read correctly',
      '“is” was not read',
      '“lovely” was mispronounced',
      '“today” was read correctly',
      '“um” was added',
    ]);
    // The omitted word shows the word that was not read; the inserted one shows
    // what was said instead.
    const visible = [...words().querySelectorAll('.lk-pf-word-text')].map(
      (item) => item.textContent,
    );
    expect(visible).toEqual(['the', 'weather', 'is', 'lovely', 'today', 'um']);
    expect(await checkA11y(container)).toHaveNoViolations();
  });

  it('announces an insertion that normalises to nothing as added, not as an omission', () => {
    // `heard` is '' for an omitted word AND for an insertion that spells
    // nothing, so a renderer that branched on the empty string would report a
    // dash the assessor tagged as spoken as a word the learner skipped.
    const dashed: SpeechAssessment = {
      ...assessment,
      words: [
        { text: 'The', error: 'none' },
        { text: '—', error: 'insertion' },
        { text: 'weather', error: 'none' },
        { text: 'is', error: 'none' },
        { text: 'lovely', error: 'none' },
        { text: 'today', error: 'none' },
      ],
    };
    render(<PronunciationFeedback data={data} assessment={dashed} />);
    expect(states()).toContain('inserted');
    expect(sentences()).toContain('“” was added');
    expect(sentences()).not.toContain('“” was not read');
  });

  it('puts the reading’s language and direction on the words and on nothing else', () => {
    const { container } = render(
      <PronunciationFeedback
        data={{ referenceText: 'السلام عليكم ورحمة الله', locale: 'ar-EG' }}
        assessment={{
          ...assessment,
          locale: 'ar-EG',
          referenceText: 'السلام عليكم ورحمة الله',
          words: [{ text: 'السلام', error: 'none' }],
        }}
        locale="en"
      />,
    );
    expect(container.querySelector('.lk-pf')).toHaveAttribute('lang', 'en');
    expect(words()).toHaveAttribute('dir', 'rtl');
    const token = container.querySelector('.lk-pf-word-text') as HTMLElement;
    expect(token).toHaveAttribute('lang', 'ar-EG');
    expect(token).toHaveAttribute('dir', 'rtl');
  });

  it('renders a legend row for each of the four states', () => {
    const { container } = render(<PronunciationFeedback data={data} assessment={assessment} />);
    const rows = [...container.querySelectorAll('.lk-pf-legend li')].map((item) => [
      item.getAttribute('data-state'),
      item.textContent,
    ]);
    expect(rows).toEqual([
      ['correct', 'Read correctly'],
      ['mispronounced', 'Mispronounced'],
      ['omitted', 'Not read'],
      ['inserted', 'Added'],
    ]);
  });
});

describe('<PronunciationFeedback> dimensions', () => {
  it('reads the graded criteria when there are any, and never renders an absent one as 0', () => {
    const { container } = render(
      <PronunciationFeedback data={data} assessment={assessment} grade={grade} />,
    );
    expect(dimension(container, 'accuracy')).toBe('88%');
    expect(dimension(container, 'fluency')).toBe('72%');
    // The assessment measured completeness at 100, but the grade did not weigh
    // it: a number set beside graded ones would read as if it had counted.
    expect(dimension(container, 'completeness')).toBe('Not assessed');
    expect(dimension(container, 'prosody')).toBe('Not assessed');
    expect(container.textContent).not.toContain('0%');
  });

  it('falls back to the assessment’s own scores when no grade is given', () => {
    const { container } = render(<PronunciationFeedback data={data} assessment={assessment} />);
    expect(dimension(container, 'accuracy')).toBe('88%');
    expect(dimension(container, 'completeness')).toBe('100%');
    expect(dimension(container, 'prosody')).toBe('Not assessed');
  });

  it('normalises a criterion carried in the grader’s own units', () => {
    const banded: GradeRecord = {
      ...grade,
      criteria: [
        { name: 'accuracy', score: 7, maxScore: 9 },
        { name: 'fluency', notApplicable: true },
      ],
    };
    const { container } = render(
      <PronunciationFeedback data={data} assessment={assessment} grade={banded} />,
    );
    expect(dimension(container, 'accuracy')).toBe('78%');
    expect(dimension(container, 'fluency')).toBe('Not assessed');
  });

  it('shows the grade and the grader’s feedback when it is given one', () => {
    render(<PronunciationFeedback data={data} assessment={assessment} grade={grade} />);
    expect(screen.getByText('Score 82%. Passed.')).toBeInTheDocument();
    expect(screen.getByText('Clear and steady.')).toHaveAttribute('dir', 'auto');
  });
});

describe('<PronunciationFeedback> word detail', () => {
  it('opens one word at a time and shows its syllables, sounds and what they were heard as', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <PronunciationFeedback data={data} assessment={assessment} breakThreshold={0.75} />,
    );
    const toggle = screen.getByRole('button', { name: 'Details for “weather”' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const panel = container.querySelector('.lk-pf-word-detail') as HTMLElement;
    expect(panel).toHaveTextContent('90%');
    expect(panel).toHaveTextContent('ˈwɛ (spelled “wea”)');
    // The second syllable carries no grapheme, so it is shown as written.
    expect(panel).toHaveTextContent('ðər');
    // The second phoneme has no symbol, so it is named by its place.
    expect(
      [...panel.querySelectorAll('.lk-pf-phoneme-symbol')].map((el) => el.textContent),
    ).toEqual(['w', 'Sound 2']);
    expect(panel).toHaveTextContent('Heard as');
    expect([...panel.querySelectorAll('.lk-pf-heard-as li')].map((el) => el.textContent)).toEqual([
      'v',
    ]);
    expect(await checkA11y(container)).toHaveNoViolations();

    // One at a time: opening another closes this one.
    await user.click(screen.getByRole('button', { name: 'Details for “today”' }));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(container.querySelectorAll('.lk-pf-word-detail')).toHaveLength(1);
  });

  it('says a word was not assessed rather than scoring it 0', async () => {
    const user = userEvent.setup();
    const unmeasured: SpeechAssessment = {
      ...assessment,
      words: [{ text: 'The', error: 'none', startMs: 0, durationMs: 100 }],
    };
    const { container } = render(<PronunciationFeedback data={data} assessment={unmeasured} />);
    await user.click(screen.getByRole('button', { name: 'Details for “the”' }));
    const panel = container.querySelector('.lk-pf-word-detail') as HTMLElement;
    expect(panel).toHaveTextContent('Not assessed');
    expect(panel).not.toHaveTextContent('0%');
  });

  it('offers no disclosure for a word the assessor said nothing else about', () => {
    const bare: SpeechAssessment = {
      ...assessment,
      words: [{ text: 'The', error: 'none' }],
    };
    render(<PronunciationFeedback data={data} assessment={bare} />);
    expect(screen.queryByRole('button', { name: /^Details for/ })).not.toBeInTheDocument();
  });

  it('shows a break note only past the caller’s own threshold, and none without one', async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(
      <PronunciationFeedback data={data} assessment={assessment} breakThreshold={0.75} />,
    );
    await user.click(screen.getByRole('button', { name: 'Details for “weather”' }));
    expect(container.querySelector('[data-break="unexpected"]')).toBeInTheDocument();
    // `missing` is 0.1, well under the same threshold.
    expect(container.querySelector('[data-break="missing"]')).not.toBeInTheDocument();

    rerender(<PronunciationFeedback data={data} assessment={assessment} />);
    await user.click(screen.getByRole('button', { name: 'Details for “weather”' }));
    expect(container.querySelector('[data-break]')).not.toBeInTheDocument();
  });

  it('plays one word out of the take, and offers no button without a take to play', async () => {
    stubMediaElement();
    const user = userEvent.setup();
    const { container } = render(
      <PronunciationFeedback data={data} assessment={assessment} audioUrl="blob:take-1" />,
    );
    await user.click(screen.getByRole('button', { name: 'Details for “weather”' }));
    await user.click(screen.getByRole('button', { name: 'Play “weather”' }));
    const element = container.querySelector('.lk-pf-audio') as HTMLAudioElement;
    expect(element.paused).toBe(false);
    expect(element.currentTime).toBeCloseTo(0.3);

    cleanup();
    render(<PronunciationFeedback data={data} assessment={assessment} />);
    await user.click(screen.getByRole('button', { name: 'Details for “weather”' }));
    expect(screen.queryByRole('button', { name: /^Play/ })).not.toBeInTheDocument();
  });

  it('stops at the end of the word, and never leaves two stops racing', () => {
    // `fireEvent`, not `userEvent`: this test drives the clock, and userEvent's
    // own inter-event delay never settles against fake timers.
    stubMediaElement();
    vi.useFakeTimers();
    const { container, unmount } = render(
      <PronunciationFeedback data={data} assessment={assessment} audioUrl="blob:take-1" />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Details for “weather”' }));
    const play = screen.getByRole('button', { name: 'Play “weather”' });
    const element = container.querySelector('.lk-pf-audio') as HTMLAudioElement;

    // Pressed twice: the first word's stop is cancelled rather than left to
    // pause the second one halfway through.
    fireEvent.click(play);
    fireEvent.click(play);
    expect(element.paused).toBe(false);
    act(() => {
      vi.advanceTimersByTime(399);
    });
    expect(element.paused).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(element.paused).toBe(true);

    // Nothing is left pending after the panel goes away.
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});

describe('<PronunciationFeedback> notes', () => {
  it('explains the phonetic alphabet only for the one it names', () => {
    const { container, rerender } = render(
      <PronunciationFeedback data={data} assessment={assessment} />,
    );
    expect(container.querySelector('.lk-pf-alphabet')).toBeInTheDocument();
    rerender(
      <PronunciationFeedback data={data} assessment={{ ...assessment, phonemeAlphabet: 'sapi' }} />,
    );
    expect(container.querySelector('.lk-pf-alphabet')).not.toBeInTheDocument();
  });

  it('notes a monotone reading only past the caller’s own threshold', () => {
    const { container, rerender } = render(
      <PronunciationFeedback data={data} assessment={assessment} monotoneThreshold={0.6} />,
    );
    expect(container.querySelector('.lk-pf-monotone')).toBeInTheDocument();
    rerender(
      <PronunciationFeedback data={data} assessment={assessment} monotoneThreshold={0.95} />,
    );
    expect(container.querySelector('.lk-pf-monotone')).not.toBeInTheDocument();
    // No threshold, no note: the SDK has no calibrated answer of its own.
    rerender(<PronunciationFeedback data={data} assessment={assessment} />);
    expect(container.querySelector('.lk-pf-monotone')).not.toBeInTheDocument();
  });
});

describe('<PronunciationFeedback> bad evidence', () => {
  // `scale` is a literal 100 in the schema, so 50 is evidence no adapter should
  // ever produce — and exactly the shape `alignReadAloud` throws a TypeError for.
  const broken = { ...assessment, scale: 50 } as unknown as SpeechAssessment;

  it('throws the mapped schema error in development, which the boundary catches', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<PronunciationFeedback data={data} assessment={broken} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Activity failed to render');
    vi.restoreAllMocks();
  });

  it('keeps the grade and the dimensions in production, and drops only the word list', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { container } = render(
      <PronunciationFeedback data={data} assessment={broken} grade={grade} />,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Score 82%. Passed.')).toBeInTheDocument();
    expect(dimension(container, 'accuracy')).toBe('88%');
    expect(
      screen.queryByRole('list', { name: 'Your reading, word by word' }),
    ).not.toBeInTheDocument();
    vi.unstubAllEnvs();
  });

  it('still reads the dimensions off refused evidence when there is no grade', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { container } = render(<PronunciationFeedback data={data} assessment={broken} />);
    expect(dimension(container, 'accuracy')).toBe('88%');
    expect(dimension(container, 'prosody')).toBe('Not assessed');
    vi.unstubAllEnvs();
  });
});

describe('<PronunciationFeedback> a grade nothing validated', () => {
  it('reads criteria that came back as JSON null the way it reads the scores', () => {
    // `GradeRecord.criteria` is optional, and a backend that serialises an
    // absent optional as `null` is the ordinary way to produce this. The panel
    // guards the assessment's `scores` defensively and then dereferenced the
    // grade — the one input nothing on this path validates — so the learner's
    // perfectly good 82% became the error boundary's fallback.
    const nulled = { ...grade, criteria: null } as unknown as GradeRecord;
    const { container } = render(
      <PronunciationFeedback data={data} assessment={assessment} grade={nulled} />,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Score 82%. Passed.')).toBeInTheDocument();
    // No criteria to read, so the dimensions fall back to the evidence's own.
    expect(dimension(container, 'accuracy')).toBe('88%');
    expect(dimension(container, 'completeness')).toBe('100%');
  });

  it('says a grade that carries no numbers could not be graded, rather than “NaN%”', () => {
    // Refused whole, grader's words included: words beside "could not be
    // graded" would read as the verdict on a grade nobody can see.
    const wordy = { ...grade, score: 'eighty-two', maxScore: null } as unknown as GradeRecord;
    const { container } = render(
      <PronunciationFeedback data={data} assessment={assessment} grade={wordy} />,
    );
    expect(container.textContent).not.toContain('NaN');
    expect(container.querySelector('.lk-pf-score')).toHaveTextContent(
      'This response could not be graded.',
    );
    // No verdict to style, so no pass or fail colour either.
    expect(container.querySelector('.lk-pf-grade')).not.toHaveAttribute('data-passed');
    expect(screen.queryByText('Clear and steady.')).not.toBeInTheDocument();
    // The evidence is still the learner's: its dimensions and marks stay.
    expect(dimension(container, 'accuracy')).toBe('88%');
    expect(words()).toBeInTheDocument();
  });

  it('says each mark once, not twice, to a screen reader', () => {
    // The hidden sentence is the marks' only channel for assistive technology.
    // The same sentence as a `title` is read straight after it, so every word
    // was announced twice.
    const { container } = render(<PronunciationFeedback data={data} assessment={assessment} />);
    for (const word of container.querySelectorAll('.lk-pf-word')) {
      expect(word).not.toHaveAttribute('title');
    }
  });
});

describe('<PronunciationFeedback> server rendering', () => {
  it('renders on a server with no browser globals touched', () => {
    const markup = renderToString(
      <PronunciationFeedbackCore data={data} assessment={assessment} grade={grade} />,
    );
    expect(markup).toContain('lk-pf-word');
    expect(markup).toContain('was mispronounced');
  });
});
