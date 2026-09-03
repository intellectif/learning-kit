import type { ActivityResult } from '@intellectif/lk-core';
import { ActivitySequence } from '@intellectif/lk-react/components/ActivitySequence';
import { MultipleChoice } from '@intellectif/lk-react/components/MultipleChoice';
import { useXAPI } from '@intellectif/lk-react/hooks/useXAPI';
import { ThemeProvider } from '@intellectif/lk-react/theme/ThemeProvider';
import { useState } from 'react';
import { LRS_ENDPOINT } from './config';
import { sampleMultipleChoice, sampleQuestionSet } from './sample-data';

export function App(): React.JSX.Element {
  const [log, setLog] = useState<{ id: string; text: string }[]>([]);

  const append = (text: string): void =>
    setLog((entries) => [...entries, { id: crypto.randomUUID(), text }]);

  // Real learner identity is applied here, at the LRS layer — the activity
  // components only emit an anonymous, structurally-valid statement (by design,
  // Req 3.1: components cannot know who the learner is).
  const { sendStatement } = useXAPI({
    endpoint: LRS_ENDPOINT,
    auth: { type: 'bearer', token: 'demo-token' },
    activityId: 'https://learning-kit.test/demo',
    actor: { objectType: 'Agent', mbox: 'mailto:learner@example.com' },
    onError: (err) => append(`xAPI send failed: ${err.message}`),
  });

  const handleComplete =
    (label: string) =>
    (result: ActivityResult): void => {
      append(
        `${label}: scored ${Math.round(result.score * 100)}% — ${
          result.passed ? 'passed' : 'not passed'
        } (${result.timeSpent} ms)`,
      );
      void sendStatement(result.xapiStatement);
    };

  return (
    <ThemeProvider>
      <main style={{ maxWidth: 680, margin: '0 auto', padding: 24 }}>
        <h1>learning-kit — Vite + React 19 example</h1>
        <p>
          A single Multiple Choice activity, plus a question set shown via the in-place pager
          (Previous / Next, no scrolling): two Fill-in-the-Blanks questions, then a reading
          comprehension group whose passage stays on screen beside each of its questions. Submitting
          scores locally and POSTs an xAPI statement to the mock LRS (MSW).
        </p>
        <h3>Answer key:</h3>
        <p>
          Tokyo, evaporation, precipitation, condensation, groundwater; twice a day, when the sun
          and the moon line up, moon
        </p>

        <section aria-labelledby="mc-heading">
          <h2 id="mc-heading">Multiple Choice</h2>
          <MultipleChoice
            data={sampleMultipleChoice}
            onComplete={handleComplete('Multiple Choice')}
          />
        </section>

        <section aria-labelledby="set-heading">
          <h2 id="set-heading">Question set — with a reading group</h2>
          <ActivitySequence
            activities={sampleQuestionSet}
            // Persist against `slotId`, not the presented index: the index moves
            // under shuffling and already differs from the slot identity once a
            // group is involved (question 3 below is slot "2.0"). It is the id
            // composeAssessmentScore scores by.
            onActivityComplete={(result, i, slotId) =>
              handleComplete(`Question ${i + 1} [slot ${slotId}]`)(result)
            }
          />
        </section>

        <section aria-labelledby="log-heading">
          <h2 id="log-heading">Activity log</h2>
          <ul aria-live="polite">
            {log.length === 0 ? <li>No activity submitted yet.</li> : null}
            {log.map((entry) => (
              <li key={entry.id}>{entry.text}</li>
            ))}
          </ul>
        </section>
      </main>
    </ThemeProvider>
  );
}
