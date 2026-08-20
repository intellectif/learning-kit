import type {
  GradeRecord,
  ItemOutcome,
  LearnerResponse,
  WrittenResponseData,
} from '@intellectif/lk-core';
import { gradeFromRubric, outcomeFromGrade } from '@intellectif/lk-core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { checkA11y } from '../../../test-support/a11y.js';
import { WrittenResponse } from '../index.js';

/**
 * Review-mode rendering of a grade that came BACK from an asynchronous grader
 * (the `graded` arm of `ItemOutcome`, built with `outcomeFromGrade`). Nothing
 * here exercises client-side scoring: the component never manufactures a
 * grade, so every number asserted below was handed to it.
 */

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

/** The learner's submitted essay, replayed into the read-only review render. */
const submitted = response('the submitted essay text', 4);

const grade = (over: Partial<GradeRecord> = {}): GradeRecord => ({
  score: 0.82,
  maxScore: 1,
  passed: true,
  feedback: 'Clear argument, but the conclusion is thin.',
  ...over,
});

const renderReview = (outcome: ItemOutcome) =>
  render(<WrittenResponse data={wr()} renderMode="review" value={submitted} outcome={outcome} />);

const feedbackRegion = (container: HTMLElement) => container.querySelector('#w1-feedback');
const outcomeBlock = (container: HTMLElement) => container.querySelector('.lk-wr-outcome');

const criterionRows = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('.lk-wr-criterion')).map((row) => ({
    name: row.querySelector('.lk-wr-criterion-name')?.textContent,
    score: row.querySelector('.lk-wr-criterion-score')?.textContent,
    comment: row.querySelector('.lk-wr-criterion-comment')?.textContent ?? null,
    notApplicable: row.getAttribute('data-na'),
  }));

const correctionRows = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('.lk-wr-correction')).map((row) => ({
    original: row.querySelector('.lk-wr-correction-original')?.textContent,
    corrected: row.querySelector('.lk-wr-correction-corrected')?.textContent,
    explanation: row.querySelector('.lk-wr-correction-explanation')?.textContent ?? null,
  }));

