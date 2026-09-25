import {
  type AiCoachingRequest,
  type AiCoachingResult,
  type InteractionEvent,
  OPEN_DELIVERY_POLICY,
  type ReadAloudData,
  resolveDeliveryPolicy,
  type SpeechAssessment,
} from '@intellectif/lk-core';
import { act, cleanup, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type LearnerAi, LkAiProvider } from '../../../ai/LkAiProvider.js';
import { useAiCoaching } from '../../../ai/useAiHelp.js';
import { SequenceSlotContext } from '../../shared/sequence-slot.js';
import { PronunciationFeedback } from '../index.js';

/**
 * Coaching on a reading's marks: offered under the marks, never in an exam or
 * where the author or the paper switched it off, and shown only when every
 * word it coaches is one the engine marked and every sound one it reported.
 * What is under test is where it appears, what a model is told, what a learner
 * is shown, and what is recorded — never the text.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const item: ReadAloudData = {
  schemaVersion: '1.0',
  type: 'read-aloud',
  id: 'ra1',
  title: 'Read the sentence',
  instructions: 'Read at a natural pace.',
  referenceText: 'The weather is lovely today.',
  locale: 'en-US',
  recording: { maxSeconds: 20 },
  scoring: { dimensions: [{ name: 'accuracy', weight: 1 }] },
};

/** "lovely" mispronounced — its vowel heard as /oʊ/ — and "today" left out. */
const assessment: SpeechAssessment = {
  assessmentVersion: '1.0',
  status: 'assessed',
  task: 'scripted',
  locale: 'en-US',
  referenceText: item.referenceText,
  recordingKey: 'take-1',
  assessor: { kind: 'auto' },
  scale: 100,
  scores: { accuracy: 70, completeness: 80 },
  miscue: 'assessor',
  phonemeAlphabet: 'ipa',
  words: [
    { text: 'The', accuracy: 95, error: 'none' },
    { text: 'weather', accuracy: 90, error: 'none' },
    { text: 'is', accuracy: 92, error: 'none' },
    {
      text: 'lovely',
      accuracy: 40,
      error: 'mispronunciation',
      phonemes: [
        { symbol: 'l', accuracy: 90 },
        { symbol: 'ʌ', accuracy: 20, heardAs: [{ symbol: 'oʊ', score: 60 }] },
        { symbol: 'v', accuracy: 85 },
        { symbol: 'l', accuracy: 88 },
        { symbol: 'i', accuracy: 90 },
      ],
    },
    { text: 'today', error: 'omission' },
  ],
};

const good: AiCoachingResult = {
  text: 'A clear reading with two things to work on.',
  // Out of reading order on purpose: the SDK puts them back in it.
  words: [
    { itemId: 'w5', tip: 'Read every word to the end.' },
    {
      itemId: 'w4',
      tip: 'Open your mouth for a short vowel.',
      sound: { expected: 'ʌ', heard: 'oʊ' },
    },
  ],
  provenance: { model: 'model-1' },
};

const port = (answer: (request: AiCoachingRequest) => unknown = () => good) =>
  vi.fn(
    async (request: AiCoachingRequest, _options: { signal: AbortSignal }) =>
      answer(request) as AiCoachingResult,
  );

const COACH = 'Coach me on this reading';
const button = () => screen.queryByRole('button', { name: COACH });

