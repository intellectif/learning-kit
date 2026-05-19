import type { ActivityResult } from '@intellectif/lk-core';
import { ActivitySequence } from '@intellectif/lk-react/components/ActivitySequence';
import { MultipleChoice } from '@intellectif/lk-react/components/MultipleChoice';
import { useXAPI } from '@intellectif/lk-react/hooks/useXAPI';
import { ThemeProvider } from '@intellectif/lk-react/theme/ThemeProvider';
import { useState } from 'react';
import { LRS_ENDPOINT } from './config';
import { sampleFibSet, sampleMultipleChoice } from './sample-data';

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
          A single Multiple Choice activity, plus a Fill-in-the-Blanks question set shown via the
          in-place pager (Previous / Next, no scrolling). Submitting scores locally and POSTs an
          xAPI statement to the mock LRS (MSW).
        </p>

        <section aria-labelledby="mc-heading">
          <h2 id="mc-heading">Multiple Choice</h2>
          <MultipleChoice
            data={sampleMultipleChoice}
            onComplete={handleComplete('Multiple Choice')}
          />
        </section>

        <section aria-labelledby="fib-heading">
          <h2 id="fib-heading">Fill in the Blanks — question set</h2>
          <ActivitySequence
            activities={sampleFibSet}
            onActivityComplete={(result, i) => handleComplete(`FIB question ${i + 1}`)(result)}
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
