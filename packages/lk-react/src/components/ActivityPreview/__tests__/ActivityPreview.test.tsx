import {
  createDraft,
  defineActivityType,
  FeedbackSchema,
  type GradeRecord,
  type LearnerResponse,
  type MultipleChoiceData,
  outcomeFromGrade,
  registerActivityType,
  UnknownActivityTypeError,
  type WrittenResponseData,
} from '@intellectif/lk-core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LkIntlProvider } from '../../../i18n/LkIntlProvider.js';
import { DEFAULT_STRINGS } from '../../../i18n/strings.js';
import { checkA11y } from '../../../test-support/a11y.js';
import { stubMediaElement } from '../../../test-support/media.js';
import type { ActivityProps } from '../../types.js';
import { ActivityPreview } from '../index.js';

const counter = () => {
  let next = 0;
  return () => {
    next += 1;
    return `id-${next}`;
  };
};

const capital: MultipleChoiceData = {
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'capital',
  title: 'Capitals',
  question: 'Which city is the capital of Japan?',
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  options: [
    { id: 'tokyo', text: 'Tokyo', isCorrect: true },
    { id: 'seoul', text: 'Seoul', isCorrect: false },
  ],
};

const essay: WrittenResponseData = {
  schemaVersion: '1.0',
  type: 'written-response',
  id: 'essay',
  title: 'Holiday',
  prompt: 'Describe your last holiday.',
  minWords: 1,
  maxWords: 50,
};

const chose = (id: string): LearnerResponse => ({
  type: 'multiple-choice',
  selectedOptionIds: [id],
});

const labelFor = (name: string) => screen.getByRole('radio', { name }).closest('label');

/** The same content with every object's keys in reverse order, nested ones included. */
const reverseKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(reverseKeys);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, field]) => [key, reverseKeys(field)]),
    );
  }
  return value;
};

