import type { ItemGroup, RouteTrace } from '@intellectif/lk-core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { checkA11y } from '../../../test-support/a11y.js';
import { ReadingRoute, type ReadingRouteResult } from '../index.js';
import { tramGroup } from './fixture.js';

/** A clock the test moves by hand. */
function testClock(start = 1_000_000): { now: () => number; advance: (ms: number) => void } {
  let time = start;
  return { now: () => time, advance: (ms) => (time += ms) };
}

const sentence = (text: string): HTMLElement => {
  const found = [...document.querySelectorAll<HTMLElement>('.lk-rr-sentence')].find((element) =>
    element.textContent?.includes(text),
  );
  if (found === undefined) {
    throw new Error(`No sentence holds "${text}"`);
  }
  return found;
};

/** The passage text marked as a step's target, without the pair numbers drawn into it. */
const targets = (): string[] =>
  [...document.querySelectorAll('.lk-rr-piece[data-kind~="target"]')].map((element) => {
    const copy = element.cloneNode(true) as HTMLElement;
    for (const number of copy.querySelectorAll('.lk-rr-pair-number')) {
      number.remove();
    }
    return copy.textContent ?? '';
  });

const guide = (): HTMLElement => screen.getByRole('complementary', { name: 'Reading guide' });

const next = async (user: ReturnType<typeof userEvent.setup>, times = 1): Promise<void> => {
  for (let count = 0; count < times; count += 1) {
    await user.click(within(guide()).getByRole('button', { name: 'Next' }));
  }
};

const card = (itemId: string): HTMLElement =>
  document.querySelector<HTMLElement>(`[data-route-item="${itemId}"]`) as HTMLElement;

