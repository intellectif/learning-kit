import type {
  AiExplanationRequest,
  AiHintRequest,
  AiTextResult,
  DictationData,
  FillInTheBlanksData,
  GapSelectData,
  ItemOutcome,
  MultipleChoiceData,
} from '@intellectif/lk-core';
import { redact } from '@intellectif/lk-core';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type LearnerAi, LkAiProvider } from '../../../ai/LkAiProvider.js';
import { explanationOffered, hintLimit, hintOffered } from '../../../ai/rules.js';
import { checkA11y } from '../../../test-support/a11y.js';
import { ActivitySequence } from '../../ActivitySequence/index.js';
import { Dictation } from '../../Dictation/index.js';
import { FillInTheBlanks } from '../../FillInTheBlanks/index.js';
import { GapSelect } from '../../GapSelect/index.js';
import { MultipleChoice } from '../../MultipleChoice/index.js';
import { asRenderable } from '../../types.js';

/**
 * AI help for learners, through ports a host supplies: an explanation of a
 * graded answer, and hints before one. The ports here are fakes the tests
 * drive; what is under test is where help appears, what it is asked, what it
 * refuses to show, and what happens when a call is slow, fails, or outlives the
 * answer it was for.
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const mc: MultipleChoiceData = {
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'mc1',
  title: 'Estar',
  question: 'Which sentence is right?',
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  options: [
    { id: 'a', text: 'She is tired now', isCorrect: true },
    { id: 'b', text: 'She are tired now', isCorrect: false },
  ],
};

const fib: FillInTheBlanksData = {
  schemaVersion: '1.0',
  type: 'fill-in-the-blanks',
  id: 'fib1',
  title: 'Spell it',
  passage: 'My last name {{b}} Rossi.',
  blanks: [{ id: 'b', acceptedAnswers: ['is'] }],
  scoringStrategy: 'partial',
};

const gs: GapSelectData = {
  schemaVersion: '1.0',
  type: 'gap-select',
  id: 'gs1',
  title: 'Hotel',
  passage: 'My name {{g}} Rossi.',
  gaps: [
    {
      id: 'g',
      choices: [
        { id: 'is', text: 'is' },
        { id: 'are', text: 'are' },
      ],
      correctChoiceId: 'is',
    },
  ],
  scoringStrategy: 'partial',
};

const dictation: DictationData = {
  schemaVersion: '1.0',
  type: 'dictation',
  id: 'dc1',
  title: 'Listen and type',
  transcript: 'The cat sat',
};

/** A promise the test settles when it chooses. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

/** Ports that answer at once, recording what they were asked. */
function ports(over: Pick<LearnerAi, 'maxHints' | 'learnerLocale'> = {}) {
  const explain = vi.fn(
    async (_request: AiExplanationRequest): Promise<AiTextResult> => ({
      text: 'Tired is a state, so it takes "is".',
      provenance: { model: 'fake-1' },
    }),
  );
  const hint = vi.fn(
    async (request: AiHintRequest): Promise<AiTextResult> => ({
      text: `Think about who is tired (${request.hintNumber}).`,
    }),
  );
  return { explain, hint, ...over } satisfies LearnerAi;
}

const hintButton = () => screen.queryByRole('button', { name: 'Get a hint' });
const explainButton = () => screen.queryByRole('button', { name: 'Explain my answer' });

async function answerMc(user: ReturnType<typeof userEvent.setup>, optionText: string) {
  await user.click(screen.getByRole('radio', { name: optionText }));
  await user.click(screen.getByRole('button', { name: 'Submit' }));
}