describe('<ActivityPreview>', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a notice, not the activity, for a draft that is not finished', async () => {
    const { container } = render(
      <ActivityPreview draft={createDraft('multiple-choice', { newId: counter() })} />,
    );
    const notice = screen.getByRole('note');
    expect(notice).toHaveTextContent(DEFAULT_STRINGS.previewIncomplete);
    expect(notice).toHaveAttribute('data-status', 'incomplete');
    expect(screen.queryAllByRole('radio')).toEqual([]);
    expect(await checkA11y(container)).toHaveNoViolations();
  });

  it('says a draft is wrong, rather than unfinished, when it is', () => {
    render(
      <ActivityPreview
        draft={{ ...capital, options: capital.options.map((o) => ({ ...o, isCorrect: true })) }}
      />,
    );
    const notice = screen.getByRole('note');
    expect(notice).toHaveTextContent(DEFAULT_STRINGS.previewInvalid);
    expect(notice).toHaveAttribute('data-status', 'invalid');
  });

  it('hands the issues to fallback, for the editor to list in its own words', () => {
    render(
      <ActivityPreview
        draft={{ ...capital, title: '' }}
        fallback={(result) => (
          <ul aria-label="Still to do">
            {result.issues.map((found) => (
              <li key={`${found.code}:${found.path.join('.')}`}>{found.code}</li>
            ))}
          </ul>
        )}
      />,
    );
    expect(screen.getByRole('list', { name: 'Still to do' })).toHaveTextContent('title_required');
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('renders a complete draft as the activity, answerable in practice', async () => {
    const user = userEvent.setup();
    render(<ActivityPreview draft={capital} />);
    await user.click(screen.getByRole('radio', { name: 'Tokyo' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    // No callback is wired, and nothing throws for the lack of one.
    expect(screen.getByText(/Score 100%/)).toBeInTheDocument();
  });

  it('marks a simulated response in review, scoring it with evaluate()', () => {
    render(<ActivityPreview draft={capital} renderMode="review" response={chose('seoul')} />);
    expect(screen.getByRole('radio', { name: 'Seoul' })).toBeChecked();
    expect(labelFor('Tokyo')).toHaveAttribute('data-correct', 'true');
    expect(labelFor('Seoul')).toHaveAttribute('data-correct', 'false');
  });

  it('shows the error fallback, rather than crashing the page, for a response it cannot mark', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // No selection at all: the scorer cannot read it, and throws.
    const unreadable = { type: 'multiple-choice' } as unknown as LearnerResponse;
    const { rerender } = render(
      <ActivityPreview draft={capital} renderMode="review" response={unreadable} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(DEFAULT_STRINGS.activityFailed);
    // A response it can mark replaces the fallback.
    rerender(<ActivityPreview draft={capital} renderMode="review" response={chose('seoul')} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(labelFor('Seoul')).toHaveAttribute('data-correct', 'false');
  });

  it('shows what a registered scorer threw, even when it threw something other than an Error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const thrown: unknown = 'scorer bug';
    registerActivityType(
      defineActivityType<{ type: string }, { type: string }>({
        type: 'preview-throwing-scorer',
        schema: FeedbackSchema as never,
        scoring: {
          kind: 'sync',
          score: () => {
            throw thrown;
          },
        },
      }),
    );
    render(
      <ActivityPreview
        draft={{ type: 'preview-throwing-scorer', id: 't1', title: 'Throws' }}
        renderMode="review"
        response={{ type: 'preview-throwing-scorer' } as unknown as LearnerResponse}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('scorer bug');
  });

  it('seeds a response in exam without grading it, and leaves it editable', async () => {
    const user = userEvent.setup();
    render(<ActivityPreview draft={capital} renderMode="exam" response={chose('seoul')} />);
    expect(screen.getByRole('radio', { name: 'Seoul' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Tokyo' }));
    expect(screen.getByRole('radio', { name: 'Tokyo' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(screen.queryByText(/Score/)).toBeNull();
    expect(labelFor('Tokyo')).not.toHaveAttribute('data-correct');
  });

  it('shows a written response as awaiting its grade, unless it is given one', () => {
    const response: LearnerResponse = {
      type: 'written-response',
      text: 'I went to the sea.',
      wordCount: 5,
    };
    const { unmount } = render(
      <ActivityPreview draft={essay} renderMode="review" response={response} />,
    );
    expect(screen.getByText(DEFAULT_STRINGS.awaitingGrade)).toBeInTheDocument();
    unmount();

    const grade: GradeRecord = {
      score: 0.8,
      maxScore: 1,
      passed: true,
      feedback: 'Well argued.',
      requiresHumanReview: false,
      criteria: [],
    };
    render(
      <ActivityPreview
        draft={essay}
        renderMode="review"
        response={response}
        outcome={outcomeFromGrade(grade)}
      />,
    );
    expect(screen.getByText('Well argued.')).toBeInTheDocument();
  });

  it('starts afresh when the simulated response changes', () => {
    const { rerender } = render(<ActivityPreview draft={capital} response={chose('seoul')} />);
    expect(screen.getByRole('radio', { name: 'Seoul' })).toBeChecked();
    rerender(<ActivityPreview draft={capital} response={chose('tokyo')} />);
    expect(screen.getByRole('radio', { name: 'Tokyo' })).toBeChecked();
  });

  it('does not start again for the same response with its keys in another order', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ActivityPreview draft={capital} response={chose('seoul')} />);
    await user.click(screen.getByRole('radio', { name: 'Tokyo' }));
    rerender(
      <ActivityPreview
        draft={capital}
        response={{ selectedOptionIds: ['seoul'], type: 'multiple-choice' }}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Tokyo' })).toBeChecked();
  });

  it('follows a draft from unfinished to complete', () => {
    const { rerender } = render(<ActivityPreview draft={{ ...capital, question: '' }} />);
    expect(screen.getByRole('note')).toHaveTextContent(DEFAULT_STRINGS.previewIncomplete);
    rerender(<ActivityPreview draft={capital} />);
    expect(screen.queryByRole('note')).toBeNull();
    expect(screen.getByRole('radio', { name: 'Tokyo' })).toBeInTheDocument();
  });

  it('keeps what the author is doing when handed the same content in a new object', async () => {
    const user = userEvent.setup();
    const copy = () => JSON.parse(JSON.stringify(capital)) as MultipleChoiceData;
    const { rerender } = render(<ActivityPreview draft={copy()} />);
    await user.click(screen.getByRole('radio', { name: 'Seoul' }));
    // An editor that rebuilds its payload on every edit hands over a new object
    // with the same content: nothing the author did here may be lost.
    rerender(<ActivityPreview draft={copy()} />);
    expect(screen.getByRole('radio', { name: 'Seoul' })).toBeChecked();
    // Keys in another order are the same content: what a JSON column hands back.
    const reordered = reverseKeys(copy());
    expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(capital));
    rerender(<ActivityPreview draft={reordered} />);
    expect(screen.getByRole('radio', { name: 'Seoul' })).toBeChecked();
    // Changed content is a different question, and starts again.
    rerender(
      <ActivityPreview draft={{ ...copy(), question: 'Which city is the capital of Peru?' }} />,
    );
    expect(screen.getByRole('radio', { name: 'Seoul' })).not.toBeChecked();
  });

  it('checks a draft changed in place again', () => {
    const draft: Record<string, unknown> = { ...capital };
    const { rerender } = render(<ActivityPreview draft={draft} />);
    expect(screen.getByRole('radio', { name: 'Tokyo' })).toBeInTheDocument();
    // A store that mutates its object, and renders again with the same reference.
    draft.title = '';
    rerender(<ActivityPreview draft={draft} />);
    expect(screen.getByRole('note')).toHaveTextContent(DEFAULT_STRINGS.previewIncomplete);
  });

  it('tells apart draft values that JSON writes alike', () => {
    const withIssues = (draft: unknown) => (
      <ActivityPreview
        draft={draft}
        fallback={(result) => (
          <ul aria-label="Issues">
            {result.issues.map((found) => (
              <li key={`${found.code}:${found.path.join('.')}`}>{found.code}</li>
            ))}
          </ul>
        )}
      />
    );
    const issues = () => screen.queryByRole('list', { name: 'Issues' });
    // A non-finite number and null decide different issues.
    const { rerender } = render(withIssues({ ...essay, minWords: Number.NaN }));
    expect(issues()).toHaveTextContent('wr_min_words_invalid');
    rerender(withIssues({ ...essay, minWords: null }));
    expect(issues()).toHaveTextContent('wr_min_words_required');
    // A Date is not the string it serialises to...
    rerender(withIssues({ ...essay, title: new Date(0) }));
    expect(issues()).toHaveTextContent('invalid_type');
    rerender(withIssues({ ...essay, title: new Date(0).toISOString() }));
    expect(issues()).toBeNull();
    // ...no object stands in for `undefined`, and `undefined` is not `null`.
    rerender(withIssues({ ...essay, media: { lkUndefined: true } }));
    expect(issues()).toHaveTextContent('media_type_required');
    rerender(withIssues({ ...essay, media: null }));
    expect(issues()).toHaveTextContent('null_not_allowed');
    rerender(withIssues({ ...essay, media: undefined }));
    expect(issues()).toBeNull();
  });

  it('compares a response by identity where JSON cannot describe it', () => {
    const mounts = vi.fn();
    function Probe({ data }: ActivityProps) {
      useEffect(() => {
        mounts();
      }, []);
      return <p>Custom renderer for {data.id}</p>;
    }
    const preview = (extra: unknown) => (
      <ActivityPreview
        draft={capital}
        renderers={{ 'multiple-choice': Probe }}
        response={
          { type: 'multiple-choice', selectedOptionIds: ['tokyo'], extra } as LearnerResponse
        }
      />
    );
    const cache = new Map([['a', 1]]);
    const { rerender } = render(preview(cache));
    rerender(preview(cache));
    expect(mounts).toHaveBeenCalledTimes(1);
    rerender(preview(new Map([['b', 2]])));
    expect(mounts).toHaveBeenCalledTimes(2);
    // A BigInt, which JSON refuses outright, and a reference back to itself.
    rerender(preview(10n));
    expect(mounts).toHaveBeenCalledTimes(3);
    const looped: Record<string, unknown> = {};
    looped.self = looped;
    rerender(preview(looped));
    expect(mounts).toHaveBeenCalledTimes(4);
    expect(screen.getByText('Custom renderer for capital')).toBeInTheDocument();
  });

  it('keeps a shuffled question in one order across remounts', () => {
    const shuffled: MultipleChoiceData = {
      ...capital,
      shuffle: true,
      options: ['tokyo', 'seoul', 'lima', 'oslo', 'cairo', 'quito'].map((id, index) => ({
        id,
        text: id,
        isCorrect: index === 0,
      })),
    };
    const order = () => screen.getAllByRole('radio').map((radio) => radio.getAttribute('value'));
    const { unmount } = render(<ActivityPreview draft={shuffled} />);
    const first = order();
    unmount();
    render(<ActivityPreview draft={shuffled} renderMode="exam" />);
    expect(order()).toEqual(first);
  });

  it('renders through renderers, which override a built-in as on the sequence', () => {
    function Probe({ data }: ActivityProps) {
      return <p>Custom renderer for {data.id}</p>;
    }
    render(<ActivityPreview draft={capital} renderers={{ 'multiple-choice': Probe }} />);
    expect(screen.getByText('Custom renderer for capital')).toBeInTheDocument();
  });

  it('notes a registered type that has no renderer', () => {
    registerActivityType(
      defineActivityType<{ type: string }, unknown>({
        type: 'preview-probe',
        // Any loose object schema will do: what is under test is the dispatch.
        schema: FeedbackSchema as never,
        scoring: { kind: 'deferred', reason: 'requires_async_grading' },
      }),
    );
    render(<ActivityPreview draft={{ type: 'preview-probe', id: 'p1', title: 'Probe' }} />);
    expect(screen.getByRole('note')).toHaveTextContent(DEFAULT_STRINGS.unsupportedActivity);
  });

  it('throws on wiring errors instead of guessing', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<ActivityPreview draft={{ title: 'No type' }} />)).toThrow(/string `type`/);
    expect(() => render(<ActivityPreview draft={{ ...capital, type: 'matching' }} />)).toThrow(
      UnknownActivityTypeError,
    );
    expect(() =>
      render(
        <ActivityPreview
          draft={capital}
          response={{ type: 'written-response', text: 'x', wordCount: 1 }}
        />,
      ),
    ).toThrow(/"written-response" response for a "multiple-choice" activity/);
    // However unfinished the draft: waiting until it is complete would throw on
    // the very edit that completes it.
    expect(() =>
      render(
        <ActivityPreview
          draft={{ ...capital, title: '' }}
          response={{ type: 'written-response', text: 'x', wordCount: 1 }}
        />,
      ),
    ).toThrow(/"written-response" response for a "multiple-choice" activity/);
  });

  it('passes its strings on to the activity it renders', () => {
    render(<ActivityPreview draft={capital} strings={{ submit: 'Enviar' }} />);
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeInTheDocument();
  });

  it('passes rich text and the interface locale through to the activity', () => {
    const { container } = render(
      <ActivityPreview
        draft={{ ...capital, questionHtml: '<strong>Which</strong> city is the capital?' }}
        sanitizeHtml={(html) => html}
        locale="es"
      />,
    );
    expect(screen.getByText('Which').tagName).toBe('STRONG');
    expect(container.querySelector('[lang="es"]')).not.toBeNull();
  });

  it('translates its notice through the provider', () => {
    render(
      <LkIntlProvider strings={{ previewIncomplete: 'Pregunta sin terminar.' }}>
        <ActivityPreview draft={{ ...capital, title: '' }} />
      </LkIntlProvider>,
    );
    expect(screen.getByRole('note')).toHaveTextContent('Pregunta sin terminar.');
  });

  it('has no accessibility violations once complete', async () => {
    const { container } = render(<ActivityPreview draft={capital} />);
    expect(await checkA11y(container)).toHaveNoViolations();
  });
});

/**
 * A listening item. `<ActivityMedia>` refuses a budgeted recording in `exam`
 * without a binding, and the transport counts nothing without one in `practice`
 * — both right for a real paper, and both wrong for a preview, which binds the
 * recording to a budget kept in memory.
 */
describe('<ActivityPreview> with a recording that has a play limit', () => {
  const budgeted = { type: 'audio', url: '/part2.mp3', alt: 'Part 2', playback: { maxPlays: 2 } };
  const plays = () => document.querySelector('.lk-media-plays');
  const loadMetadata = () =>
    act(() => {
      document.querySelector('audio')?.dispatchEvent(new Event('loadedmetadata'));
    });

  beforeEach(() => {
    stubMediaElement();
  });

  it.each([
    'practice',
    'exam',
  ] as const)('counts plays in memory in %s, so the author hears the limit a learner gets', async (renderMode) => {
    const user = userEvent.setup();
    render(<ActivityPreview draft={{ ...capital, media: budgeted }} renderMode={renderMode} />);
    loadMetadata();
    // Not the error boundary's fallback, in its development or production wording.
    // (The transport has a live notice region of its own, so `role="alert"` would
    // not tell the two apart.)
    expect(document.body).not.toHaveTextContent(DEFAULT_STRINGS.activityFailed);
    expect(document.body).not.toHaveTextContent(/could not be displayed/);
    expect(plays()).toHaveTextContent('2 of 2 plays remaining');
    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(plays()).toHaveTextContent('1 of 2 plays remaining');
  });

  it('counts afresh for a different recording or play limit, and not for a new description', async () => {
    const user = userEvent.setup();
    const withMedia = (media: Record<string, unknown>) => (
      <ActivityPreview draft={{ ...capital, media }} />
    );
    const { rerender } = render(withMedia(budgeted));
    loadMetadata();
    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(plays()).toHaveTextContent('1 of 2 plays remaining');
    // Rewording the description changes no budget.
    rerender(withMedia({ ...budgeted, alt: 'Part 2, the interview' }));
    expect(plays()).toHaveTextContent('1 of 2 plays remaining');
    // Another recording is another budget...
    rerender(withMedia({ ...budgeted, url: '/part3.mp3' }));
    loadMetadata();
    expect(plays()).toHaveTextContent('2 of 2 plays remaining');
    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(plays()).toHaveTextContent('1 of 2 plays remaining');
    // ...and so is another limit on the same recording.
    rerender(withMedia({ ...budgeted, url: '/part3.mp3', playback: { maxPlays: 3 } }));
    loadMetadata();
    expect(plays()).toHaveTextContent('3 of 3 plays remaining');
  });

  it.each<[string, Record<string, unknown>]>([
    [
      'fill-in-the-blanks',
      {
        schemaVersion: '1.0',
        type: 'fill-in-the-blanks',
        id: 'gaps',
        title: 'Gaps',
        passage: 'Yesterday I {{go}} home.',
        blanks: [{ id: 'go', acceptedAnswers: ['went'] }],
        scoringStrategy: 'partial',
        media: budgeted,
      },
    ],
    ['written-response', { ...essay, media: budgeted }],
  ])('renders a %s draft with a limited recording in exam, not the error fallback', (_type, draft) => {
    render(<ActivityPreview draft={draft} renderMode="exam" />);
    loadMetadata();
    // Not the error boundary's fallback, in its development or production wording.
    // (The transport has a live notice region of its own, so `role="alert"` would
    // not tell the two apart.)
    expect(document.body).not.toHaveTextContent(DEFAULT_STRINGS.activityFailed);
    expect(document.body).not.toHaveTextContent(/could not be displayed/);
    expect(plays()).toHaveTextContent('2 of 2 plays remaining');
  });

  it('gives review the native bar and enforces nothing', () => {
    const { container } = render(
      <ActivityPreview draft={{ ...capital, media: budgeted }} renderMode="review" />,
    );
    expect(container.querySelector('audio')).toHaveAttribute('controls');
    expect(plays()).toBeNull();
  });
});
