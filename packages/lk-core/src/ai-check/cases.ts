import { aiExplanationRequest, aiHintRequest } from '../ai.js';
import { aiWritingFeedbackRequest } from '../ai-writing.js';
import type {
  DictationData,
  FillInTheBlanksData,
  GapSelectData,
  LearnerResponse,
  MultipleChoiceData,
  WrittenResponseData,
} from '../types/activity.js';
import type { AiExplanationRequest, AiHintRequest, AiWritingFeedbackRequest } from '../types/ai.js';

/**
 * The items the cases are built from. Small, ordinary language-course content
 * — and deliberately awkward in the places a model slips:
 *
 * - an answer a hint can hardly avoid naming (`Madrid`);
 * - an answer of one short word (`is`), which a hint may write as an ordinary
 *   word and must not write beside its neighbour in the passage;
 * - an accented answer (`cañón`), so a hint that spells it without the accent
 *   is still caught;
 * - a passage with more than one blank, so a hint can be about the wrong one;
 * - a short essay whose mistakes a model must quote exactly as the learner
 *   wrote them — straight apostrophes a model likes to curl, a mistake made
 *   twice — so a correction of words nobody wrote is caught.
 */
const capital: MultipleChoiceData = {
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'ai-check-mc',
  title: 'Capital cities',
  question: 'What is the capital of Spain?',
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  options: [
    { id: 'madrid', text: 'Madrid', isCorrect: true },
    { id: 'barcelona', text: 'Barcelona', isCorrect: false },
    { id: 'seville', text: 'Seville', isCorrect: false },
  ],
};

const introduction: FillInTheBlanksData = {
  schemaVersion: '1.0',
  type: 'fill-in-the-blanks',
  id: 'ai-check-fib',
  title: 'Introducing yourself',
  passage: 'My name {{be}} Rossi and I {{live}} in Madrid.',
  blanks: [
    { id: 'be', acceptedAnswers: ['is'] },
    { id: 'live', acceptedAnswers: ['live'], hint: 'Present simple, first person.' },
  ],
  scoringStrategy: 'partial',
};

const landscape: GapSelectData = {
  schemaVersion: '1.0',
  type: 'gap-select',
  id: 'ai-check-gap',
  title: 'Geography',
  locale: 'es-ES',
  passage: 'El río pasa por un {{g1}} muy profundo, y el agua {{g2}} fría.',
  gaps: [
    {
      id: 'g1',
      choices: [
        { id: 'canon', text: 'cañón' },
        { id: 'campo', text: 'campo' },
      ],
      correctChoiceId: 'canon',
    },
    {
      id: 'g2',
      choices: [
        { id: 'esta', text: 'está' },
        { id: 'es', text: 'es' },
      ],
      correctChoiceId: 'esta',
    },
  ],
  scoringStrategy: 'partial',
};

const listening: DictationData = {
  schemaVersion: '1.0',
  type: 'dictation',
  id: 'ai-check-dictation',
  title: 'Listen and type',
  transcript: 'The train leaves at half past nine.',
};

const weekend: WrittenResponseData = {
  schemaVersion: '1.0',
  type: 'written-response',
  id: 'ai-check-writing',
  title: 'Your weekend',
  prompt: 'Write a few sentences about what you did last weekend.',
  minWords: 15,
  maxWords: 120,
  languageTarget: 'en-A2',
  rubric: {
    criteria: [
      { name: 'Grammar', description: 'Past tenses, articles, agreement', weight: 2 },
      { name: 'Vocabulary', description: 'Everyday words, used correctly', weight: 1 },
      { name: 'Task', description: 'Says what the learner did, in order', weight: 1 },
    ],
  },
};

/**
 * One call to make against a host's port, and what a learner was looking at
 * when the SDK would have made it.
 */
export interface AiCheckCase {
  /** Stable across releases, so a host can name one in an allow-list or a report. */
  id: string;
  /** Which port the case is for. */
  feature: 'explanation' | 'hint' | 'writing-feedback';
  /** What the learner did, in a few words, for a report a person reads. */
  about: string;
  /** The request, built by the SDK exactly as a component builds it. */
  request: AiExplanationRequest | AiHintRequest | AiWritingFeedbackRequest;
}

const chose = (ids: string[]): LearnerResponse => ({
  type: 'multiple-choice',
  selectedOptionIds: ids,
});
const typed = (answers: Record<string, string>): LearnerResponse => ({
  type: 'fill-in-the-blanks',
  answers,
});
const picked = (choices: Record<string, string>): LearnerResponse => ({
  type: 'gap-select',
  selections: choices,
});
const wrote = (text: string): LearnerResponse => ({ type: 'dictation', text });
const drafted = (text: string): LearnerResponse => ({
  type: 'written-response',
  text,
  wordCount: 0,
});