describe('AI help in practice', () => {
  it('gives a hint before submit, and explains the graded answer after it', async () => {
    const user = userEvent.setup();
    const ai = ports();
    const onInteraction = vi.fn();
    render(
      <LkAiProvider ai={ai}>
        <MultipleChoice data={mc} onInteraction={onInteraction} />
      </LkAiProvider>,
    );
    expect(explainButton()).toBeNull();

    await user.click(screen.getByRole('radio', { name: 'She are tired now' }));
    await user.click(hintButton() as HTMLElement);
    expect(await screen.findByText('Think about who is tired (1).')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Hints' })).toHaveTextContent('Hint 1');
    expect(screen.getByText('Written by AI. It can make mistakes.')).toBeInTheDocument();
    // What the model was asked: the key, what is chosen so far, and whether it is right.
    const hintRequest = ai.hint.mock.calls[0]?.[0] as AiHintRequest;
    expect(hintRequest).toMatchObject({ feature: 'hint', hintNumber: 1, previousHints: [] });
    expect(hintRequest.facts).toMatchObject({
      activityType: 'multiple-choice',
      options: [
        { id: 'a', chosen: false, correct: true },
        { id: 'b', chosen: true, correct: false },
      ],
    });
    expect(onInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ai-hint-shown', payload: { hintNumber: 1 } }),
    );

    await user.click(screen.getByRole('button', { name: 'Submit' }));
    // No more hints once the answer is in; the ones given stay listed.
    expect(hintButton()).toBeNull();
    expect(screen.getByText('Think about who is tired (1).')).toBeInTheDocument();

    const explain = explainButton() as HTMLElement;
    explain.focus();
    await user.click(explain);
    const panel = await screen.findByRole('region', { name: 'Explanation' });
    expect(panel).toHaveTextContent('Tired is a state, so it takes "is".');
    expect(panel).toHaveFocus();
    expect(ai.explain.mock.calls[0]?.[0]).toMatchObject({
      feature: 'explanation',
      grade: { score: 0, maxScore: 1, passed: false, category: 'incorrect' },
    });
    expect(onInteraction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ai-explanation-shown',
        activityId: 'mc1',
        payload: { provenance: { model: 'fake-1' } },
      }),
    );
  });

  it('asks each port with an abort signal, and the host’s language before the component’s', async () => {
    const user = userEvent.setup();
    const ai = ports({ learnerLocale: 'es' });
    render(<MultipleChoice data={mc} ai={ai} locale="en" />);
    await user.click(hintButton() as HTMLElement);
    await screen.findByText('Think about who is tired (1).');
    expect(ai.hint.mock.calls[0]?.[0]).toMatchObject({ learnerLocale: 'es' });
    expect((ai.hint.mock.calls[0] as unknown[])[1]).toMatchObject({
      signal: expect.any(AbortSignal),
    });
    cleanup();

    const plain = ports();
    render(<MultipleChoice data={mc} ai={plain} locale="pt-BR" />);
    await user.click(hintButton() as HTMLElement);
    await screen.findByText('Think about who is tired (1).');
    expect(plain.hint.mock.calls[0]?.[0]).toMatchObject({ learnerLocale: 'pt-BR' });
  });

  it('refuses a hint that gives the answer away, and does not count it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const user = userEvent.setup();
    const hint = vi
      .fn()
      .mockResolvedValueOnce({ text: 'The answer is "she is tired now".' })
      .mockResolvedValueOnce({ text: 'Who is tired: one person or many?' });
    render(<MultipleChoice data={mc} ai={{ hint }} />);
    await user.click(hintButton() as HTMLElement);
    expect(await screen.findByText('No hint is available right now.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Hints' })).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('reveals-answer'));

    await user.click(hintButton() as HTMLElement);
    expect(await screen.findByText('Who is tired: one person or many?')).toBeInTheDocument();
    // The refused one was never shown, so this is still the first.
    expect(hint.mock.calls[1]?.[0]).toMatchObject({ hintNumber: 1, previousHints: [] });
    expect(screen.queryByText('No hint is available right now.')).toBeNull();
  });

  it('gives no more hints than the host allows, and passes each one the hints before it', async () => {
    const user = userEvent.setup();
    const ai = ports({ maxHints: 2 });
    render(<MultipleChoice data={mc} ai={ai} />);
    await user.click(hintButton() as HTMLElement);
    await screen.findByText('Think about who is tired (1).');
    await user.click(hintButton() as HTMLElement);
    await screen.findByText('Think about who is tired (2).');
    expect(ai.hint.mock.calls[1]?.[0]).toMatchObject({
      hintNumber: 2,
      previousHints: ['Think about who is tired (1).'],
    });
    expect(hintButton()).toBeNull();
    expect(screen.getByText('No more hints for this question.')).toBeInTheDocument();
  });

  it('refuses an explanation of a grade the learner did not get', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(
      <MultipleChoice
        data={mc}
        ai={{ explain: async () => ({ text: 'Well done, that is right!', verdict: 'correct' }) }}
      />,
    );
    await answerMc(user, 'She are tired now');
    await user.click(explainButton() as HTMLElement);
    expect(await screen.findByText('No explanation is available right now.')).toBeInTheDocument();
    expect(screen.queryByText('Well done, that is right!')).toBeNull();
  });

  it('costs the learner the help, never the question, when a port fails — and lets them ask again', async () => {
    const user = userEvent.setup();
    const explain = vi
      .fn()
      .mockRejectedValueOnce(new Error('503'))
      .mockImplementationOnce(() => {
        throw new Error('thrown, not rejected');
      })
      .mockResolvedValueOnce({ text: 'Third time lucky.' });
    render(<MultipleChoice data={mc} ai={{ explain }} />);
    await answerMc(user, 'She is tired now');
    await user.click(explainButton() as HTMLElement);
    expect(await screen.findByText('No explanation is available right now.')).toBeInTheDocument();
    await user.click(explainButton() as HTMLElement);
    await waitFor(() => expect(explain).toHaveBeenCalledTimes(2));
    expect(screen.getByText('No explanation is available right now.')).toBeInTheDocument();
    await user.click(explainButton() as HTMLElement);
    expect(await screen.findByText('Third time lucky.')).toBeInTheDocument();
    // The question itself was never in doubt.
    expect(screen.getByText(/Score 100%/)).toBeInTheDocument();
  });

  it('says it is working, and ignores a second press while it does', async () => {
    const user = userEvent.setup();
    const pending = deferred<AiTextResult>();
    const explain = vi.fn(() => pending.promise);
    render(<MultipleChoice data={mc} ai={{ explain }} />);
    await answerMc(user, 'She is tired now');
    await user.click(explainButton() as HTMLElement);
    const working = screen.getByRole('button', { name: 'Explaining…' });
    expect(working).toHaveAttribute('aria-busy', 'true');
    expect(working).toHaveAttribute('aria-disabled', 'true');
    await user.click(working);
    expect(explain).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve({ text: 'Done.' });
    });
    expect(screen.getByText('Done.')).toBeInTheDocument();
  });
});