describe('where coaching is offered', () => {
  it('nowhere without a port', () => {
    render(<PronunciationFeedback data={item} assessment={assessment} />);
    expect(button()).toBeNull();
  });

  it('under the marks, from a prop or the provider', () => {
    const pronunciationCoaching = port();
    const { container } = render(
      <PronunciationFeedback data={item} assessment={assessment} ai={{ pronunciationCoaching }} />,
    );
    // After the word list it explains.
    const words = container.querySelector('.lk-pf-words') as Element;
    const coaching = container.querySelector('.lk-ai-coaching') as Element;
    expect(words.compareDocumentPosition(coaching) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(button()).toBeInTheDocument();
    cleanup();
    render(
      <LkAiProvider ai={{ pronunciationCoaching }}>
        <PronunciationFeedback data={item} assessment={assessment} />
      </LkAiProvider>,
    );
    expect(button()).toBeInTheDocument();
    expect(pronunciationCoaching).not.toHaveBeenCalled();
  });

  it('never in an exam, or where the author or the paper switched explanations or feedback off', () => {
    const ai: LearnerAi = { pronunciationCoaching: port() };
    for (const props of [
      { renderMode: 'exam' as const },
      { data: { ...item, ai: { explanations: false } } },
      { delivery: { ai: { explanations: false } } },
      { delivery: { feedback: false } },
      { delivery: { ai: false } },
    ]) {
      render(<PronunciationFeedback data={item} assessment={assessment} ai={ai} {...props} />);
      expect(button(), JSON.stringify(props)).toBeNull();
      cleanup();
    }
  });

  it('where the paper hides solutions, and where the author switched hints off: a reading has no hidden answer', () => {
    const ai: LearnerAi = { pronunciationCoaching: port() };
    render(
      <PronunciationFeedback
        data={{ ...item, ai: { hints: false } }}
        assessment={assessment}
        ai={ai}
        delivery={{ solutions: false, hints: false, ai: { hints: false } }}
      />,
    );
    expect(button()).toBeInTheDocument();
  });

  it('never inside a paper sat as an exam, whatever the panel is told', () => {
    render(
      <SequenceSlotContext.Provider
        value={{
          captureGroup: 'slot-1',
          renderMode: 'exam',
          delivery: OPEN_DELIVERY_POLICY,
          scoring: undefined,
          triesClosed: false,
          triesState: () => {},
          takeState: () => {},
        }}
      >
        <PronunciationFeedback
          data={item}
          assessment={assessment}
          renderMode="practice"
          ai={{ pronunciationCoaching: port() }}
        />
      </SequenceSlotContext.Provider>,
    );
    expect(button()).toBeNull();
  });

  it('never where the paper around it switched AI explanations off, whatever the panel is told', () => {
    render(
      <SequenceSlotContext.Provider
        value={{
          captureGroup: 'slot-1',
          renderMode: 'review',
          delivery: resolveDeliveryPolicy({ ai: { explanations: false } }),
          scoring: undefined,
          triesClosed: false,
          triesState: () => {},
          takeState: () => {},
        }}
      >
        <PronunciationFeedback
          data={item}
          assessment={assessment}
          delivery={null}
          ai={{ pronunciationCoaching: port() }}
        />
      </SequenceSlotContext.Provider>,
    );
    expect(button()).toBeNull();
  });

  it('not on marks that are not this text’s, nor on evidence the SDK refuses', () => {
    const ai: LearnerAi = { pronunciationCoaching: port() };
    vi.stubEnv('NODE_ENV', 'production');
    for (const evidence of [
      { ...assessment, referenceText: 'Another text.' },
      { ...assessment, status: 'no_speech' as const },
      { ...assessment, scale: 5 } as unknown as SpeechAssessment,
    ]) {
      render(<PronunciationFeedback data={item} assessment={evidence} ai={ai} />);
      expect(button()).toBeNull();
      cleanup();
    }
  });

  it('not without the item’s id and title — and says so to a developer', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(
      <PronunciationFeedback
        data={{ referenceText: item.referenceText, locale: item.locale }}
        assessment={assessment}
        ai={{ pronunciationCoaching: port() }}
      />,
    );
    expect(button()).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('data.id'));
    cleanup();
    for (const half of [{ title: item.title }, { id: item.id }]) {
      render(
        <PronunciationFeedback
          data={{ referenceText: item.referenceText, locale: item.locale, ...half }}
          assessment={assessment}
          ai={{ pronunciationCoaching: port() }}
        />,
      );
      expect(button(), JSON.stringify(half)).toBeNull();
      cleanup();
    }
    warn.mockClear();
    // No port in force, nothing to warn about.
    render(
      <PronunciationFeedback
        data={{ referenceText: item.referenceText, locale: item.locale }}
        assessment={assessment}
      />,
    );
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('asking for coaching', () => {
  it('tells the model the text, the marks with their sounds, the scores and the language to write in', async () => {
    const user = userEvent.setup();
    const pronunciationCoaching = port();
    render(
      <PronunciationFeedback
        data={item}
        assessment={assessment}
        grade={{ score: 0.7, maxScore: 1, passed: true, feedback: 'Clear.' }}
        locale="es"
        ai={{ pronunciationCoaching }}
      />,
    );
    await user.click(button() as HTMLElement);
    const [request, options] = pronunciationCoaching.mock.calls[0] as [
      AiCoachingRequest,
      { signal: AbortSignal },
    ];
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(request).toMatchObject({
      feature: 'pronunciation-coaching',
      facts: {
        activityId: 'ra1',
        title: 'Read the sentence',
        instructions: 'Read at a natural pace.',
        referenceText: item.referenceText,
        locale: 'en-US',
        phonemeAlphabet: 'ipa',
        scores: { accuracy: 70, completeness: 80 },
      },
      grade: { score: 0.7, maxScore: 1, passed: true },
      learnerLocale: 'es',
    });
    expect(request.facts.words.map((word) => [word.itemId, word.state])).toEqual([
      ['w1', 'correct'],
      ['w2', 'correct'],
      ['w3', 'correct'],
      ['w4', 'mispronounced'],
      ['w5', 'omitted'],
    ]);
    expect(request.facts.words[3]?.sounds?.[1]).toEqual({
      symbol: 'ʌ',
      accuracy: 20,
      heardAs: [{ symbol: 'oʊ', score: 60 }],
    });
  });

  it('shows the coaching whole, in reading order, once — and records it without its text', async () => {
    const user = userEvent.setup();
    const onInteraction = vi.fn<(event: InteractionEvent) => void>();
    render(
      <PronunciationFeedback
        data={item}
        assessment={assessment}
        ai={{ pronunciationCoaching: port() }}
        onInteraction={onInteraction}
      />,
    );
    const asked = button() as HTMLElement;
    asked.focus();
    await user.click(asked);
    const panel = await screen.findByRole('region', { name: 'Coaching on your reading' });
    expect(within(panel).getByText('Coaching on your reading')).toHaveClass('lk-ai-heading');
    expect(within(panel).getByText(good.text)).toBeInTheDocument();
    const words = within(panel).getByRole('list', { name: 'Words to practise' });
    const entries = within(words).getAllByRole('listitem');
    expect(entries.map((entry) => entry.textContent)).toEqual([
      'lovelySound: ʌ, heard as oʊOpen your mouth for a short vowel.',
      'todayRead every word to the end.',
    ]);
    // The word keeps the reading's language; the tip is the learner's.
    expect(within(entries[0] as HTMLElement).getByText('lovely')).toHaveAttribute('lang', 'en-US');
    expect(within(panel).getByText('Written by AI. It can make mistakes.')).toBeInTheDocument();
    // One per reading: the button that asked is gone, and focus went to what it asked for.
    expect(button()).toBeNull();
    expect(panel).toHaveFocus();
    expect(onInteraction).toHaveBeenCalledTimes(1);
    const event = onInteraction.mock.calls[0]?.[0] as InteractionEvent;
    expect(event).toMatchObject({
      type: 'ai-coaching-shown',
      activityId: 'ra1',
      payload: { words: 2, provenance: { model: 'model-1' } },
    });
    expect(JSON.stringify(event)).not.toContain('vowel');
  });

  it('refuses coaching on a word read correctly, or a sound the engine did not report — and the learner may ask again', async () => {
    const user = userEvent.setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const onInteraction = vi.fn<(event: InteractionEvent) => void>();
    for (const words of [
      [{ itemId: 'w1', tip: 'Say "the" more clearly.' }],
      [{ itemId: 'w4', tip: 'The consonant.', sound: { expected: 'ʃ' } }],
    ]) {
      const pronunciationCoaching = port(() => ({ text: 'Tips.', words }));
      render(
        <PronunciationFeedback
          data={item}
          assessment={assessment}
          ai={{ pronunciationCoaching }}
          onInteraction={onInteraction}
        />,
      );
      await user.click(button() as HTMLElement);
      expect(await screen.findByText('No coaching is available right now.')).toBeInTheDocument();
      expect(screen.queryByText('Tips.')).toBeNull();
      expect(onInteraction).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: 'ai-help-refused',
          activityId: 'ra1',
          payload: { feature: 'pronunciation-coaching', reason: 'contradicts-marks' },
        }),
      );
      // Refused is not shown: the button is still there to ask again.
      await user.click(button() as HTMLElement);
      expect(pronunciationCoaching).toHaveBeenCalledTimes(2);
      cleanup();
    }
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('pronunciation coaching'));
  });

  it('says it is not available when the port fails, and records nothing', async () => {
    const user = userEvent.setup();
    const onInteraction = vi.fn();
    render(
      <PronunciationFeedback
        data={item}
        assessment={assessment}
        ai={{
          pronunciationCoaching: () => {
            throw new Error('503');
          },
        }}
        onInteraction={onInteraction}
      />,
    );
    await user.click(button() as HTMLElement);
    expect(await screen.findByText('No coaching is available right now.')).toBeInTheDocument();
    expect(onInteraction).not.toHaveBeenCalled();
  });

  it('drops coaching on other marks, and abandons a call on its way', async () => {
    const user = userEvent.setup();
    let signal: AbortSignal | undefined;
    let reply: (value: AiCoachingResult) => void = () => {};
    const pronunciationCoaching = vi.fn(
      (_request: AiCoachingRequest, options: { signal: AbortSignal }) => {
        signal = options.signal;
        return new Promise<AiCoachingResult>((resolve) => {
          reply = resolve;
        });
      },
    );
    const onInteraction = vi.fn();
    const { rerender } = render(
      <PronunciationFeedback
        data={item}
        assessment={assessment}
        ai={{ pronunciationCoaching }}
        onInteraction={onInteraction}
      />,
    );
    await user.click(button() as HTMLElement);
    expect(screen.getByRole('button', { name: 'Writing your coaching…' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    const retaken = { ...assessment, recordingKey: 'take-2' };
    rerender(
      <PronunciationFeedback
        data={item}
        assessment={retaken}
        ai={{ pronunciationCoaching }}
        onInteraction={onInteraction}
      />,
    );
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      reply(good);
    });
    // The late reply was for the old take: nothing of it lands, and nothing
    // records a coaching no learner saw.
    expect(screen.queryByText(good.text)).toBeNull();
    expect(onInteraction).not.toHaveBeenCalled();
    expect(button()).not.toHaveAttribute('aria-busy');
  });
});

