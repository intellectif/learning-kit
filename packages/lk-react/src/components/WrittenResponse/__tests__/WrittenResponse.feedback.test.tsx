import type {
  AiWritingFeedbackRequest,
  AiWritingFeedbackResult,
  InteractionEvent,
  WrittenResponseData,
} from '@intellectif/lk-core';
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type LearnerAi, LkAiProvider } from '../../../ai/LkAiProvider.js';
import { useAiWritingFeedback } from '../../../ai/useAiHelp.js';
import { ActivitySequence } from '../../ActivitySequence/index.js';
import { WrittenResponse } from '../index.js';

/**
 * Feedback on a draft: asked for before submit, in practice only, and shown
 * only when every correction quotes what the learner wrote. What is under
 * test is where it appears and where it never does, what a model is told,
 * what a learner is shown — the indicative score as an indication — and that
 * a revision makes the feedback say it is about an earlier draft.
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const essay: WrittenResponseData = {
  schemaVersion: '1.0',
  type: 'written-response',
  id: 'wr1',
  title: 'Your weekend',
  prompt: 'Describe your weekend.',
  minWords: 3,
  maxWords: 60,
  rubric: {
    criteria: [
      { name: 'Grammar', weight: 1 },
      { name: 'Task', weight: 1 },
    ],
  },
};

const DRAFT = 'I go to the market and buyed bread.';

const good = (request: AiWritingFeedbackRequest): AiWritingFeedbackResult => ({
  text: `Draft ${request.draftNumber}: mind your past tenses.`,
  corrections: [{ original: 'buyed', corrected: 'bought', explanation: 'Irregular verb.' }],
  criteria: [
    { name: 'Grammar', score: 0, comment: 'Two tense mistakes.' },
    { name: 'Task', score: 1 },
  ],
  provenance: { model: 'model-1' },
});

const port = (answer: (request: AiWritingFeedbackRequest) => unknown = good) =>
  vi.fn(async (request: AiWritingFeedbackRequest) => answer(request) as AiWritingFeedbackResult);

const ask = () => screen.getByRole('button', { name: 'Get feedback on my draft' });
const typeDraft = async (user: ReturnType<typeof userEvent.setup>, text = DRAFT) => {
  await user.type(screen.getByRole('textbox'), text);
};

describe('where feedback on a draft is offered', () => {
  it('nowhere without a port', () => {
    render(<WrittenResponse data={essay} />);
    expect(screen.queryByRole('button', { name: 'Get feedback on my draft' })).toBeNull();
  });

  it('in practice, before submit, from a component prop or the provider', () => {
    const writingFeedback = port();
    render(<WrittenResponse data={essay} ai={{ writingFeedback }} />);
    expect(ask()).toBeInTheDocument();
    cleanup();
    render(
      <LkAiProvider ai={{ writingFeedback }}>
        <WrittenResponse data={essay} />
      </LkAiProvider>,
    );
    expect(ask()).toBeInTheDocument();
  });

  it('never in an exam or a review, or where the author or the paper switched explanations off', () => {
    const ai: LearnerAi = { writingFeedback: port() };
    for (const props of [
      { renderMode: 'exam' as const },
      { renderMode: 'review' as const },
      { disabled: true },
      { data: { ...essay, ai: { explanations: false } } },
      { delivery: { ai: { explanations: false } } },
      { delivery: { feedback: false } },
      { delivery: { solutions: false } },
      { delivery: { ai: false } },
    ]) {
      render(<WrittenResponse data={essay} ai={ai} {...props} />);
      expect(
        screen.queryByRole('button', { name: 'Get feedback on my draft' }),
        JSON.stringify(props),
      ).toBeNull();
      cleanup();
    }
  });

  it('in a question set in practice, and never in one sat as an exam', () => {
    const writingFeedback = port();
    render(
      <LkAiProvider ai={{ writingFeedback }}>
        <ActivitySequence activities={[essay]} />
      </LkAiProvider>,
    );
    expect(ask()).toBeInTheDocument();
    cleanup();
    render(
      <LkAiProvider ai={{ writingFeedback }}>
        <ActivitySequence activities={[essay]} renderMode="exam" />
      </LkAiProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Get feedback on my draft' })).toBeNull();
  });
});

describe('asking for feedback', () => {
  it('tells the model the draft and the rubric, and shows the feedback as feedback, not a grade', async () => {
    const user = userEvent.setup();
    const writingFeedback = port();
    const onInteraction = vi.fn<(event: InteractionEvent) => void>();
    render(<WrittenResponse data={essay} ai={{ writingFeedback }} onInteraction={onInteraction} />);
    await typeDraft(user);
    await user.click(ask());

    const panel = await screen.findByRole('region', { name: 'Feedback on your draft' });
    const [request] = writingFeedback.mock.calls[0] as [AiWritingFeedbackRequest];
    expect(request).toMatchObject({
      feature: 'writing-feedback',
      draftNumber: 1,
      previousFeedback: [],
      facts: { text: DRAFT, wordCount: 8, rubric: [{ name: 'Grammar' }, { name: 'Task' }] },
    });
    expect(panel).toHaveTextContent('Draft 1: mind your past tenses.');
    const corrections = screen.getByRole('list', { name: 'Suggested corrections' });
    expect(corrections).toHaveTextContent('buyed');
    expect(corrections).toHaveTextContent('bought');
    expect(corrections).toHaveTextContent('Irregular verb.');
    expect(panel).toHaveTextContent('Two tense mistakes.');
    expect(panel).toHaveTextContent('Indicative score: 50%. Not a grade.');
    expect(panel).toHaveTextContent('Written by AI. It can make mistakes.');
    // Focus follows the feedback from the button that asked.
    expect(document.activeElement).toBe(panel);

    const shown = onInteraction.mock.calls
      .map(([event]) => event)
      .find((event) => event.type === 'ai-writing-feedback-shown');
    expect(shown?.payload).toEqual({
      draftNumber: 1,
      corrections: 1,
      indicativeScore: 0.5,
      provenance: { model: 'model-1' },
    });
  });

  it('says when the draft has changed since, and asks again with what was said before', async () => {
    const user = userEvent.setup();
    const writingFeedback = port();
    render(<WrittenResponse data={essay} ai={{ writingFeedback, maxWritingFeedback: 2 }} />);
    await typeDraft(user);
    await user.click(ask());
    await screen.findByRole('region', { name: 'Feedback on your draft' });
    expect(screen.queryByText('You have changed your text since this feedback.')).toBeNull();

    await user.type(screen.getByRole('textbox'), ' Then I went home.');
    expect(screen.getByText('You have changed your text since this feedback.')).toBeInTheDocument();

    await user.click(ask());
    await screen.findByText(/Draft 2:/);
    const [second] = writingFeedback.mock.calls[1] as [AiWritingFeedbackRequest];
    expect(second.draftNumber).toBe(2);
    expect(second.previousFeedback).toEqual(['Draft 1: mind your past tenses.']);
    expect(screen.queryByText('You have changed your text since this feedback.')).toBeNull();
    // Two of two used.
    expect(screen.getByText('No more feedback for this answer.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Get feedback on my draft' })).toBeNull();
  });

  it('refuses feedback that corrects words the learner never wrote, says so, and does not count it', async () => {
    const user = userEvent.setup();
    const writingFeedback = port(() => ({
      text: 'Mind your verbs.',
      corrections: [{ original: 'I goed', corrected: 'I went' }],
    }));
    const onInteraction = vi.fn<(event: InteractionEvent) => void>();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <WrittenResponse
        data={essay}
        ai={{ writingFeedback, maxWritingFeedback: 1 }}
        onInteraction={onInteraction}
      />,
    );
    await typeDraft(user);
    await user.click(ask());
    await screen.findByText('No feedback is available right now.');
    expect(screen.queryByRole('region', { name: 'Feedback on your draft' })).toBeNull();
    expect(screen.queryByText('Mind your verbs.')).toBeNull();
    // Not counted: the one request allowed is still there to use.
    expect(ask()).toBeInTheDocument();
    const refused = onInteraction.mock.calls
      .map(([event]) => event)
      .find((event) => event.type === 'ai-help-refused');
    expect(refused?.payload).toEqual({
      feature: 'writing-feedback',
      reason: 'misquotes-answer',
      draftNumber: 1,
    });
  });

  it('makes one call at a time, however often the button is pressed', async () => {
    const user = userEvent.setup();
    let answer: (value: AiWritingFeedbackResult) => void = () => {};
    const writingFeedback = vi.fn(
      () =>
        new Promise<AiWritingFeedbackResult>((resolve) => {
          answer = resolve;
        }),
    );
    render(<WrittenResponse data={essay} ai={{ writingFeedback }} />);
    await typeDraft(user);
    await user.click(ask());
    await user.click(screen.getByRole('button', { name: 'Reading your draft…' }));
    expect(writingFeedback).toHaveBeenCalledTimes(1);
    await act(async () => {
      answer({ text: 'One reply.' });
    });
    expect(await screen.findByText('One reply.')).toBeInTheDocument();
  });

  it('says so when the port fails, counts nothing, and lets the learner ask again', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const writingFeedback = vi
      .fn<(request: AiWritingFeedbackRequest) => Promise<AiWritingFeedbackResult>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementation(async (request) => good(request));
    render(<WrittenResponse data={essay} ai={{ writingFeedback, maxWritingFeedback: 1 }} />);
    await typeDraft(user);
    await user.click(ask());
    await screen.findByText('No feedback is available right now.');
    await user.click(ask());
    await screen.findByRole('region', { name: 'Feedback on your draft' });
    const [second] = writingFeedback.mock.calls[1] as [AiWritingFeedbackRequest];
    expect(second.draftNumber).toBe(1);
    expect(screen.getByText('No more feedback for this answer.')).toBeInTheDocument();
  });

  it('asks in the learner’s language, or else in the page’s', async () => {
    const user = userEvent.setup();
    const writingFeedback = port();
    render(
      <WrittenResponse data={essay} locale="pt-BR" ai={{ writingFeedback, learnerLocale: 'es' }} />,
    );
    await typeDraft(user);
    await user.click(ask());
    await screen.findByRole('region', { name: 'Feedback on your draft' });
    cleanup();
    render(<WrittenResponse data={essay} locale="pt-BR" ai={{ writingFeedback }} />);
    await typeDraft(user);
    await user.click(ask());
    await screen.findByRole('region', { name: 'Feedback on your draft' });
    expect(
      writingFeedback.mock.calls.map(
        ([request]) => (request as AiWritingFeedbackRequest).learnerLocale,
      ),
    ).toEqual(['es', 'pt-BR']);
  });

  it('asks about the draft a controlled component is given', async () => {
    const user = userEvent.setup();
    const writingFeedback = port();
    render(
      <WrittenResponse
        data={essay}
        ai={{ writingFeedback }}
        value={{ type: 'written-response', text: DRAFT, wordCount: 8 }}
        onChange={() => {}}
      />,
    );
    await user.click(ask());
    await screen.findByRole('region', { name: 'Feedback on your draft' });
    const [request] = writingFeedback.mock.calls[0] as [AiWritingFeedbackRequest];
    expect(request.facts.text).toBe(DRAFT);
  });

  it('does not ask about an empty draft', async () => {
    const user = userEvent.setup();
    const writingFeedback = port();
    render(<WrittenResponse data={essay} ai={{ writingFeedback }} />);
    expect(ask()).toHaveAttribute('aria-disabled', 'true');
    await user.click(ask());
    expect(writingFeedback).not.toHaveBeenCalled();
  });

  it('abandons a call when the answer is submitted, and keeps the feedback already given on screen', async () => {
    const user = userEvent.setup();
    let signal: AbortSignal | undefined;
    let answer: (value: AiWritingFeedbackResult) => void = () => {};
    let calls = 0;
    const writingFeedback = vi.fn(
      (request: AiWritingFeedbackRequest, options: { signal: AbortSignal }) => {
        calls += 1;
        if (calls === 1) {
          return Promise.resolve(good(request));
        }
        signal = options.signal;
        return new Promise<AiWritingFeedbackResult>((resolve) => {
          answer = resolve;
        });
      },
    );
    render(<WrittenResponse data={essay} ai={{ writingFeedback }} />);
    await typeDraft(user);
    await user.click(ask());
    await screen.findByText(/Draft 1:/);
    await user.click(ask());
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      answer({ text: 'Too late.' });
    });
    expect(screen.queryByText('Too late.')).toBeNull();
    // The feedback the learner had is still there to read; no more can be asked for.
    expect(screen.getByText(/Draft 1:/)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Get feedback on my draft' })).toBeNull(),
    );
    // Nothing is still on its way, for a page that reads the state.
    expect(document.querySelector('.lk-wr-ai')).toHaveAttribute('data-state', 'idle');
  });

  it('forgets the feedback on one question when another takes its place', async () => {
    const user = userEvent.setup();
    const writingFeedback = port();
    const { rerender } = render(<WrittenResponse data={essay} ai={{ writingFeedback }} />);
    await typeDraft(user);
    await user.click(ask());
    await screen.findByRole('region', { name: 'Feedback on your draft' });
    rerender(<WrittenResponse data={{ ...essay, id: 'wr2' }} ai={{ writingFeedback }} />);
    expect(screen.queryByRole('region', { name: 'Feedback on your draft' })).toBeNull();
  });

  it('shows the indicative score as a whole percentage, rounded', async () => {
    const user = userEvent.setup();
    // Grammar 1 of 3 and Task 1 of 1, weighted equally: two thirds.
    const writingFeedback = port(() => ({
      text: 'Nearly.',
      criteria: [
        { name: 'Grammar', score: 1, maxScore: 3 },
        { name: 'Task', score: 1 },
      ],
    }));
    render(<WrittenResponse data={essay} ai={{ writingFeedback }} />);
    await typeDraft(user);
    await user.click(ask());
    expect(await screen.findByText('Indicative score: 67%. Not a grade.')).toBeInTheDocument();
  });
});

describe('a written response a host draws itself', () => {
  function HostEssay({ data, ai }: { data: unknown; ai?: LearnerAi }) {
    const help = useAiWritingFeedback({
      data: data as never,
      response: { type: 'written-response', text: DRAFT, wordCount: 8 },
      submitted: false,
      ...(ai !== undefined ? { ai } : {}),
    });
    return <p>{help.offered ? 'feedback offered' : 'no feedback'}</p>;
  }

  it('gets feedback on the terms the SDK’s own does, and none where the paper says no', () => {
    const writingFeedback = port();
    const renderers = { 'written-response': HostEssay as never };
    render(
      <LkAiProvider ai={{ writingFeedback }}>
        <ActivitySequence activities={[essay]} renderers={renderers} />
      </LkAiProvider>,
    );
    expect(screen.getByText('feedback offered')).toBeInTheDocument();
    cleanup();

    // An exam around it wins, though the host passed no mode and a provider is above.
    render(
      <LkAiProvider ai={{ writingFeedback }}>
        <ActivitySequence activities={[essay]} renderers={renderers} renderMode="exam" />
      </LkAiProvider>,
    );
    expect(screen.getByText('no feedback')).toBeInTheDocument();
    cleanup();

    // So does a paper that switched AI explanations off, though the host passed no policy.
    render(
      <LkAiProvider ai={{ writingFeedback }}>
        <ActivitySequence
          activities={[essay]}
          renderers={renderers}
          delivery={{ ai: { explanations: false } }}
        />
      </LkAiProvider>,
    );
    expect(screen.getByText('no feedback')).toBeInTheDocument();
  });
});

describe('useAiWritingFeedback on its own', () => {
  const response = { type: 'written-response', text: DRAFT, wordCount: 8 } as const;

  it('offers nothing without a port', () => {
    const { result } = renderHook(() =>
      useAiWritingFeedback({ data: essay, response, submitted: false }),
    );
    expect(result.current.offered).toBe(false);
  });

  it('asks nothing past the limit, however it is asked, and reports no score it did not compute', async () => {
    const writingFeedback = port(() => ({ text: 'Fine.' }));
    const onInteraction = vi.fn<(event: InteractionEvent) => void>();
    const ai: LearnerAi = { writingFeedback, maxWritingFeedback: 1 };
    const { result } = renderHook(() =>
      useAiWritingFeedback({ data: essay, response, submitted: false, ai, onInteraction }),
    );
    await act(async () => {
      result.current.ask();
    });
    await waitFor(() => expect(result.current.used).toBe(1));
    await act(async () => {
      result.current.ask();
    });
    expect(writingFeedback).toHaveBeenCalledTimes(1);
    expect(result.current.latest?.indicativeScore).toBeNull();
    const shown = onInteraction.mock.calls
      .map(([event]) => event)
      .find((event) => event.type === 'ai-writing-feedback-shown');
    expect(shown?.payload).toEqual({ draftNumber: 1, corrections: 0 });
  });

  it('reaches no model where it is not offered, however it is asked', async () => {
    const writingFeedback = port();
    const { result } = renderHook(() =>
      useAiWritingFeedback({
        data: essay,
        response,
        submitted: false,
        renderMode: 'exam',
        ai: { writingFeedback },
      }),
    );
    expect(result.current.offered).toBe(false);
    await act(async () => {
      result.current.ask();
    });
    expect(writingFeedback).not.toHaveBeenCalled();
  });
});
