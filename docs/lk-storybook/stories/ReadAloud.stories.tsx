import {
  type GradeRecord,
  gradeReadAloud,
  outcomeFromGrade,
  outcomeFromUnscorable,
  type ReadAloudData,
  type ReadAloudLearnerResponse,
  redact,
  type SpeechAssessment,
  type SpeechMeasurement,
  type SpeechPlausibilityPolicy,
} from '@intellectif/lk-core';
import {
  ReadAloud,
  type ReadAloudAssessResult,
  type RecordingBinding,
} from '@intellectif/lk-react/components/ReadAloud';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { silentWavDataUri } from './silent-wav';

const data: ReadAloudData = {
  schemaVersion: '1.0',
  type: 'read-aloud',
  id: 'sb-read-aloud',
  title: 'Read the sentence aloud',
  instructions: 'Listen to the model first if you like, then read the sentence in one take.',
  referenceText: 'The weather is lovely today, so we will walk to the park.',
  locale: 'en-US',
  media: { type: 'audio', url: silentWavDataUri(0.75), alt: 'Model reading' },
  slowMedia: { type: 'audio', url: silentWavDataUri(1.5), alt: 'Model reading, slow' },
  recording: { maxSeconds: 20, minSeconds: 1, maxTakes: 3 },
  scoring: {
    dimensions: [
      { name: 'accuracy', weight: 3 },
      { name: 'fluency', weight: 1 },
      { name: 'completeness', weight: 1 },
    ],
  },
  passThreshold: 0.7,
  feedback: {
    correct: 'Clearly read — the whole sentence came through.',
    incorrect: 'Play the slow model once more and read it again.',
  },
};

/**
 * What a server would have measured of the take. Every story uses one figure
 * because no story records anything: `gradeReadAloud` reads a measurement and
 * never a duration the browser reported, so a fixture has to supply one.
 */
const MEASURED: SpeechMeasurement = { durationMs: 4200, voicedMs: 3600 };

/** Story-only thresholds. Yours are a calibration, and belong in your configuration. */
const PLAUSIBILITY: SpeechPlausibilityPolicy = { maxWordsPerSecond: 6, minVoicedMs: 800 };

/**
 * The evidence an assessor would return, bound to one stored take. Canned:
 * nothing here listens to anything. The three bindings are the part to copy —
 * `recordingKey`, `referenceText` and `locale` must match the take and the
 * item exactly, or the grade comes back `recording_mismatch`,
 * `reference_mismatch` or `locale_mismatch` rather than a score.
 */
function assessmentFor(recordingKey: string): SpeechAssessment {
  return {
    assessmentVersion: '1.0',
    status: 'assessed',
    task: 'scripted',
    locale: data.locale,
    referenceText: data.referenceText,
    recordingKey,
    assessor: { kind: 'auto', id: 'storybook-canned-assessor' },
    scale: 100,
    // No `prosody`: this item does not weight it and nothing measured it. A 0
    // there would turn "not measured" into a failing dimension.
    scores: { accuracy: 86, fluency: 78, completeness: 92, overall: 85 },
    recognizedText: 'The weather is lovely today so we will walk to the',
    miscue: 'assessor',
    phonemeAlphabet: 'ipa',
    words: [
      { text: 'The', error: 'none', accuracy: 97, startMs: 0, durationMs: 180 },
      { text: 'weather', error: 'none', accuracy: 91, startMs: 200, durationMs: 420 },
      { text: 'is', error: 'none', accuracy: 95, startMs: 640, durationMs: 150 },
      {
        text: 'lovely',
        error: 'mispronunciation',
        accuracy: 62,
        startMs: 810,
        durationMs: 480,
        syllables: [
          { text: 'love', grapheme: 'love', accuracy: 58, startMs: 810, durationMs: 250 },
          { text: 'ly', grapheme: 'ly', accuracy: 71, startMs: 1060, durationMs: 230 },
        ],
        phonemes: [
          { symbol: 'l', accuracy: 88, startMs: 810, durationMs: 60 },
          {
            symbol: 'ʌ',
            accuracy: 41,
            startMs: 870,
            durationMs: 90,
            heardAs: [{ symbol: 'ɒ', score: 63 }],
          },
          { symbol: 'v', accuracy: 74, startMs: 960, durationMs: 100 },
          { symbol: 'l', accuracy: 80, startMs: 1060, durationMs: 90 },
          { symbol: 'i', accuracy: 69, startMs: 1150, durationMs: 140 },
        ],
      },
      { text: 'today', error: 'none', accuracy: 89, startMs: 1320, durationMs: 430 },
      {
        text: 'so',
        error: 'none',
        accuracy: 93,
        startMs: 1800,
        durationMs: 200,
        breaks: { unexpected: 0.82 },
      },
      { text: 'we', error: 'none', accuracy: 96, startMs: 2030, durationMs: 160 },
      { text: 'will', error: 'none', accuracy: 90, startMs: 2210, durationMs: 200 },
      { text: 'walk', error: 'none', accuracy: 84, startMs: 2430, durationMs: 330 },
      { text: 'to', error: 'none', accuracy: 94, startMs: 2790, durationMs: 140 },
      { text: 'the', error: 'none', accuracy: 92, startMs: 2950, durationMs: 130 },
      // An omitted word was never spoken: no timings, and no accuracy to give.
      { text: 'park', error: 'omission' },
    ],
    prosody: { monotoneConfidence: 0.71 },
    signal: { snrDb: 24 },
  };
}

