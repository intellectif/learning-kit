import { aiExplanationRequest, aiHintRequest } from '../ai.js';
import type {
  DictationData,
  FillInTheBlanksData,
  GapSelectData,
  LearnerResponse,
  MultipleChoiceData,
} from '../types/activity.js';
import type { AiExplanationRequest, AiHintRequest } from '../types/ai.js';

/**
 * The items the cases are built from. Small, ordinary language-course content
 * — and deliberately awkward in the places a model slips:
 *
 * - an answer a hint can hardly avoid naming (`Madrid`);
 * - an answer of one short word (`is`), which a hint may write as an ordinary
 *   word and must not write beside its neighbour in the passage;
 * - an accented answer (`cañón`), so a hint that spells it without the accent
 *   is still caught;
 * - a passage with more than one blank, so a hint can be about the wrong one.
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

/**
 * One call to make against a host's port, and what a learner was looking at
 * when the SDK would have made it.
 */
export interface AiCheckCase {
  /** Stable across releases, so a host can name one in an allow-list or a report. */
  id: string;
  /** Which port the case is for. */
  feature: 'explanation' | 'hint';
  /** What the learner did, in a few words, for a report a person reads. */
  about: string;
  /** The request, built by the SDK exactly as a component builds it. */
  request: AiExplanationRequest | AiHintRequest;
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

/**
 * The cases {@link runAiCheck} runs: every type the SDK explains, answered
 * right, wrong and — where a type can be — partly right; and every type it
 * hints for, before an answer and after a wrong one.
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
  ];
}