describe('<ReadingRoute> walkthrough', () => {
  it('lays the passage out with its labels and numbers the questions as on the paper', () => {
    render(<ReadingRoute group={tramGroup()} />);
    const labels = [...document.querySelectorAll('.lk-rr-paragraph-label')].map(
      (label) => label.textContent,
    );
    expect(labels).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(within(card('tf1')).getByText('Question 1')).toBeInTheDocument();
    expect(within(card('fib1')).getByText('Questions 5–6')).toBeInTheDocument();
    expect(within(card('gs1')).getByText('Questions 7–8')).toBeInTheDocument();
    expect(screen.getByText('True / False / Not Given').nextSibling).toHaveTextContent(
      'Walkthrough',
    );
  });

  it('walks step by step, and asks where to look before it shows', async () => {
    const user = userEvent.setup();
    render(<ReadingRoute group={tramGroup()} />);
    // A headings task in the route: skim first, the paragraph openings marked.
    expect(within(guide()).getByRole('heading', { name: 'Skim the text' })).toBeInTheDocument();
    expect(targets()).toContain('Planners began to reconsider in the 1980s.');

    await next(user);
    expect(
      within(guide()).getByRole('heading', { name: 'Read the instructions' }),
    ).toBeInTheDocument();
    expect(card('tf1').querySelector('.lk-mc-instructions')).toHaveAttribute(
      'data-lk-route-target',
    );
    expect(card('tf1')).toHaveAttribute('data-active');

    await next(user);
    expect(within(guide()).getByText(/“By 1960” and “stopped running trams”/)).toBeInTheDocument();
    expect(card('tf1').querySelector('legend')).toHaveAttribute('data-lk-route-target');

    await next(user);
    // The locate step: nothing shown until the learner chooses.
    expect(
      within(guide()).getByText('Where would you look? Select the sentence in the passage.'),
    ).toBeInTheDocument();
    expect(within(guide()).getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(targets()).toEqual([]);
    await user.click(sentence('Buses were cheaper'));
    expect(
      within(guide()).getByText('Not quite. The evidence is highlighted now.'),
    ).toBeInTheDocument();
    expect(targets()).toEqual([
      'By 1960, only a handful of British cities still ran trams at all.',
    ]);
    expect(within(guide()).getByRole('button', { name: 'Next' })).toBeEnabled();

    await next(user, 2);
    // Matching the meaning: the pairs, numbered in the guide and in the passage.
    expect(
      within(guide()).getByText(/the text says “only a handful of British cities still ran trams”/),
    ).toBeInTheDocument();
    expect(within(guide()).getByText(/^Compare the question's words/)).toBeInTheDocument();
    expect(
      document.querySelector('.lk-rr-piece[data-kind~="pair"] .lk-rr-pair-number'),
    ).toHaveTextContent('2');
  });

  it('dims the text before the previous answer when answers follow the order of the text', async () => {
    const user = userEvent.setup();
    render(<ReadingRoute group={tramGroup()} />);
    await next(user, 3);
    await user.click(sentence('By 1960'));
    expect(within(guide()).getByText('Yes — that is where the evidence is.')).toBeInTheDocument();
    await next(user, 5);
    // Question 2: locate, with the search starting after question 1's answer.
    expect(within(guide()).getByText(/start after the answer to question 1/)).toBeInTheDocument();
    expect(sentence('Buses were cheaper').querySelector('[data-dim]')).not.toBeNull();
    expect(sentence('Planners began').querySelector('[data-dim]')).toBeNull();
  });

  it('can be left at any step, with the questions still answerable', async () => {
    const user = userEvent.setup();
    render(<ReadingRoute group={tramGroup()} />);
    await user.click(within(guide()).getByRole('button', { name: 'Skip the guide' }));
    expect(
      within(guide()).getByText('That is the whole route. Answer any questions left, then finish.'),
    ).toBeInTheDocument();
    await user.click(within(guide()).getByRole('button', { name: 'Back' }));
    expect(
      within(guide()).getByRole('heading', { name: 'Rule out the traps' }),
    ).toBeInTheDocument();
  });

  it('has no accessibility violations while guiding and while choosing', async () => {
    const user = userEvent.setup();
    const { container } = render(<ReadingRoute group={tramGroup()} />);
    expect(await checkA11y(container)).toHaveNoViolations();
    await next(user, 3);
    expect(await checkA11y(container)).toHaveNoViolations();
  });
});

describe('<ReadingRoute> coached', () => {
  it('names the move without its place, lets the learner try again, and shows on request', async () => {
    const user = userEvent.setup();
    const onTraceChange = vi.fn();
    render(<ReadingRoute group={tramGroup()} level="coached" onTraceChange={onTraceChange} />);
    // Coached, the survey shows nothing: the learner skims.
    expect(targets()).toEqual([]);
    await next(user, 2);
    expect(
      within(guide()).getByText(/Find the key words in question 1: the words that tell you/),
    ).toBeInTheDocument();
    await next(user);
    await user.click(sentence('Buses were cheaper'));
    expect(
      within(guide()).getByText('Not there. Try again, or ask to be shown.'),
    ).toBeInTheDocument();
    expect(targets()).toEqual([]);
    await user.click(sentence('In the middle'));
    expect(within(guide()).getByRole('button', { name: 'Show me' })).toHaveAttribute(
      'data-prominent',
    );
    await user.click(within(guide()).getByRole('button', { name: 'Show me' }));
    expect(targets()).toEqual([
      'By 1960, only a handful of British cities still ran trams at all.',
    ]);
    const trace = onTraceChange.mock.calls.at(-1)?.[0] as RouteTrace;
    expect(trace.events.map((event) => event.type)).toEqual([
      'started',
      'step',
      'step',
      'step',
      'step',
      'located',
      'located',
      'shown',
    ]);
  });

  it('moves between sentences with the arrow keys and chooses with Enter', async () => {
    const user = userEvent.setup();
    render(<ReadingRoute group={tramGroup()} level="coached" />);
    await next(user, 3);
    await user.click(within(guide()).getByRole('button', { name: 'Choose a sentence' }));
    expect(document.activeElement).toBe(sentence('In the middle'));
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(document.activeElement).toBe(sentence('By 1960'));
    await user.keyboard('{Enter}');
    expect(within(guide()).getByText('Yes — that is where the evidence is.')).toBeInTheDocument();
  });
});

describe('<ReadingRoute> solo', () => {
  it('lets the learner answer and mark evidence, then debriefs, grades and fades', async () => {
    const user = userEvent.setup();
    const clock = testClock();
    const onFinish = vi.fn<(result: ReadingRouteResult) => void>();
    render(
      <ReadingRoute
        group={tramGroup()}
        level="solo"
        pace={true}
        now={clock.now}
        onFinish={onFinish}
      />,
    );
    expect(screen.queryByRole('complementary', { name: 'Reading guide' })).toBeNull();
    expect(screen.getByText('0:00 of 12:00 suggested')).toBeInTheDocument();

    // Question 1 right, with the right sentence marked.
    await user.click(within(card('tf1')).getByRole('radio', { name: 'True' }));
    await user.click(
      within(card('tf1')).getByRole('button', { name: 'Mark evidence for question 1 (0 marked)' }),
    );
    expect(
      screen.getByText(/Select the sentence that proves your answer to question 1/),
    ).toBeInTheDocument();
    await user.click(sentence('By 1960'));
    expect(sentence('By 1960')).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(card('tf1')).getByRole('button', { name: /Done marking/ }));
    // Answering alone shows no marks until the debrief.
    await user.click(within(card('tf1')).getByRole('button', { name: 'Submit' }));
    expect(card('tf1').querySelector('[data-correct]')).toBeNull();
    clock.advance(30_000);

    // Question 3 wrong: the trap.
    await user.click(within(card('tf3')).getByRole('radio', { name: 'True' }));
    // Questions 5 and 6: one over the word limit.
    const blanks = within(card('fib1')).getAllByRole('textbox');
    await user.type(blanks[0] as HTMLElement, 'the old railway lines');
    await user.type(blanks[1] as HTMLElement, '14 million');
    clock.advance(30_000);

    await user.click(screen.getByRole('button', { name: 'Finish and review' }));
    expect(onFinish).toHaveBeenCalledTimes(1);
    const [[result]] = onFinish.mock.calls as [[ReadingRouteResult]];
    const { summary, state, trace, responses } = result;
    const byKey = Object.fromEntries(summary.questions.map((question) => [question.key, question]));
    expect(byKey.tf1).toMatchObject({ correct: true, located: true });
    expect(byKey.tf3).toMatchObject({ correct: false, cause: 'trap', trap: 'opposite' });
    expect(byKey['fib1#b1']).toMatchObject({ correct: false, cause: 'limit' });
    expect(byKey['fib1#b2']).toMatchObject({ correct: true });
    expect(byKey.tf2).toMatchObject({ correct: null, cause: 'unanswered' });
    expect(summary.seconds).toBe(60);
    expect(responses.tf1).toEqual(expect.objectContaining({ selectedOptionIds: ['t'] }));
    expect(trace.events.at(-1)?.type).toBe('finished');
    expect(state.seen).toEqual(['trams']);

    // The debrief: the score, and the first wrong answer opened.
    expect(within(guide()).getByText('2 of 8 correct')).toBeInTheDocument();
    expect(within(guide()).getByText('Evidence found for 1 of 1')).toBeInTheDocument();
    expect(within(guide()).getByRole('button', { name: /Question 2/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(within(guide()).getByRole('button', { name: /Question 3/ }));
    expect(
      within(guide()).getByText('“True” says the opposite of what the text says.'),
    ).toBeInTheDocument();
    expect(targets()).toEqual(['roughly double the original forecast']);
    expect(
      within(guide()).getByText(/the text says “roughly double the original forecast”/),
    ).toBeInTheDocument();
    // The questions are marked now.
    expect(card('tf3').querySelector('[data-correct="false"]')).not.toBeNull();
    await user.click(within(guide()).getByRole('button', { name: /Question 1/ }));
    expect(within(guide()).getByText('The sentence you marked')).toBeInTheDocument();
    expect(sentence('By 1960').querySelector('[data-kind~="mark"]')).not.toBeNull();
  });

  it('is what every strategy gets when the paper switches hints off', () => {
    render(<ReadingRoute group={tramGroup()} delivery={{ hints: false }} />);
    expect(screen.queryByRole('complementary', { name: 'Reading guide' })).toBeNull();
    expect(screen.getAllByText('Solo')).toHaveLength(4);
  });

  it('fades a strategy the learner already handles', () => {
    render(
      <ReadingRoute
        group={tramGroup()}
        learnerState={{
          stateVersion: '1',
          strategies: { tfng: { level: 'solo', streak: 0 } },
          seen: [],
        }}
      />,
    );
    expect(
      within(card('tf1')).getByRole('button', { name: 'Mark evidence for question 1 (0 marked)' }),
    ).toBeInTheDocument();
    expect(within(card('mc1')).queryByRole('button', { name: /Mark evidence/ })).toBeNull();
  });
});

describe('<ReadingRoute> review', () => {
  it('debriefs a stored attempt from its trace and answers', async () => {
    const user = userEvent.setup();
    const trace: RouteTrace = {
      traceVersion: '1',
      passage: 'any',
      events: [
        {
          at: 0,
          type: 'started',
          levels: {
            tfng: 'solo',
            'multiple-choice': 'solo',
            completion: 'solo',
            'matching-headings': 'solo',
          },
        },
        { at: 1, type: 'marked', question: 'mc1', sentence: 10, on: true },
        { at: 2, type: 'finished' },
      ],
    };
    render(
      <ReadingRoute
        group={tramGroup()}
        renderMode="review"
        trace={trace}
        responses={{ mc1: { type: 'multiple-choice', selectedOptionIds: ['a'] } }}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Finish and review' })).toBeNull();
    expect(within(guide()).getByText('0 of 8 correct')).toBeInTheDocument();
    await user.click(within(guide()).getByRole('button', { name: /Question 4/ }));
    expect(within(guide()).getByText('Fell for a trap')).toBeInTheDocument();
    expect(
      within(guide()).getByText(
        '“The line was approved too late.” repeats words from the text, but the text says something different about them.',
      ),
    ).toBeInTheDocument();
    expect(document.querySelector('.lk-rr-piece[data-kind~="lure"]')).toHaveTextContent(
      'approved in 2007',
    );
    expect(sentence("Edinburgh's line").querySelector('[data-kind~="mark"]')).not.toBeNull();
  });

  it('keeps right and wrong, and where the answers are, to what the paper allows', async () => {
    const user = userEvent.setup();
    render(
      <ReadingRoute
        group={tramGroup()}
        renderMode="review"
        trace={null}
        responses={{ tf1: { type: 'multiple-choice', selectedOptionIds: ['t'] } }}
        delivery={{ feedback: false, solutions: false }}
      />,
    );
    expect(screen.queryByText(/of 8 correct/)).toBeNull();
    await user.click(within(guide()).getByRole('button', { name: 'Question 1' }));
    expect(targets()).toEqual([]);
  });
});

describe('<ReadingRoute> refuses', () => {
  it('a group with no route, in development, with an accessible fallback', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const group: ItemGroup = tramGroup();
    delete group.route;
    render(<ReadingRoute group={group} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('a route that breaks its rules', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const group = tramGroup();
    (group.route?.questions[0] as { evidence: string[] }).evidence = ['Not in the passage'];
    render(<ReadingRoute group={group} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    spy.mockRestore();
    fireEvent.click(document.body);
  });
});
