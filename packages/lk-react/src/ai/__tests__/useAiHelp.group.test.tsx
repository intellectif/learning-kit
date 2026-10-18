import type {
  AiExplanationRequest,
  AiGroupInput,
  AiHintRequest,
  AiTextResult,
  AiWritingFeedbackRequest,
  ItemGroup,
  MultipleChoiceData,
  WrittenResponseData,
} from '@intellectif/lk-core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActivitySequence } from '../../components/ActivitySequence/index.js';
import type { ActivityProps } from '../../components/types.js';
import type { LearnerAi } from '../LkAiProvider.js';
import { useAiExplanation, useAiHints } from '../useAiHelp.js';

/**
 * A question read beside its group's material — a passage, or the
 * instructions a run of questions shares — sends that material with its
 * request. Inside a pager the paper knows the group; a host drawing its own
 * questions outside one passes it.
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const PASSAGE = 'The highest tides, called spring tides, come when the sun and the moon line up.';

const question = (id: string): MultipleChoiceData => ({
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id,
  title: id,
  question: 'When do the highest tides come?',
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  options: [
    { id: 'a', text: 'When the sun and the moon line up', isCorrect: true },
    { id: 'b', text: 'Only at full moon', isCorrect: false },
  ],
});

const reading = (
  body = PASSAGE,
  items: ItemGroup['items'] = [question('in-group')],
): ItemGroup => ({
  schemaVersion: '1.0',
  type: 'item-group',
  id: 'tides',
  title: 'Part 2',
  stimulus: { id: 'tides-text', kind: 'text', title: 'Tides', body },
  items,
});

const MATERIAL = { kind: 'text', title: 'Tides', text: PASSAGE };

/** A group the host believes in, which a paper's own must override. */
const elsewhere: AiGroupInput = {
  title: 'Somewhere else',
  stimulus: { id: 'x', kind: 'text', body: 'Not the passage on the screen.' },
};

function ports() {
  return {
    hint: vi.fn(
      async (_request: AiHintRequest): Promise<AiTextResult> => ({
        text: 'Read the last sentence.',
      }),
    ),
    explain: vi.fn(
      async (_request: AiExplanationRequest): Promise<AiTextResult> => ({
        text: 'The text says so.',
      }),
    ),
    writingFeedback: vi.fn(async (_request: AiWritingFeedbackRequest) => ({
      text: 'A clear summary.',
    })),
  } satisfies LearnerAi;
}

const sentHint = (ai: ReturnType<typeof ports>, call = 0): AiHintRequest =>
  ai.hint.mock.calls[call]?.[0] as AiHintRequest;

/** A host's own question, asking for help with the group it was told about. */
function HostQuestion({
  data,
  ai,
  group,
  submitted = false,
}: ActivityProps & { group?: AiGroupInput; submitted?: boolean }) {
  const shared = {
    data,
    response: { type: 'multiple-choice' as const, selectedOptionIds: submitted ? ['b'] : [] },
    submitted,
    ...(ai !== undefined ? { ai } : {}),
    ...(group !== undefined ? { group } : {}),
  };
  const hints = useAiHints(shared);
  const explanation = useAiExplanation(shared);
  return (
    <div>
      <button type="button" onClick={hints.ask}>
        Get a hint
      </button>
      <button type="button" onClick={explanation.ask}>
        Explain my answer
      </button>
    </div>
  );
}

