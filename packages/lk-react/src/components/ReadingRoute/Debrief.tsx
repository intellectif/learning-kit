'use client';

import {
  type PlannedQuestion,
  ROUTE_STRATEGIES,
  type RouteLearnerState,
  type RouteSummary,
  routeTrapText,
} from '@intellectif/lk-core';
import type { LkStrings } from '../../i18n/strings.js';

export interface DebriefProps {
  summary: RouteSummary;
  questions: readonly PlannedQuestion[];
  /** The learner's state after this route, when the route itself computed it. */
  next: RouteLearnerState | null;
  selected: string | null;
  onSelect: (key: string) => void;
  /** Whether right and wrong, and why, may be shown. */
  feedback: boolean;
  /** Whether where the answers are may be shown. */
  solutions: boolean;
  marked: (key: string) => number;
  s: LkStrings;
}

/**
 * What the route found: the score, how often the evidence was found, each
 * strategy's level now and next, and, for the question the learner opens,
 * why its answer went the way it did — with the evidence, the paraphrases and
 * the trap shown in the passage beside it.
 */
export function Debrief({
  summary,
  questions,
  next,
  selected,
  onSelect,
  feedback,
  solutions,
  marked,
  s,
}: DebriefProps): React.JSX.Element {
  const strategyName = (id: keyof typeof ROUTE_STRATEGIES): string =>
    s.routeStrategy?.(id) ?? ROUTE_STRATEGIES[id].title;
  const trapText = s.routeTrap ?? routeTrapText;
  const located = summary.strategies.reduce((total, entry) => total + entry.located, 0);
  const locatable = summary.strategies.reduce((total, entry) => total + entry.locatable, 0);
  const result = summary.questions.find((question) => question.key === selected);
  const planned = questions.find((question) => question.key === selected);

  return (
    <div className="lk-rr-debrief">
      <h3 className="lk-rr-debrief-title">{s.routeDebrief}</h3>
      {feedback ? (
        <p className="lk-rr-debrief-score">{s.routeDebriefScore(summary.correct, summary.total)}</p>
      ) : null}
      {locatable > 0 ? (
        <p className="lk-rr-debrief-located">{s.routeDebriefLocated(located, locatable)}</p>
      ) : null}
      {next !== null ? (
        <ul className="lk-rr-levels">
          {summary.strategies.map((entry) => {
            const after = next.strategies[entry.strategy]?.level ?? entry.level;
            return (
              <li key={entry.strategy} data-change={after === entry.level ? undefined : after}>
                {s.routeNextLevel(
                  strategyName(entry.strategy),
                  s.routeLevel(entry.level),
                  s.routeLevel(after),
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
      <ol className="lk-rr-results">
        {summary.questions.map((question) => (
          <li key={question.key}>
            <button
              type="button"
              className="lk-rr-result"
              aria-pressed={question.key === selected}
              data-correct={
                feedback && question.correct !== null ? String(question.correct) : undefined
              }
              onClick={() => onSelect(question.key)}
            >
              <span className="lk-rr-result-number">{s.routeShowEvidence(question.number)}</span>
              {feedback ? (
                <span className="lk-rr-result-mark">
                  {/* A wrong answer always has a cause, and an unanswered one is `unanswered`. */}
                  {question.correct === true
                    ? s.routeCorrect
                    : s.routeCause(question.cause ?? 'unknown')}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ol>
      {result !== undefined && planned !== undefined ? (
        <div className="lk-rr-detail" aria-live="polite">
          <p className="lk-rr-detail-title">
            {s.routeShowEvidence(result.number)} · {strategyName(result.strategy)}
          </p>
          {feedback && result.cause !== null ? (
            <p className="lk-rr-detail-cause">{s.routeCauseAdvice(result.cause)}</p>
          ) : null}
          {feedback && solutions && result.cause === 'trap'
            ? planned.traps
                .filter((trap) => trap.optionId === result.chosen)
                .map((trap) => (
                  <p key={trap.optionId} className="lk-rr-detail-trap">
                    {trapText(trap)}
                  </p>
                ))
            : null}
          {solutions ? (
            <ul className="lk-rr-pairs">
              {planned.pairs.map((pair) =>
                pair.question !== undefined && pair.passage !== undefined ? (
                  <li key={pair.index}>
                    <span className="lk-rr-pair-chip" aria-hidden="true">
                      {pair.index}
                    </span>
                    {s.routeParaphrase(pair.question, pair.passage.text)}
                  </li>
                ) : null,
              )}
            </ul>
          ) : null}
          {marked(result.key) > 0 ? (
            <p className="lk-rr-detail-marks">{s.routeYourMarks(marked(result.key))}</p>
          ) : null}
          {result.seconds !== null && result.seconds >= 1 ? (
            <p className="lk-rr-detail-time">{s.routeSeconds(result.seconds)}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