describe('WrittenResponse — returned grade (review mode)', () => {
  it('renders the percentage, the pass wording, and the grader narrative', () => {
    const { container } = renderReview(outcomeFromGrade(grade()));
    expect(feedbackRegion(container)).toHaveTextContent('Score 82%. Passed.');
    expect(container.querySelector('.lk-wr-grade-feedback')).toHaveTextContent(
      'Clear argument, but the conclusion is thin.',
    );
    const block = outcomeBlock(container);
    expect(block).toHaveAttribute('data-status', 'graded');
    expect(block).toHaveAttribute('data-passed', 'true');
  });

  it('renders the not-passed wording for a failing grade', () => {
    const { container } = renderReview(
      outcomeFromGrade(grade({ score: 0.41, passed: false, feedback: 'Off topic throughout.' })),
    );
    expect(feedbackRegion(container)).toHaveTextContent('Score 41%. Not passed.');
    expect(feedbackRegion(container)).toHaveTextContent('Off topic throughout.');
    expect(outcomeBlock(container)).toHaveAttribute('data-passed', 'false');
  });

  it('renders a null narrative as no feedback paragraph, keeping the score line', () => {
    const { container } = renderReview(outcomeFromGrade(grade({ feedback: null })));
    expect(feedbackRegion(container)).toHaveTextContent('Score 82%. Passed.');
    expect(container.querySelector('.lk-wr-grade-feedback')).toBeNull();
  });

  it('renders every criterion with its score or band, and its comment', () => {
    const { container } = renderReview(
      outcomeFromGrade(
        grade({
          criteria: [
            {
              name: 'Task achievement',
              score: 0.9,
              weight: 2,
              comment: 'Addressed every part of the prompt.',
            },
            { name: 'Range', band: 'B2', comment: 'Varied but repetitive vocabulary.' },
            { name: 'Accuracy', score: 0.625, comment: 'Tense slips in the third paragraph.' },
          ],
        }),
      ),
    );
    expect(criterionRows(container)).toEqual([
      {
        name: 'Task achievement',
        score: '90%',
        comment: 'Addressed every part of the prompt.',
        notApplicable: 'false',
      },
      {
        name: 'Range',
        score: 'B2',
        comment: 'Varied but repetitive vocabulary.',
        notApplicable: 'false',
      },
      {
        name: 'Accuracy',
        score: '63%',
        comment: 'Tense slips in the third paragraph.',
        notApplicable: 'false',
      },
    ]);
  });

  it('prefers an ordinal band over a numeric score when the grader sent both', () => {
    const { container } = renderReview(
      outcomeFromGrade(grade({ criteria: [{ name: 'Fluency', band: 'C1', score: 0.75 }] })),
    );
    expect(criterionRows(container)).toEqual([
      { name: 'Fluency', score: 'C1', comment: null, notApplicable: 'false' },
    ]);
  });

  it('renders a criterion with neither score nor band as a name and comment only', () => {
    const { container } = renderReview(
      outcomeFromGrade(grade({ criteria: [{ name: 'Coherence', comment: 'Hard to follow.' }] })),
    );
    expect(criterionRows(container)).toEqual([
      { name: 'Coherence', score: '', comment: 'Hard to follow.', notApplicable: 'false' },
    ]);
  });

  it('renders a notApplicable criterion as "Not applicable" with no percentage', () => {
    const { container } = renderReview(
      outcomeFromGrade(
        grade({
          criteria: [
            { name: 'Task achievement', score: 0.9 },
            {
              name: 'Interaction',
              score: 0.5,
              notApplicable: true,
              comment: 'This is a monologue task.',
            },
          ],
        }),
      ),
    );
    const [achievement, interaction] = criterionRows(container);
    expect(achievement).toEqual({
      name: 'Task achievement',
      score: '90%',
      comment: null,
      notApplicable: 'false',
    });
    expect(interaction).toEqual({
      name: 'Interaction',
      score: 'Not applicable',
      comment: 'This is a monologue task.',
      notApplicable: 'true',
    });
    // The 0.5 it carries must never surface as "50%".
    expect(interaction?.score).not.toContain('%');
  });

  it('omits the criteria list entirely when the grade carries none', () => {
    const { container } = renderReview(outcomeFromGrade(grade()));
    expect(container.querySelector('.lk-wr-criteria')).toBeNull();
    const { container: empty } = render(
      <WrittenResponse
        data={wr({ id: 'w2' })}
        renderMode="review"
        value={submitted}
        outcome={outcomeFromGrade(grade({ criteria: [] }))}
      />,
    );
    expect(empty.querySelector('.lk-wr-criteria')).toBeNull();
  });

  it('renders each inline correction as original, corrected, and explanation', () => {
    const { container } = renderReview(
      outcomeFromGrade(
        grade({
          corrections: [
            {
              original: 'I go yesterday',
              corrected: 'I went yesterday',
              explanation: 'Past simple for a finished time.',
              category: 'tense',
              range: { start: 0, end: 14 },
            },
            { original: 'a apple', corrected: 'an apple' },
          ],
        }),
      ),
    );
    expect(correctionRows(container)).toEqual([
      {
        original: 'I go yesterday',
        corrected: 'I went yesterday',
        explanation: 'Past simple for a finished time.',
      },
      { original: 'a apple', corrected: 'an apple', explanation: null },
    ]);
    // The original is struck through and the fix marked as an insertion.
    expect(container.querySelector('del.lk-wr-correction-original')).toBeInTheDocument();
    expect(container.querySelector('ins.lk-wr-correction-corrected')).toBeInTheDocument();
  });

  // A grader that anchors corrections by `range` legitimately returns the same
  // fix twice when the learner made the same mistake twice. Both occurrences
  // render — though React warns about the non-unique list key derived from
  // `original:corrected` (reported, not fixed here).
  it('renders repeated identical corrections once per occurrence', () => {
    const { container } = renderReview(
      outcomeFromGrade(
        grade({
          corrections: [
            { original: 'a apple', corrected: 'an apple', range: { start: 3, end: 10 } },
            { original: 'a apple', corrected: 'an apple', range: { start: 41, end: 48 } },
          ],
        }),
      ),
    );
    expect(correctionRows(container)).toHaveLength(2);
  });

  it('omits the corrections list when the grade carries none', () => {
    const { container } = renderReview(outcomeFromGrade(grade()));
    expect(container.querySelector('.lk-wr-corrections')).toBeNull();
  });

  it('renders the awaiting-review affordance when requiresHumanReview is true', () => {
    const { container } = renderReview(outcomeFromGrade(grade({ requiresHumanReview: true })));
    expect(container.querySelector('.lk-wr-review-flag')).toHaveTextContent(
      'This grade is awaiting review by a teacher.',
    );
  });

  it('omits the awaiting-review affordance when requiresHumanReview is false or absent', () => {
    const { container } = renderReview(outcomeFromGrade(grade({ requiresHumanReview: false })));
    expect(container.querySelector('.lk-wr-review-flag')).toBeNull();
    expect(container.textContent).not.toContain('awaiting review');

    const { container: absent } = render(
      <WrittenResponse
        data={wr({ id: 'w2' })}
        renderMode="review"
        value={submitted}
        outcome={outcomeFromGrade(grade())}
      />,
    );
    expect(absent.querySelector('.lk-wr-review-flag')).toBeNull();
    expect(absent.textContent).not.toContain('awaiting review');
  });

  it('normalises an unscaled grader payload: 8.5 of 10 renders as 85%', () => {
    const { container } = renderReview(outcomeFromGrade(grade({ score: 8.5, maxScore: 10 })));
    expect(feedbackRegion(container)).toHaveTextContent('Score 85%. Passed.');
    expect(container.textContent).not.toContain('850%');
  });

  it('renders a rubric-derived grade end to end', () => {
    const rubricGrade = gradeFromRubric(
      [
        { name: 'Task achievement', score: 0.9, weight: 2, comment: 'Fully on task.' },
        { name: 'Grammar range', score: 0.6, weight: 1, comment: 'Simple structures only.' },
        { name: 'Interaction', notApplicable: true, weight: 1 },
      ],
      undefined,
      { feedback: 'Solid content; stretch your grammar next time.' },
    );
    if ('unscorable' in rubricGrade) {
      throw new Error(`expected a grade, got: ${rubricGrade.reason}`);
    }
    const { container } = renderReview(outcomeFromGrade(rubricGrade));
    // (0.9 * 2 + 0.6 * 1) / 3 = 0.8 — computed by core, never by the grader.
    expect(feedbackRegion(container)).toHaveTextContent('Score 80%. Passed.');
    expect(feedbackRegion(container)).toHaveTextContent(
      'Solid content; stretch your grammar next time.',
    );
    expect(criterionRows(container)).toEqual([
      {
        name: 'Task achievement',
        score: '90%',
        comment: 'Fully on task.',
        notApplicable: 'false',
      },
      {
        name: 'Grammar range',
        score: '60%',
        comment: 'Simple structures only.',
        notApplicable: 'false',
      },
      { name: 'Interaction', score: 'Not applicable', comment: null, notApplicable: 'true' },
    ]);
  });

  it('has no axe violations while showing a full returned grade', async () => {
    const { container } = renderReview(
      outcomeFromGrade(
        grade({
          criteria: [
            { name: 'Task achievement', score: 0.9, comment: 'Fully on task.' },
            { name: 'Range', band: 'B2', comment: 'Repetitive vocabulary.' },
            { name: 'Interaction', notApplicable: true, comment: 'Monologue task.' },
          ],
          corrections: [
            {
              original: 'I go yesterday',
              corrected: 'I went yesterday',
              explanation: 'Past simple for a finished time.',
            },
          ],
          requiresHumanReview: true,
        }),
      ),
    );
    expect(await checkA11y(container)).toHaveNoViolations();
  });
});

