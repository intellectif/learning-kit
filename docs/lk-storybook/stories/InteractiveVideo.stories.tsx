import {
  type GradeRecord,
  type ItemGroup,
  type MediaTimeline,
  outcomeFromGrade,
  redactItemGroup,
  type SpeakingResponseData,
  type SpeechAssessment,
} from '@intellectif/lk-core';
import type { SequenceRecordingBinding } from '@intellectif/lk-react';
import { InteractiveVideo } from '@intellectif/lk-react/components/InteractiveVideo';
import type { SpeakingAssessResult } from '@intellectif/lk-react/components/SpeakingResponse';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { silentWavDataUri } from './silent-wav';

/**
 * The example app's clip — eight seconds of ffmpeg's test pattern, served from
 * `apps/lk-example-vite/public` (see `.storybook/main.ts`) — with a quiz at 0:02
 * and a required one at 0:05.
 */
const timeline: MediaTimeline = {
  navigation: 'free',
  chapters: [
    { at: 0, title: 'Counting' },
    { at: 5, title: 'Stopping' },
  ],
  cues: [
    { id: 'first', at: 2, title: 'First pause', itemIds: ['sb-video-start'] },
    { id: 'second', at: 5, title: 'Second pause', itemIds: ['sb-video-stop'], required: true },
  ],
};

const group: ItemGroup = {
  schemaVersion: '1.0',
  type: 'item-group',
  id: 'sb-video',
  title: 'A short clip',
  stimulus: {
    id: 'sb-video-stimulus',
    kind: 'video',
    media: {
      type: 'video',
      url: '/demo-video.webm',
      alt: 'A test pattern with a counting clock',
      tracks: [
        {
          kind: 'captions',
          src: '/demo-video.vtt',
          srclang: 'en',
          label: 'English',
          default: true,
        },
      ],
    },
  },
  items: [
    {
      schemaVersion: '1.0',
      type: 'multiple-choice',
      id: 'sb-video-start',
      title: 'The start',
      question: 'Where does the clock start?',
      mode: 'single',
      scoringStrategy: 'all-or-nothing',
      options: [
        { id: 'zero', text: 'At zero', isCorrect: true },
        { id: 'ten', text: 'At ten', isCorrect: false },
      ],
    },
    {
      schemaVersion: '1.0',
      type: 'fill-in-the-blanks',
      id: 'sb-video-stop',
      title: 'The end',
      passage: 'The clock stops at {{n}}.',
      blanks: [{ id: 'n', acceptedAnswers: ['eight', '8'] }],
      scoringStrategy: 'all-or-nothing',
    },
  ],
  timeline,
};

const meta: Meta<typeof InteractiveVideo> = {
  title: 'Activities/InteractiveVideo',
  component: InteractiveVideo,
  args: {
    group,
    renderMode: 'practice',
    onActivityComplete: fn(),
    onFinished: fn(),
    onInteraction: fn(),
  },
};
export default meta;

type Story = StoryObj<typeof InteractiveVideo>;

export const Practice: Story = {};

/** No skipping ahead of a quiz not yet answered. */
export const NoSkipAhead: Story = {
  args: { group: { ...group, timeline: { ...timeline, navigation: 'no-skip-ahead' } } },
};

// ── A spoken answer inside the video (lk-react 23.6.0) ─────────────────────

/** The clip with a spoken answer in a quiz of its own at 0:06. */
const spoken: SpeakingResponseData = {
  schemaVersion: '1.0',
  type: 'speaking-response',
  id: 'sb-video-speak',
  title: 'Your turn',
  prompt: 'Say what the clock did, in one or two sentences.',
  locale: 'en-US',
  recording: { maxSeconds: 30, maxTakes: 2 },
  rubric: {
    criteria: [
      { name: 'Content', weight: 2, description: 'Says when it started and when it stopped.' },
      { name: 'Pronunciation', weight: 1, measure: 'pronunciation' },
    ],
  },
};

