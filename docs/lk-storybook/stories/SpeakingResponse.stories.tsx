import {
  type AiGradingJudgement,
  type GradeRecord,
  gradeSpeakingResponse,
  outcomeFromGrade,
  type SpeakingResponseData,
  type SpeakingResponseLearnerResponse,
  type SpeechAssessment,
} from '@intellectif/lk-core';
import {
  type RecordingBinding,
  type SpeakingAssessResult,
  SpeakingResponse,
} from '@intellectif/lk-react/components/SpeakingResponse';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

const data: SpeakingResponseData = {
  schemaVersion: '1.0',
  type: 'speaking-response',
  id: 'sb-speaking-response',
  title: 'City or country',
  instructions: 'Answer in about a minute. Give at least one reason.',
  prompt: 'Would you rather live in a city or in the country? Say why.',
  locale: 'en-US',
  recording: { minSeconds: 10, maxSeconds: 60, maxTakes: 2 },
  rubric: {
    criteria: [
      {
        name: 'Content',
        weight: 2,
        description: 'Answers the question with a reason.',
        levels: [{ label: 'Not met' }, { label: 'Partly met' }, { label: 'Met' }],
      },
      { name: 'Language', weight: 1 },
      { name: 'Pronunciation', weight: 1, measure: 'pronunciation' },
      { name: 'Fluency', weight: 1, measure: 'fluency' },
    ],
  },
  languageTarget: 'en-B1',
  passThreshold: 0.6,
};

/** What the learner said, verbatim: the transcriber's text, fillers and grammar kept. */
const TRANSCRIPT =
  'um I think I would rather live in the city because uh there is more things to do and the buses is everywhere';

/**
 * The engine's unscripted assessment of the take, measured against the
 * transcript. Canned: nothing here listens to anything.
 */
function assessmentFor(recordingKey: string): SpeechAssessment {
  return {
    assessmentVersion: '1.0',
    status: 'assessed',
    task: 'unscripted',
    locale: data.locale,
    recordingKey,
    assessor: { kind: 'auto', id: 'storybook-canned-engine' },
    scale: 100,
    scores: { accuracy: 91, fluency: 74, prosody: 80 },
    recognizedText: TRANSCRIPT,
    transcript: { text: TRANSCRIPT, source: { kind: 'auto', id: 'storybook-transcriber' } },
    miscue: 'none',
    words: TRANSCRIPT.split(' ').map((text) => ({ text, error: 'none' as const, accuracy: 91 })),
  };
}

/** A judge's marks of the criteria a judge scores, as `checkAiGrading` returns them. */
const JUDGEMENT: AiGradingJudgement = {
  criteria: [
    { name: 'Content', level: 'Met', score: 1, comment: 'A clear choice, and a reason for it.' },
    { name: 'Language', score: 0.6, comment: 'Agreement slips: "there is more things".' },
  ],
  feedback: 'A clear answer. Watch the verb after a plural: "there are", "the buses are".',
  corrections: [
    { original: 'there is more things', corrected: 'there are more things' },
    { original: 'the buses is', corrected: 'the buses are' },
  ],
  requiresHumanReview: false,
  provenance: { model: 'storybook-judge', promptHash: 'sb-1' },
};

/** The grade a server computes with `gradeSpeakingResponse`, from the take's evidence. */
function gradeFor(recordingKey: string): GradeRecord {
  const result = gradeSpeakingResponse(
    data,
    { type: 'speaking-response', recording: { key: recordingKey, mimeType: 'audio/wav' } },
    { assessment: assessmentFor(recordingKey), judgement: JUDGEMENT },
    {
      measured: { durationMs: 21000, voicedMs: 16000 },
      plausibility: { maxWordsPerSecond: 6, minVoicedMs: 800 },
    },
  );
  if ('unscorable' in result) {
    throw new Error(`speaking story fixture is unscorable: ${result.code} — ${result.reason}`);
  }
  return result;
}

let takeCount = 0;

/** A binding with no server behind it: the "upload" mints a key, `assess` answers as asked. */
function binding(
  assess?: (key: string) => SpeakingAssessResult,
): RecordingBinding<SpeakingAssessResult> {
  return {
    upload: async (take) => {
      takeCount += 1;
      return {
        key: `sb-answer-${takeCount}`,
        mimeType: take.mimeType,
        durationMs: take.durationMs,
      };
    },
    ...(assess !== undefined ? { assess: async (ref) => assess(ref.key) } : {}),
  };
}

const STORED_KEY = 'sb-stored-answer';
const storedResponse: SpeakingResponseLearnerResponse = {
  type: 'speaking-response',
  recording: { key: STORED_KEY, mimeType: 'audio/wav' },
  takes: 1,
};

const meta: Meta<typeof SpeakingResponse> = {
  title: 'Activities/Speaking Response',
  component: SpeakingResponse,
  args: { data, onComplete: fn(), onSubmit: fn(), onInteraction: fn() },
};
export default meta;

type Story = StoryObj<typeof SpeakingResponse>;

/**
 * Practice, end to end — **this one needs a microphone**. Record, submit, and
 * the canned grade comes back: the score, the judge's feedback, each criterion,
 * the corrections and the transcript.
 */
export const Practice: Story = {
  args: {
    recordingBinding: binding((key) => ({
      status: 'graded',
      assessment: assessmentFor(key),
      grade: gradeFor(key),
    })),
  },
};

/**
 * The grade waits for a person: `routeGrade` sent it to one. The learner is
 * told the answer is in, and `onComplete` is not called.
 */
export const Pending: Story = {
  args: { recordingBinding: binding(() => ({ status: 'pending' })) },
};

/** No `assess`: the take is recorded, uploaded and submitted, and a notice replaces the feedback. */
export const NoAssessor: Story = {
  args: { recordingBinding: binding() },
};

/** An exam: nothing is assessed on the client, and an answer without a recording can be handed in. */
export const Exam: Story = {
  args: { renderMode: 'exam', recordingBinding: binding() },
};

/** A stored grade, and the kept evidence for its transcript. No binding is needed. */
export const Review: Story = {
  args: {
    renderMode: 'review',
    value: storedResponse,
    outcome: outcomeFromGrade(gradeFor(STORED_KEY)),
    assessment: assessmentFor(STORED_KEY),
  },
};