describe('WrittenResponse — ungraded outcomes stay ungraded', () => {
  it('shows "not graded yet" and never a percentage for a deferred outcome', () => {
    const outcome: ItemOutcome = {
      status: 'deferred',
      reason: 'requires_async_grading',
      maxScore: 1,
      partial: { withinWordBounds: true, wordCount: 4 },
    };
    const { container } = renderReview(outcome);
    expect(feedbackRegion(container)).toHaveTextContent(
      'Not graded yet. This response is waiting for its grade.',
    );
    expect(outcomeBlock(container)).toHaveAttribute('data-status', 'deferred');
    // The bug this type exists to prevent: an ungraded response rendered as a
    // zero. No percentage of any kind may appear.
    expect(container.textContent).not.toContain('0%');
    expect(container.textContent).not.toMatch(/\d+%/);
    expect(container.textContent).not.toContain('Passed');
  });

  it('renders the could-not-be-graded state for an unscorable outcome', () => {
    const outcome: ItemOutcome = {
      status: 'unscorable',
      reason: 'Grader returned no numeric score',
      maxScore: 1,
    };
    const { container } = renderReview(outcome);
    expect(feedbackRegion(container)).toHaveTextContent('This response could not be graded.');
    const block = outcomeBlock(container);
    expect(block).toHaveAttribute('data-status', 'unscorable');
    // The developer-facing reason is a diagnostic attribute, not learner copy.
    expect(block).toHaveAttribute('data-reason', 'Grader returned no numeric score');
    expect(container.textContent).not.toContain('Grader returned no numeric score');
    expect(container.textContent).not.toMatch(/\d+%/);
  });
});

