import {
  type DictationData,
  diffDictationChars,
  evaluate,
  type ItemOutcome,
  redact,
} from '@intellectif/lk-core';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkA11y } from '../../../test-support/a11y.js';
import { stubMediaElement } from '../../../test-support/media.js';
import { repeatedly, slowdown } from '../../../test-support/timing.js';
import { ActivityPreview } from '../../ActivityPreview/index.js';
import { ActivitySequence } from '../../ActivitySequence/index.js';
import { bulletDirections } from '../Dictation.js';
import { Dictation } from '../index.js';

afterEach(cleanup);

const data: DictationData = {
  schemaVersion: '1.0',
  type: 'dictation',
  id: 'dc1',
  title: 'Listen and type the sentence',
  transcript: 'The cat sat on the mat.',
  media: { type: 'audio', url: 'https://x.test/cat.mp3', alt: 'Recording' },
  feedback: { correct: 'Well heard.', incorrect: 'Listen once more.' },
};

// A locked scrubber and a fixed speed, no play budget: the schema refuses a
// budgeted recording beside a slow one, so this is the two-file shape that
// validates.
const twoRecordings: DictationData = {
  ...data,
  id: 'dc2',
  media: {
    type: 'audio',
    url: 'https://x.test/cat.mp3',
    alt: 'Recording',
    playback: { seek: 'none', rate: 'fixed' },
  },
  slowMedia: { type: 'audio', url: 'https://x.test/cat-slow.mp3' },
};

const withHints: DictationData = { ...data, id: 'dc3', hints: { mode: 'progressive-words' } };

const box = () => screen.getByRole('textbox', { name: 'Type what you hear' });
const check = () => screen.getByRole('button', { name: 'Check answers' });
const words = () => screen.getByRole('list', { name: 'Your answer, word by word' });
const wordStates = () =>
  [...words().querySelectorAll('.lk-dc-word')].map((item) => item.getAttribute('data-state'));
const hiddenSentences = () =>
  [...words().querySelectorAll('.lk-visually-hidden')].map((item) => item.textContent);

/** The redacted projection as a server would hand it over, typed for the prop. */
const projectionOf = (source: DictationData, reveal?: 'after-submit'): DictationData =>
  redact(source, reveal === undefined ? {} : { reveal }) as unknown as DictationData;

describe('<Dictation> rendering', () => {
  it('renders the title, one recording, the answer box and the check button', async () => {
    const { container } = render(<Dictation data={data} />);
    expect(screen.getByRole('form', { name: data.title })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Recording' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Slow recording' })).not.toBeInTheDocument();
    expect(box()).toHaveAttribute('maxlength', '8000');
    expect(box()).toHaveAttribute('dir', 'auto');
    expect(box()).toHaveAttribute('spellcheck', 'false');
    expect(box()).toHaveAttribute('autocorrect', 'off');
    expect(check()).toBeEnabled();
    expect(await checkA11y(container)).toHaveNoViolations();
  });

  it('renders a second, slower recording that inherits seek and rate from the first', () => {
    stubMediaElement();
    render(<Dictation data={twoRecordings} renderMode="exam" />);
    const normal = screen.getByRole('group', { name: 'Recording' });
    const slow = screen.getByRole('group', { name: 'Slow recording' });
    // Both files get the transport, and the locked scrubber and fixed speed
    // bind the slow one too — a free slow file beside a locked normal one
    // would defeat the policy.
    for (const group of [normal, slow]) {
      expect(within(group).getByRole('button', { name: 'Play' })).toBeInTheDocument();
      expect(within(group).queryByRole('slider', { name: 'Seek' })).not.toBeInTheDocument();
      expect(
        within(group).queryByRole('combobox', { name: 'Playback speed' }),
      ).not.toBeInTheDocument();
      expect(within(group).queryByRole('status')).not.toBeInTheDocument();
    }
    expect(slow.querySelector('audio')).toHaveAttribute('aria-label', 'Slow recording');
  });

  // Both schemas refuse `maxPlays` beside `slowMedia`; this projection is built
  // by hand, as a server that skipped `redact()` would build it.
  const budgetedProjection = {
    redacted: true,
    schemaVersion: '1.0',
    type: 'dictation',
    id: 'dc-projected',
    title: 'Listen',
    media: {
      type: 'audio',
      url: 'https://x.test/cat.mp3',
      alt: 'Recording',
      playback: { maxPlays: 2, seek: 'none', rate: 'fixed' },
    },
    slowMedia: { type: 'audio', url: 'https://x.test/cat-slow.mp3', alt: 'Recording, slow' },
  } as unknown as DictationData;
  const budget = { key: 'slot:0', slotId: '0', index: 0, entry: { plays: 1 } };

  it('refuses, in development, a projection that pairs a play budget with a slow recording', () => {
    stubMediaElement();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Dictation data={budgetedProjection} renderMode="exam" mediaBudget={budget} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Slow recording' })).not.toBeInTheDocument();
    spy.mockRestore();
  });

  it('never gives the slow recording a budget in production, even when a projection pairs it with one', () => {
    stubMediaElement();
    // No dev boundary in production: whatever arrives, the slow file follows
    // the policy minus the budget, so it renders in an exam with no binding.
    vi.stubEnv('NODE_ENV', 'production');
    try {
      render(<Dictation data={budgetedProjection} renderMode="exam" mediaBudget={budget} />);
    } finally {
      vi.unstubAllEnvs();
    }
    const normal = screen.getByRole('group', { name: 'Recording' });
    const slow = screen.getByRole('group', { name: 'Slow recording' });
    expect(within(normal).getByRole('status')).toHaveTextContent('1 of 2 plays remaining');
    expect(within(slow).queryByRole('status')).not.toBeInTheDocument();
    expect(within(slow).queryByRole('slider', { name: 'Seek' })).not.toBeInTheDocument();
    expect(slow.querySelector('audio')).toHaveAttribute('aria-label', 'Recording, slow');
  });

  it('pauses the first recording when the second starts', async () => {
    stubMediaElement();
    const user = userEvent.setup();
    render(<Dictation data={twoRecordings} />);
    const [normal, slow] = [...document.querySelectorAll('audio')] as HTMLAudioElement[];
    await user.click(
      within(screen.getByRole('group', { name: 'Recording' })).getByRole('button', {
        name: 'Play',
      }),
    );
    expect((normal as HTMLAudioElement).paused).toBe(false);
    await user.click(
      within(screen.getByRole('group', { name: 'Slow recording' })).getByRole('button', {
        name: 'Play',
      }),
    );
    expect((slow as HTMLAudioElement).paused).toBe(false);
    expect((normal as HTMLAudioElement).paused).toBe(true);
  });

  it('keeps two renderings of the same item from pausing each other', async () => {
    stubMediaElement();
    const user = userEvent.setup();
    render(
      <>
        <Dictation data={twoRecordings} />
        <Dictation data={twoRecordings} />
      </>,
    );
    const [firstNormal, , secondNormal] = [...document.querySelectorAll('audio')] as [
      HTMLAudioElement,
      HTMLAudioElement,
      HTMLAudioElement,
    ];
    const plays = screen.getAllByRole('button', { name: 'Play' });
    // Normal and slow of the first form, then normal and slow of the second.
    await user.click(plays[0] as HTMLElement);
    await user.click(plays[2] as HTMLElement);
    expect(firstNormal.paused).toBe(false);
    expect(secondNormal.paused).toBe(false);
  });

  it('keeps separately hydrated copies of one item from pausing each other', async () => {
    stubMediaElement();
    const user = userEvent.setup();
    // Two islands of the same server-rendered markup derive the same useId for
    // the same tree position; the playback group must not be named from it.
    const islands = [0, 1].map(() => {
      const island = document.createElement('div');
      island.innerHTML = renderToString(<Dictation data={twoRecordings} />);
      document.body.append(island);
      return island;
    });
    const roots: Root[] = [];
    await act(async () => {
      for (const island of islands) {
        roots.push(hydrateRoot(island, <Dictation data={twoRecordings} />));
      }
    });
    const [first, second] = islands as [HTMLDivElement, HTMLDivElement];
    await user.click(within(first).getAllByRole('button', { name: 'Play' })[0] as HTMLElement);
    await user.click(within(second).getAllByRole('button', { name: 'Play' })[1] as HTMLElement);
    expect((first.querySelector('audio') as HTMLAudioElement).paused).toBe(false);
    act(() => {
      for (const root of roots) {
        root.unmount();
      }
    });
    for (const island of islands) {
      island.remove();
    }
  });

  it('shows no hints unless the data asks for them', () => {
    render(<Dictation data={data} />);
    expect(screen.queryByRole('button', { name: /Reveal the next word/ })).not.toBeInTheDocument();
  });
});

