import {
  type ActivityResult,
  gradeReadAloud,
  type InteractionEvent,
  inspectWav,
  type SpeechMeasurement,
  type SpeechPlausibilityPolicy,
  type WavInspectionPolicy,
} from '@intellectif/lk-core';
import { type LearnerAi, LkAiProvider } from '@intellectif/lk-react/ai/LkAiProvider';
import { ActivitySequence } from '@intellectif/lk-react/components/ActivitySequence';
import { Dictation } from '@intellectif/lk-react/components/Dictation';
import { GapSelect } from '@intellectif/lk-react/components/GapSelect';
import { MultipleChoice } from '@intellectif/lk-react/components/MultipleChoice';
import { ReadAloud, type RecordingBinding } from '@intellectif/lk-react/components/ReadAloud';
import { useXAPI } from '@intellectif/lk-react/hooks/useXAPI';
import { ThemeProvider } from '@intellectif/lk-react/theme/ThemeProvider';
import { useCallback, useMemo, useRef, useState } from 'react';
import { LRS_ENDPOINT } from './config';
import {
  demoSpeechAssessment,
  sampleAiExam,
  sampleAiPractice,
  sampleDictation,
  sampleGapSelect,
  sampleMultipleChoice,
  sampleQuestionSet,
  sampleReadAloud,
} from './sample-data';

/**
 * Where this demo draws the line between silence and speech, and how finely it
 * looks for it. Both fields are required of `inspectWav` because neither has an
 * answer that is right for every microphone — these are one page's guesses,
 * not the SDK's advice.
 */
const DEMO_WAV_POLICY: WavInspectionPolicy = { silenceDbfs: -45, frameMs: 20 };

/**
 * The demo's plausibility policy. More words per second of voiced audio than
 * this, or less voiced audio than this, and `gradeReadAloud` refuses the take
 * rather than scoring it — which is what stops a learner passing a speaking
 * item by recording a cough. Yours belongs in your own configuration, with
 * values you calibrated.
 */
const DEMO_PLAUSIBILITY: SpeechPlausibilityPolicy = { maxWordsPerSecond: 6, minVoicedMs: 800 };

/** The interaction kinds each demo activity reports into the log below. */
const DICTATION_EVENTS: readonly string[] = ['submitted', 'hint-requested'];
const READ_ALOUD_EVENTS: readonly string[] = [
  'recording-started',
  'recording-stopped',
  'recording-discarded',
  'recording-uploaded',
  'recording-upload-failed',
  'assessment-requested',
  'assessment-failed',
  'submitted',
];

/** Long enough to show the component's own pending state. A real assessor is slower. */
const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A stand-in for your model, so the AI help can be tried with no server and no
 * key. A real application's ports post the request to its own server, which
 * holds the key and the prompt and chooses the model.
 *
 * Its second hint gives the answer away on purpose: the SDK refuses to show
 * it. And its explanation states the verdict it read from the facts, as a
 * model's structured output would, so the SDK can check it against the grade.
 */
let demoHintCalls = 0;
const demoAi: LearnerAi = {
  hint: async (request) => {
    await pause(300);
    demoHintCalls += 1;
    if (demoHintCalls === 2) {
      return { text: 'The answer is: she is tired.' };
    }
    return {
      text:
        request.hintNumber === 1
          ? 'Is "she" one person, or several?'
          : 'Which form of "to be" goes with one person?',
      provenance: { model: 'demo-stand-in' },
    };
  },
  explain: async (request) => {
    await pause(300);
    const facts = request.facts;
    const chosen =
      facts.activityType === 'multiple-choice'
        ? facts.options.find((option) => option.chosen)
        : undefined;
    const right = chosen?.correct === true;
    return {
      verdict: right ? 'correct' : 'incorrect',
      text: right
        ? '"She" is one person, so the verb is "is".'
        : '"She" is one person, so the verb is "is", not "are".',
      provenance: { model: 'demo-stand-in' },
    };
  },
  maxHints: 3,
};

const AI_EVENTS: readonly string[] = ['ai-hint-shown', 'ai-explanation-shown'];