describe('where AI help never appears', () => {
  it('shows nothing in an exam, before or after submit, whatever ports are passed', async () => {
    const user = userEvent.setup();
    const ai = ports();
    render(<MultipleChoice data={mc} ai={ai} renderMode="exam" />);
    expect(hintButton()).toBeNull();
    await answerMc(user, 'She is tired now');
    expect(explainButton()).toBeNull();
    expect(ai.hint).not.toHaveBeenCalled();
    expect(ai.explain).not.toHaveBeenCalled();
  });

  it('shows nothing without a port, and only the help whose port was passed', async () => {
    const user = userEvent.setup();
    const { container } = render(<MultipleChoice data={mc} />);
    expect(container.querySelector('.lk-ai')).toBeNull();
    cleanup();

    render(<MultipleChoice data={mc} ai={{ explain: ports().explain }} />);
    expect(hintButton()).toBeNull();
    await answerMc(user, 'She is tired now');
    expect(explainButton()).not.toBeNull();
  });

  it('honours an author who switched a feature off for the item', async () => {
    const user = userEvent.setup();
    render(<MultipleChoice data={{ ...mc, ai: { hints: false } }} ai={ports()} />);
    expect(hintButton()).toBeNull();
    await answerMc(user, 'She is tired now');
    expect(explainButton()).not.toBeNull();
    cleanup();

    render(<MultipleChoice data={{ ...mc, ai: { explanations: false } }} ai={ports()} />);
    expect(hintButton()).not.toBeNull();
    await answerMc(user, 'She is tired now');
    expect(explainButton()).toBeNull();
  });

  it('gives no hint on a disabled question', () => {
    render(<MultipleChoice data={mc} ai={ports()} disabled />);
    expect(hintButton()).toBeNull();
  });

  it('lets a component’s own ports win over the provider’s, whole', async () => {
    const user = userEvent.setup();
    const provided = ports();
    const own = { hint: vi.fn(async () => ({ text: 'From the prop.' })) };
    render(
      <LkAiProvider ai={provided}>
        <MultipleChoice data={mc} ai={own} />
      </LkAiProvider>,
    );
    await user.click(hintButton() as HTMLElement);
    expect(await screen.findByText('From the prop.')).toBeInTheDocument();
    expect(provided.hint).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    // The prop has no `explain`, and the provider's is not borrowed.
    expect(explainButton()).toBeNull();
  });
});