describe('<Dictation> answering in practice', () => {
  it('scores locally, reports the outcome, and builds a fill-in statement with the typed text', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    const onSubmit = vi.fn();
    render(<Dictation data={data} onComplete={onComplete} onSubmit={onSubmit} />);
    await user.type(box(), 'The cat sat on the met.');
    await user.click(check());
    expect(onSubmit).toHaveBeenCalledWith({ type: 'dictation', text: 'The cat sat on the met.' });
    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0]?.[0];
    expect(result.score).toBeCloseTo(21 / 22, 10);
    expect(result.passed).toBe(true);
    expect(result.xapiStatement.object.definition.interactionType).toBe('fill-in');
    expect(result.xapiStatement.result.response).toBe('The cat sat on the met.');
    // The words summary is a sentence of its own, so the feedback after it reads as one;
    // the authored feedback is isolated in its own span, its direction its own.
    const live = document.getElementById(`${data.id}-feedback`) as HTMLElement;
    expect(live).toHaveTextContent(
      'Answer submitted. Score 95%. Passed. 5 of 6 words correct. Well heard.',
    );
    expect(live.querySelector('span[dir="auto"]')).toHaveTextContent('Well heard.');
    expect(box()).toHaveAttribute('data-correct', 'true');
    expect(box()).toBeDisabled();
  });

  it('marks every word, with a hidden sentence per word and a character diff inside a wrong one', async () => {
    const user = userEvent.setup();
    const { container } = render(<Dictation data={data} />);
    await user.type(box(), 'cat sit on the mat now');
    await user.click(check());
    expect(wordStates()).toEqual([
      'missing',
      'correct',
      'incorrect',
      'correct',
      'correct',
      'correct',
      'extra',
    ]);
    expect(hiddenSentences()).toEqual([
      '“the” is missing',
      '“cat” is correct',
      '“sit” should be “sat”',
      '“on” is correct',
      '“the” is correct',
      '“mat” is correct',
      '“now” is extra',
    ]);
    // The visible text is decoration, hidden from assistive technology.
    for (const visible of words().querySelectorAll('.lk-dc-word-text')) {
      expect(visible).toHaveAttribute('aria-hidden', 'true');
    }
    const wrong = words().querySelectorAll('.lk-dc-word')[2] as HTMLElement;
    const ops = [...wrong.querySelectorAll('.lk-dc-op')];
    expect(ops.map((op) => op.getAttribute('data-op'))).toEqual(['equal', 'substitute', 'equal']);
    expect(ops.map((op) => op.textContent)).toEqual(['s', 'i', 't']);
    for (const op of ops) {
      expect(op).toHaveAttribute('aria-hidden', 'true');
    }
    // The whole-sentence diff, the legend and the note about normalisation.
    const diff = container.querySelector('.lk-dc-diff') as HTMLElement;
    expect(diff).toHaveAttribute('aria-hidden', 'true');
    expect(diff.querySelectorAll('.lk-dc-op[data-op="missing"]').length).toBeGreaterThan(0);
    expect(diff.querySelector('.lk-dc-op[data-op="missing"]')).toHaveTextContent('•');
    expect(
      [...(container.querySelector('.lk-dc-legend') as HTMLElement).querySelectorAll('li')].map(
        (item) => item.getAttribute('data-state'),
      ),
    ).toEqual(['correct', 'incorrect', 'missing', 'extra']);
    expect(
      screen.getByText('Compared after ignoring case, punctuation and extra spaces.'),
    ).toBeInTheDocument();
    expect(await checkA11y(container)).toHaveNoViolations();
  });

  it('offers the solution behind a toggle, with the accepted alternatives', async () => {
    const user = userEvent.setup();
    render(<Dictation data={{ ...data, acceptedTranscripts: ['A cat sat on the mat.'] }} />);
    await user.type(box(), 'the cat');
    await user.click(check());
    const toggle = screen.getByRole('button', { name: 'Show solution' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('The cat sat on the mat.')).not.toBeInTheDocument();
    await user.click(toggle);
    const solution = screen.getByRole('blockquote', { name: 'Solution' });
    expect(solution).toHaveTextContent('The cat sat on the mat.');
    expect(solution).toHaveTextContent('A cat sat on the mat.');
    // No locale on the item: the direction is the transcript's first letter's.
    expect(solution).toHaveAttribute('dir', 'ltr');
    expect(screen.getByRole('button', { name: 'Hide solution' })).toHaveAttribute(
      'aria-controls',
      solution.id,
    );
    await user.click(screen.getByRole('button', { name: 'Hide solution' }));
    expect(screen.queryByRole('blockquote')).not.toBeInTheDocument();
  });

  it('accepts an empty submission as a recorded answer, scored 0 with nothing to compare', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<Dictation data={data} onComplete={onComplete} />);
    await user.click(check());
    expect(onComplete.mock.calls[0]?.[0]).toMatchObject({ score: 0, passed: false });
    expect(screen.getByRole('note')).toHaveTextContent(
      'Nothing to compare: no words were entered.',
    );
    expect(
      screen.queryByRole('list', { name: 'Your answer, word by word' }),
    ).not.toBeInTheDocument();
    expect(document.getElementById(`${data.id}-feedback`)).toHaveTextContent(
      /Score 0%\. Not passed\. 0 of 6 words correct\./,
    );
    // The solution is still offered: the learner who heard nothing needs it most.
    await user.click(screen.getByRole('button', { name: 'Show solution' }));
    expect(screen.getByRole('blockquote', { name: 'Solution' })).toHaveTextContent(
      'The cat sat on the mat.',
    );
  });

  it('keeps interface text in the interface language and gives the dictation language to its words', async () => {
    const user = userEvent.setup();
    const { container } = render(<Dictation data={{ ...data, locale: 'en-GB' }} locale="es" />);
    await user.type(box(), 'The cat sat on the met.');
    await user.click(check());
    await user.click(screen.getByRole('button', { name: 'Show solution' }));
    const langOf = (element: Element | null) => element?.closest('[lang]')?.getAttribute('lang');
    // Named by interface text: the list, the box and the solution stay in the interface language.
    expect(langOf(words())).toBe('es');
    expect(langOf(box())).toBe('es');
    expect(langOf(screen.getByRole('blockquote', { name: 'Solution' }))).toBe('es');
    expect(langOf(container.querySelector('.lk-visually-hidden'))).toBe('es');
    // The dictation's own words carry its language.
    expect(langOf(container.querySelector('.lk-dc-word-text'))).toBe('en-GB');
    expect(langOf(container.querySelector('.lk-dc-solution p'))).toBe('en-GB');
    // A tag naming no direction leaves it to the text: the title's own, and the
    // transcript's first letter for the rest — never the list's own text.
    expect(container.querySelector('.lk-dc-title')).toHaveAttribute('dir', 'auto');
    expect(words()).toHaveAttribute('dir', 'ltr');
    // The form is named by the title element, which carries the content language.
    expect(screen.getByRole('form')).toHaveAttribute(
      'aria-labelledby',
      container.querySelector('.lk-dc-title')?.id,
    );
  });

  it('lays an Arabic dictation out right to left inside a left-to-right interface, whatever is typed', async () => {
    const user = userEvent.setup();
    const arabic: DictationData = {
      ...data,
      id: 'dc-ar',
      title: 'استمع واكتب',
      transcript: 'القطة تنام على السجادة',
      locale: 'ar',
    };
    const { container } = render(<Dictation data={arabic} locale="es" />);
    await user.type(box(), 'ok القطه تنام على السجاده');
    await user.click(screen.getByRole('button', { name: 'Check answers' }));
    expect(words()).toHaveAttribute('dir', 'rtl');
    expect(container.querySelector('.lk-dc-diff')).toHaveAttribute('dir', 'rtl');
    expect(container.querySelector('.lk-dc-title')).toHaveAttribute('dir', 'rtl');
    // The text box still follows what is typed in it.
    expect(box()).toHaveAttribute('dir', 'auto');
  });

  it('draws a wrong word as its character marks, and keeps interface tooltips off content', async () => {
    const user = userEvent.setup();
    const { container } = render(<Dictation data={data} />);
    await user.type(box(), 'The cat sat on the met.');
    await user.click(check());
    const wrong = container.querySelector('.lk-dc-word[data-state="incorrect"]') as HTMLElement;
    expect(wrong.querySelector('.lk-dc-word-text')).toHaveAttribute('data-marks', 'characters');
    expect(wrong).toHaveAttribute('title', '“met” should be “mat”');
    expect(wrong.querySelector('.lk-dc-word-text')).not.toHaveAttribute('title');
    expect(container.querySelectorAll('.lk-dc-op[title]')).toHaveLength(0);
  });

  it('announces a one-word transcript in the singular', async () => {
    const user = userEvent.setup();
    render(<Dictation data={{ ...data, transcript: 'Hello.' }} />);
    await user.type(box(), 'Hello');
    await user.click(check());
    expect(document.getElementById(`${data.id}-feedback`)).toHaveTextContent(
      '1 of 1 word correct.',
    );
  });

  it('hides the per-word sentences on screen without any stylesheet', async () => {
    const user = userEvent.setup();
    const { container } = render(<Dictation data={data} />);
    await user.type(box(), 'The cat sat on the met.');
    await user.click(check());
    const hidden = container.querySelector('.lk-visually-hidden') as HTMLElement;
    expect(hidden.style.position).toBe('absolute');
    expect(hidden.style.clipPath).toBe('inset(50%)');
    expect(hidden.style.overflow).toBe('hidden');
  });

  it('emits text-changed with the length only, debounced, and submitted with the score', async () => {
    const user = userEvent.setup();
    const onInteraction = vi.fn();
    render(<Dictation data={data} onInteraction={onInteraction} />);
    await user.type(box(), 'The cat');
    await vi.waitFor(() => {
      expect(onInteraction).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'text-changed', payload: { length: 7 } }),
      );
    });
    // One event for seven keystrokes, and never the text itself.
    expect(
      onInteraction.mock.calls.filter(([event]) => event.type === 'text-changed'),
    ).toHaveLength(1);
    await user.click(check());
    expect(onInteraction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'submitted',
        activityId: 'dc1',
        payload: { length: 7, hintsRevealed: 0, score: expect.any(Number) },
      }),
    );
  });

  it('reports every keystroke through onChange as a dictation response', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Dictation data={data} onChange={onChange} />);
    await user.type(box(), 'ab');
    expect(onChange).toHaveBeenNthCalledWith(1, { type: 'dictation', text: 'a' });
    expect(onChange).toHaveBeenNthCalledWith(2, { type: 'dictation', text: 'ab' });
  });
});

