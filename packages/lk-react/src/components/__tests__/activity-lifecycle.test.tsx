import type {
  BuiltInActivityType,
  DeliveryPolicy,
  DictationData,
  FillInTheBlanksData,
  GapSelectData,
  MarkTheWordsData,
  MatchingData,
  MultipleChoiceData,
  OrderingData,
  ReadAloudData,
  SpeakingResponseData,
  WrittenResponseData,
} from '@intellectif/lk-core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { stubMediaElement } from '../../test-support/media.js';
import { type SpeechCaptureHarness, stubSpeechCapture } from '../../test-support/speech.js';
import { Dictation } from '../Dictation/index.js';
import { FillInTheBlanks } from '../FillInTheBlanks/index.js';
import { GapSelect } from '../GapSelect/index.js';
import { MarkTheWords } from '../MarkTheWords/index.js';
import { Matching } from '../Matching/index.js';
import { MultipleChoice } from '../MultipleChoice/index.js';
import { Ordering } from '../Ordering/index.js';
import { ReadAloud } from '../ReadAloud/index.js';
import { SpeakingResponse } from '../SpeakingResponse/index.js';
import type { RenderMode } from '../types.js';
import { WrittenResponse } from '../WrittenResponse/index.js';

/**
 * The six activity components, walked through the same moments.
 *
 * Each component keeps its own copy of the same setup — the summary it
 * announces, the delivery policy it obeys — and the copies drift: a multiple
 * choice under `feedback: false` once said "Answer submitted." before anyone
 * had answered, where every other component said nothing. A rule that holds for
 * one component is written here once and asked of all six, so a drift shows up
 * as the one component that fails.
 */

let speech: SpeechCaptureHarness | undefined;
beforeEach(() => {
  stubMediaElement();
  speech = stubSpeechCapture();
});
afterEach(() => {
  cleanup();
  speech?.restore();
  speech = undefined;
});

const mc: MultipleChoiceData = {
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'mc1',
  title: 'Capital',
  question: 'What is the capital of Spain?',
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  options: [
    { id: 'madrid', text: 'Madrid', isCorrect: true },
    { id: 'seville', text: 'Seville', isCorrect: false },
  ],
  feedback: { correct: 'Well done.', incorrect: 'Not quite.' },
};

const fib: FillInTheBlanksData = {
  schemaVersion: '1.0',
  type: 'fill-in-the-blanks',
  id: 'fib1',
  title: 'To be',
  passage: 'My name {{be}} Rossi.',
  blanks: [{ id: 'be', acceptedAnswers: ['is'], hint: 'Third person singular.' }],
  scoringStrategy: 'partial',
};

const gs: GapSelectData = {
  schemaVersion: '1.0',
  type: 'gap-select',
  id: 'gs1',
  title: 'To be',
  passage: 'She {{g}} tired.',
  gaps: [
    {
      id: 'g',
      choices: [
        { id: 'is', text: 'is' },
        { id: 'are', text: 'are' },
      ],
      correctChoiceId: 'is',
    },
  ],
  scoringStrategy: 'partial',
};

const match: MatchingData = {
  schemaVersion: '1.0',
  type: 'matching',
  id: 'mt1',
  title: 'Capitals',
  options: [
    { id: 'madrid', text: 'Madrid' },
    { id: 'lisbon', text: 'Lisbon' },
  ],
  prompts: [{ id: 'es', text: 'Spain', correctOptionId: 'madrid' }],
  scoringStrategy: 'partial',
};

const marks: MarkTheWordsData = {
  schemaVersion: '1.0',
  type: 'mark-the-words',
  id: 'mw1',
  title: 'Verbs',
  text: 'She ran home.',
  targets: [{ text: 'ran' }],
  scoringStrategy: 'partial',
};

const steps: OrderingData = {
  schemaVersion: '1.0',
  type: 'ordering',
  id: 'or1',
  title: 'Steps',
  items: [
    { id: 'k', text: 'Boil the water.' },
    { id: 'q', text: 'Add the pasta.' },
  ],
  scoringStrategy: 'partial',
};

const essay: WrittenResponseData = {
  schemaVersion: '1.0',
  type: 'written-response',
  id: 'wr1',
  title: 'Your weekend',
  prompt: 'Describe your weekend.',
  minWords: 1,
  maxWords: 50,
};

const dictation: DictationData = {
  schemaVersion: '1.0',
  type: 'dictation',
  id: 'dc1',
  title: 'Listen and type',
  transcript: 'The cat sat on the mat.',
  media: { type: 'audio', url: 'https://x.test/cat.mp3', alt: 'Recording' },
};

const reading: ReadAloudData = {
  schemaVersion: '1.0',
  type: 'read-aloud',
  id: 'ra1',
  title: 'Read the sentence',
  referenceText: 'The weather is lovely today.',
  locale: 'en-US',
  recording: { maxSeconds: 20, minSeconds: 1, maxTakes: 3 },
  scoring: { dimensions: [{ name: 'accuracy', weight: 1 }] },
};

const answer: SpeakingResponseData = {
  schemaVersion: '1.0',
  type: 'speaking-response',
  id: 'sr1',
  title: 'Answer the question',
  prompt: 'What did you do last weekend?',
  locale: 'en-US',
  recording: { maxSeconds: 60, maxTakes: 3 },
  rubric: { criteria: [{ name: 'Content', weight: 1 }] },
};