describe('review', () => {
  const scored = (score: number): ItemOutcome => ({
    status: 'scored',
    score,
    maxScore: 1,
    passed: score >= 0.7,
    feedback: null,
    details: [
      {
        itemId: 'a',
        outcome: score === 1 ? 'correct' : 'incorrect-omission',
        learnerResponse: [],
        correctResponse: [],
      },
      {
        itemId: 'b',
        outcome: score === 1 ? 'correct-omission' : 'incorrect',
        learnerResponse: [],
        correctResponse: [],
      },
    ],
  });

  it('explains the grade of record on a redacted item, and gives no hints', async () => {
    const user = userEvent.setup();
    const ai = ports();
    render(
      <MultipleChoice
        data={asRenderable(redact(mc))}
        renderMode="review"
        defaultValue={{ type: 'multiple-choice', selectedOptionIds: ['b'] }}
        outcome={scored(0)}
        ai={ai}
      />,
    );
    expect(hintButton()).toBeNull();
    await user.click(explainButton() as HTMLElement);
    await screen.findByRole('region', { name: 'Explanation' });
    const request = ai.explain.mock.calls[0]?.[0] as AiExplanationRequest;
    expect(request.grade.category).toBe('incorrect');
    expect(request.facts).toMatchObject({
      options: [
        { id: 'a', chosen: false, correct: true },
        { id: 'b', chosen: true, correct: false },
      ],
    });
  });

  it('never calls the port for a grade of record that cannot be a grade', async () => {
    // 85 "out of 1" on a wrong answer: lk-core refuses to build the request,
    // so the model is never told a wrong answer was correct.
    const user = userEvent.setup();
    const ai = ports();
    const corrupt: ItemOutcome = {
      status: 'scored',
      score: 85,
      maxScore: 1,
      passed: true,
      feedback: null,
      details: [],
    };
    render(
      <MultipleChoice
        data={asRenderable(redact(mc))}
        renderMode="review"
        defaultValue={{ type: 'multiple-choice', selectedOptionIds: ['b'] }}
        outcome={corrupt}
        ai={ai}
      />,
    );
    await user.click(explainButton() as HTMLElement);
    expect(await screen.findByText('No explanation is available right now.')).toBeInTheDocument();
    expect(ai.explain).not.toHaveBeenCalled();
  });

  it('offers nothing to explain until the grade of record is scored', () => {
    render(
      <MultipleChoice
        data={asRenderable(redact(mc))}
        renderMode="review"
        defaultValue={{ type: 'multiple-choice', selectedOptionIds: ['b'] }}
        outcome={{ status: 'deferred', reason: 'requires_async_grading', maxScore: 1 }}
        ai={ports()}
      />,
    );
    expect(explainButton()).toBeNull();
  });

  it('drops an explanation when the grade it explained is replaced', async () => {
    const user = userEvent.setup();
    const props = {
      data: asRenderable<MultipleChoiceData>(redact(mc)),
      renderMode: 'review' as const,
      defaultValue: { type: 'multiple-choice' as const, selectedOptionIds: ['b'] },
      ai: ports(),
    };
    const { rerender } = render(<MultipleChoice {...props} outcome={scored(0)} />);
    await user.click(explainButton() as HTMLElement);
    await screen.findByRole('region', { name: 'Explanation' });
    rerender(<MultipleChoice {...props} outcome={scored(1)} />);
    expect(screen.queryByRole('region', { name: 'Explanation' })).toBeNull();
    expect(explainButton()).not.toBeNull();
  });
});