describe('<Dictation> progressive hints', () => {
  it('reveals the transcript words left to right, resets, and never changes the score', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    const onComplete = vi.fn();
    const onInteraction = vi.fn();
    render(
      <Dictation
        data={withHints}
        onChange={onChange}
        onSubmit={onSubmit}
        onComplete={onComplete}
        onInteraction={onInteraction}
      />,
    );
    const reveal = () => screen.getByRole('button', { name: /Reveal the next word/ });
    expect(reveal()).toHaveTextContent('Reveal the next word (0 of 6 shown)');
    expect(screen.queryByRole('button', { name: 'Reset hints' })).not.toBeInTheDocument();
    expect(box()).not.toHaveAttribute('aria-describedby');

    await user.click(reveal());
    expect(screen.getByRole('status')).toHaveTextContent('The …');
    expect(onInteraction).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'hint-requested', payload: { revealed: 1, total: 6 } }),
    );
    expect(onChange).toHaveBeenLastCalledWith({ type: 'dictation', text: '', hintsRevealed: 1 });
    expect(box()).toHaveAttribute('aria-describedby', screen.getByRole('status').id);

    await user.click(reveal());
    expect(screen.getByRole('status')).toHaveTextContent('The cat …');
    expect(reveal()).toHaveTextContent('Reveal the next word (2 of 6 shown)');

    await user.click(screen.getByRole('button', { name: 'Reset hints' }));
    expect(screen.getByRole('status')).toHaveTextContent('');
    // The reset button leaves with the hints; focus moves to the reveal button, not the page.
    expect(reveal()).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith({ type: 'dictation', text: '' });

    for (let i = 0; i < 6; i += 1) {
      await user.click(reveal());
    }
    expect(screen.getByRole('status')).toHaveTextContent('The cat sat on the mat.');
    // aria-disabled, not disabled: a natively disabled button would drop focus.
    expect(reveal()).toHaveAttribute('aria-disabled', 'true');
    expect(reveal()).not.toBeDisabled();
    expect(reveal()).toHaveFocus();
    await user.click(reveal());
    expect(reveal()).toHaveTextContent('Reveal the next word (6 of 6 shown)');

    await user.type(box(), 'The cat sat on the mat.');
    expect(onChange).toHaveBeenLastCalledWith({
      type: 'dictation',
      text: 'The cat sat on the mat.',
      hintsRevealed: 6,
    });
    await user.click(check());
    expect(onSubmit).toHaveBeenCalledWith({
      type: 'dictation',
      text: 'The cat sat on the mat.',
      hintsRevealed: 6,
    });
    // Six hints, full marks: hints are recorded, never charged.
    expect(onComplete.mock.calls[0]?.[0]).toMatchObject({ score: 1, passed: true });
    expect(onInteraction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'submitted',
        payload: { length: 23, hintsRevealed: 6, score: 1 },
      }),
    );
    // Hidden once the attempt is marked.
    expect(screen.queryByRole('button', { name: /Reveal the next word/ })).not.toBeInTheDocument();
  });

  it('joins a token with nothing spelled in it to the word before it', async () => {
    const user = userEvent.setup();
    render(<Dictation data={{ ...withHints, transcript: 'Wait - what?  Really' }} />);
    const reveal = () => screen.getByRole('button', { name: /Reveal the next word/ });
    expect(reveal()).toHaveTextContent('Reveal the next word (0 of 3 shown)');
    await user.click(reveal());
    expect(screen.getByRole('status')).toHaveTextContent('Wait - …');
  });

  it('splits hint words the way the scorer reads them', () => {
    const acute = String.fromCodePoint(0xb4);
    const nextLine = String.fromCodePoint(0x85);
    render(<Dictation data={{ ...withHints, transcript: `rock ${acute} roll${nextLine}again` }} />);
    // The accent alone is no word, and NEXT LINE separates two.
    expect(screen.getByRole('button', { name: /Reveal the next word/ })).toHaveTextContent(
      'Reveal the next word (0 of 3 shown)',
    );
  });

  it('reports the hints actually shown, and none where no hint can be', async () => {
    const user = userEvent.setup();
    const practice = vi.fn();
    render(
      <Dictation
        data={withHints}
        defaultValue={{ type: 'dictation', text: 'The', hintsRevealed: 99 }}
        onSubmit={practice}
      />,
    );
    await user.click(check());
    expect(practice).toHaveBeenCalledWith({ type: 'dictation', text: 'The', hintsRevealed: 6 });
    cleanup();

    const exam = vi.fn();
    render(
      <Dictation
        data={withHints}
        renderMode="exam"
        defaultValue={{ type: 'dictation', text: 'The', hintsRevealed: 4 }}
        onSubmit={exam}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Submit answers' }));
    expect(exam).toHaveBeenCalledWith({ type: 'dictation', text: 'The' });
    cleanup();

    const noHints = vi.fn();
    render(
      <Dictation
        data={data}
        defaultValue={{ type: 'dictation', text: 'The', hintsRevealed: 3 }}
        onSubmit={noHints}
      />,
    );
    await user.click(check());
    expect(noHints).toHaveBeenCalledWith({ type: 'dictation', text: 'The' });
  });
});

