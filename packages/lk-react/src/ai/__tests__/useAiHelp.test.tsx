import type {
  AiExplanationRequest,
  AiHintRequest,
  AiTextResult,
  ItemOutcome,
  MultipleChoiceData,
} from '@intellectif/lk-core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SequenceQuestion } from '../../components/ActivitySequence/index.js';
import { ActivitySequence } from '../../components/ActivitySequence/index.js';
import type { ActivityProps } from '../../components/types.js';
import { type LearnerAi, LkAiProvider } from '../LkAiProvider.js';
import { useAiExplanation, useAiHints } from '../useAiHelp.js';

/**
 * The AI rules without the SDK's own buttons: what a host gets when it draws a
 * question itself. The components are built on these hooks, so what they
 * guarantee is guaranteed here — above all that an exam reaches no model, even
 * with ports in scope, because a host calls `ask` whenever it likes.
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

const chose = (id: string) => ({ type: 'multiple-choice' as const, selectedOptionIds: [id] });

const scored: ItemOutcome = {
  status: 'scored',
  score: 0,
  maxScore: 1,
  passed: false,
  feedback: null,
  details: [],
};

const ungraded: ItemOutcome = {
  status: 'deferred',
  reason: 'requires_async_grading',
  maxScore: 1,
};

/** Ports that answer at once, recording what they were asked. */
function ports(over: Partial<LearnerAi> = {}): LearnerAi & {
  explain: ReturnType<typeof vi.fn>;
  hint: ReturnType<typeof vi.fn>;
} {
  return {
    explain: vi.fn(
      async (_request: AiExplanationRequest): Promise<AiTextResult> => ({
        verdict: 'incorrect',
        text: '"She" is one person, so the verb is "is".',
        provenance: { model: 'fake-1' },
      }),
    ),
    hint: vi.fn(
      async (request: AiHintRequest): Promise<AiTextResult> => ({
        text: `Who is tired? (${request.hintNumber})`,
      }),
    ),
    ...over,
  } as LearnerAi & { explain: ReturnType<typeof vi.fn>; hint: ReturnType<typeof vi.fn> };
}

/** Every render's hook results, so a test can read the latest and compare identities. */
interface Seen {
  hints: ReturnType<typeof useAiHints>;
  explanation: ReturnType<typeof useAiExplanation>;
}

/**
 * A host's own question, drawn with nothing from the SDK but the rules: it asks
 * for help through the hooks and shows what they give it.
 */
function HostQuestion({
  data,
  renderMode,
  outcome,
  ai,
  onInteraction,
  question,
  seen,
  submitted = false,
  chosen = 'b',
}: ActivityProps & {
  question?: SequenceQuestion;
  seen?: Seen[];
  submitted?: boolean;
  chosen?: string;
}) {
  const shared = {
    data,
    response: chose(chosen),
    submitted,
    ...(renderMode !== undefined ? { renderMode } : {}),
    ...(ai !== undefined ? { ai } : {}),
    ...(onInteraction !== undefined ? { onInteraction } : {}),
  };
  const hints = useAiHints(shared);
  const explanation = useAiExplanation({
    ...shared,
    ...(outcome !== undefined ? { outcome } : {}),
  });
  seen?.push({ hints, explanation });
  return (
    <div>
      <p>{`slot ${question?.slot.slotId ?? 'none'}`}</p>
      <p>{`hints offered: ${hints.offered} used ${hints.used} of ${hints.limit}`}</p>
      <ol>
        {hints.hints.map((hint) => (
          <li key={hint.text}>{hint.text}</li>
        ))}
      </ol>
      {hints.status === 'unavailable' ? <p>No hint is available right now.</p> : null}
      <button type="button" onClick={hints.ask}>
        Get a hint
      </button>
      <p>{`explanation offered: ${explanation.offered}`}</p>
      {explanation.explanation !== null ? <p>{explanation.explanation.text}</p> : null}
      {explanation.status === 'unavailable' ? <p>No explanation is available.</p> : null}
      <button type="button" onClick={explanation.ask}>
        Explain my answer
      </button>
    </div>
  );
}

const getHint = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Get a hint' }));
const getExplanation = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Explain my answer' }));