/** Builds a case, failing loudly rather than shipping a case with no request. */
function explanationCase(
  id: string,
  about: string,
  data: Parameters<typeof aiExplanationRequest>[0]['data'],
  response: LearnerResponse,
): AiCheckCase {
  const request = aiExplanationRequest({ data, response });
  if (request === null) {
    throw new Error(`ai-check: no explanation request for "${id}"`);
  }
  return { id, feature: 'explanation', about, request };
}

function hintCase(
  id: string,
  about: string,
  data: Parameters<typeof aiHintRequest>[0]['data'],
  response: LearnerResponse,
  previousHints: string[] = [],
): AiCheckCase {
  const request = aiHintRequest({ data, response, previousHints });
  if (request === null) {
    throw new Error(`ai-check: no hint request for "${id}"`);
  }
  return { id, feature: 'hint', about, request };
}

function writingCase(
  id: string,
  about: string,
  text: string,
  previousFeedback: string[] = [],
  learnerLocale?: string,
): AiCheckCase {
  const request = aiWritingFeedbackRequest({
    data: weekend,
    response: drafted(text),
    previousFeedback,
    ...(learnerLocale !== undefined ? { learnerLocale } : {}),
  });
  if (request === null) {
    throw new Error(`ai-check: no writing feedback request for "${id}"`);
  }
  return { id, feature: 'writing-feedback', about, request };
}

/**
 * The cases {@link runAiCheck} runs: every type the SDK explains, answered
 * right, wrong and — where a type can be — partly right; every type it hints
 * for, before an answer and after a wrong one; and drafts of an essay, with
 * mistakes, without, and revised.
 *
 * They are ordinary calls. What makes them a test is that the SDK knows the
 * answer to each, so it can check what your model writes about it.
 *
 * A fresh array each call, so a caller may filter, slice or add to it without
 * changing what the next caller gets.
 */
export function aiCheckCases(): AiCheckCase[] {
  return [
    explanationCase('mc-correct', 'Chose the right city', capital, chose(['madrid'])),
    explanationCase('mc-wrong', 'Chose Barcelona', capital, chose(['barcelona'])),
    explanationCase('mc-blank', 'Chose nothing and submitted', capital, chose([])),
    explanationCase(
      'fib-correct',
      'Filled both blanks correctly',
      introduction,
      typed({ be: 'is', live: 'live' }),
    ),
    explanationCase(
      'fib-partly',
      'One blank right, one wrong',
      introduction,
      typed({ be: 'is', live: 'lives' }),
    ),
    explanationCase(
      'fib-wrong',
      'Both blanks wrong',
      introduction,
      typed({ be: 'are', live: 'living' }),
    ),
    explanationCase(
      'gap-partly',
      'One gap right, one wrong, in Spanish',
      landscape,
      picked({ g1: 'canon', g2: 'es' }),
    ),
    explanationCase(
      'gap-wrong',
      'Both gaps wrong, in Spanish',
      landscape,
      picked({ g1: 'campo', g2: 'es' }),
    ),
    explanationCase(
      'dictation-near',
      'Typed the sentence with two words wrong',
      listening,
      wrote('The train leaves at half past five'),
    ),
    explanationCase(
      'dictation-correct',
      'Typed the sentence correctly',
      listening,
      wrote('The train leaves at half past nine.'),
    ),
    hintCase('mc-hint-1', 'Has not answered yet', capital, chose([])),
    hintCase('mc-hint-2', 'Asked again after choosing Seville', capital, chose(['seville']), [
      'Think about where the government sits.',
    ]),
    hintCase('fib-hint-1', 'Both blanks empty', introduction, typed({})),
    hintCase(
      'fib-hint-2',
      'Asked again with one blank wrong',
      introduction,
      typed({ be: 'are', live: '' }),
      ['Look again at the first blank.'],
    ),
    hintCase('gap-hint-1', 'Neither gap chosen, in Spanish', landscape, picked({})),
    hintCase(
      'gap-hint-2',
      'Asked again with the first gap wrong',
      landscape,
      picked({ g1: 'campo' }),
      ['Piensa en la forma del terreno.'],
    ),
    writingCase(
      'writing-mistakes',
      'A first draft with tense, article and agreement mistakes',
      "Last weekend I go to the market and buyed a apple. My friends was there too, so we don't go home early. Then I go to the cinema.",
    ),
    writingCase(
      'writing-clean',
      'A first draft with no mistakes to correct',
      'Last weekend I went to the market and bought an apple. My friends were there too, so we stayed until the evening. Then we went to the cinema.',
    ),
    writingCase(
      'writing-revised',
      'A second draft that fixed some mistakes',
      "Last weekend I went to the market and bought a apple. My friends was there too, so we didn't go home early.",
      ['Check your past tenses: "go" and "buyed" should be past forms.'],
    ),
    writingCase(
      'writing-feedback-in-spanish',
      'A first draft, with feedback asked for in Spanish',
      'Last weekend I visit my grandmother. She cook a big lunch and we eat together in the garden.',
      [],
      'es',
    ),
  ];
}
