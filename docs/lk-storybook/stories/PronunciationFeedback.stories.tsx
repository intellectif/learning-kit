import {
  type GradeRecord,
  gradeReadAloud,
  type ReadAloudData,
  type ReadAloudLearnerResponse,
  type SpeechAssessment,
  type SpeechMeasurement,
  type SpeechPlausibilityPolicy,
} from '@intellectif/lk-core';
import { PronunciationFeedback } from '@intellectif/lk-react/components/PronunciationFeedback';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { silentWavDataUri } from './silent-wav';

/**
 * The whole item, although the panel is handed only two fields of it. The rest
 * is here because a grade is computed from the whole thing: the panel renders a
 * judgement it did not make, which is exactly why its `data` is a `Pick` and it
 * has no `renderMode`.
 */
const item: ReadAloudData = {
  schemaVersion: '1.0',
  type: 'read-aloud',
  id: 'sb-pronunciation',
  title: 'Read the tongue twister aloud',
  referenceText: 'She sells sea shells by the sea shore.',
  locale: 'en-US',
  recording: { maxSeconds: 20, minSeconds: 1, maxTakes: 3 },
  scoring: {
    dimensions: [
      { name: 'accuracy', weight: 3 },
      { name: 'completeness', weight: 1 },
    ],
  },
  passThreshold: 0.7,
};

const RECORDING_KEY = 'sb-pf-take';
const MEASURED: SpeechMeasurement = { durationMs: 3900, voicedMs: 3200 };
const PLAUSIBILITY: SpeechPlausibilityPolicy = { maxWordsPerSecond: 6, minVoicedMs: 800 };

/**
 * One reading with all four marking states in it: two words mispronounced, one
 * never said, and one said that is not in the text. `accuracy` is absent
 * wherever nothing scored it — never 0, which would read as a failure rather
 * than a gap.
 */
const assessment: SpeechAssessment = {
  assessmentVersion: '1.0',
  status: 'assessed',
  task: 'scripted',
  locale: item.locale,
  referenceText: item.referenceText,
  recordingKey: RECORDING_KEY,
  assessor: { kind: 'auto', id: 'storybook-canned-assessor' },
  scale: 100,
  scores: { accuracy: 71, completeness: 88, fluency: 74, overall: 73 },
  recognizedText: 'She sells sea shells by um the sea',
  miscue: 'assessor',
  phonemeAlphabet: 'ipa',
  words: [
    { text: 'She', error: 'none', accuracy: 94, startMs: 0, durationMs: 220 },
    {
      text: 'sells',
      error: 'mispronunciation',
      accuracy: 57,
      startMs: 240,
      durationMs: 380,
      syllables: [
        { text: 'sells', grapheme: 'sells', accuracy: 57, startMs: 240, durationMs: 380 },
      ],
      phonemes: [
        { symbol: 's', accuracy: 86, startMs: 240, durationMs: 90 },
        {
          symbol: 'ɛ',
          accuracy: 44,
          startMs: 330,
          durationMs: 120,
          heardAs: [{ symbol: 'eɪ', score: 58 }],
        },
        { symbol: 'l', accuracy: 62, startMs: 450, durationMs: 90 },
        { symbol: 'z', accuracy: 51, startMs: 540, durationMs: 80 },
      ],
    },
    { text: 'sea', error: 'none', accuracy: 91, startMs: 640, durationMs: 250 },
    {
      text: 'shells',
      error: 'mispronunciation',
      accuracy: 63,
      startMs: 910,
      durationMs: 400,
      // A phoneme with no symbol is reported by its position instead: some
      // engines score a sound without naming it.
      phonemes: [
        { accuracy: 48, startMs: 910, durationMs: 130 },
        { symbol: 'ɛ', accuracy: 72, startMs: 1040, durationMs: 110 },
        { symbol: 'l', accuracy: 70, startMs: 1150, durationMs: 90 },
        { symbol: 'z', accuracy: 66, startMs: 1240, durationMs: 70 },
      ],
    },
    {
      text: 'by',
      error: 'none',
      accuracy: 95,
      startMs: 1340,
      durationMs: 200,
      breaks: { unexpected: 0.84 },
    },
    // Said, but not in the text. An insertion carries no reference word, and it
    // is why the panel branches on the state and never on an empty string.
    { text: 'um', error: 'insertion', startMs: 1560, durationMs: 180 },
    { text: 'the', error: 'none', accuracy: 92, startMs: 1770, durationMs: 140 },
    { text: 'sea', error: 'none', accuracy: 89, startMs: 1930, durationMs: 240 },
    { text: 'shore', error: 'omission' },
  ],
  prosody: { monotoneConfidence: 0.78 },
  signal: { snrDb: 21 },
};

/**
 * The grade the evidence produced. Its `criteria` are what the dimension rows
 * read, because they are the numbers the learner was actually graded on — so
 * `fluency`, which this item does not weight, reads "Not assessed" even though
 * the engine reported one.
 */
function gradeOfFixture(): GradeRecord {
  const response: ReadAloudLearnerResponse = {
    type: 'read-aloud',
    recording: { key: RECORDING_KEY, mimeType: 'audio/wav' },
    takes: 1,
  };
  const result = gradeReadAloud(item, response, assessment, {
    measured: MEASURED,
    plausibility: PLAUSIBILITY,
  });
  if ('unscorable' in result) {
    throw new Error(`pronunciation story fixture is unscorable: ${result.code} — ${result.reason}`);
  }
  return result;
}

const grade = gradeOfFixture();

const meta: Meta<typeof PronunciationFeedback> = {
  title: 'Activities/Pronunciation Feedback',
  component: PronunciationFeedback,
  args: {
    data: { referenceText: item.referenceText, locale: item.locale },
    assessment,
  },
};
export default meta;

type Story = StoryObj<typeof PronunciationFeedback>;

/**
 * The panel as a graded review screen shows it: the score, the dimensions the
 * grade weighed, every word marked, and — past the two thresholds — a note
 * about the unexpected pause and one about the flat pitch.
 */
export const Graded: Story = {
  args: { grade, breakThreshold: 0.75, monotoneThreshold: 0.6 },
};

/**
 * **No thresholds.** Neither has a default, because how confident an engine has
 * to be before a pause is worth mentioning is a calibration the SDK cannot make
 * for you — so no break note and no monotone note render at all.
 */
export const WithoutThresholds: Story = {
  args: { grade },
};

/**
 * No grade. The dimensions fall back to `assessment.scores`, which is the
 * engine's own view rather than the graded one — so `fluency` now shows a
 * figure, and `prosody`, which nothing measured, still reads "Not assessed"
 * instead of 0%.
 */
export const WithoutGrade: Story = {
  args: { breakThreshold: 0.75, monotoneThreshold: 0.6 },
};

/**
 * With the learner's own take. Every word that carries timings gains a button
 * that plays just that word — the audio here is silent, so the buttons work and
 * nothing is heard.
 */
export const WithAudio: Story = {
  args: {
    grade,
    audioUrl: silentWavDataUri(4),
    breakThreshold: 0.75,
    monotoneThreshold: 0.6,
  },
};