describe('the reading coaching belongs to', () => {
  it('keeps coaching when the same assessment is handed in again as a new object', async () => {
    const user = userEvent.setup();
    const pronunciationCoaching = port();
    const { rerender } = render(
      <PronunciationFeedback data={item} assessment={assessment} ai={{ pronunciationCoaching }} />,
    );
    await user.click(button() as HTMLElement);
    await screen.findByText(good.text);
    rerender(
      <PronunciationFeedback
        data={{ ...item }}
        assessment={structuredClone(assessment)}
        ai={{ pronunciationCoaching }}
      />,
    );
    expect(screen.getByText(good.text)).toBeInTheDocument();
    expect(pronunciationCoaching).toHaveBeenCalledTimes(1);
  });

  it('drops it for another take, even one the engine marked the same', async () => {
    const user = userEvent.setup();
    const pronunciationCoaching = port();
    const { rerender } = render(
      <PronunciationFeedback data={item} assessment={assessment} ai={{ pronunciationCoaching }} />,
    );
    await user.click(button() as HTMLElement);
    await screen.findByText(good.text);
    rerender(
      <PronunciationFeedback
        data={item}
        assessment={{ ...assessment, recordingKey: 'take-2' }}
        ai={{ pronunciationCoaching }}
      />,
    );
    expect(screen.queryByText(good.text)).toBeNull();
    expect(button()).toBeInTheDocument();
  });
});