export function App(): React.JSX.Element {
  const [log, setLog] = useState<{ id: string; text: string }[]>([]);

  const append = useCallback((text: string): void => {
    setLog((entries) => [...entries, { id: crypto.randomUUID(), text }]);
  }, []);

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

  // Interactions are the analytics channel for what a statement does not
  // carry: a dictation reports how many hint words were shown before the
  // answer went in, and a read-aloud reports every take, upload and
  // assessment attempt.
  const logInteraction =
    (label: string, kinds: readonly string[]) =>
    (event: InteractionEvent): void => {
      if (kinds.includes(event.type)) {
        append(`${label} ${event.type} ${JSON.stringify(event.payload)}`);
      }
    };

  // What a server would know about each stored take. A real application
  // measures the bytes IT stored, on its own machine: a duration the browser
  // reports is a claim rather than a measurement, and `gradeReadAloud` reads
  // only a measurement. Holding it here is what lets this page grade with no
  // backend at all.
  const measurements = useRef(new Map<string, SpeechMeasurement | null>());

  const readAloudBinding = useMemo<RecordingBinding>(
    () => ({
      async upload(take) {
        // DEMO ONLY: this "upload" never leaves the tab. Yours POSTs the blob
        // to your storage and returns the key it was stored under, which is
        // the only thing the learner's response carries.
        const bytes = new Uint8Array(await take.blob.arrayBuffer());
        const wav = inspectWav(bytes, DEMO_WAV_POLICY);
        const key = `demo-take-${crypto.randomUUID()}`;
        measurements.current.set(
          key,
          wav.valid ? { durationMs: wav.durationMs, voicedMs: wav.voicedMs } : null,
        );
        append(
          wav.valid
            ? `Read Aloud take measured: ${wav.durationMs} ms, ${wav.voicedMs} ms voiced, ` +
                `peak ${wav.peakDbfs.toFixed(1)} dBFS`
            : `Read Aloud take could not be measured (${wav.reason})`,
        );
        return { key, mimeType: take.mimeType, durationMs: take.durationMs };
      },
      async assess(ref) {
        await pause(400);
        const measured = measurements.current.get(ref.key) ?? null;
        if (measured === null) {
          // A take that exists but could not be measured is reported as a
          // failure the learner may retry: `gradeReadAloud` throws rather than
          // inventing a measurement, and a thrown error is not an answer to
          // put in front of a learner.
          return { status: 'failed', retryable: true };
        }
        // Canned evidence — nothing here listened to the recording — but bound
        // to this take and this item the way a real assessor's output must be.
        // See `demoSpeechAssessment`.
        const assessment = demoSpeechAssessment(ref.key);
        const graded = gradeReadAloud(
          sampleReadAloud,
          { type: 'read-aloud', recording: ref },
          assessment,
          { measured, plausibility: DEMO_PLAUSIBILITY },
        );
        return 'unscorable' in graded
          ? { status: 'unscorable', code: graded.code, assessment }
          : { status: 'graded', assessment, grade: graded };
      },
    }),
    [append],
  );

  return (
    <ThemeProvider>
      <main style={{ maxWidth: 680, margin: '0 auto', padding: 24 }}>
        <h1>learning-kit — Vite + React 19 example</h1>
        <p>
          A single Multiple Choice activity, a Gap Select cloze, a Dictation (two silent recordings,
          so the transport can be tried without hosted audio), a Read Aloud that records from your
          microphone, plus a question set shown via the in-place pager (Previous / Next, no
          scrolling): two Fill-in-the-Blanks questions, then a reading comprehension group whose
          passage stays on screen beside each of its questions. Submitting scores locally and POSTs
          an xAPI statement to the mock LRS (MSW).
        </p>
        <h3>Answer key:</h3>
        <p>
          Tokyo; She is tired; from, from, in; The cat isn&apos;t on the mat; evaporation,
          precipitation, condensation, groundwater; twice a day, when the sun and the moon line up,
          moon
        </p>

        <section aria-labelledby="mc-heading">
          <h2 id="mc-heading">Multiple Choice</h2>
          <MultipleChoice
            data={sampleMultipleChoice}
            onComplete={handleComplete('Multiple Choice')}
          />
        </section>

        <section aria-labelledby="gs-heading">
          <h2 id="gs-heading">Gap Select</h2>
          <GapSelect data={sampleGapSelect} onComplete={handleComplete('Gap Select')} />
        </section>

        <section aria-labelledby="dc-heading">
          <h2 id="dc-heading">Dictation</h2>
          <Dictation
            data={sampleDictation}
            onComplete={handleComplete('Dictation')}
            onInteraction={logInteraction('Dictation', DICTATION_EVENTS)}
          />
        </section>

        <section aria-labelledby="ra-heading">
          <h2 id="ra-heading">Read Aloud</h2>
          <p>
            Recording asks for microphone permission. The take is encoded as 16 kHz mono WAV,
            measured in this tab with <code>inspectWav</code>, and graded by{' '}
            <code>gradeReadAloud</code> from canned evidence — so the page needs no server and keeps
            no recording. A real application uploads the take to its own storage and measures and
            assesses it there: evidence a browser produced can be forged, so a browser-side
            assessment is for practice that feeds nothing.
          </p>
          <ReadAloud
            data={sampleReadAloud}
            recordingBinding={readAloudBinding}
            breakThreshold={0.75}
            monotoneThreshold={0.6}
            onComplete={handleComplete('Read Aloud')}
            onSubmit={(response) => append(`Read Aloud response ${JSON.stringify(response)}`)}
            onInteraction={logInteraction('Read Aloud', READ_ALOUD_EVENTS)}
          />
        </section>

        <section aria-labelledby="ai-heading">
          <h2 id="ai-heading">AI help</h2>
          <p>
            The same question twice, answered by a stand-in model in this page. In practice a
            learner can ask for hints and, once graded, an explanation — and the second hint, which
            gives the answer away on purpose, is refused. In an exam no question gives AI help,
            whatever the page connects.
          </p>
          <LkAiProvider ai={demoAi}>
            <section aria-labelledby="ai-practice-heading">
              <h3 id="ai-practice-heading">AI help in practice</h3>
              <MultipleChoice
                data={sampleAiPractice}
                onInteraction={logInteraction('AI help', AI_EVENTS)}
              />
            </section>
            <section aria-labelledby="ai-exam-heading">
              <h3 id="ai-exam-heading">AI help in an exam</h3>
              <MultipleChoice data={sampleAiExam} renderMode="exam" />
            </section>
          </LkAiProvider>
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
