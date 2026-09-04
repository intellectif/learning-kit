import type { ItemOutcome, LearnerResponse, WrittenResponseData } from '@intellectif/lk-core';
import { gradeFromRubric, outcomeFromGrade, redact } from '@intellectif/lk-core';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkA11y } from '../../../test-support/a11y.js';
import type { Renderable } from '../index.js';
import { WrittenResponse } from '../index.js';

/**
 * `evaluate` is spied through to the real implementation so the exam-mode
 * guarantee — the component NEVER grades client-side — is asserted directly
 * rather than inferred from what happens to be rendered.
 */
const evaluateSpy = vi.hoisted(() => vi.fn());
vi.mock('@intellectif/lk-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@intellectif/lk-core')>();
  evaluateSpy.mockImplementation(actual.evaluate);
  return { ...actual, evaluate: evaluateSpy };
});

const wr = (over: Partial<WrittenResponseData> = {}): WrittenResponseData => ({
  schemaVersion: '1.0',
  type: 'written-response',
  id: 'w1',
  title: 'Essay',
  prompt: 'Describe your favourite place.',
  minWords: 2,
  maxWords: 5,
  ...over,
});

const response = (text: string, wordCount: number): LearnerResponse => ({
  type: 'written-response',
  text,
  wordCount,
});

const counter = () => document.getElementById('w1-counter');
const textarea = () => screen.getByRole('textbox');
const submitButton = () => screen.getByRole('button', { name: 'Submit' });

beforeEach(() => {
  evaluateSpy.mockClear();
});

describe('WrittenResponse — controlled value', () => {
  it('renders from props.value and never from internal state', async () => {
    const user = userEvent.setup();
    render(<WrittenResponse data={wr()} value={response('frozen text', 2)} onChange={vi.fn()} />);
    expect(textarea()).toHaveValue('frozen text');
    await user.type(textarea(), ' more');
    // The caller never updated `value`, so the textarea must not drift.
    expect(textarea()).toHaveValue('frozen text');
  });

  it('reports every change through onChange as a written-response payload', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<WrittenResponse data={wr()} value={response('', 0)} onChange={onChange} />);
    await user.type(textarea(), 'ab');
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenNthCalledWith(1, {
      type: 'written-response',
      text: 'a',
      wordCount: 1,
    });
    expect(onChange).toHaveBeenNthCalledWith(2, {
      type: 'written-response',
      text: 'b',
      wordCount: 1,
    });
  });

  it('drives the live word counter from the controlled value', () => {
    const { rerender } = render(
      <WrittenResponse data={wr()} value={response('one two', 2)} onChange={vi.fn()} />,
    );
    expect(counter()).toHaveTextContent('2 words (2–5 words)');
    rerender(
      <WrittenResponse data={wr()} value={response('one two three', 3)} onChange={vi.fn()} />,
    );
    expect(textarea()).toHaveValue('one two three');
    expect(counter()).toHaveTextContent('3 words (2–5 words)');
  });

  it('submits the controlled text and prefers value over defaultValue', async () => {
    const user = userEvent.setup();
    const onSubmitted = vi.fn();
    render(
      <WrittenResponse
        data={wr()}
        value={response('controlled words', 2)}
        defaultValue={response('ignored seed', 2)}
        onChange={vi.fn()}
        onSubmitted={onSubmitted}
      />,
    );
    expect(textarea()).toHaveValue('controlled words');
    await user.click(submitButton());
    expect(onSubmitted.mock.calls[0]?.[0].text).toBe('controlled words');
  });

  it('round-trips through caller state when the caller feeds onChange back in', async () => {
    const user = userEvent.setup();
    function Host() {
      const [current, setCurrent] = useState<LearnerResponse>(response('', 0));
      return <WrittenResponse data={wr()} value={current} onChange={setCurrent} />;
    }
    render(<Host />);
    await user.type(textarea(), 'live edit');
    expect(textarea()).toHaveValue('live edit');
    expect(counter()).toHaveTextContent('2 words (2–5 words)');
  });

  it('ignores another activity type’s response shape instead of throwing', () => {
    render(
      <WrittenResponse
        data={wr()}
        value={{ type: 'multiple-choice', selectedOptionIds: ['a'] }}
        onChange={vi.fn()}
      />,
    );
    expect(textarea()).toHaveValue('');
  });
});