describe('useAiCoaching', () => {
  const withProvider =
    (ai: LearnerAi) =>
    ({ children }: { children: ReactNode }) => <LkAiProvider ai={ai}>{children}</LkAiProvider>;

  it('offers, asks and shows for marks a host draws itself', async () => {
    const pronunciationCoaching = port();
    const { result } = renderHook(() => useAiCoaching({ data: item, assessment }), {
      wrapper: withProvider({ pronunciationCoaching }),
    });
    expect(result.current).toMatchObject({ offered: true, status: 'idle', coaching: null });
    act(() => result.current.ask());
    await waitFor(() => expect(result.current.status).toBe('shown'));
    expect(result.current.coaching?.words.map((word) => word.word)).toEqual(['lovely', 'today']);
    // Once shown, asking again calls nothing.
    act(() => result.current.ask());
    expect(pronunciationCoaching).toHaveBeenCalledTimes(1);
  });

  it('coaches the marks of a stored grade when no assessment was kept — without sounds', async () => {
    const pronunciationCoaching = port(() => ({
      text: 'One word to practise.',
      words: [{ itemId: 'w2', tip: 'Say it slowly.' }],
    }));
    const { result } = renderHook(
      () =>
        useAiCoaching({
          data: item,
          grade: {
            score: 0.5,
            maxScore: 1,
            passed: false,
            feedback: 'Keep practising.',
            details: [
              {
                itemId: 'w1',
                outcome: 'correct',
                learnerResponse: 'the',
                correctResponse: 'the',
                weight: 1,
                score: 1,
              },
              {
                itemId: 'w2',
                outcome: 'incorrect',
                learnerResponse: 'wetter',
                correctResponse: 'weather',
                weight: 1,
                score: 0.3,
              },
            ],
          },
        }),
      { wrapper: withProvider({ pronunciationCoaching }) },
    );
    act(() => result.current.ask());
    await waitFor(() => expect(result.current.status).toBe('shown'));
    const request = pronunciationCoaching.mock.calls[0]?.[0] as AiCoachingRequest;
    expect(request.facts.words.some((word) => word.sounds !== undefined)).toBe(false);
    expect(result.current.coaching?.words).toEqual([
      { itemId: 'w2', word: 'weather', tip: 'Say it slowly.' },
    ]);
  });

  it('abandons a call, and withdraws coaching shown, once the paper switches AI explanations off', async () => {
    let signal: AbortSignal | undefined;
    const pronunciationCoaching = vi.fn(
      (_request: AiCoachingRequest, options: { signal: AbortSignal }) => {
        signal = options.signal;
        return new Promise<AiCoachingResult>(() => {});
      },
    );
    const open = { ai: { explanations: true } };
    const closed = { ai: { explanations: false } };
    const asking = renderHook(
      ({ delivery }) => useAiCoaching({ data: item, assessment, delivery }),
      { initialProps: { delivery: open }, wrapper: withProvider({ pronunciationCoaching }) },
    );
    act(() => asking.result.current.ask());
    expect(asking.result.current.status).toBe('loading');
    asking.rerender({ delivery: closed });
    expect(signal?.aborted).toBe(true);
    expect(asking.result.current).toMatchObject({ offered: false, status: 'idle' });

    const shown = renderHook(
      ({ delivery }) => useAiCoaching({ data: item, assessment, delivery }),
      {
        initialProps: { delivery: open },
        wrapper: withProvider({ pronunciationCoaching: port() }),
      },
    );
    act(() => shown.result.current.ask());
    await waitFor(() => expect(shown.result.current.status).toBe('shown'));
    shown.rerender({ delivery: closed });
    expect(shown.result.current).toMatchObject({ offered: false, coaching: null });
  });

  it('reaches no model where it is not offered, however it is asked', () => {
    const pronunciationCoaching = port();
    const { result } = renderHook(
      () => useAiCoaching({ data: item, assessment, renderMode: 'exam' }),
      { wrapper: withProvider({ pronunciationCoaching }) },
    );
    expect(result.current.offered).toBe(false);
    act(() => result.current.ask());
    expect(pronunciationCoaching).not.toHaveBeenCalled();
    // And no marks, nothing to offer.
    const none = renderHook(() => useAiCoaching({ data: item }), {
      wrapper: withProvider({ pronunciationCoaching }),
    });
    expect(none.result.current.offered).toBe(false);
  });
});
