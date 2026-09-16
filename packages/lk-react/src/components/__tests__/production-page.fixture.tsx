/**
 * The page `production-bundle.test.ts` bundles for a browser: one case per
 * public component that has a development path, each in a root of its own so
 * one failure cannot hide another. It is an entry point, never imported by a
 * test, and it reaches for `document` at module scope because a page does.
 *
 * Every data payload is refused by its schema in a way nothing on screen
 * reads (`schemaVersion` is a literal `'1.0'`), so development throws the
 * schema error and production renders the activity. The last two cases throw
 * in every mode and show what the error boundary itself does.
 */
import type {
  DictationData,
  FillInTheBlanksData,
  GapSelectData,
  GradeRecord,
  MultipleChoiceData,
  ReadAloudData,
  SpeechAssessment,
  WrittenResponseData,
} from '@intellectif/lk-core';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { ActivityPreview } from '../ActivityPreview/index.js';
import { ActivitySequence } from '../ActivitySequence/index.js';
import { Dictation } from '../Dictation/index.js';
import { FillInTheBlanks } from '../FillInTheBlanks/index.js';
import { GapSelect } from '../GapSelect/index.js';
import { MultipleChoice } from '../MultipleChoice/index.js';
import { PronunciationFeedback } from '../PronunciationFeedback/index.js';
import { ReadAloud } from '../ReadAloud/index.js';
import { WrittenResponse } from '../WrittenResponse/index.js';

/** A schema version no schema accepts, on a payload every renderer can still draw. */
function refused<T>(data: T): T {
  return { ...data, schemaVersion: '0.0' };
}

const multipleChoice: MultipleChoiceData = {
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'mc',
  title: 'MC title',
  question: 'MC question text',
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  options: [
    { id: 'a', text: 'Alpha', isCorrect: true },
    { id: 'b', text: 'Beta', isCorrect: false },
  ],
};

const fillInTheBlanks: FillInTheBlanksData = {
  schemaVersion: '1.0',
  type: 'fill-in-the-blanks',
  id: 'fib',
  title: 'FIB title',
  passage: 'FIB passage {{b1}} end',
  blanks: [{ id: 'b1', acceptedAnswers: ['x'] }],
  scoringStrategy: 'partial',
};

const gapSelect: GapSelectData = {
  schemaVersion: '1.0',
  type: 'gap-select',
  id: 'gs',
  title: 'GS title',
  passage: 'GS passage {{a}} end',
  banks: [
    {
      id: 'p',
      choices: [
        { id: 'of', text: 'of' },
        { id: 'in', text: 'in' },
      ],
    },
  ],
  gaps: [{ id: 'a', bankId: 'p', correctChoiceId: 'in' }],
  scoringStrategy: 'partial',
};

const dictation: DictationData = {
  schemaVersion: '1.0',
  type: 'dictation',
  id: 'dc',
  title: 'DC title',
  transcript: 'The cat sat.',
  media: { type: 'audio', url: 'https://x.test/dictation.wav', alt: 'Recording' },
};

const writtenResponse: WrittenResponseData = {
  schemaVersion: '1.0',
  type: 'written-response',
  id: 'wr',
  title: 'WR title',
  prompt: 'WR prompt text',
  minWords: 1,
  maxWords: 100,
};

const readAloud: ReadAloudData = {
  schemaVersion: '1.0',
  type: 'read-aloud',
  id: 'ra',
  title: 'RA title',
  referenceText: 'RA reference text.',
  locale: 'en-US',
  recording: { maxSeconds: 20, minSeconds: 1, maxTakes: 2 },
  scoring: { dimensions: [{ name: 'accuracy', weight: 1 }] },
};

const assessment: SpeechAssessment = {
  assessmentVersion: '1.0',
  status: 'assessed',
  task: 'scripted',
  locale: 'en-US',
  referenceText: readAloud.referenceText,
  recordingKey: 'take-1',
  assessor: { kind: 'auto', id: 'engine-1' },
  scale: 100,
  scores: { accuracy: 86 },
  recognizedText: 'ra reference text',
  miscue: 'assessor',
  words: [
    { text: 'RA', error: 'none' },
    { text: 'reference', error: 'none' },
    { text: 'text', error: 'none' },
  ],
};

const grade: GradeRecord = { score: 0.86, maxScore: 1, passed: true, feedback: 'Clearly read.' };

const upload = async () => ({ key: 'take-1', mimeType: 'audio/wav' });

const cases: Record<string, () => ReactNode> = {
  'pronunciation-feedback': () => (
    <PronunciationFeedback
      data={{ referenceText: readAloud.referenceText, locale: readAloud.locale }}
      // `scale` is a literal 100: evidence `validateSpeechAssessment` refuses.
      assessment={{ ...assessment, scale: 5 } as unknown as SpeechAssessment}
      grade={grade}
    />
  ),
  'multiple-choice': () => <MultipleChoice data={refused(multipleChoice)} />,
  'fill-in-the-blanks': () => <FillInTheBlanks data={refused(fillInTheBlanks)} />,
  'gap-select': () => <GapSelect data={refused(gapSelect)} />,
  dictation: () => <Dictation data={refused(dictation)} />,
  'written-response': () => <WrittenResponse data={refused(writtenResponse)} />,
  'read-aloud': () => <ReadAloud data={refused(readAloud)} recordingBinding={{ upload }} />,
  'activity-sequence': () => <ActivitySequence activities={[refused(multipleChoice)]} />,
  // A response the scorer cannot read: the preview hands the throw to the boundary.
  'activity-preview': () => (
    <ActivityPreview
      draft={multipleChoice}
      renderMode="review"
      response={{ type: 'multiple-choice', selectedOptionIds: 42 as unknown as string[] }}
    />
  ),
  // Throws in every mode: a practice read-aloud with nowhere to store a take.
  'error-boundary': () => <ReadAloud data={readAloud} />,
};

const main = document.getElementById('main') as HTMLElement;
for (const [name, render] of Object.entries(cases)) {
  const section = document.createElement('section');
  section.setAttribute('data-case', name);
  main.appendChild(section);
  createRoot(section).render(render());
}