describe('a question drawn outside any pager', () => {
  it('sends the group it was given with a hint and an explanation', async () => {
    const user = userEvent.setup();
    const ai = ports();
    const { rerender } = render(<HostQuestion data={question('q')} ai={ai} group={reading()} />);
    await user.click(screen.getByRole('button', { name: 'Get a hint' }));
    await waitFor(() => expect(ai.hint).toHaveBeenCalledTimes(1));
    expect(sentHint(ai).material).toEqual(MATERIAL);

    rerender(<HostQuestion data={question('q')} ai={ai} group={reading()} submitted />);
    await user.click(screen.getByRole('button', { name: 'Explain my answer' }));
    await waitFor(() => expect(ai.explain).toHaveBeenCalledTimes(1));
    expect(ai.explain.mock.calls[0]?.[0]).toMatchObject({ material: MATERIAL });
  });

  it('sends no material without a group', async () => {
    const user = userEvent.setup();
    const ai = ports();
    render(<HostQuestion data={question('q')} ai={ai} />);
    await user.click(screen.getByRole('button', { name: 'Get a hint' }));
    await waitFor(() => expect(ai.hint).toHaveBeenCalledTimes(1));
    expect(sentHint(ai)).not.toHaveProperty('material');
  });
});

describe('inside <ActivitySequence>, the paper decides the group', () => {
  it("sends a grouped question's passage, and none for a question on its own, whatever the host passes", async () => {
    const user = userEvent.setup();
    const ai = ports();
    function Drawn(props: ActivityProps) {
      return <HostQuestion {...props} group={elsewhere} />;
    }
    render(
      <ActivitySequence
        activities={[question('alone'), reading()]}
        ai={ai}
        renderers={{ 'multiple-choice': Drawn }}
        renderMode="practice"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Get a hint' }));
    await waitFor(() => expect(ai.hint).toHaveBeenCalledTimes(1));
    expect(sentHint(ai, 0)).not.toHaveProperty('material');

    await user.click(screen.getByRole('button', { name: 'Next' }));
    const hintButtons = screen.getAllByRole('button', { name: 'Get a hint' });
    await user.click(hintButtons[hintButtons.length - 1] as HTMLElement);
    await waitFor(() => expect(ai.hint).toHaveBeenCalledTimes(2));
    expect(sentHint(ai, 1).material).toEqual(MATERIAL);
  });

  it("sends it from the SDK's own components too", async () => {
    const user = userEvent.setup();
    const ai = ports();
    render(<ActivitySequence activities={[reading()]} ai={ai} renderMode="practice" />);
    await user.click(screen.getByRole('button', { name: 'Get a hint' }));
    await waitFor(() => expect(ai.hint).toHaveBeenCalledTimes(1));
    expect(sentHint(ai).material).toEqual(MATERIAL);
  });

  it('reads the group as the paper now holds it, after the passage was edited', async () => {
    const user = userEvent.setup();
    const ai = ports();
    const { rerender } = render(
      <ActivitySequence activities={[reading()]} ai={ai} renderMode="practice" />,
    );
    const edited = `${PASSAGE} Neap tides come between them.`;
    rerender(<ActivitySequence activities={[reading(edited)]} ai={ai} renderMode="practice" />);
    await user.click(screen.getByRole('button', { name: 'Get a hint' }));
    await waitFor(() => expect(ai.hint).toHaveBeenCalledTimes(1));
    expect(sentHint(ai).material?.text).toBe(edited);
  });

  it('sends the passage with feedback on a summary of it', async () => {
    const user = userEvent.setup();
    const ai = ports();
    const summary: WrittenResponseData = {
      schemaVersion: '1.0',
      type: 'written-response',
      id: 'summary',
      title: 'Summary',
      prompt: 'Summarise the text in one sentence.',
      minWords: 3,
      maxWords: 40,
    };
    render(
      <ActivitySequence activities={[reading(PASSAGE, [summary])]} ai={ai} renderMode="practice" />,
    );
    await user.type(
      screen.getByRole('textbox'),
      'Spring tides come when the sun and moon line up.',
    );
    await user.click(screen.getByRole('button', { name: 'Get feedback on my draft' }));
    await waitFor(() => expect(ai.writingFeedback).toHaveBeenCalledTimes(1));
    const [request] = ai.writingFeedback.mock.calls[0] as [AiWritingFeedbackRequest];
    expect(request.material).toEqual(MATERIAL);
  });
});
