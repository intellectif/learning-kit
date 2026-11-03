'use client';

import type { CriterionScore, GradeRecord, InlineCorrection } from '@intellectif/lk-core';
import type { LkStrings } from '../../i18n/strings.js';

/**
 * How a judged grade is shown: its criteria, the corrections a grader anchored
 * in the answer, and the grader's own words. Shared by the components a grader
 * judges — a written response, a spoken answer — and drawn under each one's own
 * class names, which are its styling contract.
 */

/** The class prefix of the component drawing the grade. */
export type GradePrefix = 'lk-wr' | 'lk-sr';

/**
 * One criterion's score as a percentage of its OWN maximum.
 *
 * `CriterionScore.maxScore` defaults to 1 — the SDK's scaled convention — but
 * a grader may work out of 100, or out of 9 for a CEFR band, and
 * `gradeFromRubric` deliberately stores those judgements verbatim so a grade
 * stays auditable in the units the grader actually used. It normalises when it
 * computes the total; anything DISPLAYING a criterion has to normalise too, or
 * a perfectly ordinary 82/100 renders as "8200%". This is the same guard the
 * overall score already applies against `outcome.maxScore`.
 */
export function criterionPercent(criterion: CriterionScore): string {
  const max = criterion.maxScore !== undefined && criterion.maxScore > 0 ? criterion.maxScore : 1;
  return `${Math.round(((criterion.score as number) / max) * 100)}%`;
}

/**
 * Pairs each correction with a list key that is unique by construction. The
 * same mistake made twice carries the same `original`/`corrected` pair, so
 * the grader's `range` is what tells the occurrences apart. `range` is
 * optional and nothing validates it, so a correction without one — or one
 * whose range the grader already used — is keyed by its position instead.
 * Only position keys start with `#`, so the two kinds never collide.
 */
function keyedCorrections(
  corrections: readonly InlineCorrection[],
): { key: string; correction: InlineCorrection }[] {
  const used = new Set<string>();
  return corrections.map((correction, index) => {
    const anchored = correction.range
      ? `${correction.range.start}-${correction.range.end}:${correction.corrected}`
      : undefined;
    const key = anchored !== undefined && !used.has(anchored) ? anchored : `#${index}`;
    used.add(key);
    return { key, correction };
  });
}

/**
 * Renders the server-computed outcome in `review` mode. The grade shown here
 * always came back from the asynchronous grader — nothing on this path scores,
 * infers, or defaults a grade. A `written-response` outcome carries no
 * per-item `details` (there are no options or blanks to mark), so the render
 * is the scaled score, the pass state, and the grader's feedback.
 */
export function CriteriaList({
  criteria,
  s,
  prefix,
}: {
  criteria: readonly CriterionScore[];
  s: LkStrings;
  prefix: GradePrefix;
}) {
  return (
    <ul className={`${prefix}-criteria`}>
      {criteria.map((criterion) => (
        <li
          className={`${prefix}-criterion`}
          key={criterion.name}
          data-na={String(criterion.notApplicable === true)}
        >
          <span className={`${prefix}-criterion-name`}>{criterion.name}</span>
          {criterion.notApplicable === true ? (
            <span className={`${prefix}-criterion-score`}>{s.notApplicable}</span>
          ) : (
            <span className={`${prefix}-criterion-score`}>
              {criterion.band ??
                (typeof criterion.score === 'number' ? criterionPercent(criterion) : '')}
            </span>
          )}
          {criterion.comment ? (
            <span className={`${prefix}-criterion-comment`}>{criterion.comment}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function CorrectionsList({
  corrections,
  label,
  prefix,
}: {
  corrections: readonly InlineCorrection[];
  label?: string;
  prefix: GradePrefix;
}) {
  return (
    <ul
      className={`${prefix}-corrections`}
      {...(label !== undefined ? { 'aria-label': label } : {})}
    >
      {keyedCorrections(corrections).map(({ key, correction }) => (
        <li className={`${prefix}-correction`} key={key}>
          <del className={`${prefix}-correction-original`}>{correction.original}</del>{' '}
          <ins className={`${prefix}-correction-corrected`}>{correction.corrected}</ins>
          {correction.explanation ? (
            <span className={`${prefix}-correction-explanation`}>{correction.explanation}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function GradeBody({
  grade,
  s,
  prefix,
}: {
  grade: GradeRecord;
  s: LkStrings;
  prefix: GradePrefix;
}) {
  return (
    <>
      {grade.feedback ? <p className={`${prefix}-grade-feedback`}>{grade.feedback}</p> : null}
      {grade.criteria && grade.criteria.length > 0 ? (
        <CriteriaList criteria={grade.criteria} s={s} prefix={prefix} />
      ) : null}
      {grade.corrections && grade.corrections.length > 0 ? (
        <CorrectionsList corrections={grade.corrections} prefix={prefix} />
      ) : null}
      {grade.requiresHumanReview === true ? (
        <p className={`${prefix}-review-flag`}>{s.awaitingHumanReview}</p>
      ) : null}
    </>
  );
}