/** What the moments under test vary: the mode, and a delivery policy or none. */
type Shared = { renderMode: RenderMode; delivery?: DeliveryPolicy };

/** Every activity component, as a learner meets it, with the props the moment under test varies. */
const COMPONENTS = {
  'multiple-choice': (props) => <MultipleChoice data={mc} {...props} />,
  'fill-in-the-blanks': (props) => <FillInTheBlanks data={fib} {...props} />,
  'gap-select': (props) => <GapSelect data={gs} {...props} />,
  matching: (props) => <Matching data={match} {...props} />,
  'mark-the-words': (props) => <MarkTheWords data={marks} {...props} />,
  ordering: (props) => <Ordering data={steps} {...props} />,
  'written-response': (props) => <WrittenResponse data={essay} {...props} />,
  dictation: (props) => <Dictation data={dictation} {...props} />,
  'read-aloud': (props) => (
    <ReadAloud
      data={reading}
      recordingBinding={{
        upload: async (take) => ({
          key: 'take-1',
          mimeType: take.mimeType,
          durationMs: take.durationMs,
        }),
      }}
      {...props}
    />
  ),
  'speaking-response': (props) => (
    <SpeakingResponse
      data={answer}
      recordingBinding={{
        upload: async (take) => ({
          key: 'take-1',
          mimeType: take.mimeType,
          durationMs: take.durationMs,
        }),
      }}
      {...props}
    />
  ),
} satisfies Record<BuiltInActivityType, (props: Shared) => ReactElement>;

const POLICIES: Record<string, DeliveryPolicy | undefined> = {
  'no policy': undefined,
  'feedback: false': { feedback: false },
  'solutions: false': { solutions: false },
  'hints: false': { hints: false },
  'everything off': { feedback: false, solutions: false, hints: false },
};

/**
 * What the component's feedback region says: the live region every one of the
 * six announces an answer's result in. Other live regions — a written
 * response's word count — describe the input, not the answer.
 */
function feedbackOf(container: HTMLElement): string {
  const [region, ...more] = container.querySelectorAll('[aria-live][id$="-feedback"]');
  if (region === undefined || more.length > 0) {
    throw new Error('expected exactly one feedback region');
  }
  return region.textContent?.trim() ?? '';
}

describe('before the learner has answered', () => {
  for (const [type, show] of Object.entries(COMPONENTS)) {
    for (const renderMode of ['practice', 'exam'] as const) {
      it(`${type} in ${renderMode} announces nothing, under every delivery policy`, () => {
        const heard: Record<string, string> = {};
        for (const [name, delivery] of Object.entries(POLICIES)) {
          const { container } = render(
            show({ renderMode, ...(delivery !== undefined ? { delivery } : {}) }),
          );
          const said = feedbackOf(container);
          if (said !== '') {
            heard[name] = said;
          }
          cleanup();
        }
        expect(heard).toEqual({});
      });
    }
  }
});

/**
 * An answer, and its submit, for each activity that scores when it is
 * submitted — the four that share `feedbackAnnouncement`. A written response
 * is graded later and a read-aloud once its recording is assessed: each has a
 * suite of its own for what it says then.
 */
const ANSWER: Record<
  | 'multiple-choice'
  | 'fill-in-the-blanks'
  | 'gap-select'
  | 'matching'
  | 'mark-the-words'
  | 'ordering'
  | 'dictation',
  (user: UserEvent) => Promise<void>
> = {
  'multiple-choice': async (user) => {
    await user.click(screen.getByRole('radio', { name: 'Madrid' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));
  },
  'fill-in-the-blanks': async (user) => {
    await user.type(screen.getByRole('textbox'), 'is');
    await user.click(screen.getByRole('button', { name: 'Check answers' }));
  },
  'gap-select': async (user) => {
    await user.selectOptions(screen.getByRole('combobox'), 'is');
    await user.click(screen.getByRole('button', { name: 'Check answers' }));
  },
  matching: async (user) => {
    await user.selectOptions(screen.getByRole('combobox', { name: 'Spain' }), 'madrid');
    await user.click(screen.getByRole('button', { name: 'Check answers' }));
  },
  'mark-the-words': async (user) => {
    await user.click(screen.getByRole('option', { name: 'ran' }));
    await user.click(screen.getByRole('button', { name: 'Check answers' }));
  },
  ordering: async (user) => {
    await user.click(screen.getAllByRole('button', { name: 'Move down' })[0] as HTMLElement);
    await user.click(screen.getByRole('button', { name: 'Check answers' }));
  },
  dictation: async (user) => {
    await user.type(screen.getByRole('textbox'), 'The cat sat on the mat.');
    await user.click(screen.getByRole('button', { name: 'Check answers' }));
  },
};

describe('after a submit', () => {
  for (const [type, answer] of Object.entries(ANSWER)) {
    const show = COMPONENTS[type as keyof typeof COMPONENTS];
    it(`${type} says it was received and its score — without feedback, only that it was received`, async () => {
      const user = userEvent.setup();
      const { container: withFeedback } = render(show({ renderMode: 'practice' }));
      await answer(user);
      expect(feedbackOf(withFeedback)).toMatch(/^Answer submitted\. Score 100%\. Passed\./);
      cleanup();

      const { container: without } = render(
        show({ renderMode: 'practice', delivery: { feedback: false } }),
      );
      await answer(user);
      expect(feedbackOf(without)).toBe('Answer submitted.');
    });
  }
});