describe('WrittenResponse — uncontrolled defaultValue', () => {
  it('seeds the textarea and counter from defaultValue', () => {
    render(<WrittenResponse data={wr()} defaultValue={response('seed draft', 2)} />);
    expect(textarea()).toHaveValue('seed draft');
    expect(counter()).toHaveTextContent('2 words (2–5 words)');
  });

  it('edits freely from the seed and still reports onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<WrittenResponse data={wr()} defaultValue={response('seed', 1)} onChange={onChange} />);
    await user.type(textarea(), ' more');
    expect(textarea()).toHaveValue('seed more');
    expect(onChange).toHaveBeenLastCalledWith({
      type: 'written-response',
      text: 'seed more',
      wordCount: 2,
    });
  });

  it('resets to the current seed when the data prop changes (Req 3.7)', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <WrittenResponse data={wr()} defaultValue={response('first seed', 2)} />,
    );
    await user.type(textarea(), ' edited');
    rerender(
      <WrittenResponse
        data={wr({ id: 'w2', prompt: 'New prompt.' })}
        defaultValue={response('second seed', 2)}
      />,
    );
    expect(textarea()).toHaveValue('second seed');
    expect(document.getElementById('w2-counter')).toHaveTextContent('2 words (2–5 words)');
  });

  it('does not wipe the draft when only defaultValue changes identity', async () => {
    const user = userEvent.setup();
    const data = wr();
    const { rerender } = render(<WrittenResponse data={data} defaultValue={response('seed', 1)} />);
    await user.type(textarea(), ' typed');
    rerender(<WrittenResponse data={data} defaultValue={response('seed', 1)} />);
    expect(textarea()).toHaveValue('seed typed');
  });
});

describe('WrittenResponse — submit callbacks', () => {
  it('defaults to practice mode: onSubmit fires before onSubmitted', async () => {
    const user = userEvent.setup();
    const order: string[] = [];
    const onSubmit = vi.fn(() => {
      order.push('onSubmit');
    });
    const onSubmitted = vi.fn(() => {
      order.push('onSubmitted');
    });
    render(<WrittenResponse data={wr()} onSubmit={onSubmit} onSubmitted={onSubmitted} />);
    await user.type(textarea(), 'two words');
    await user.click(submitButton());
    expect(order).toEqual(['onSubmit', 'onSubmitted']);
    expect(onSubmit).toHaveBeenCalledWith({
      type: 'written-response',
      text: 'two words',
      wordCount: 2,
    });
  });

  it('submits without an onSubmitted handler', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<WrittenResponse data={wr()} onSubmit={onSubmit} />);
    await user.type(textarea(), 'no submitted handler');
    await user.click(submitButton());
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(textarea()).toBeDisabled();
  });

  it('still evaluates through core in practice mode', async () => {
    const user = userEvent.setup();
    render(<WrittenResponse data={wr()} onSubmitted={vi.fn()} />);
    await user.type(textarea(), 'practice words');
    await user.click(submitButton());
    expect(evaluateSpy).toHaveBeenCalledTimes(1);
  });
});