/**
 * The fixture's grade, or a loud failure. A story whose evidence quietly came
 * back unscorable would render a "we could not assess this" notice and look
 * like a component bug, so say which check refused it instead.
 */
function gradeFor(recordingKey: string): GradeRecord {
  const response: ReadAloudLearnerResponse = {
    type: 'read-aloud',
    recording: { key: recordingKey, mimeType: 'audio/wav' },
    takes: 1,
  };
  const result = gradeReadAloud(data, response, assessmentFor(recordingKey), {
    measured: MEASURED,
    plausibility: PLAUSIBILITY,
  });
  if ('unscorable' in result) {
    throw new Error(`read-aloud story fixture is unscorable: ${result.code} — ${result.reason}`);
  }
  return result;
}

/** Keys are minted, never reused: two takes must not share one. */
let takeCount = 0;

/**
 * A binding with no server behind it. The "upload" mints a key in the tab and
 * `assess` answers with whatever the story asked for. Only `upload` is
 * required — a binding without `assess` records, uploads and submits, and the
 * feedback is replaced by a notice.
 */
function binding(assess?: (key: string) => ReadAloudAssessResult): RecordingBinding {
  return {
    upload: async (take) => {
      takeCount += 1;
      return { key: `sb-take-${takeCount}`, mimeType: take.mimeType, durationMs: take.durationMs };
    },
    ...(assess !== undefined ? { assess: async (ref) => assess(ref.key) } : {}),
  };
}

/** The stored attempt the three `review` stories render. */
const STORED_KEY = 'sb-stored-take';
const storedResponse: ReadAloudLearnerResponse = {
  type: 'read-aloud',
  recording: { key: STORED_KEY, mimeType: 'audio/wav' },
  takes: 1,
};
const storedGrade = gradeFor(STORED_KEY);

const meta: Meta<typeof ReadAloud> = {
  title: 'Activities/Read Aloud',
  component: ReadAloud,
  args: { data, onComplete: fn(), onSubmit: fn(), onInteraction: fn() },
};
export default meta;

type Story = StoryObj<typeof ReadAloud>;

/**
 * Practice, end to end — **this one needs a microphone**. Record, play the take
 * back, submit, and the canned assessment comes back graded with the marks
 * below it.
 */
export const Practice: Story = {
  args: {
    recordingBinding: binding((key) => ({
      status: 'graded',
      assessment: assessmentFor(key),
      grade: gradeFor(key),
    })),
    breakThreshold: 0.75,
    monotoneThreshold: 0.6,
  },
};

/**
 * A binding with **no `assess`**: the take is still recorded, uploaded and
 * submitted, and the panel is replaced by the "not available" notice. This is
 * what `<ActivityPreview>` shows an author, and it is why a missing assessor is
 * a notice rather than a throw.
 */
export const NoAssessor: Story = {
  args: { recordingBinding: binding() },
};

/**
 * The assessor heard nothing. `no_speech` and `insufficient_voiced_time` become
 * "we could not hear you"; every other code becomes "we could not assess this
 * take". The learner is offered another take and no code is ever shown to them.
 */
export const Unscorable: Story = {
  args: {
    recordingBinding: binding(() => ({ status: 'unscorable', code: 'no_speech' })),
  },
};

/**
 * Exam, on a `redact()` projection. A read-aloud has no answer key, so the
 * projection keeps the text, the locale and the bounds and drops only the
 * authored feedback. It records, uploads, submits and locks — and never scores,
 * reveals, assesses or builds a statement.
 */
export const Exam: Story = {
  args: {
    data: redact(data) as unknown as ReadAloudData,
    renderMode: 'exam',
    recordingBinding: binding(),
  },
};

/** Review with the evidence kept: the full marks, every word openable. */
export const Review: Story = {
  args: {
    renderMode: 'review',
    defaultValue: storedResponse,
    outcome: outcomeFromGrade(storedGrade),
    assessment: assessmentFor(STORED_KEY),
    breakThreshold: 0.75,
    monotoneThreshold: 0.6,
  },
};

/**
 * Review with the grade stored but the evidence not: the marks are rebuilt from
 * `outcome.grade.details`, which carries one per reference word. No syllables,
 * no sounds and no insertions — details record the reference words alone.
 */
export const ReviewFromStoredDetails: Story = {
  args: {
    renderMode: 'review',
    defaultValue: storedResponse,
    outcome: outcomeFromGrade(storedGrade),
  },
};

/**
 * Review of a take nobody could grade. The learner reads "this could not be
 * graded"; the code rides on `data-code` for a diagnostic, never as text.
 */
export const ReviewUnscorable: Story = {
  args: {
    renderMode: 'review',
    defaultValue: storedResponse,
    outcome: outcomeFromUnscorable({
      code: 'insufficient_voiced_time',
      reason: 'the take carried almost no voiced audio',
    }),
  },
};

export const Disabled: Story = {
  args: { recordingBinding: binding(), disabled: true },
};