const speakingGroup: ItemGroup = {
  ...group,
  items: [...group.items, spoken],
  timeline: {
    ...timeline,
    cues: [...timeline.cues, { id: 'speak', at: 6, title: 'Your turn', itemIds: [spoken.id] }],
  },
};

/** The spoken answer's slot: the third question of the video's one entry. */
const SPOKEN_SLOT = '0.2';
const SAID = 'the clock starts at zero and uh stops at eight';

/** The engine's unscripted assessment and a judge's grade, canned: nothing here listens. */
function assessmentFor(recordingKey: string): SpeechAssessment {
  return {
    assessmentVersion: '1.0',
    status: 'assessed',
    task: 'unscripted',
    locale: spoken.locale,
    recordingKey,
    assessor: { kind: 'auto', id: 'storybook-canned-engine' },
    scale: 100,
    scores: { accuracy: 92 },
    transcript: { text: SAID, source: { kind: 'auto', id: 'storybook-transcriber' } },
    miscue: 'none',
    words: SAID.split(' ').map((text) => ({ text, error: 'none' as const, accuracy: 92 })),
  };
}
const GRADE: GradeRecord = {
  score: 0.83,
  maxScore: 1,
  passed: true,
  feedback: 'Clear: both moments are there.',
  criteria: [
    { name: 'Content', score: 0.8, weight: 2, comment: 'Start and stop, both named.' },
    { name: 'Pronunciation', score: 92, maxScore: 100, weight: 1 },
  ],
  corrections: [{ original: 'stops at eight', corrected: 'stops at eight seconds' }],
  grader: { kind: 'ai', model: 'storybook-judge', promptHash: 'sb-1' },
};

let takes = 0;

/** A binding with no server behind it: the "upload" mints a key, `assess` answers as asked. */
function videoBinding(assess?: (key: string) => SpeakingAssessResult): SequenceRecordingBinding {
  return {
    upload: async (take) => {
      takes += 1;
      return {
        key: `sb-video-take-${takes}`,
        mimeType: take.mimeType,
        durationMs: take.durationMs,
      };
    },
    ...(assess !== undefined ? { assess: async (ref) => assess(ref.key) } : {}),
    playbackUrl: async () => silentWavDataUri(2),
  };
}

/**
 * A spoken answer at 0:06 — **this one needs a microphone**. The video pauses,
 * the learner records and submits, and the canned grade shows under the pause:
 * the score, each criterion, the correction and what was said.
 */
export const SpokenAnswer: Story = {
  args: {
    group: speakingGroup,
    recordingBinding: videoBinding((key) => ({
      status: 'graded',
      assessment: assessmentFor(key),
      grade: GRADE,
    })),
  },
};

/**
 * The grade waits for a person. The answer counts, the learner is told it waits,
 * and the quiz marker and the end card show it pending.
 */
export const SpokenAnswerPending: Story = {
  args: { group: speakingGroup, recordingBinding: videoBinding(() => ({ status: 'pending' })) },
};

/** An exam: the take is stored and submitted, nothing is assessed, and an answer without one can be handed in. */
export const SpokenAnswerExam: Story = {
  args: {
    group: redactItemGroup(speakingGroup) as unknown as ItemGroup,
    renderMode: 'exam',
    recordingBinding: videoBinding(),
  },
};

/** Review: the stored grade, what was said, and the take played back through `playbackUrl`. */
export const SpokenAnswerReview: Story = {
  args: {
    group: redactItemGroup(speakingGroup) as unknown as ItemGroup,
    renderMode: 'review',
    responses: {
      [SPOKEN_SLOT]: {
        type: 'speaking-response',
        recording: { key: 'sb-video-stored', mimeType: 'audio/wav' },
        takes: 1,
      },
    },
    outcomes: { [SPOKEN_SLOT]: outcomeFromGrade(GRADE) },
    assessments: { [SPOKEN_SLOT]: assessmentFor('sb-video-stored') },
    recordingBinding: videoBinding(),
  },
};
