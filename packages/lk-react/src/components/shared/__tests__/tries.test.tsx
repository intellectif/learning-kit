import type {
  ActivityResult,
  DictationData,
  FillInTheBlanksData,
  GapSelectData,
  LearnerResponse,
  MultipleChoiceData,
} from '@intellectif/lk-core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LearnerAi } from '../../../ai/LkAiProvider.js';
import { ActivitySequence, type SequenceItemOutcome } from '../../ActivitySequence/index.js';
import { Dictation } from '../../Dictation/index.js';
import { FillInTheBlanks } from '../../FillInTheBlanks/index.js';
import { GapSelect } from '../../GapSelect/index.js';
import { MultipleChoice } from '../../MultipleChoice/index.js';
import type { ActivityProps } from '../../types.js';
import { mintTake, stampTake } from '../sequence-slot.js';

/**
 * Tries and hint costs move grades, so the first thing under test is that
 * nothing moves without a policy — every other suite in this package passes
 * unchanged, which is the wider proof. Then each rule the components share:
 * when "Try again" is offered and when it is not, that the answer is kept and
 * the marks go, that no right answer and no explanation show while another try
 * is on offer, which try counts and what a hint costs, and how a set waits for
 * the question on screen and closes every question's tries once it reports.
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
  blanks: [{ id: 'be', acceptedAnswers: ['is'], hint: 'Third person singular.' }],
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

const submit = (name = 'Submit') => screen.getByRole('button', { name });
const tryAgain = () => screen.queryByRole('button', { name: 'Try again' });
const feedbackText = (id: string) => document.getElementById(`${id}-feedback`)?.textContent ?? '';
const optionMark = (text: string) =>
  screen
    .getByRole('radio', { name: new RegExp(`^${text}`) })
    .closest('label')
    ?.getAttribute('data-correct');

describe('with no policy', () => {
  it('offers no second try, and reports the answer once, as it always has', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    const onSubmit = vi.fn();
    render(<MultipleChoice data={mc} onComplete={onComplete} onSubmit={onSubmit} />);
    await user.click(screen.getByRole('radio', { name: /^Seville/ }));
    await user.click(submit());
    expect(tryAgain()).toBeNull();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0]?.[0]).toMatchObject({ score: 0, maxScore: 1, passed: false });
    expect(onSubmit).toHaveBeenCalledWith({
      type: 'multiple-choice',
      selectedOptionIds: ['seville'],
    });
    // The right answer shows at once, as before.
    expect(optionMark('Madrid')).toBe('true');
    expect(feedbackText('mc1')).toBe('Answer submitted. Score 0%. Not passed. Not quite.');
  });
});

describe('Try again', () => {
  it('is offered after an answer short of full marks, and hides the right answer while it is', async () => {
    const user = userEvent.setup();
    const explain = vi.fn(async () => ({ text: 'Madrid.' }));
    render(<MultipleChoice data={mc} scoring={{ retries: 1 }} ai={{ explain }} />);
    await user.click(screen.getByRole('radio', { name: /^Seville/ }));
    await user.click(submit());
    expect(tryAgain()).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Show answer' })).toBeInTheDocument();
    // What the learner chose is marked; the right option they missed is not.
    expect(optionMark('Seville')).toBe('false');
    expect(optionMark('Madrid')).toBeNull();
    // An explanation would name the answer the next try is for.
    expect(screen.queryByRole('button', { name: 'Explain my answer' })).toBeNull();
    expect(feedbackText('mc1')).toBe(
      'Answer submitted. Score 0%. Not passed. 1 try left. Not quite.',
    );
  });

  it('keeps the answer, clears the marks, and puts the learner back at the question', async () => {
    const user = userEvent.setup();
    render(<MultipleChoice data={mc} scoring={{ retries: 1 }} />);
    await user.click(screen.getByRole('radio', { name: /^Seville/ }));
    await user.click(submit());
    await user.click(tryAgain() as HTMLElement);
    expect(screen.getByRole('radio', { name: /^Seville/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /^Seville/ })).toBeEnabled();
    expect(optionMark('Seville')).toBeNull();
    expect(feedbackText('mc1')).toBe('');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: /^Madrid/ }));
  });

  it('is not offered after full marks, without feedback, in an exam, or disabled', async () => {
    const user = userEvent.setup();
    render(<MultipleChoice data={mc} scoring={{ retries: 2 }} />);
    await user.click(screen.getByRole('radio', { name: /^Madrid/ }));
    await user.click(submit());
    expect(tryAgain()).toBeNull();
    cleanup();

    // Offered where the learner cannot see the marks, it would say the answer was wrong.
    render(<MultipleChoice data={mc} scoring={{ retries: 2 }} delivery={{ feedback: false }} />);
    await user.click(screen.getByRole('radio', { name: /^Seville/ }));
    await user.click(submit());
    expect(tryAgain()).toBeNull();
    cleanup();

    render(<MultipleChoice data={mc} scoring={{ retries: 2 }} renderMode="exam" />);
    await user.click(screen.getByRole('radio', { name: /^Seville/ }));
    await user.click(submit());
    expect(tryAgain()).toBeNull();
  });

  it('runs out: the last try allowed offers no other, and the answer shows', async () => {
    const user = userEvent.setup();
    render(<MultipleChoice data={mc} scoring={{ retries: 1 }} />);
    await user.click(screen.getByRole('radio', { name: /^Seville/ }));
    await user.click(submit());
    await user.click(tryAgain() as HTMLElement);
    await user.click(submit());
    expect(tryAgain()).toBeNull();
    expect(optionMark('Madrid')).toBe('true');
  });

  it('Show answer ends the tries, shows what a finished question shows, and keeps focus', async () => {
    const user = userEvent.setup();
    const explain = vi.fn(async () => ({ text: 'Madrid.' }));
    render(<MultipleChoice data={mc} scoring={{ retries: 1 }} ai={{ explain }} />);
    await user.click(screen.getByRole('radio', { name: /^Seville/ }));
    await user.click(submit());
    await user.click(screen.getByRole('button', { name: 'Show answer' }));
    expect(tryAgain()).toBeNull();
    expect(optionMark('Madrid')).toBe('true');
    expect(screen.getByRole('button', { name: 'Explain my answer' })).toBeInTheDocument();
    expect(document.activeElement).toBe(document.getElementById('mc1-feedback'));
    expect(feedbackText('mc1')).toBe('Answer submitted. Score 0%. Not passed. Not quite.');
  });

  it('says "Keep this answer" where the paper shows no right answer to close on', async () => {
    const user = userEvent.setup();
    render(<GapSelect data={gs} scoring={{ retries: 1 }} />);
    await user.selectOptions(screen.getByRole('combobox'), 'are');
    await user.click(submit('Check answers'));
    expect(screen.getByRole('button', { name: 'Keep this answer' })).toBeInTheDocument();
    cleanup();

    render(<MultipleChoice data={mc} scoring={{ retries: 1 }} delivery={{ solutions: false }} />);
    await user.click(screen.getByRole('radio', { name: /^Seville/ }));
    await user.click(submit());
    expect(screen.getByRole('button', { name: 'Keep this answer' })).toBeInTheDocument();
  });
});

describe('which try counts', () => {
  const twoTries = async (onComplete: (result: ActivityResult) => void, scoring: object) => {
    const user = userEvent.setup();
    render(<MultipleChoice data={mc} scoring={scoring} onComplete={onComplete} />);
    await user.click(screen.getByRole('radio', { name: /^Seville/ }));
    await user.click(submit());
    await user.click(tryAgain() as HTMLElement);
    await user.click(screen.getByRole('radio', { name: /^Madrid/ }));
    await user.click(submit());
  };

  it('the first, by default: a later right answer is for learning and moves no grade', async () => {
    const onComplete = vi.fn();
    await twoTries(onComplete, { retries: 1 });
    expect(onComplete).toHaveBeenCalledTimes(2);
    expect(onComplete.mock.calls[1]?.[0]).toMatchObject({ score: 0, passed: false });
    expect(feedbackText('mc1')).toBe(
      'Answer submitted. Score 0%. Not passed. Your first try counts. This one scored 100%. Well done.',
    );
  });

  it('the best, after what each try cost', async () => {
    const onComplete = vi.fn();
    await twoTries(onComplete, { retries: 1, retryPenalty: 0.25, counts: 'best' });
    expect(onComplete.mock.calls[1]?.[0]).toMatchObject({ score: 0.75, passed: true });
    expect(feedbackText('mc1')).toBe(
      'Answer submitted. Score 75%. Passed. Before hints and tries, this answer scored 100%. Well done.',
    );
  });

  it('the statement records the try just made, at what it cost', async () => {
    const onComplete = vi.fn();
    await twoTries(onComplete, { retries: 1, retryPenalty: 0.25, counts: 'last' });
    const result = onComplete.mock.calls[1]?.[0] as ActivityResult;
    expect(result.score).toBe(0.75);
    expect(result.xapiStatement.result?.score?.scaled).toBe(0.75);
  });
});

describe('what hints cost', () => {
  it('says the cost before a hint is asked for, and charges each blank once', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    const onChange = vi.fn();
    render(
      <FillInTheBlanks
        data={fib}
        scoring={{ hintPenalty: 0.25 }}
        onComplete={onComplete}
        onChange={onChange}
      />,
    );
    expect(screen.getByText("Each hint costs 25% of this question's marks.")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show hint' }));
    expect(onChange).toHaveBeenLastCalledWith({
      type: 'fill-in-the-blanks',
      answers: {},
      hintsRevealed: 1,
    });
    // Hidden and shown again: one hint, seen once.
    await user.click(screen.getByRole('button', { name: 'Hide hint' }));
    await user.click(screen.getByRole('button', { name: 'Show hint' }));
    await user.type(screen.getByRole('textbox'), 'is');
    expect(onChange).toHaveBeenLastCalledWith({
      type: 'fill-in-the-blanks',
      answers: { be: 'is' },
      hintsRevealed: 1,
    });
    await user.click(submit('Check answers'));
    expect(onComplete.mock.calls[0]?.[0]).toMatchObject({ score: 0.75, passed: true });
  });

  it('counts a restored answer’s hints, and adds the ones shown after', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onComplete = vi.fn();
    render(
      <FillInTheBlanks
        data={fib}
        scoring={{ hintPenalty: 0.25 }}
        defaultValue={{ type: 'fill-in-the-blanks', answers: { be: 'is' }, hintsRevealed: 2 }}
        onSubmit={onSubmit}
        onComplete={onComplete}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Show hint' }));
    await user.click(submit('Check answers'));
    expect(onSubmit).toHaveBeenCalledWith({
      type: 'fill-in-the-blanks',
      answers: { be: 'is' },
      hintsRevealed: 3,
    });
    expect(onComplete.mock.calls[0]?.[0]).toMatchObject({ score: 0.25 });
  });

  it('counts nothing in an exam, where an author’s hint is free as it always was', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <FillInTheBlanks
        data={fib}
        renderMode="exam"
        scoring={{ hintPenalty: 0.25 }}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.queryByText(/Each hint costs/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Show hint' }));
    await user.type(screen.getByRole('textbox'), 'is');
    await user.click(submit('Submit answers'));
    expect(onSubmit).toHaveBeenCalledWith({ type: 'fill-in-the-blanks', answers: { be: 'is' } });
  });

  it('charges an AI hint, and reports it as it is shown', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onComplete = vi.fn();
    const ai: LearnerAi = { hint: vi.fn(async () => ({ text: 'Think about the government.' })) };
    render(
      <MultipleChoice
        data={mc}
        ai={ai}
        scoring={{ hintPenalty: 0.2 }}
        onChange={onChange}
        onComplete={onComplete}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Get a hint' }));
    await screen.findByText('Think about the government.');
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith({
        type: 'multiple-choice',
        selectedOptionIds: [],
        hintsRevealed: 1,
      }),
    );
    await user.click(screen.getByRole('radio', { name: /^Madrid/ }));
    await user.click(submit());
    expect(onComplete.mock.calls[0]?.[0]).toMatchObject({ score: 0.8, passed: true });
  });

  it('dictation: a word hint shown stays shown where it costs, and is charged', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<Dictation data={dictation} scoring={{ hintPenalty: 0.1 }} onComplete={onComplete} />);
    await user.click(screen.getByRole('button', { name: /Reveal the next word/ }));
    expect(screen.queryByRole('button', { name: 'Reset hints' })).toBeNull();
    await user.type(screen.getByRole('textbox'), 'The cat sat on the mat.');
    await user.click(submit('Check answers'));
    expect(onComplete.mock.calls[0]?.[0]).toMatchObject({ score: 0.9 });
  });
});

describe('a right answer that may not show', () => {
  it('dictation: the marks say a word is wrong or missing, not what it should be', async () => {
    const user = userEvent.setup();
    render(<Dictation data={dictation} delivery={{ solutions: false }} />);
    await user.type(screen.getByRole('textbox'), 'cat sad on the mat');
    await user.click(submit('Check answers'));
    const marks = screen.getByRole('list', { name: 'Your answer, word by word' }).textContent ?? '';
    expect(marks).toContain('A word is missing');
    expect(marks).toContain('“sad” is wrong');
    expect(marks).not.toContain('The');
    expect(marks).not.toContain('should be');
    expect(document.querySelector('.lk-dc-diff')).toBeNull();
  });

  it('dictation: the same while another try is on offer, and the words once it closes', async () => {
    const user = userEvent.setup();
    render(<Dictation data={dictation} scoring={{ retries: 1 }} />);
    await user.type(screen.getByRole('textbox'), 'cat sad on the mat');
    await user.click(submit('Check answers'));
    const marks = () =>
      screen.getByRole('list', { name: 'Your answer, word by word' }).textContent ?? '';
    expect(marks()).toContain('A word is missing');
    expect(screen.queryByRole('button', { name: 'Show solution' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Show answer' }));
    expect(marks()).toContain('“sad” should be “sat”');
    expect(screen.getByRole('button', { name: 'Show solution' })).toBeInTheDocument();
  });
});

describe('a policy nobody could apply', () => {
  it('fails the question at render rather than grade by a guess', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // A component: its error boundary shows the failure in place of the question
    // (in development, the error itself).
    render(<MultipleChoice data={mc} scoring={{ hintPenalty: '0.1' } as never} />);
    expect(screen.getByText(/this item scoring policy cannot be applied/)).toBeInTheDocument();
    expect(screen.queryByRole('radio')).toBeNull();
    cleanup();
    // A paper: it throws before any question is drawn.
    expect(() =>
      render(<ActivitySequence activities={[mc]} scoring={{ retries: 2, retryPenalty: 0.5 }} />),
    ).toThrow(/retryPenalty/);
  });
});

describe('in a question set', () => {
  const twoQuestions = [mc, { ...mc, id: 'mc2' }];

  it('waits for the question on screen while it offers a try, and takes the later grade', async () => {
    const user = userEvent.setup();
    const onFinished = vi.fn<(items: SequenceItemOutcome[]) => void>();
    const onActivityComplete = vi.fn();
    render(
      <ActivitySequence
        activities={[mc]}
        scoring={{ retries: 1, counts: 'best', retryPenalty: 0.5 }}
        onFinished={onFinished}
        onActivityComplete={onActivityComplete}
      />,
    );
    await user.click(screen.getByRole('radio', { name: /^Seville/ }));
    await user.click(submit());
    expect(onActivityComplete).toHaveBeenCalledTimes(1);
    expect(onFinished).not.toHaveBeenCalled();
    await user.click(tryAgain() as HTMLElement);
    await user.click(screen.getByRole('radio', { name: /^Madrid/ }));
    await user.click(submit());
    expect(onActivityComplete).toHaveBeenCalledTimes(2);
    expect(onFinished).toHaveBeenCalledTimes(1);
    const [item] = onFinished.mock.calls[0]?.[0] ?? [];
    expect(item).toMatchObject({ kind: 'scored', result: { score: 0.5, passed: false } });
  });

  it('reports once the learner closes the question on screen', async () => {
    const user = userEvent.setup();
    const onFinished = vi.fn();
    render(<ActivitySequence activities={[mc]} scoring={{ retries: 1 }} onFinished={onFinished} />);
    await user.click(screen.getByRole('radio', { name: /^Seville/ }));
    await user.click(submit());
    expect(onFinished).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Show answer' }));
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('does not wait for a question the learner left, and closes its tries when it reports', async () => {
    const user = userEvent.setup();
    const onFinished = vi.fn();
    render(
      <ActivitySequence
        activities={twoQuestions}
        scoring={{ retries: 1 }}
        onFinished={onFinished}
      />,
    );
    await user.click(screen.getByRole('radio', { name: /^Seville/ }));
    await user.click(submit());
    expect(tryAgain()).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    const second = document.querySelectorAll('.lk-mc')[1] as HTMLElement;
    await user.click(second.querySelector('input[value="madrid"]') as HTMLElement);
    await user.click(second.querySelector('button[type="submit"]') as HTMLElement);
    expect(onFinished).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    // The set was handed on: the first question offers no try that could change it.
    expect(tryAgain()).toBeNull();
    expect(optionMark('Madrid')).toBe('true');
  });

  it('holds the paper’s policy in every question, over one a question was handed', async () => {
    const user = userEvent.setup();
    const onActivityComplete = vi.fn();
    render(
      <ActivitySequence
        activities={[mc]}
        scoring={{ hintPenalty: 0.5 }}
        renderers={{
          'multiple-choice': (props) => (
            <MultipleChoice {...props} scoring={{ retries: 3 }} data={props.data as never} />
          ),
        }}
        onActivityComplete={onActivityComplete}
      />,
    );
    await user.click(screen.getByRole('radio', { name: /^Seville/ }));
    await user.click(submit());
    // The paper gives one try; the question asked for four.
    expect(tryAgain()).toBeNull();
  });

  it('keeps a consumer renderer’s first grade, which it stamps no try on', () => {
    const onActivityComplete = vi.fn();
    const Twice = ({ onComplete }: { onComplete?: (result: ActivityResult) => void }) => {
      const result = (score: number) =>
        ({ score, maxScore: 1, passed: score >= 0.7, timeSpent: 0 }) as unknown as ActivityResult;
      onComplete?.(result(0));
      onComplete?.(result(1));
      return null;
    };
    const onFinished = vi.fn();
    render(
      <ActivitySequence
        activities={[mc]}
        scoring={{ retries: 1 }}
        renderers={{ 'multiple-choice': Twice }}
        onActivityComplete={onActivityComplete}
        onFinished={onFinished}
      />,
    );
    expect(onActivityComplete).toHaveBeenCalledTimes(1);
    expect(onFinished.mock.calls[0]?.[0]?.[0]).toMatchObject({ result: { score: 0 } });
  });
});

describe('restored and reviewed answers', () => {
  it('a question restored as submitted offers no try it never had', () => {
    render(
      <MultipleChoice
        data={mc}
        scoring={{ retries: 2 }}
        defaultValue={{ type: 'multiple-choice', selectedOptionIds: ['seville'] }}
        defaultSubmitted
      />,
    );
    expect(tryAgain()).toBeNull();
  });

  it('writes no hint count on a response that saw no hint', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(response: LearnerResponse) => void>();
    render(<GapSelect data={gs} scoring={{ hintPenalty: 0.5 }} onSubmit={onSubmit} />);
    await user.selectOptions(screen.getByRole('combobox'), 'is');
    await user.click(submit('Check answers'));
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ type: 'gap-select', selections: { g: 'is' } });
  });
});

describe('the gaps a mutation sweep found', () => {
  const twoBlanks: FillInTheBlanksData = {
    ...fib,
    id: 'fib2',
    passage: 'She {{be}} tired and {{go}} home.',
    blanks: [
      { id: 'be', acceptedAnswers: ['is'], hint: 'Third person singular.' },
      { id: 'go', acceptedAnswers: ['goes'] },
    ],
  };

  it('a question disabled after it was graded offers no try', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<MultipleChoice data={mc} scoring={{ retries: 1 }} />);
    await user.click(screen.getByRole('radio', { name: /^Seville/ }));
    await user.click(submit());
    expect(tryAgain()).not.toBeNull();
    rerender(<MultipleChoice data={mc} scoring={{ retries: 1 }} disabled />);
    expect(tryAgain()).toBeNull();
  });

  it('says the best try counts when an earlier one scored more', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(
      <FillInTheBlanks
        data={twoBlanks}
        scoring={{ retries: 1, counts: 'best' }}
        onComplete={onComplete}
      />,
    );
    const [be, go] = screen.getAllByRole('textbox') as [HTMLElement, HTMLElement];
    await user.type(be, 'is');
    await user.type(go, 'went');
    await user.click(submit('Check answers'));
    await user.click(tryAgain() as HTMLElement);
    await user.clear(be);
    await user.type(be, 'are');
    await user.click(submit('Check answers'));
    expect(onComplete.mock.calls[1]?.[0]).toMatchObject({ score: 0.5 });
    expect(feedbackText('fib2')).toContain('Your best try counts. This one scored 0%.');
  });

  it('multiple choice counts a restored answer’s hints', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(
      <MultipleChoice
        data={mc}
        scoring={{ hintPenalty: 0.25 }}
        defaultValue={{ type: 'multiple-choice', selectedOptionIds: [], hintsRevealed: 2 }}
        onComplete={onComplete}
      />,
    );
    await user.click(screen.getByRole('radio', { name: /^Madrid/ }));
    await user.click(submit());
    expect(onComplete.mock.calls[0]?.[0]).toMatchObject({ score: 0.5 });
  });

  it('fill in the blanks writes no answer in while another try is on offer', async () => {
    const user = userEvent.setup();
    render(<FillInTheBlanks data={fib} scoring={{ retries: 1 }} showCorrectAnswers />);
    await user.type(screen.getByRole('textbox'), 'are');
    await user.click(submit('Check answers'));
    expect(document.querySelector('.lk-fib-answer')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Show answer' }));
    expect(document.querySelector('.lk-fib-answer')?.textContent).toBe('is');
  });

  it('fill in the blanks closes on "Keep this answer" where it would write no answer in', async () => {
    const user = userEvent.setup();
    render(<FillInTheBlanks data={fib} scoring={{ retries: 1 }} />);
    await user.type(screen.getByRole('textbox'), 'are');
    await user.click(submit('Check answers'));
    expect(screen.getByRole('button', { name: 'Keep this answer' })).toBeInTheDocument();
  });

  it('a hint hidden and shown again is not reported as a second one', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FillInTheBlanks data={fib} scoring={{ hintPenalty: 0.25 }} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Show hint' }));
    await user.click(screen.getByRole('button', { name: 'Hide hint' }));
    await user.click(screen.getByRole('button', { name: 'Show hint' }));
    expect(onChange).toHaveBeenCalled();
    for (const [response] of onChange.mock.calls) {
      expect(response).toMatchObject({ hintsRevealed: 1 });
    }
  });

  it('gap select charges an AI hint', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    const ai: LearnerAi = { hint: vi.fn(async () => ({ text: 'Count the people.' })) };
    render(<GapSelect data={gs} ai={ai} scoring={{ hintPenalty: 0.5 }} onComplete={onComplete} />);
    await user.click(screen.getByRole('button', { name: 'Get a hint' }));
    await screen.findByText('Count the people.');
    await user.selectOptions(screen.getByRole('combobox'), 'is');
    await user.click(submit('Check answers'));
    expect(onComplete.mock.calls[0]?.[0]).toMatchObject({ score: 0.5 });
  });

  it('dictation draws a missing word as a gap, not as the word', async () => {
    const user = userEvent.setup();
    render(<Dictation data={dictation} delivery={{ solutions: false }} />);
    await user.type(screen.getByRole('textbox'), 'cat sat on the mat');
    await user.click(submit('Check answers'));
    const missing = document.querySelector('li[data-state="missing"] .lk-dc-word-text');
    expect(missing?.textContent).toBe('…');
  });

  it('a set waits for a question being tried again, wherever the learner is', async () => {
    const user = userEvent.setup();
    const onFinished = vi.fn<(items: SequenceItemOutcome[]) => void>();
    render(
      <ActivitySequence
        activities={[mc, { ...mc, id: 'mc2' }]}
        scoring={{ retries: 1, counts: 'last' }}
        onFinished={onFinished}
      />,
    );
    const [first, second] = [...document.querySelectorAll('.lk-mc')] as [HTMLElement, HTMLElement];
    await user.click(first.querySelector('input[value="seville"]') as HTMLElement);
    await user.click(first.querySelector('button[type="submit"]') as HTMLElement);
    await user.click(tryAgain() as HTMLElement);
    // Walked away mid-retry: the first question is unanswered again.
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(second.querySelector('input[value="madrid"]') as HTMLElement);
    await user.click(second.querySelector('button[type="submit"]') as HTMLElement);
    expect(onFinished).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    await user.click(first.querySelector('input[value="madrid"]') as HTMLElement);
    await user.click(first.querySelector('button[type="submit"]') as HTMLElement);
    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(onFinished.mock.calls[0]?.[0]?.[0]).toMatchObject({ result: { score: 1 } });
  });

  it('a set stops waiting for a question its host takes away', async () => {
    const user = userEvent.setup();
    const onFinished = vi.fn();
    function Removable(props: ActivityProps) {
      const [shown, setShown] = useState(true);
      return shown ? (
        <>
          <MultipleChoice {...props} data={props.data as never} />
          <button type="button" onClick={() => setShown(false)}>
            Remove
          </button>
        </>
      ) : null;
    }
    render(
      <ActivitySequence
        activities={[mc]}
        scoring={{ retries: 1 }}
        renderers={{ 'multiple-choice': Removable }}
        onFinished={onFinished}
      />,
    );
    await user.click(screen.getByRole('radio', { name: /^Seville/ }));
    await user.click(submit());
    expect(onFinished).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('keeps a consumer renderer’s first grade even against a stamped one after it', () => {
    const onActivityComplete = vi.fn();
    const result = (score: number) =>
      ({ score, maxScore: 1, passed: score >= 0.7, timeSpent: 0 }) as unknown as ActivityResult;
    // The first question reports twice; the second stays unanswered, so the
    // set is not reported and only the stamp could let the second grade in.
    const Mixed = ({
      data,
      onComplete,
    }: {
      data: { id: string };
      onComplete?: (result: ActivityResult) => void;
    }) => {
      if (data.id === 'mc1') {
        onComplete?.(result(0));
        onComplete?.(stampTake(result(1), mintTake()));
      }
      return null;
    };
    render(
      <ActivitySequence
        activities={[mc, { ...mc, id: 'mc2' }]}
        scoring={{ retries: 1 }}
        renderers={{ 'multiple-choice': Mixed as never }}
        onActivityComplete={onActivityComplete}
      />,
    );
    expect(onActivityComplete).toHaveBeenCalledTimes(1);
    expect(onActivityComplete.mock.calls[0]?.[0]).toMatchObject({ score: 0 });
  });
});