describe('<Dictation> seeding, control and reset', () => {
  it('seeds from defaultValue, hints included, and stays editable', async () => {
    const user = userEvent.setup();
    render(
      <Dictation
        data={withHints}
        defaultValue={{ type: 'dictation', text: 'The', hintsRevealed: 2 }}
      />,
    );
    expect(box()).toHaveValue('The');
    expect(screen.getByRole('status')).toHaveTextContent('The cat …');
    await user.type(box(), ' cat');
    expect(box()).toHaveValue('The cat');
  });

  it('is controlled when value is supplied', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Dictation data={data} value={{ type: 'dictation', text: 'The' }} onChange={onChange} />,
    );
    await user.type(box(), 'x');
    // The caller owns the value: the box does not move on its own.
    expect(box()).toHaveValue('The');
    expect(onChange).toHaveBeenCalledWith({ type: 'dictation', text: 'Thex' });
  });

  it('reads a response of another type as nothing typed rather than throwing', () => {
    render(
      <Dictation
        data={data}
        value={{ type: 'multiple-choice', selectedOptionIds: ['a'] }}
        onChange={vi.fn()}
      />,
    );
    expect(box()).toHaveValue('');
  });

  it('mounts already submitted with defaultSubmitted', () => {
    render(
      <Dictation
        data={data}
        defaultSubmitted
        defaultValue={{ type: 'dictation', text: 'The cat sat on the mat.' }}
      />,
    );
    expect(box()).toBeDisabled();
    expect(check()).toBeDisabled();
  });

  it('resets when the activity changes, and not when it merely re-renders', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Dictation data={data} />);
    await user.type(box(), 'The cat');
    await user.click(check());
    expect(box()).toBeDisabled();

    rerender(<Dictation data={data} />);
    expect(box()).toHaveValue('The cat');
    expect(box()).toBeDisabled();

    rerender(<Dictation data={{ ...data, id: 'dc9' }} />);
    expect(box()).toHaveValue('');
    expect(box()).toBeEnabled();
    expect(
      screen.queryByRole('list', { name: 'Your answer, word by word' }),
    ).not.toBeInTheDocument();
  });
});

