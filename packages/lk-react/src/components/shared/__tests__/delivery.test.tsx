import type {
  DeliveryPolicy,
  DictationData,
  FillInTheBlanksData,
  GapSelectData,
  ItemOutcome,
  MultipleChoiceData,
  WrittenResponseData,
} from '@intellectif/lk-core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LearnerAi } from '../../../ai/LkAiProvider.js';
import { useAiHints } from '../../../ai/useAiHelp.js';
import { DEFAULT_STRINGS } from '../../../i18n/strings.js';
import { ActivitySequence } from '../../ActivitySequence/index.js';
import { Dictation } from '../../Dictation/index.js';
import { FillInTheBlanks } from '../../FillInTheBlanks/index.js';
import { GapSelect } from '../../GapSelect/index.js';
import { MultipleChoice } from '../../MultipleChoice/index.js';
import type { ActivityProps } from '../../types.js';
import { WrittenResponse } from '../../WrittenResponse/index.js';

/**
 * A delivery policy takes away what a mode would show — never more, and
 * nothing when it is empty. The existing suites are the proof of "nothing when
 * empty": every one of them passes unchanged. This file is the proof of each
 * setting, on each component it reaches, and of the paper's policy holding in
 * a question that was drawn by a host and handed nothing.
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const mc: MultipleChoiceData = {
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'mc1',
  title: 'Capital',
  question: 'What is the capital of Spain?',
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  options: [
    { id: 'madrid', text: 'Madrid', isCorrect: true, feedback: 'Yes, the capital.' },
    { id: 'seville', text: 'Seville', isCorrect: false, feedback: 'Seville is in the south.' },
  ],
  feedback: { correct: 'Well done.', incorrect: 'Not quite.' },
};

const fib: FillInTheBlanksData = {
  schemaVersion: '1.0',
  type: 'fill-in-the-blanks',
  id: 'fib1',
  title: 'To be',
  passage: 'My name {{be}} Rossi.',
  blanks: [
    {
      id: 'be',
      acceptedAnswers: ['is'],
      hint: 'Third person singular.',
      feedback: 'After "name", use "is".',
    },
  ],
  scoringStrategy: 'partial',
};

const gs: GapSelectData = {
  schemaVersion: '1.0',
  type: 'gap-select',
  id: 'gs1',
  title: 'To be',
  passage: 'She {{g}} tired.',
  gaps: [
    {
      id: 'g',
      choices: [
        { id: 'is', text: 'is' },
        { id: 'are', text: 'are' },
      ],
      correctChoiceId: 'is',
      feedback: 'One person: "is".',
    },
  ],
  scoringStrategy: 'partial',
};

const dictation: DictationData = {
  schemaVersion: '1.0',
  type: 'dictation',
  id: 'dc1',
  title: 'Listen and type',
  transcript: 'The cat sat on the mat.',
  media: { type: 'audio', url: 'https://x.test/cat.mp3', alt: 'Recording' },
  hints: { mode: 'progressive-words' },
};

const essay: WrittenResponseData = {
  schemaVersion: '1.0',
  type: 'written-response',
  id: 'wr1',
  title: 'Your weekend',
  prompt: 'Describe your weekend.',
  minWords: 1,
  maxWords: 50,
};

const scored = (score: number): ItemOutcome => ({
  status: 'scored',
  score,
  maxScore: 1,
  passed: score >= 0.7,
  feedback: null,
  details: [],
});

const submit = (name = 'Submit') => screen.getByRole('button', { name });
const marked = () => [...document.querySelectorAll('[data-correct]')];

describe('an empty policy', () => {
  it('is no policy: the same marks, feedback and score as with none', async () => {
    const user = userEvent.setup();
    const { container: none } = render(<MultipleChoice data={mc} />);
    await user.click(screen.getByRole('radio', { name: 'Seville' }));
    await user.click(submit());
    const without = none.innerHTML;
    cleanup();

    const { container: empty } = render(<MultipleChoice data={mc} delivery={{}} />);
    await user.click(screen.getByRole('radio', { name: 'Seville' }));
    await user.click(submit());
    expect(empty.innerHTML).toBe(without);
  });
});

describe('feedback: false', () => {
  it('multiple choice: says the answer was received, and still reports the score', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<MultipleChoice data={mc} delivery={{ feedback: false }} onComplete={onComplete} />);
    await user.click(screen.getByRole('radio', { name: 'Seville' }));
    await user.click(submit());

    expect(marked()).toHaveLength(0);
    expect(screen.queryByText('Seville is in the south.')).toBeNull();
    expect(screen.queryByText(/Score/)).toBeNull();
    expect(screen.queryByText(/Not quite/)).toBeNull();
    expect(screen.getByText('Answer submitted.')).toBeInTheDocument();
    // The grade is the host's to show later: it still arrives, whole.
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ score: 0, passed: false }));
  });

  it('fill in the blanks and gap select: no marks and no authored feedback', async () => {
    const user = userEvent.setup();
    render(<FillInTheBlanks data={fib} delivery={{ feedback: false }} />);
    await user.type(screen.getByRole('textbox'), 'are');
    await user.click(submit('Check answers'));
    expect(marked()).toHaveLength(0);
    expect(screen.queryByText('After "name", use "is".')).toBeNull();
    expect(screen.queryByRole('button', { name: /feedback/i })).toBeNull();
    expect(screen.getByText('Answer submitted.')).toBeInTheDocument();
    cleanup();

    render(<GapSelect data={gs} delivery={{ feedback: false }} />);
    await user.selectOptions(screen.getByRole('combobox'), 'are');
    await user.click(submit('Check answers'));
    expect(marked()).toHaveLength(0);
    expect(screen.queryByText('One person: "is".')).toBeNull();
    expect(screen.getByText('Answer submitted.')).toBeInTheDocument();
  });

  it('dictation: no word marks, no score, and no solution to self-mark against', async () => {
    const user = userEvent.setup();
    render(<Dictation data={dictation} delivery={{ feedback: false }} />);
    await user.type(screen.getByRole('textbox'), 'The cat sat on a mat');
    await user.click(submit('Check answers'));
    expect(screen.queryByRole('list', { name: 'Your answer, word by word' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show solution' })).toBeNull();
    expect(screen.getByText('Answer submitted.')).toBeInTheDocument();
  });

  it('review: reads back what was answered and not how it was marked', () => {
    render(
      <MultipleChoice
        data={mc}
        renderMode="review"
        defaultValue={{ type: 'multiple-choice', selectedOptionIds: ['seville'] }}
        outcome={scored(0)}
        delivery={{ feedback: false }}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Seville' })).toBeChecked();
    expect(marked()).toHaveLength(0);
    expect(screen.queryByText(/Score/)).toBeNull();
  });

  it('review: still says a grade is not in yet, which says nothing about the answer', () => {
    render(
      <WrittenResponse
        data={essay}
        renderMode="review"
        defaultValue={{ type: 'written-response', text: 'I went to the beach.', wordCount: 5 }}
        outcome={{ status: 'deferred', reason: 'requires_async_grading', maxScore: 1 }}
        delivery={{ feedback: false }}
      />,
    );
    expect(screen.getByText(DEFAULT_STRINGS.awaitingGrade)).toBeInTheDocument();
    cleanup();

    render(
      <WrittenResponse
        data={essay}
        renderMode="review"
        defaultValue={{ type: 'written-response', text: 'I went to the beach.', wordCount: 5 }}
        outcome={scored(0.9)}
        delivery={{ feedback: false }}
      />,
    );
    expect(screen.queryByText(/Score/)).toBeNull();
  });
});

describe('solutions: false', () => {
  it('multiple choice: marks the option chosen, never the right one that was missed', async () => {
    const user = userEvent.setup();
    render(<MultipleChoice data={mc} delivery={{ solutions: false }} />);
    await user.click(screen.getByRole('radio', { name: 'Seville' }));
    await user.click(submit());

    const madrid = screen.getByRole('radio', { name: 'Madrid' }).closest('label');
    const seville = screen.getByRole('radio', { name: /^Seville/ }).closest('label');
    expect(seville?.getAttribute('data-correct')).toBe('false');
    expect(madrid?.hasAttribute('data-correct')).toBe(false);
    // Feedback written on the right option would name it.
    expect(screen.queryByText('Yes, the capital.')).toBeNull();
    expect(screen.getByText('Seville is in the south.')).toBeInTheDocument();
  });

  it('multiple choice: still marks a right answer right', async () => {
    const user = userEvent.setup();
    render(<MultipleChoice data={mc} delivery={{ solutions: false }} />);
    await user.click(screen.getByRole('radio', { name: 'Madrid' }));
    await user.click(submit());
    expect(
      screen
        .getByRole('radio', { name: /^Madrid/ })
        .closest('label')
        ?.getAttribute('data-correct'),
    ).toBe('true');
  });

  it('fill in the blanks: showCorrectAnswers writes no answer in', async () => {
    const user = userEvent.setup();
    render(<FillInTheBlanks data={fib} showCorrectAnswers delivery={{ solutions: false }} />);
    await user.type(screen.getByRole('textbox'), 'are');
    await user.click(submit('Check answers'));
    // Still an input marked wrong, not the answer written into the passage.
    expect(screen.getByRole('textbox').getAttribute('data-correct')).toBe('false');
    expect(document.querySelector('.lk-fib-answer')).toBeNull();
  });

  it('dictation: marks the words, and offers no solution', async () => {
    const user = userEvent.setup();
    render(<Dictation data={dictation} delivery={{ solutions: false }} />);
    await user.type(screen.getByRole('textbox'), 'The cat sat on a mat');
    await user.click(submit('Check answers'));
    expect(screen.getByRole('list', { name: 'Your answer, word by word' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show solution' })).toBeNull();
  });
});

describe('hints: false', () => {
  it('fill in the blanks: takes away the author’s hint, which an exam shows by default', () => {
    render(<FillInTheBlanks data={fib} renderMode="exam" />);
    expect(screen.getByRole('button', { name: 'Show hint' })).toBeInTheDocument();
    cleanup();

    render(<FillInTheBlanks data={fib} renderMode="exam" delivery={{ hints: false }} />);
    expect(screen.queryByRole('button', { name: 'Show hint' })).toBeNull();
    expect(screen.getByRole('textbox').hasAttribute('aria-describedby')).toBe(false);
  });

  it('dictation: no word hints, and none reported on the response', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Dictation data={dictation} delivery={{ hints: false }} onSubmit={onSubmit} />);
    expect(screen.queryByRole('button', { name: /Reveal the next word/ })).toBeNull();
    await user.type(screen.getByRole('textbox'), 'The cat');
    await user.click(submit('Check answers'));
    expect(onSubmit.mock.calls[0]?.[0]).not.toHaveProperty('hintsRevealed');
  });

  it('switches AI hints off with the author’s, since a hint is a hint', () => {
    const ai: LearnerAi = { hint: vi.fn(async () => ({ text: 'Think.' })) };
    render(<MultipleChoice data={mc} ai={ai} delivery={{ hints: false }} />);
    expect(screen.queryByRole('button', { name: 'Get a hint' })).toBeNull();
  });
});

describe('ai switches', () => {
  const ports = (): LearnerAi => ({
    hint: vi.fn(async () => ({ text: 'Think about the government.' })),
    explain: vi.fn(async () => ({ text: 'Madrid is the capital.' })),
  });

  it('switch one feature off and leave the other', async () => {
    const user = userEvent.setup();
    render(<MultipleChoice data={mc} ai={ports()} delivery={{ ai: { hints: false } }} />);
    expect(screen.queryByRole('button', { name: 'Get a hint' })).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'Seville' }));
    await user.click(submit());
    expect(screen.getByRole('button', { name: 'Explain my answer' })).toBeInTheDocument();
  });

  it('offer no explanation where the grade or the answer is hidden, since it would give both', async () => {
    const user = userEvent.setup();
    for (const delivery of [{ feedback: false }, { solutions: false }] as DeliveryPolicy[]) {
      render(<MultipleChoice data={mc} ai={ports()} delivery={delivery} />);
      await user.click(screen.getByRole('radio', { name: 'Seville' }));
      await user.click(submit());
      expect(screen.queryByRole('button', { name: 'Explain my answer' })).toBeNull();
      cleanup();
    }
  });
});

describe('a policy nobody can read', () => {
  it('restricts rather than allows, and says so in development', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <FillInTheBlanks
        data={fib}
        // A form that posts strings: its author meant "off".
        delivery={{ hints: 'false' } as unknown as DeliveryPolicy}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Show hint' })).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/delivery policy is not valid/));
  });
});

describe('the paper decides', () => {
  it('reaches every question in a sequence', () => {
    render(<ActivitySequence activities={[fib]} renderMode="exam" delivery={{ hints: false }} />);
    expect(screen.queryByRole('button', { name: 'Show hint' })).toBeNull();
  });

  it('hands a host’s renderer the policy, and holds in it when the host ignores it', async () => {
    const user = userEvent.setup();
    const ai: LearnerAi = { hint: vi.fn(async () => ({ text: 'Think.' })) };
    const handed: unknown[] = [];
    // Draws its own question, and asks the hooks for hints without passing
    // on the policy it was handed.
    function Careless({ data, delivery }: ActivityProps) {
      handed.push(delivery);
      const hints = useAiHints({
        data,
        ai,
        response: { type: 'multiple-choice', selectedOptionIds: [] },
        submitted: false,
      });
      return (
        <button type="button" onClick={hints.ask}>
          {`Mine: hints ${hints.offered ? 'on' : 'off'}`}
        </button>
      );
    }
    render(
      <ActivitySequence
        activities={[mc]}
        renderers={{ 'multiple-choice': Careless }}
        delivery={{ ai: { hints: false } }}
      />,
    );
    expect(handed.at(-1)).toEqual({ ai: { hints: false } });
    await user.click(screen.getByRole('button', { name: 'Mine: hints off' }));
    expect(ai.hint).not.toHaveBeenCalled();
  });

  it('holds in an SDK component a host draws and hands a policy of its own', async () => {
    const user = userEvent.setup();
    // The host wraps the SDK's own component and passes it a DIFFERENT policy
    // from the one it was handed — it switches feedback off, and says nothing
    // about hints. The paper switched hints off, and that still holds: the
    // two combine, whichever is stricter, setting by setting.
    render(
      <ActivitySequence
        activities={[fib]}
        delivery={{ hints: false }}
        renderers={{
          'fill-in-the-blanks': (props) => (
            <FillInTheBlanks
              {...(props as ActivityProps<FillInTheBlanksData>)}
              delivery={{ feedback: false }}
            />
          ),
        }}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Show hint' })).toBeNull();
    await user.type(screen.getByRole('textbox'), 'are');
    await user.click(submit('Check answers'));
    expect(marked()).toHaveLength(0);
  });

  it('holds in an SDK component a host draws and hands no policy at all', () => {
    render(
      <ActivitySequence
        activities={[fib]}
        renderMode="exam"
        delivery={{ hints: false }}
        renderers={{
          'fill-in-the-blanks': ({ data, renderMode }) => (
            <FillInTheBlanks
              data={data as FillInTheBlanksData}
              {...(renderMode !== undefined ? { renderMode } : {})}
            />
          ),
        }}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Show hint' })).toBeNull();
  });
});