describe('WrittenResponse — exam mode', () => {
  it('never calls evaluate() but still emits the response and submission', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onSubmitted = vi.fn();
    render(
      <WrittenResponse
        data={wr()}
        renderMode="exam"
        onSubmit={onSubmit}
        onSubmitted={onSubmitted}
      />,
    );
    await user.type(textarea(), 'exam answer text');
    await user.click(submitButton());
    expect(evaluateSpy).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledWith({
      type: 'written-response',
      text: 'exam answer text',
      wordCount: 3,
    });
    const submission = onSubmitted.mock.calls[0]?.[0];
    expect(submission.wordCount).toBe(3);
    expect(submission.withinWordBounds).toBe(true);
    expect(submission.xapiStatement.result).not.toHaveProperty('score');
  });

  it('reports out-of-bounds word counts without core', async () => {
    const user = userEvent.setup();
    const onSubmitted = vi.fn();
    render(
      <WrittenResponse
        data={wr({ minWords: 5, maxWords: 10 })}
        renderMode="exam"
        onSubmitted={onSubmitted}
      />,
    );
    await user.type(textarea(), 'too short');
    await user.click(submitButton());
    expect(evaluateSpy).not.toHaveBeenCalled();
    expect(onSubmitted.mock.calls[0]?.[0].withinWordBounds).toBe(false);
  });

  it('renders and submits a redact() projection', async () => {
    const user = userEvent.setup();
    // `redact()` returns the wide `RedactedActivityData`; the component's data
    // prop is the narrower `Renderable<WrittenResponseData>` projection type.
    const projection = redact(
      wr({ feedback: { correct: 'Nice work', incorrect: 'Try again' } }),
    ) as unknown as Renderable<WrittenResponseData>;
    expect(projection).not.toHaveProperty('feedback');
    const onSubmit = vi.fn();
    render(<WrittenResponse data={projection} renderMode="exam" onSubmit={onSubmit} />);
    expect(screen.getByText('Describe your favourite place.')).toBeInTheDocument();
    expect(counter()).toHaveTextContent('0 words (2–5 words)');
    await user.type(textarea(), 'redacted render works');
    await user.click(submitButton());
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(evaluateSpy).not.toHaveBeenCalled();
  });

  it('never reveals authored feedback, before or after submit', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <WrittenResponse
        data={wr({ feedback: { correct: 'Nice work', incorrect: 'Try again' } })}
        renderMode="exam"
        onSubmitted={vi.fn()}
      />,
    );
    expect(container.textContent).not.toContain('Nice work');
    await user.type(textarea(), 'answer given');
    await user.click(submitButton());
    expect(container.textContent).not.toContain('Nice work');
    expect(container.textContent).not.toContain('Try again');
  });

  it('supports a controlled exam attempt', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <WrittenResponse
        data={wr()}
        renderMode="exam"
        value={response('restored attempt', 2)}
        onChange={onChange}
      />,
    );
    expect(textarea()).toHaveValue('restored attempt');
    await user.type(textarea(), '!');
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('WrittenResponse — review mode', () => {
  const reviewed = response('the submitted essay text', 4);

  it('is read-only, has no submit control, and shows the learner response', () => {
    render(<WrittenResponse data={wr()} renderMode="review" value={reviewed} />);
    const field = textarea();
    expect(field).toHaveValue('the submitted essay text');
    expect(field).toHaveAttribute('readonly');
    expect(field).not.toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
  });

  it('renders the submitted text from defaultValue too, and keeps the counter live', () => {
    render(<WrittenResponse data={wr()} renderMode="review" defaultValue={reviewed} />);
    expect(textarea()).toHaveValue('the submitted essay text');
    expect(counter()).toHaveTextContent('4 words (2–5 words)');
  });

  it('rejects edits and never emits a change or a submission', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    const onSubmitted = vi.fn();
    render(
      <WrittenResponse
        data={wr()}
        renderMode="review"
        value={reviewed}
        onChange={onChange}
        onSubmit={onSubmit}
        onSubmitted={onSubmitted}
      />,
    );
    await user.type(textarea(), ' tampered');
    expect(onChange).not.toHaveBeenCalled();
    expect(textarea()).toHaveValue('the submitted essay text');
    fireEvent.submit(screen.getByRole('form', { name: 'Essay' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it('never scores locally: no outcome means no grade is shown', () => {
    render(<WrittenResponse data={wr()} renderMode="review" value={reviewed} />);
    expect(evaluateSpy).not.toHaveBeenCalled();
    expect(document.querySelector('.lk-wr-outcome')).toBeNull();
  });

  it('shows a "not graded yet" affordance for a deferred outcome', () => {
    const outcome: ItemOutcome = {
      status: 'deferred',
      reason: 'requires_async_grading',
      maxScore: 1,
    };
    render(<WrittenResponse data={wr()} renderMode="review" value={reviewed} outcome={outcome} />);
    const region = document.getElementById('w1-feedback');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveTextContent('Not graded yet.');
    expect(document.querySelector('.lk-wr-outcome')).toHaveAttribute('data-status', 'deferred');
    expect(evaluateSpy).not.toHaveBeenCalled();
  });

  it('shows the returned grade and grader feedback for a scored outcome', () => {
    const outcome: ItemOutcome = {
      status: 'scored',
      score: 0.85,
      maxScore: 1,
      passed: true,
      feedback: 'Strong thesis, weak conclusion.',
      details: [],
    };
    render(<WrittenResponse data={wr()} renderMode="review" value={reviewed} outcome={outcome} />);
    const region = document.getElementById('w1-feedback');
    expect(region).toHaveTextContent('Score 85%. Passed.');
    expect(region).toHaveTextContent('Strong thesis, weak conclusion.');
    const marker = document.querySelector('.lk-wr-outcome');
    expect(marker).toHaveAttribute('data-status', 'scored');
    expect(marker).toHaveAttribute('data-passed', 'true');
  });

  it('marks a failing grade from the outcome alone', () => {
    const outcome: ItemOutcome = {
      status: 'scored',
      score: 0.4,
      maxScore: 1,
      passed: false,
      feedback: null,
      details: [],
    };
    render(<WrittenResponse data={wr()} renderMode="review" value={reviewed} outcome={outcome} />);
    expect(document.getElementById('w1-feedback')).toHaveTextContent('Score 40%. Not passed.');
    expect(document.querySelector('.lk-wr-outcome')).toHaveAttribute('data-passed', 'false');
  });

  it('normalises a grader score against its own maxScore', () => {
    const outcome: ItemOutcome = {
      status: 'scored',
      score: 8.5,
      maxScore: 10,
      passed: true,
      feedback: null,
      details: [],
    };
    render(<WrittenResponse data={wr()} renderMode="review" value={reviewed} outcome={outcome} />);
    expect(document.getElementById('w1-feedback')).toHaveTextContent('Score 85%.');
  });

  it('normalises each CRITERION against its own maxScore, end to end', () => {
    // The real path: a grader working in its native units, through the SDK's
    // own arithmetic, into the review render. `gradeFromRubric` stores the
    // judgements verbatim so the grade stays auditable in the grader's units,
    // which means anything DISPLAYING one has to normalise too.
    const result = gradeFromRubric([
      { name: 'Task achievement', score: 82, maxScore: 100, weight: 1 },
      { name: 'Range', score: 7, maxScore: 9, weight: 1 },
    ]);
    if ('unscorable' in result) {
      throw new Error(`expected a grade: ${result.reason}`);
    }

    render(
      <WrittenResponse
        data={wr()}
        renderMode="review"
        value={reviewed}
        outcome={outcomeFromGrade(result)}
      />,
    );

    const rows = [...document.querySelectorAll('.lk-wr-criterion-score')].map(
      (node) => node.textContent,
    );
    // 82/100 and 7/9 — not 8200% and 700%.
    expect(rows).toEqual(['82%', '78%']);
  });

  it('still renders a scaled [0,1] criterion unchanged when maxScore is omitted', () => {
    const result = gradeFromRubric([{ name: 'Task', score: 0.75, weight: 1 }]);
    if ('unscorable' in result) {
      throw new Error('expected a grade');
    }
    render(
      <WrittenResponse
        data={wr()}
        renderMode="review"
        value={reviewed}
        outcome={outcomeFromGrade(result)}
      />,
    );
    expect(document.querySelector('.lk-wr-criterion-score')).toHaveTextContent('75%');
  });

  it('states plainly when an outcome is unscorable', () => {
    const outcome: ItemOutcome = {
      status: 'unscorable',
      reason: 'Activity type "written-response" is not registered',
      maxScore: 1,
    };
    render(<WrittenResponse data={wr()} renderMode="review" value={reviewed} outcome={outcome} />);
    expect(document.getElementById('w1-feedback')).toHaveTextContent(
      'This response could not be graded.',
    );
  });

  it('ignores the outcome outside review mode', async () => {
    const user = userEvent.setup();
    const outcome: ItemOutcome = {
      status: 'scored',
      score: 1,
      maxScore: 1,
      passed: true,
      feedback: 'Leaked feedback',
      details: [],
    };
    const { container } = render(
      <WrittenResponse data={wr()} renderMode="exam" outcome={outcome} onSubmitted={vi.fn()} />,
    );
    expect(container.textContent).not.toContain('Leaked feedback');
    await user.type(textarea(), 'exam answer');
    await user.click(submitButton());
    expect(container.textContent).not.toContain('Leaked feedback');
    expect(container.textContent).not.toContain('Score 100%');
  });

  it('has no axe violations while showing a returned grade', async () => {
    const outcome: ItemOutcome = {
      status: 'scored',
      score: 0.9,
      maxScore: 1,
      passed: true,
      feedback: 'Clear argument.',
      details: [],
    };
    const { container } = render(
      <WrittenResponse data={wr()} renderMode="review" value={reviewed} outcome={outcome} />,
    );
    expect(await checkA11y(container)).toHaveNoViolations();
  });
});

describe('WrittenResponse — rich text', () => {
  const html = '<em>Describe</em> your favourite place.';

  it('renders promptHtml through the caller-supplied sanitiser', () => {
    const sanitizeHtml = vi.fn((input: string) => input);
    render(<WrittenResponse data={wr({ promptHtml: html })} sanitizeHtml={sanitizeHtml} />);
    expect(sanitizeHtml).toHaveBeenCalledWith(html);
    const prompt = document.getElementById('w1-prompt');
    expect(prompt?.querySelector('em')).not.toBeNull();
    expect(prompt).toHaveTextContent('Describe your favourite place.');
  });

  it('injects only what the sanitiser returned', () => {
    render(
      <WrittenResponse
        data={wr({ promptHtml: '<img src=x onerror=alert(1)>Describe it.' })}
        sanitizeHtml={() => 'Describe it.'}
      />,
    );
    const prompt = document.getElementById('w1-prompt');
    expect(prompt?.querySelector('img')).toBeNull();
    expect(prompt).toHaveTextContent('Describe it.');
  });

  it('falls back to escaped plain text when no sanitiser is supplied', () => {
    render(<WrittenResponse data={wr({ promptHtml: html, prompt: '<b>plain</b> prompt' })} />);
    const prompt = document.getElementById('w1-prompt');
    expect(prompt?.querySelector('b')).toBeNull();
    expect(prompt?.querySelector('em')).toBeNull();
    expect(prompt).toHaveTextContent('<b>plain</b> prompt');
  });

  it('falls back to plain text when the activity has no promptHtml', () => {
    const sanitizeHtml = vi.fn((input: string) => input);
    render(<WrittenResponse data={wr()} sanitizeHtml={sanitizeHtml} />);
    expect(sanitizeHtml).not.toHaveBeenCalled();
    expect(screen.getByText('Describe your favourite place.')).toBeInTheDocument();
  });

  it('keeps the textarea labelled by the rich-text prompt', async () => {
    const { container } = render(
      <WrittenResponse data={wr({ promptHtml: html })} sanitizeHtml={(input) => input} />,
    );
    expect(
      screen.getByRole('textbox', { name: 'Describe your favourite place.' }),
    ).toBeInTheDocument();
    expect(await checkA11y(container)).toHaveNoViolations();
  });
});