describe('a call that outlives its answer', () => {
  it('drops a hint that arrives after the learner submitted, and aborts its call', async () => {
    const user = userEvent.setup();
    const pending = deferred<AiTextResult>();
    let signal: AbortSignal | undefined;
    const hint = vi.fn((_request: AiHintRequest, options: { signal: AbortSignal }) => {
      signal = options.signal;
      return pending.promise;
    });
    render(<MultipleChoice data={mc} ai={{ hint }} />);
    await user.click(screen.getByRole('radio', { name: 'She is tired now' }));
    await user.click(hintButton() as HTMLElement);
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      pending.resolve({ text: 'Too late to help.' });
    });
    expect(screen.queryByText('Too late to help.')).toBeNull();
  });

  it('aborts an explanation still on its way when the question goes away', async () => {
    const user = userEvent.setup();
    let signal: AbortSignal | undefined;
    const explain = vi.fn((_request: AiExplanationRequest, options: { signal: AbortSignal }) => {
      signal = options.signal;
      return new Promise<AiTextResult>(() => undefined);
    });
    const { unmount } = render(<MultipleChoice data={mc} ai={{ explain }} />);
    await answerMc(user, 'She is tired now');
    await user.click(explainButton() as HTMLElement);
    unmount();
    expect(signal?.aborted).toBe(true);
  });

  it('starts another question with no hints', async () => {
    const user = userEvent.setup();
    const ai = ports();
    const { rerender } = render(<MultipleChoice data={mc} ai={ai} />);
    await user.click(hintButton() as HTMLElement);
    await screen.findByText('Think about who is tired (1).');
    rerender(<MultipleChoice data={{ ...mc, id: 'mc2' }} ai={ai} />);
    expect(screen.queryByText('Think about who is tired (1).')).toBeNull();
    await user.click(hintButton() as HTMLElement);
    await screen.findByText('Think about who is tired (1).');
    expect(ai.hint.mock.calls[1]?.[0]).toMatchObject({ hintNumber: 1 });
  });
});

describe('the other types', () => {
  it('fill-in-the-blanks: hints know the passage, and a short answer is refused only in its place', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const user = userEvent.setup();
    const hint = vi
      .fn()
      .mockResolvedValueOnce({ text: 'Say it: my last name is Rossi.' })
      .mockResolvedValueOnce({ text: 'The verb is "to be".' });
    const explain = vi.fn(async (_request: AiExplanationRequest) => ({
      text: 'Name is singular.',
    }));
    render(<FillInTheBlanks data={fib} ai={{ hint, explain }} />);
    await user.click(hintButton() as HTMLElement);
    expect(await screen.findByText('No hint is available right now.')).toBeInTheDocument();
    expect(hint.mock.calls[0]?.[0]).toMatchObject({
      facts: { activityType: 'fill-in-the-blanks', passage: 'My last name [1] Rossi.' },
    });
    await user.click(hintButton() as HTMLElement);
    expect(await screen.findByText('The verb is "to be".')).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Fill in blank 1' }), 'are');
    await user.click(screen.getByRole('button', { name: 'Check answers' }));
    await user.click(explainButton() as HTMLElement);
    expect(await screen.findByText('Name is singular.')).toBeInTheDocument();
    expect(explain.mock.calls[0]?.[0]).toMatchObject({
      grade: { category: 'incorrect' },
      facts: { blanks: [{ id: 'b', typed: 'are', accepted: ['is'], correct: false }] },
    });
  });

  it('gap select: hints and an explanation, the same way', async () => {
    const user = userEvent.setup();
    const ai = ports();
    render(<GapSelect data={gs} ai={ai} />);
    await user.click(hintButton() as HTMLElement);
    await screen.findByText('Think about who is tired (1).');
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Choose the answer for gap 1' }),
      'is',
    );
    await user.click(screen.getByRole('button', { name: 'Check answers' }));
    await user.click(explainButton() as HTMLElement);
    await screen.findByRole('region', { name: 'Explanation' });
    expect(ai.explain.mock.calls[0]?.[0]).toMatchObject({
      grade: { category: 'correct' },
      facts: { gaps: [{ chosen: 'is', answer: 'is', correct: true }] },
    });
  });

  it('dictation: an explanation of the marked words, and no AI hints — it has its own', async () => {
    const user = userEvent.setup();
    const ai = ports();
    render(<Dictation data={dictation} ai={ai} />);
    expect(hintButton()).toBeNull();
    await user.type(screen.getByRole('textbox', { name: 'Type what you hear' }), 'the bat sat');
    await user.click(screen.getByRole('button', { name: 'Check answers' }));
    await user.click(explainButton() as HTMLElement);
    await screen.findByRole('region', { name: 'Explanation' });
    const request = ai.explain.mock.calls[0]?.[0] as AiExplanationRequest;
    expect(request.facts).toMatchObject({
      activityType: 'dictation',
      transcript: 'The cat sat',
      typed: 'the bat sat',
    });
    expect(request.grade.category).toBe('partly-correct');
  });

  it('hands a renderers override the ports outside exam, and none in it', () => {
    const handed: unknown[] = [];
    const renderers = {
      'multiple-choice': (props: { ai?: LearnerAi }) => {
        handed.push(props.ai);
        return <p>Mine</p>;
      },
    };
    const ai = ports();
    render(<ActivitySequence activities={[mc]} ai={ai} renderers={renderers} />);
    expect(handed.at(-1)).toBe(ai);
    cleanup();
    render(<ActivitySequence activities={[mc]} ai={ai} renderers={renderers} renderMode="exam" />);
    expect(handed.at(-1)).toBeUndefined();
  });

  it('reaches every question of a sequence through its own `ai` prop', async () => {
    const user = userEvent.setup();
    const ai = ports();
    render(<ActivitySequence activities={[mc]} ai={ai} />);
    await user.click(hintButton() as HTMLElement);
    expect(await screen.findByText('Think about who is tired (1).')).toBeInTheDocument();
  });
});