describe('<Dictation> in exam mode', () => {
  it('submits without grading, revealing or emitting a statement, hints withheld', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onComplete = vi.fn();
    const onInteraction = vi.fn();
    const { container } = render(
      <Dictation
        data={projectionOf({
          ...withHints,
          slowMedia: { type: 'audio', url: 'https://x.test/cat-slow.mp3' },
        })}
        renderMode="exam"
        onSubmit={onSubmit}
        onComplete={onComplete}
        onInteraction={onInteraction}
      />,
    );
    // The recordings are all a learner needs; nothing here can reveal a word.
    expect(screen.getByRole('group', { name: 'Recording' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Slow recording' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reveal the next word/ })).not.toBeInTheDocument();
    await user.type(box(), 'The cat sat on the mat.');
    await user.click(screen.getByRole('button', { name: 'Submit answers' }));
    expect(onSubmit).toHaveBeenCalledWith({ type: 'dictation', text: 'The cat sat on the mat.' });
    expect(onComplete).not.toHaveBeenCalled();
    expect(box()).not.toHaveAttribute('data-correct');
    expect(
      screen.queryByRole('list', { name: 'Your answer, word by word' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /solution/i })).not.toBeInTheDocument();
    expect(screen.getByText('Answer submitted.')).toBeInTheDocument();
    expect(onInteraction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'submitted',
        payload: { length: 23, hintsRevealed: 0 },
      }),
    );
    expect(await checkA11y(container)).toHaveNoViolations();
  });

  it('never reads the transcript even when full data is handed to an exam', async () => {
    const user = userEvent.setup();
    render(<Dictation data={withHints} renderMode="exam" onSubmit={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Reveal the next word/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Submit answers' }));
    expect(document.body.textContent).not.toContain('The cat sat on the mat.');
  });

  it('refuses redacted data in practice rather than failing at submit time', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Dictation data={projectionOf(data)} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    spy.mockRestore();
  });
});

describe('<Dictation> in review mode', () => {
  const answered = { type: 'dictation', text: 'The cat sat on the met.' } as const;
  const scored = evaluate(data, answered);

  it('marks from the transcript when it is present, and offers nothing to submit', async () => {
    const { container } = render(
      <Dictation data={data} renderMode="review" defaultValue={answered} outcome={scored} />,
    );
    expect(box()).toHaveValue('The cat sat on the met.');
    expect(box()).toBeDisabled();
    expect(screen.queryByRole('button', { name: /answers/i })).not.toBeInTheDocument();
    expect(wordStates()).toEqual([
      'correct',
      'correct',
      'correct',
      'correct',
      'correct',
      'incorrect',
    ]);
    expect(container.querySelector('.lk-dc-diff')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show solution' })).toBeInTheDocument();
    expect(screen.getByText(/Score 95%\. Passed\./)).toBeInTheDocument();
    expect(box()).toHaveAttribute('data-correct', 'true');
    expect(await checkA11y(container)).toHaveNoViolations();
  });

  it('marks from the stored details when a review holds the key but not the response', () => {
    render(<Dictation data={data} renderMode="review" outcome={scored} />);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(wordStates()).toEqual([
      'correct',
      'correct',
      'correct',
      'correct',
      'correct',
      'incorrect',
    ]);
    expect(screen.getByRole('button', { name: 'Show solution' })).toBeInTheDocument();
  });

  it('reads a response of another type as no response, and marks from the details', () => {
    render(
      <Dictation
        data={data}
        renderMode="review"
        defaultValue={{ type: 'multiple-choice', selectedOptionIds: ['a'] }}
        outcome={scored}
      />,
    );
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(wordStates()).toHaveLength(6);
    // Nothing to show in the box, so nothing to mark it with.
    expect(box()).not.toHaveAttribute('data-correct');
  });

  it('renders marks in review from an after-submit projection in development', async () => {
    // `redact()` stamps `redacted: true` on the projection AND leaves the
    // transcript in it, so a boundary that gated on the marker would throw on
    // exactly the payload a review screen hands over. NODE_ENV is unset here:
    // the dev-only validation runs, and must not reject it.
    vi.stubEnv('NODE_ENV', undefined);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(
      <Dictation
        data={projectionOf(data, 'after-submit')}
        renderMode="review"
        defaultValue={answered}
        outcome={scored}
      />,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(wordStates()).toHaveLength(6);
    expect(container.querySelector('.lk-dc-diff')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show solution' })).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    vi.unstubAllEnvs();
  });

  it('renders the word list from the stored details on a plain projection, with no diff or solution', async () => {
    const outcome = evaluate(data, { type: 'dictation', text: 'The cat sat on mat.' });
    const { container } = render(
      <Dictation
        data={projectionOf(data)}
        renderMode="review"
        defaultValue={{ type: 'dictation', text: 'The cat sat on mat.' }}
        outcome={outcome}
      />,
    );
    // One item per transcript word, as the scorer wrote them.
    expect(wordStates()).toEqual([
      'correct',
      'correct',
      'correct',
      'correct',
      'missing',
      'correct',
    ]);
    expect(hiddenSentences()[4]).toBe('“the” is missing');
    expect(container.querySelector('.lk-dc-diff')).not.toBeInTheDocument();
    expect(container.querySelector('.lk-dc-op')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /solution/i })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('The cat sat on the mat.');
    expect(await checkA11y(container)).toHaveNoViolations();
  });

  it('shows a summary only when the outcome has not been graded, or carries no details', () => {
    const deferred: ItemOutcome = {
      status: 'deferred',
      reason: 'requires_async_grading',
      maxScore: 1,
    };
    const { rerender } = render(
      <Dictation data={data} renderMode="review" defaultValue={answered} outcome={deferred} />,
    );
    expect(screen.getByText('Not graded yet.')).toBeInTheDocument();
    expect(
      screen.queryByRole('list', { name: 'Your answer, word by word' }),
    ).not.toBeInTheDocument();
    expect(box()).not.toHaveAttribute('data-correct');

    rerender(
      <Dictation
        data={projectionOf(data)}
        renderMode="review"
        defaultValue={answered}
        outcome={{ ...scored, details: [] } as ItemOutcome}
      />,
    );
    expect(screen.getByText(/Score 95%\. Passed\./)).toBeInTheDocument();
    expect(
      screen.queryByRole('list', { name: 'Your answer, word by word' }),
    ).not.toBeInTheDocument();

    rerender(
      <Dictation
        data={data}
        renderMode="review"
        defaultValue={answered}
        outcome={{
          status: 'graded',
          score: 8.5,
          maxScore: 10,
          passed: true,
          feedback: null,
          grade: { score: 8.5, maxScore: 10, passed: true, feedback: null },
        }}
      />,
    );
    expect(screen.getByText('Score 85%. Passed.')).toBeInTheDocument();

    rerender(
      <Dictation
        data={data}
        renderMode="review"
        defaultValue={answered}
        outcome={{ status: 'unscorable', reason: 'no-scorer', maxScore: 1 }}
      />,
    );
    expect(screen.getByText('No grade available.')).toBeInTheDocument();
  });

  it('says nothing was typed for an empty review answer', () => {
    render(
      <Dictation
        data={data}
        renderMode="review"
        defaultValue={{ type: 'dictation', text: '' }}
        outcome={evaluate(data, { type: 'dictation', text: '' })}
      />,
    );
    expect(screen.getByRole('note')).toHaveTextContent(
      'Nothing to compare: no words were entered.',
    );
  });
});

describe('<Dictation> marks in every script', () => {
  const cp = (...points: number[]) => String.fromCodePoint(...points);
  const LRM = cp(0x200e);
  const RLM = cp(0x200f);

  /** The marked clusters of the first wrong word, as [op, text]. */
  const marksOf = (item: DictationData, typed: string): [string | null, string | null][] => {
    const { container } = render(
      <Dictation
        data={item}
        renderMode="review"
        defaultValue={{ type: 'dictation', text: typed }}
        outcome={evaluate(item, { type: 'dictation', text: typed })}
      />,
    );
    const wrong = container.querySelector('.lk-dc-word[data-state="incorrect"]') as HTMLElement;
    const marks = [...wrong.querySelectorAll('.lk-dc-op')].map(
      (op) => [op.getAttribute('data-op'), op.textContent] as [string | null, string | null],
    );
    cleanup();
    return marks;
  };

  it.each<[string, string, string, [string, string][]]>([
    [
      'a Thai tone mark typed wrong',
      cp(0xe44, 0xe21, 0xe48),
      cp(0xe44, 0xe21, 0xe49),
      [
        ['equal', cp(0xe44)],
        ['substitute', cp(0xe21, 0xe49)],
      ],
    ],
    [
      'a Thai tone mark typed where there is none, marked as extra',
      cp(0xe44, 0xe21),
      cp(0xe44, 0xe21, 0xe48),
      [
        ['equal', cp(0xe44)],
        ['extra', cp(0xe21, 0xe48)],
      ],
    ],
    [
      'an Arabic vowel mark typed wrong',
      cp(0x643, 0x64e, 0x62a, 0x64e, 0x628),
      cp(0x643, 0x64e, 0x62a, 0x650, 0x628),
      [
        ['equal', cp(0x643, 0x64e)],
        ['substitute', cp(0x62a, 0x650)],
        ['equal', cp(0x628)],
      ],
    ],
    [
      'the alef of a lam-alef typed wrong',
      cp(0x633, 0x644, 0x627, 0x645),
      cp(0x633, 0x644, 0x623, 0x645),
      [
        ['equal', cp(0x633)],
        ['substitute', cp(0x644, 0x623)],
        ['equal', cp(0x645)],
      ],
    ],
    [
      'the second letter of a Hindi conjunct typed wrong',
      cp(0x915, 0x94d, 0x937, 0x93e),
      cp(0x915, 0x94d, 0x938, 0x93e),
      [['substitute', cp(0x915, 0x94d, 0x938, 0x93e)]],
    ],
    [
      'a skin tone typed wrong',
      `ok ${cp(0x1f44d, 0x1f3fd)}`,
      `ok ${cp(0x1f44d, 0x1f3fe)}`,
      [['substitute', cp(0x1f44d, 0x1f3fe)]],
    ],
    [
      'a Thai SARA AM typed for a SARA AA',
      cp(0xe19, 0xe49, 0xe32),
      cp(0xe19, 0xe49, 0xe33),
      [['substitute', cp(0xe19, 0xe49, 0xe33)]],
    ],
    [
      'the letter of a Sinhala conjunct asked for with a joiner',
      cp(0xdc1, 0xdca, 0x200d, 0xdbb, 0xdd3),
      cp(0xdc1, 0xdca, 0x200d, 0xdbb, 0xdd2),
      [['substitute', cp(0xdc1, 0xdca, 0x200d, 0xdbb, 0xdd2)]],
    ],
    [
      'a Malayalam consonant under a dot reph',
      cp(0xd4e, 0xd15),
      cp(0xd4e, 0xd16),
      [['substitute', cp(0xd4e, 0xd16)]],
    ],
    [
      'a Gurmukhi letter set under the consonant before its virama',
      cp(0xa2a, 0xa4d, 0xa30, 0xa47, 0xa2e),
      cp(0xa2a, 0xa4d, 0xa2f, 0xa47, 0xa2e),
      [
        ['substitute', cp(0xa2a, 0xa4d, 0xa2f, 0xa47)],
        ['equal', cp(0xa2e)],
      ],
    ],
    [
      'the Tamil conjunct KSSA typed for KA and CA',
      cp(0xb95, 0xbcd, 0xb9a),
      cp(0xb95, 0xbcd, 0xbb7),
      [['substitute', cp(0xb95, 0xbcd, 0xbb7)]],
    ],
    [
      'a Chakma letter stacked under its virama',
      cp(0x11107, 0x11133, 0x11108),
      cp(0x11107, 0x11133, 0x11109),
      [['substitute', cp(0x11107, 0x11133, 0x11109)]],
    ],
    [
      'a Mongolian vowel separator typed where there is none, drawn into the vowel after it',
      cp(0x1821, 0x182e, 0x1821),
      cp(0x1821, 0x182e, 0x180e, 0x1821),
      [
        ['equal', cp(0x1821, 0x182e)],
        ['extra', cp(0x180e, 0x1821)],
      ],
    ],
  ])('marks the whole cluster for %s', (_label, transcript, typed, expected) => {
    expect(marksOf({ ...data, transcript }, typed)).toEqual(expected);
  });

  it.each<[string, string, string, [string, string][]]>([
    [
      'the Tamil letter after a visible virama',
      cp(0xbaa, 0xb9f, 0xbcd, 0xb9f, 0xbae, 0xbcd),
      cp(0xbaa, 0xb9f, 0xbcd, 0xb9a, 0xbae, 0xbcd),
      [
        ['equal', cp(0xbaa, 0xb9f, 0xbcd)],
        ['substitute', cp(0xb9a)],
        ['equal', cp(0xbae, 0xbcd)],
      ],
    ],
    [
      'the Sinhala letter after an al-lakuna with no joiner',
      cp(0xd85, 0xd9a, 0xdca, 0xd9a),
      cp(0xd85, 0xd9a, 0xdca, 0xda0),
      [
        ['equal', cp(0xd85, 0xd9a, 0xdca)],
        ['substitute', cp(0xda0)],
      ],
    ],
    [
      'a Gurmukhi letter after its virama that the font does not set under the consonant',
      cp(0xa38, 0xa4d, 0xa15),
      cp(0xa38, 0xa4d, 0xa16),
      [
        ['equal', cp(0xa38, 0xa4d)],
        ['substitute', cp(0xa16)],
      ],
    ],
    [
      'the Tamil CA typed after KA and its virama, which is no conjunct',
      cp(0xb95, 0xbcd, 0xbb7),
      cp(0xb95, 0xbcd, 0xb9a),
      [
        ['equal', cp(0xb95, 0xbcd)],
        ['substitute', cp(0xb9a)],
      ],
    ],
    [
      'the correct letter after a missing consonant and its virama',
      cp(0x92d, 0x915, 0x94d, 0x924),
      cp(0x92d, 0x94d, 0x924),
      [
        ['equal', cp(0x92d)],
        ['missing', `${LRM}•${cp(0x94d)}${LRM}`],
        ['equal', cp(0x924)],
      ],
    ],
  ])(
    'leaves %s as its own mark, since it is drawn apart',
    (_label, transcript, typed, expected) => {
      expect(marksOf({ ...data, transcript }, typed)).toEqual(expected);
    },
  );

  it.each<[string, string, string, string, string]>([
    [
      'a number meets an Arabic word',
      'ar',
      'ولد عام 2024 في القاهرة',
      'ولد عام 2024في القاهرة',
      `${RLM}•${RLM}`,
    ],
    [
      'an Arabic word meets an English one',
      'en',
      'I read كتاب today',
      'I read كتابtoday',
      `${LRM}•${LRM}`,
    ],
    ['two English words meet', 'en', 'the cat', 'thecat', `${LRM}•${LRM}`],
  ])(
    'lays out the bullet for a missing space where %s in the content direction when its neighbours disagree',
    (_label, locale, transcript, typed, bullet) => {
      const item: DictationData = { ...data, locale, transcript };
      const value = { type: 'dictation', text: typed } as const;
      const { container } = render(
        <Dictation
          data={item}
          renderMode="review"
          defaultValue={value}
          outcome={evaluate(item, value)}
        />,
      );
      const missing = container.querySelector('.lk-dc-diff .lk-dc-op[data-op="missing"]');
      expect(missing?.textContent).toBe(bullet);
    },
  );

  it('keeps a bullet missing, not wrong, whatever marks sit on it', () => {
    const marks = marksOf(
      { ...data, locale: 'th', transcript: cp(0xe14, 0xe35, 0x20, 0xe01) },
      cp(0xe35, 0x20, 0xe01),
    );
    expect(marks[0]?.[0]).toBe('missing');
    // A missing consonant whose tone mark was typed wrong: still missing.
    const wrongMark = marksOf(
      { ...data, locale: 'th', transcript: cp(0xe44, 0xe21, 0xe48, 0x20, 0xe14, 0xe35) },
      cp(0xe44, 0xe49, 0x20, 0xe14, 0xe35),
    );
    expect(wrongMark.map(([op]) => op)).toEqual(['equal', 'missing']);
  });

  it('keeps a run of correct characters in one span, so an engine shapes it whole', () => {
    expect(marksOf({ ...data, transcript: 'kitten' }, 'kitxen')).toEqual([
      ['equal', 'kit'],
      ['substitute', 'x'],
      ['equal', 'en'],
    ]);
  });

  it('turns common ligatures off only in runs whose letters are Latin, Greek or Cyrillic', () => {
    const item: DictationData = {
      ...data,
      transcript: `office ${cp(0x1a20, 0x1a60, 0x1a26, 0x1a63)}`,
    };
    const value = {
      type: 'dictation',
      text: `offlce ${cp(0x1a20, 0x1a60, 0x1a27, 0x1a63)}`,
    } as const;
    const { container } = render(
      <Dictation
        data={item}
        renderMode="review"
        defaultValue={value}
        outcome={evaluate(item, value)}
      />,
    );
    const ops = [...container.querySelectorAll('.lk-dc-diff .lk-dc-op')].map((op) => [
      op.textContent,
      op.getAttribute('data-ligatures'),
    ]);
    expect(ops).toContainEqual(['l', 'decorative']);
    expect(ops).toContainEqual([cp(0x1a20, 0x1a60, 0x1a27, 0x1a63), null]);
  });

  it('works out the bullets of a long word in linear time', () => {
    const emoji = cp(0x1f600);
    const word = diffDictationChars(emoji.repeat(2000), 'x');
    const eighth = diffDictationChars(emoji.repeat(250), 'x');
    expect(bulletDirections(word, undefined).size).toBe(1999);
    // Timed apart from drawing, whose cost would hide it. The same 2,000
    // missing emoji as one word and as eight: a search per bullet through every
    // character of its word makes the one word about eight times slower than
    // the eight.
    expect(
      slowdown(
        () => bulletDirections(word, undefined),
        repeatedly(8, () => bulletDirections(eighth, undefined)),
      ),
    ).toBeLessThan(3);
  });

  it.each<[string, string, string, string, string]>([
    [
      'a digit missing from a number in Arabic text',
      'ar',
      'ولد عام 2024',
      'ولد عام 204',
      `${LRM}•${LRM}`,
    ],
    [
      'an Arabic-Indic digit missing',
      'ar',
      cp(0x661, 0x662, 0x663),
      cp(0x661, 0x663),
      `${LRM}•${LRM}`,
    ],
    [
      'a Latin letter missing in Arabic text',
      'ar',
      'اشتريت iphone',
      'اشتريت iphon',
      `${LRM}•${LRM}`,
    ],
    ['an Arabic letter missing', 'ar', 'كتاب جديد', 'كتا جديد', `${RLM}•${RLM}`],
    ['a Hebrew letter missing', 'he', 'שלום', 'שלם', `${RLM}•${RLM}`],
    ['a Latin letter missing in Latin text', 'en', 'kitten', 'kiten', `${LRM}•${LRM}`],
    [
      'an N’Ko digit missing',
      'en',
      `code ${cp(0x7c1, 0x7c2, 0x7c3)} here`,
      `code ${cp(0x7c2, 0x7c3)} here`,
      `${RLM}•${RLM}`,
    ],
    // A sign beside a number is laid out with the number, as a European number is.
    [
      'a shekel sign missing before a number in Hebrew',
      'he',
      'המחיר ₪50 היום',
      'המחיר 50 היום',
      `${LRM}•${LRM}`,
    ],
    [
      'a degree sign missing after a number in Hebrew',
      'he',
      'חום 30° היום',
      'חום 30 היום',
      `${LRM}•${LRM}`,
    ],
  ])(
    'lays out the bullet for %s in the direction of the character it stands for',
    (_label, locale, transcript, typed, bullet) => {
      const marks = marksOf({ ...data, locale, transcript }, typed);
      expect(marks.find(([op]) => op === 'missing')?.[1]).toBe(bullet);
    },
  );

  it.each<[string, Partial<DictationData>, string, string | null]>([
    ['a Central Kurdish tag', { locale: 'ckb', transcript: 'القطة تنام' }, 'rtl', 'rtl'],
    ['a Syriac tag', { locale: 'syr', transcript: 'القطة تنام' }, 'rtl', 'rtl'],
    ['the deprecated Hebrew tag', { locale: 'iw', transcript: 'שלום עולם' }, 'rtl', 'rtl'],
    [
      'a Punjabi tag in Arabic script',
      { locale: 'pa-Arab', transcript: 'القطة تنام' },
      'rtl',
      'rtl',
    ],
    ['an Arabic tag in Latin script', { locale: 'ar-Latn', transcript: 'al qitta' }, 'ltr', 'ltr'],
    [
      'a Kurdish tag in Latin script',
      { locale: 'ku-Latn', transcript: 'pisik radize' },
      'ltr',
      'ltr',
    ],
    // A language written in both directions names none: the text decides.
    [
      'a bare Kurdish tag over Arabic-script text',
      { locale: 'ku', transcript: 'پشیلەکە' },
      'auto',
      'rtl',
    ],
    [
      'a bare Kurdish tag over Latin text',
      { locale: 'ku', transcript: 'pisik radize' },
      'auto',
      'ltr',
    ],
    ['an underscore tag', { locale: 'ar_EG', transcript: 'al qitta' }, 'rtl', 'rtl'],
    ['an Egyptian Arabic tag', { locale: 'arz', transcript: 'iPhone gdid' }, 'rtl', 'rtl'],
    ['a Book Pahlavi script subtag', { locale: 'pal-Phlv', transcript: 'x' }, 'rtl', 'rtl'],
    // A script code for no particular script names no direction: the language does.
    [
      'an Arabic tag with the Common script code',
      { locale: 'ar-Zyyy', transcript: 'x' },
      'rtl',
      'rtl',
    ],
    // A private-use tag names nothing.
    ['a private-use tag', { locale: 'x-arab', transcript: 'the cat' }, 'auto', 'ltr'],
    // An author's right-to-left mark before a Latin word lays the words out right to left.
    [
      'no tag, over text that starts with a right-to-left mark',
      { transcript: `${cp(0x200f)}iPhone جديد` },
      'auto',
      'rtl',
    ],
    // No locale: the title reads its own text, the rest the transcript's first
    // letter, whatever the learner typed first.
    ['no tag, over Arabic text', { transcript: 'القطة تنام' }, 'auto', 'rtl'],
    ['no tag, over text that starts with a tatweel', { transcript: 'ـمرحبا بك' }, 'auto', 'rtl'],
    // Nothing to go by: the list inherits the interface's direction.
    ['no tag and no letter', { transcript: '2024 1999' }, 'auto', null],
  ])('takes the content direction for %s', (_label, over, titleDir, contentDir) => {
    const item = { ...data, ...over } as DictationData;
    const typed = `the ${item.transcript}x`;
    const { container } = render(
      <Dictation
        data={item}
        renderMode="review"
        defaultValue={{ type: 'dictation', text: typed }}
        outcome={evaluate(item, { type: 'dictation', text: typed })}
      />,
    );
    expect(container.querySelector('.lk-dc-title')).toHaveAttribute('dir', titleDir);
    expect(words().getAttribute('dir')).toBe(contentDir);
    expect(container.querySelector('.lk-dc-diff')?.getAttribute('dir')).toBe(contentDir);
    for (const text of container.querySelectorAll('.lk-dc-word-text')) {
      expect(text).toHaveAttribute('dir', contentDir ?? 'auto');
    }
  });

  it('renders stale data whose locale is not a string, in production, reading no direction from it', () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      const stale = { ...data, locale: 42 } as unknown as DictationData;
      const typed = { type: 'dictation', text: 'The cat sat on the mat.' } as const;
      const { container } = render(
        <Dictation
          data={stale}
          renderMode="review"
          defaultValue={typed}
          outcome={evaluate(data, typed)}
        />,
      );
      expect(container.querySelector('.lk-dc-title')).toHaveAttribute('dir', 'auto');
      expect(container.querySelector('.lk-dc-title')).not.toHaveAttribute('lang');
      expect(words()).toHaveAttribute('dir', 'ltr');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('writes a tag with underscores as the hyphenated tag lang accepts', () => {
    const item: DictationData = { ...data, locale: 'ar_EG', transcript: 'القطة تنام' };
    const { container } = render(<Dictation data={item} />);
    expect(container.querySelector('.lk-dc-title')).toHaveAttribute('lang', 'ar-EG');
  });

  it('names the form by its title only when the title has something to say', () => {
    const { container } = render(<Dictation data={{ ...data, title: ` ${cp(0x200b)} ` }} />);
    expect(screen.getByRole('textbox', { name: 'Type what you hear' })).toBeInTheDocument();
    expect(container.querySelector('form')).not.toHaveAttribute('aria-labelledby');
  });

  it('counts hint words as the scorer counts them, across the byte-order mark, Greek accents and tatweel', () => {
    const cases: [string, number][] = [
      [`the${cp(0xfeff)}cat sat`, 2],
      [`Good morning, Anna${cp(0xfeff)}Maria.`, 3],
      [`x ${cp(0x1fef)} y`, 2],
      [`x ${cp(0x1ffd)} y`, 2],
      [`${cp(0x645, 0x631)} ${cp(0x640, 0x640)} ${cp(0x62d, 0x628)}`, 2],
      [`it${cp(0xff40)}s ${cp(0xff40)} fine`, 2],
    ];
    for (const [transcript, count] of cases) {
      const item: DictationData = { ...withHints, transcript };
      render(<Dictation data={item} />);
      expect([
        transcript,
        screen.getByRole('button', { name: /Reveal the next word/ }).textContent,
      ]).toEqual([transcript, `Reveal the next word (0 of ${count} shown)`]);
      cleanup();
    }
  });
});

describe('dictation reaches the screen through the SDK’s own renderers', () => {
  beforeEach(() => {
    stubMediaElement();
  });

  it('is dispatched by <ActivitySequence> instead of falling to the unsupported notice', async () => {
    const user = userEvent.setup();
    const onFinished = vi.fn();
    render(<ActivitySequence activities={[data]} onFinished={onFinished} />);
    expect(screen.queryByText(/no renderer/i)).not.toBeInTheDocument();
    await user.type(box(), 'The cat sat on the mat.');
    await user.click(check());
    expect(onFinished).toHaveBeenCalled();
    expect(onFinished.mock.calls[0]?.[0][0]).toMatchObject({ kind: 'scored' });
  });

  it('records its raw response through the sequence in exam mode', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onFinished = vi.fn();
    render(
      <ActivitySequence
        activities={[projectionOf(data)]}
        renderMode="exam"
        onSubmit={onSubmit}
        onFinished={onFinished}
      />,
    );
    await user.type(box(), 'the cat');
    await user.click(screen.getByRole('button', { name: 'Submit answers' }));
    expect(onSubmit).toHaveBeenCalledWith(
      { type: 'dictation', text: 'the cat' },
      expect.objectContaining({ slotId: '0', activityId: 'dc1' }),
    );
    expect(onFinished.mock.calls[0]?.[0][0]).toMatchObject({ kind: 'responded' });
  });

  it('is dispatched by <ActivityPreview> once the draft is complete', () => {
    render(<ActivityPreview draft={twoRecordings} />);
    expect(screen.queryByText(/no renderer/i)).not.toBeInTheDocument();
    expect(box()).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Slow recording' })).toBeInTheDocument();
  });

  it('shows an editor the preview notice while the draft is unfinished', () => {
    render(<ActivityPreview draft={{ ...data, transcript: '' }} />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('note')).toBeInTheDocument();
  });

  it('previews a marked answer in review from the draft alone', () => {
    render(
      <ActivityPreview
        draft={data}
        renderMode="review"
        response={{ type: 'dictation', text: 'The cat sat on the met.' }}
      />,
    );
    expect(wordStates()).toEqual([
      'correct',
      'correct',
      'correct',
      'correct',
      'correct',
      'incorrect',
    ]);
  });
});