describe('useAiHints / useAiExplanation', () => {
  it('gives a host question the same hints the SDK’s own components give', async () => {
    const user = userEvent.setup();
    const ai = ports();
    render(<HostQuestion data={mc} ai={ai} />);

    await getHint(user);
    expect(await screen.findByText('Who is tired? (1)')).toBeInTheDocument();
    await getHint(user);
    expect(await screen.findByText('Who is tired? (2)')).toBeInTheDocument();
    expect(screen.getByText('hints offered: true used 2 of 3')).toBeInTheDocument();
    // The facts the SDK built, not anything the host had to assemble.
    const asked = ai.hint.mock.calls[1]?.[0] as AiHintRequest;
    expect(asked.feature).toBe('hint');
    expect(asked.hintNumber).toBe(2);
    expect(asked.previousHints).toEqual(['Who is tired? (1)']);
    expect(asked.facts.activityId).toBe('mc1');
  });

  it('refuses a hint that gives the answer away, and does not count it', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ai = ports({
      hint: vi.fn(async (): Promise<AiTextResult> => ({ text: 'Pick "She is tired now".' })),
    });
    render(<HostQuestion data={mc} ai={ai} />);

    await getHint(user);
    expect(await screen.findByText('No hint is available right now.')).toBeInTheDocument();
    expect(screen.queryByText('Pick "She is tired now".')).toBeNull();
    expect(screen.getByText('hints offered: true used 0 of 3')).toBeInTheDocument();
  });

  it('refuses an explanation whose verdict is not the one the SDK reached', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ai = ports({
      explain: vi.fn(
        async (): Promise<AiTextResult> => ({ verdict: 'correct', text: 'Well done!' }),
      ),
    });
    render(<HostQuestion data={mc} ai={ai} submitted />);

    await getExplanation(user);
    expect(await screen.findByText('No explanation is available.')).toBeInTheDocument();
    expect(screen.queryByText('Well done!')).toBeNull();
  });

  it('explains a graded answer in practice, and reports that it was shown', async () => {
    const user = userEvent.setup();
    const onInteraction = vi.fn();
    render(<HostQuestion data={mc} ai={ports()} submitted onInteraction={onInteraction} />);

    await getExplanation(user);
    expect(
      await screen.findByText('"She" is one person, so the verb is "is".'),
    ).toBeInTheDocument();
    expect(onInteraction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ai-explanation-shown',
        activityId: 'mc1',
        payload: { provenance: { model: 'fake-1' } },
      }),
    );
  });

  it('reaches no model in an exam, however the host asks', async () => {
    const user = userEvent.setup();
    const ai = ports();
    render(
      // Ports in scope from every direction: a provider above, and the prop.
      <LkAiProvider ai={ai}>
        <HostQuestion data={mc} ai={ai} renderMode="exam" submitted />
      </LkAiProvider>,
    );

    expect(screen.getByText('hints offered: false used 0 of 3')).toBeInTheDocument();
    expect(screen.getByText('explanation offered: false')).toBeInTheDocument();
    // A host that presses on anyway — its own button, its own rules — still
    // reaches nothing: `ask` is the guard, not the button being hidden.
    await getHint(user);
    await getExplanation(user);
    expect(ai.hint).not.toHaveBeenCalled();
    expect(ai.explain).not.toHaveBeenCalled();
  });

  it('honours the item’s own switch', async () => {
    const user = userEvent.setup();
    const ai = ports();
    render(<HostQuestion data={{ ...mc, ai: { hints: false } }} ai={ai} />);

    expect(screen.getByText('hints offered: false used 0 of 3')).toBeInTheDocument();
    await getHint(user);
    expect(ai.hint).not.toHaveBeenCalled();
  });

  it('takes the ports from a provider, and lets a prop override them', async () => {
    const user = userEvent.setup();
    const above = ports();
    const own = ports();
    const { rerender } = render(
      <LkAiProvider ai={above}>
        <HostQuestion data={mc} />
      </LkAiProvider>,
    );

    await getHint(user);
    await waitFor(() => expect(above.hint).toHaveBeenCalledTimes(1));

    rerender(
      <LkAiProvider ai={above}>
        <HostQuestion data={mc} ai={own} />
      </LkAiProvider>,
    );
    await getHint(user);
    await waitFor(() => expect(own.hint).toHaveBeenCalledTimes(1));
    expect(above.hint).toHaveBeenCalledTimes(1);
  });

  it('keeps one identity for `ask`, so a host may hold it', async () => {
    const user = userEvent.setup();
    const seen: Seen[] = [];
    render(<HostQuestion data={mc} ai={ports()} seen={seen} submitted />);
    const first = seen[0];

    await getHint(user);
    await getExplanation(user);
    await screen.findByText('"She" is one person, so the verb is "is".');

    expect(seen.length).toBeGreaterThan(1);
    expect(seen.at(-1)?.hints.ask).toBe(first?.hints.ask);
    expect(seen.at(-1)?.explanation.ask).toBe(first?.explanation.ask);
  });

  it('drops an explanation the answer it was about has outrun', async () => {
    const user = userEvent.setup();
    const ai = ports();
    const { rerender } = render(<HostQuestion data={mc} ai={ai} submitted chosen="b" />);

    await getExplanation(user);
    await screen.findByText('"She" is one person, so the verb is "is".');

    // Another answer: the explanation on screen was written about the old one.
    rerender(<HostQuestion data={mc} ai={ai} submitted chosen="a" />);
    expect(screen.queryByText('"She" is one person, so the verb is "is".')).toBeNull();
  });

  it('works through a sequence’s own ports, for a question the host draws', async () => {
    const user = userEvent.setup();
    const ai = ports();
    // The sequence hands its ports down as the ordinary `ai` prop, so a host's
    // renderer passes what it was given straight to the hooks.
    function Drawn(props: ActivityProps & { question?: SequenceQuestion }) {
      return <HostQuestion {...props} />;
    }
    render(
      <ActivitySequence
        activities={[mc]}
        ai={ai}
        renderers={{ 'multiple-choice': Drawn }}
        renderMode="practice"
      />,
    );

    expect(screen.getByText('slot 0')).toBeInTheDocument();
    await getHint(user);
    expect(await screen.findByText('Who is tired? (1)')).toBeInTheDocument();
  });

  it('gives a sequence’s exam questions no ports at all', () => {
    const seenAi: (LearnerAi | undefined)[] = [];
    function Drawn({ ai }: ActivityProps) {
      seenAi.push(ai);
      return <p>Drawn</p>;
    }
    render(
      <ActivitySequence
        activities={[mc]}
        ai={ports()}
        renderers={{ 'multiple-choice': Drawn }}
        renderMode="exam"
      />,
    );

    expect(seenAi.length).toBeGreaterThan(0);
    expect(seenAi.every((handed) => handed === undefined)).toBe(true);
  });

  it('takes the exam from the paper around it, when the host forgets to pass one', async () => {
    const user = userEvent.setup();
    const ai = ports();
    // The host's renderer drops `renderMode` on the floor — the hooks would
    // default to `practice` — and a provider above the pager holds the ports
    // the exam sequence itself refuses to hand down. The paper decides.
    function Forgetful({ data }: ActivityProps) {
      return <HostQuestion data={data} submitted />;
    }
    render(
      <LkAiProvider ai={ai}>
        <ActivitySequence
          activities={[mc]}
          renderers={{ 'multiple-choice': Forgetful }}
          renderMode="exam"
        />
      </LkAiProvider>,
    );

    expect(screen.getByText('hints offered: false used 0 of 3')).toBeInTheDocument();
    expect(screen.getByText('explanation offered: false')).toBeInTheDocument();
    await getHint(user);
    await getExplanation(user);
    expect(ai.hint).not.toHaveBeenCalled();
    expect(ai.explain).not.toHaveBeenCalled();
  });

  it('refuses a host that says practice inside an exam', async () => {
    const user = userEvent.setup();
    const ai = ports();
    // Not a forgetful host but a confident one: its own component defaults
    // `renderMode` to 'practice', as a React component so often does, and it
    // is sitting in a paper of record. The paper still wins.
    function Confident({ data }: ActivityProps) {
      return <HostQuestion data={data} ai={ai} renderMode="practice" submitted />;
    }
    render(
      <ActivitySequence
        activities={[mc]}
        renderers={{ 'multiple-choice': Confident }}
        renderMode="exam"
      />,
    );

    expect(screen.getByText('hints offered: false used 0 of 3')).toBeInTheDocument();
    expect(screen.getByText('explanation offered: false')).toBeInTheDocument();
    await getHint(user);
    await getExplanation(user);
    expect(ai.hint).not.toHaveBeenCalled();
    expect(ai.explain).not.toHaveBeenCalled();
  });

  it('takes the review from the paper around it too, and practice where there is no paper', () => {
    const ai = ports();
    function Forgetful({ data, outcome }: ActivityProps) {
      return <HostQuestion data={data} ai={ai} {...(outcome !== undefined ? { outcome } : {})} />;
    }
    render(
      <ActivitySequence
        activities={[mc]}
        ai={ai}
        renderers={{ 'multiple-choice': Forgetful }}
        renderMode="review"
        outcomes={{ '0': scored }}
      />,
    );
    // Review, not the `practice` the hooks would have assumed: no hints, and
    // an explanation only because the grade of record is scored.
    expect(screen.getByText('hints offered: false used 0 of 3')).toBeInTheDocument();
    expect(screen.getByText('explanation offered: true')).toBeInTheDocument();
    cleanup();

    // On its own, with no paper around it, nothing changes: practice.
    render(<HostQuestion data={mc} ai={ai} />);
    expect(screen.getByText('hints offered: true used 0 of 3')).toBeInTheDocument();
  });

  it('marks a graded review answer explainable, and an unscored one not', async () => {
    const user = userEvent.setup();
    const ai = ports();
    const { rerender } = render(
      <HostQuestion data={mc} ai={ai} renderMode="review" outcome={scored} />,
    );
    expect(screen.getByText('explanation offered: true')).toBeInTheDocument();

    rerender(<HostQuestion data={mc} ai={ai} renderMode="review" outcome={ungraded} />);
    expect(screen.getByText('explanation offered: false')).toBeInTheDocument();
    await getExplanation(user);
    expect(ai.explain).not.toHaveBeenCalled();
  });
});