describe('accessibility and limits', () => {
  it('passes axe with hints listed and an explanation shown', async () => {
    const user = userEvent.setup();
    const { container } = render(<MultipleChoice data={mc} ai={ports()} />);
    await user.click(hintButton() as HTMLElement);
    await screen.findByText('Think about who is tired (1).');
    expect(await checkA11y(container)).toHaveNoViolations();
    await answerMc(user, 'She is tired now');
    await user.click(explainButton() as HTMLElement);
    await screen.findByRole('region', { name: 'Explanation' });
    expect(await checkA11y(container)).toHaveNoViolations();
  });

  it('offers each kind of help only where the rules say, whatever renders it', () => {
    const open = { renderMode: 'practice' as const, submitted: false, disabled: false };
    expect(hintOffered({ data: mc, ...open })).toBe(true);
    expect(hintOffered({ data: fib, ...open })).toBe(true);
    expect(hintOffered({ data: gs, ...open })).toBe(true);
    // A dictation has hints of its own, and no AI ones, whoever asks.
    expect(hintOffered({ data: dictation, ...open })).toBe(false);
    expect(hintOffered({ data: mc, ...open, renderMode: 'exam' })).toBe(false);
    expect(hintOffered({ data: mc, ...open, submitted: true })).toBe(false);
    expect(hintOffered({ data: asRenderable<MultipleChoiceData>(redact(mc)), ...open })).toBe(
      false,
    );

    const graded = { renderMode: 'practice' as const, submitted: true, outcome: undefined };
    expect(explanationOffered({ data: dictation, ...graded })).toBe(true);
    expect(explanationOffered({ data: mc, ...graded, renderMode: 'exam' })).toBe(false);
    expect(explanationOffered({ data: mc, ...graded, submitted: false })).toBe(false);
    expect(
      explanationOffered({
        data: { ...mc, type: 'written-response' } as never,
        ...graded,
      }),
    ).toBe(false);
  });

  it('reads the hint limit as a whole number from 1 to 10, and 3 otherwise', () => {
    expect(hintLimit(undefined)).toBe(3);
    expect(hintLimit({})).toBe(3);
    expect(hintLimit({ maxHints: 1 })).toBe(1);
    expect(hintLimit({ maxHints: 10 })).toBe(10);
    expect(hintLimit({ maxHints: 50 })).toBe(10);
    for (const bad of [0, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(hintLimit({ maxHints: bad }), String(bad)).toBe(3);
    }
  });
});