describe('WrittenResponse — plain scored outcome (no GradeRecord)', () => {
  it('still renders the score and the authored feedback', () => {
    const outcome: ItemOutcome = {
      status: 'scored',
      score: 0.76,
      maxScore: 1,
      passed: true,
      feedback: 'Strong thesis, weak conclusion.',
      details: [],
    };
    const { container } = renderReview(outcome);
    expect(feedbackRegion(container)).toHaveTextContent('Score 76%. Passed.');
    expect(container.querySelector('.lk-wr-grade-feedback')).toHaveTextContent(
      'Strong thesis, weak conclusion.',
    );
    expect(outcomeBlock(container)).toHaveAttribute('data-status', 'scored');
    // Nothing from the graded arm may appear on the pre-existing path.
    expect(container.querySelector('.lk-wr-criteria')).toBeNull();
    expect(container.querySelector('.lk-wr-corrections')).toBeNull();
    expect(container.querySelector('.lk-wr-review-flag')).toBeNull();
  });
});

describe('WrittenResponse — review mode stays read-only while showing a grade', () => {
  it('shows the submitted text, no submit control, and rejects edits', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(
      <WrittenResponse
        data={wr()}
        renderMode="review"
        value={submitted}
        onChange={onChange}
        outcome={outcomeFromGrade(grade())}
      />,
    );
    const field = screen.getByRole('textbox');
    expect(field).toHaveValue('the submitted essay text');
    expect(field).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
    await user.type(field, ' tampered');
    expect(field).toHaveValue('the submitted essay text');
    expect(onChange).not.toHaveBeenCalled();
    expect(feedbackRegion(container)).toHaveTextContent('Score 82%. Passed.');
  });

  it('shows the submitted text from defaultValue alongside the grade', () => {
    const { container } = render(
      <WrittenResponse
        data={wr()}
        renderMode="review"
        defaultValue={submitted}
        outcome={outcomeFromGrade(grade({ feedback: 'Well structured.' }))}
      />,
    );
    expect(screen.getByRole('textbox')).toHaveValue('the submitted essay text');
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
    expect(feedbackRegion(container)).toHaveTextContent('Well structured.');
  });

  it('never renders a returned grade outside review mode', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <WrittenResponse
        data={wr()}
        outcome={outcomeFromGrade(
          grade({
            feedback: 'Leaked narrative.',
            criteria: [{ name: 'Task achievement', score: 0.9, comment: 'Leaked comment.' }],
          }),
        )}
      />,
    );
    expect(container.textContent).not.toContain('Leaked narrative.');
    expect(container.textContent).not.toContain('82%');
    await user.type(screen.getByRole('textbox'), 'practice answer');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(container.textContent).not.toContain('Leaked narrative.');
    expect(container.textContent).not.toContain('Leaked comment.');
    expect(container.textContent).not.toContain('82%');
  });
});
