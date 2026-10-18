import { aiExplanationRequest, aiHintRequest } from '../ai.js';
import { aiCoachingRequest } from '../ai-coaching.js';
import { aiCritiqueRequest } from '../ai-critique.js';
import { aiDraftsRequest } from '../ai-drafts.js';
import { aiGradingRequest } from '../ai-grading.js';
import { aiWritingFeedbackRequest } from '../ai-writing.js';
import { gradeReadAloud } from '../scoring/speech/grade.js';
import type {
  ActivityType,
  DictationData,
  FillInTheBlanksData,
  GapSelectData,
  LearnerResponse,
  MultipleChoiceData,
  ReadAloudData,
  WrittenResponseData,
} from '../types/activity.js';
import type {
  AiCoachingRequest,
  AiCritiqueRequest,
  AiDraftSource,
  AiDraftsRequest,
  AiDraftType,
  AiExplanationRequest,
  AiGradingRequest,
  AiGroupInput,
  AiHintRequest,
  AiWritingFeedbackRequest,
} from '../types/ai.js';
import type { ItemGroup } from '../types/item-group.js';
import type { SpeechAssessment, SpeechWord } from '../types/speech.js';

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
 *   twice — so a correction of words nobody wrote is caught;
 * - questions in item groups: a reading passage that prints a question's
 *   answer, which a hint must point to without quoting, and a run of blanks
 *   whose instructions only the group states;
 * - essays to grade on a rubric of three criteria, two judged on levels and
 *   one on a score, so a grade that drops a criterion or leaves a scale is
 *   caught.
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
 * A reading group: a passage, a question it answers word for word, and a
 * summary of it. The question's answer is printed in the passage, so a hint
 * that quotes the passage where it answers is refused.
 */
const TIDES =
  'Along most coasts the tide comes in twice a day. It is pulled by the moon: as the Earth ' +
  'turns, the ocean nearest the moon bulges towards it, and so does the ocean on the far side. ' +
  'The highest tides, called spring tides, come when the sun and the moon line up.';

const springTides: MultipleChoiceData = {
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'ai-check-tides',
  title: 'Spring tides',
  question: 'When do the highest tides come?',
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  options: [
    { id: 'line-up', text: 'When the sun and the moon line up', isCorrect: true },
    { id: 'full-moon', text: 'Only at full moon', isCorrect: false },
    { id: 'winter', text: 'In winter', isCorrect: false },
  ],
};

const tidesSummary: WrittenResponseData = {
  schemaVersion: '1.0',
  type: 'written-response',
  id: 'ai-check-tides-summary',
  title: 'Summary',
  prompt: 'Summarise the text in one or two sentences.',
  minWords: 10,
  maxWords: 60,
  languageTarget: 'en-B1',
};

const tides: ItemGroup = {
  schemaVersion: '1.0',
  type: 'item-group',
  id: 'ai-check-tides-group',
  title: 'Part 2 — Reading',
  stimulus: { id: 'ai-check-tides-text', kind: 'text', title: 'Tides', body: TIDES },
  items: [springTides, tidesSummary],
};

/** A part whose questions share instructions the questions themselves never state. */
const formation: FillInTheBlanksData = {
  schemaVersion: '1.0',
  type: 'fill-in-the-blanks',
  id: 'ai-check-formation',
  title: 'Word formation',
  passage: 'She smiled {{a}} when she heard the news. (HAPPY)',
  blanks: [{ id: 'a', acceptedAnswers: ['happily'] }],
  scoringStrategy: 'all-or-nothing',
};

const formationPart: ItemGroup = {
  schemaVersion: '1.0',
  type: 'item-group',
  id: 'ai-check-formation-part',
  title: 'Part 1 — Word formation',
  stimulus: {
    id: 'ai-check-formation-instructions',
    kind: 'text',
    body: 'Use the word in capitals at the end of each sentence to form a word that fits the gap.',
  },
  items: [formation],
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
 * The weekend task set as an exam question: graded on three criteria, two on
 * levels and one on a score. Three, so a prompt that names only the ones it
 * expects drops one; two scales, so a grade must keep to each.
 */
const weekendExam: WrittenResponseData = {
  schemaVersion: '1.0',
  type: 'written-response',
  id: 'ai-check-writing-exam',
  title: 'Your weekend',
  prompt: 'Write a few sentences about what you did last weekend.',
  minWords: 15,
  maxWords: 120,
  languageTarget: 'en-A2',
  rubric: {
    criteria: [
      {
        name: 'Task',
        description: 'Says what the learner did last weekend, in order',
        weight: 1,
        levels: [
          { label: 'Not met', description: 'Not about last weekend' },
          { label: 'Partly met', description: 'About the weekend, but thin or out of order' },
          { label: 'Met', description: 'Says what they did, in order' },
        ],
      },
      {
        name: 'Grammar',
        description: 'Past tenses, articles, agreement',
        weight: 2,
        levels: [
          { label: 'Limited', description: 'Errors in most sentences, some blocking meaning' },
          { label: 'Basic', description: 'Frequent errors in past tenses and articles' },
          { label: 'Good', description: 'Some errors, none that blocks meaning' },
          {
            label: 'Very good',
            description: 'Past tenses, articles and agreement almost always right',
          },
        ],
      },
      { name: 'Vocabulary', description: 'Everyday words, used correctly', weight: 1 },
    ],
  },
};

/** The tides summary set as an exam question, graded against its group's passage. */
const tidesSummaryExam: WrittenResponseData = {
  schemaVersion: '1.0',
  type: 'written-response',
  id: 'ai-check-tides-summary-exam',
  title: 'Summary',
  prompt: 'Summarise the text in one or two sentences.',
  minWords: 10,
  maxWords: 60,
  languageTarget: 'en-B1',
  rubric: {
    criteria: [
      {
        name: 'Content',
        description: 'What the text says, and nothing it does not',
        weight: 2,
        levels: [
          { label: 'Wrong', description: 'Misstates what the text says' },
          { label: 'Partly right', description: 'Gets one of its points wrong, or leaves it out' },
          { label: 'Right', description: 'States its points as the text does' },
        ],
      },
      { name: 'Language', description: "Clear sentences, in the learner's own words", weight: 1 },
    ],
  },
};

const tidesExam: ItemGroup = {
  schemaVersion: '1.0',
  type: 'item-group',
  id: 'ai-check-tides-exam',
  title: 'Part 2 — Reading',
  stimulus: { id: 'ai-check-tides-exam-text', kind: 'text', title: 'Tides', body: TIDES },
  items: [springTides, tidesSummaryExam],
};

const weather: ReadAloudData = {
  schemaVersion: '1.0',
  type: 'read-aloud',
  id: 'ai-check-reading',
  title: 'Read the forecast aloud',
  referenceText: 'The weather is warm in the north.',
  locale: 'en-US',
  recording: { maxSeconds: 20 },
  scoring: {
    dimensions: [
      { name: 'accuracy', weight: 2 },
      { name: 'fluency', weight: 1 },
    ],
  },
};

/** A word of the forecast as an engine reports it. */
const said = (text: string, over: Partial<SpeechWord> = {}): SpeechWord => ({
  text,
  error: 'none',
  accuracy: 92,
  ...over,
});

/**
 * An engine's assessment of the forecast. With `slips`, "weather" is
 * mispronounced — its "th" heard as /d/ or /z/ — and "north" is left out: the
 * marks a model must coach, and no others.
 */
function forecast(slips: boolean): SpeechAssessment {
  return {
    assessmentVersion: '1.0',
    status: 'assessed',
    task: 'scripted',
    locale: 'en-US',
    referenceText: weather.referenceText,
    recordingKey: 'ai-check-take',
    assessor: { kind: 'auto', id: 'pronunciation-engine' },
    scale: 100,
    scores: slips ? { accuracy: 68, fluency: 81, completeness: 86 } : { accuracy: 94, fluency: 90 },
    miscue: 'assessor',
    phonemeAlphabet: 'ipa',
    words: [
      said('The'),
      slips
        ? said('weather', {
            accuracy: 38,
            error: 'mispronunciation',
            phonemes: [
              { symbol: 'w', accuracy: 90 },
              { symbol: 'ɛ', accuracy: 85 },
              {
                symbol: 'ð',
                accuracy: 12,
                heardAs: [
                  { symbol: 'd', score: 64 },
                  { symbol: 'z', score: 21 },
                  { symbol: 'ð', score: 12 },
                ],
              },
              { symbol: 'ɚ', accuracy: 80 },
            ],
          })
        : said('weather'),
      said('is'),
      said('warm'),
      said('in'),
      said('the'),
      slips ? { text: 'north', error: 'omission' } : said('north'),
    ],
  };
}

/**
 * One call to make against a host's port, and what a learner was looking at
 * when the SDK would have made it.
 */
export interface AiCheckCase {
  /** Stable across releases, so a host can name one in an allow-list or a report. */
  id: string;
  /** Which port the case is for. */
  feature:
    | 'explanation'
    | 'hint'
    | 'writing-feedback'
    | 'pronunciation-coaching'
    | 'item-critique'
    | 'draft-generation'
    | 'grading';
  /** What the learner did, in a few words, for a report a person reads. */
  about: string;
  /** The request, built by the SDK exactly as a component builds it. */
  request:
    | AiExplanationRequest
    | AiHintRequest
    | AiWritingFeedbackRequest
    | AiCoachingRequest
    | AiCritiqueRequest
    | AiDraftsRequest
    | AiGradingRequest;
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

/**
 * Items an author asks a model to review. Each is valid, and each but the last
 * has a flaw a rule cannot see: a distractor that is botanically a right
 * answer, and a task far above the level it is set for.
 */
const fruit: MultipleChoiceData = {
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'ai-check-fruit',
  title: 'Food words',
  question: 'Which of these is a fruit?',
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  options: [
    { id: 'f1', text: 'Apple', isCorrect: true },
    { id: 'f2', text: 'Carrot', isCorrect: false },
    { id: 'f3', text: 'Tomato', isCorrect: false },
  ],
};

const tooHard: WrittenResponseData = {
  schemaVersion: '1.0',
  type: 'written-response',
  id: 'ai-check-too-hard',
  title: 'Cities',
  prompt: 'Discuss the socioeconomic ramifications of rapid urbanisation in developing economies.',
  minWords: 40,
  maxWords: 80,
};

const cleanCloze: FillInTheBlanksData = {
  schemaVersion: '1.0',
  type: 'fill-in-the-blanks',
  id: 'ai-check-clean-cloze',
  title: 'Daily routine',
  passage: 'Every morning I {{1}} up at seven and {{2}} a shower.',
  blanks: [
    { id: '1', acceptedAnswers: ['get', 'wake'] },
    { id: '2', acceptedAnswers: ['take', 'have'] },
  ],
  scoringStrategy: 'partial',
};

function critiqueCase(
  id: string,
  about: string,
  type: ActivityType,
  draft: unknown,
  extra: { level?: string; authorLocale?: string } = {},
): AiCheckCase {
  const request = aiCritiqueRequest({ type, draft, ...extra });
  if (request === null) {
    throw new Error(`ai-check: no critique request for "${id}"`);
  }
  return { id, feature: 'item-critique', about, request };
}

/** A short reading to draft from: plain, and with facts a question can be asked about. */
const MARKET =
  'Maria lives in Seville, in the south of Spain. Every Saturday she walks to the market with her ' +
  'grandmother. They buy oranges, fresh bread and a little cheese. On the way home they stop at a ' +
  'café, where Maria drinks hot chocolate and her grandmother reads the newspaper.';

/** The same reading as a video's captions, with times in seconds. */
const MARKET_CAPTIONS = [
  { start: 0, end: 4.2, text: 'Maria lives in Seville, in the south of Spain.' },
  { start: 4.2, end: 8.9, text: 'Every Saturday she walks to the market with her grandmother.' },
  { start: 8.9, end: 12.6, text: 'They buy oranges, fresh bread and a little cheese.' },
  { start: 12.6, end: 18.1, text: 'On the way home they stop at a café.' },
];

function draftsCase(
  id: string,
  about: string,
  types: AiDraftType[],
  source: AiDraftSource,
  extra: Omit<Parameters<typeof aiDraftsRequest>[0], 'types' | 'source'> = {},
): AiCheckCase {
  const request = aiDraftsRequest({ types, source, ...extra });
  if (request === null) {
    throw new Error(`ai-check: no drafts request for "${id}"`);
  }
  return { id, feature: 'draft-generation', about, request };
}

/**
 * What a host sets on every read-aloud it drafts: the SDK has no default for a
 * recording's length or the dimensions a reading is graded on.
 */
const READ_ALOUD_SETTINGS = {
  locale: 'en-US',
  recording: { maxSeconds: 20 },
  scoring: { dimensions: [{ name: 'accuracy', weight: 1 }] },
};

/** Builds a case, failing loudly rather than shipping a case with no request. */
function explanationCase(
  id: string,
  about: string,
  data: Parameters<typeof aiExplanationRequest>[0]['data'],
  response: LearnerResponse,
  group?: AiGroupInput,
): AiCheckCase {
  const request = aiExplanationRequest({ data, response, ...(group ? { group } : {}) });
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
  group?: AiGroupInput,
): AiCheckCase {
  const request = aiHintRequest({ data, response, previousHints, ...(group ? { group } : {}) });
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
  task: { data: WrittenResponseData; group?: AiGroupInput } = { data: weekend },
): AiCheckCase {
  const request = aiWritingFeedbackRequest({
    data: task.data,
    response: drafted(text),
    previousFeedback,
    ...(task.group ? { group: task.group } : {}),
    ...(learnerLocale !== undefined ? { learnerLocale } : {}),
  });
  if (request === null) {
    throw new Error(`ai-check: no writing feedback request for "${id}"`);
  }
  return { id, feature: 'writing-feedback', about, request };
}

function gradingCase(
  id: string,
  about: string,
  text: string,
  extra: { data?: WrittenResponseData; group?: AiGroupInput; learnerLocale?: string } = {},
): AiCheckCase {
  const built = aiGradingRequest({
    data: extra.data ?? weekendExam,
    response: drafted(text),
    ...(extra.group ? { group: extra.group } : {}),
    ...(extra.learnerLocale !== undefined ? { learnerLocale: extra.learnerLocale } : {}),
  });
  if (!built.ok) {
    throw new Error(`ai-check: no grading request for "${id}": ${built.problem}`);
  }
  return { id, feature: 'grading', about, request: built.request };
}

function coachingCase(
  id: string,
  about: string,
  marks: { assessment?: SpeechAssessment; fromGradeOnly?: boolean },
  learnerLocale?: string,
): AiCheckCase {
  const assessment = marks.assessment ?? forecast(true);
  const grade = gradeReadAloud(
    weather,
    { type: 'read-aloud', recording: { key: 'ai-check-take', mimeType: 'audio/wav' } },
    assessment,
    {
      measured: { durationMs: 4000, voicedMs: 3000 },
      plausibility: { maxWordsPerSecond: 6, minVoicedMs: 500 },
    },
  );
  if ('unscorable' in grade) {
    throw new Error(`ai-check: the reading for "${id}" did not grade: ${grade.reason}`);
  }
  const request = aiCoachingRequest({
    data: weather,
    ...(marks.fromGradeOnly === true ? {} : { assessment }),
    grade,
    ...(learnerLocale !== undefined ? { learnerLocale } : {}),
  });
  if (request === null) {
    throw new Error(`ai-check: no coaching request for "${id}"`);
  }
  return { id, feature: 'pronunciation-coaching', about, request };
}

/**
 * The cases {@link runAiCheck} runs: every type the SDK explains, answered
 * right, wrong and — where a type can be — partly right; every type it hints
 * for, before an answer and after a wrong one; drafts of an essay, with
 * mistakes, without, and revised; and essays to grade, on the task, with
 * mistakes to quote, off the task, and against a passage.
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
    explanationCase(
      'mc-reading-wrong',
      "Chose 'Only at full moon', on a question about its group's passage",
      springTides,
      chose(['full-moon']),
      tides,
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
    hintCase(
      'mc-reading-hint',
      "Has not answered a question whose answer its group's passage prints",
      springTides,
      chose([]),
      [],
      tides,
    ),
    hintCase(
      'fib-formation-hint',
      'A word-formation blank, under the instructions its group gives',
      formation,
      typed({}),
      [],
      formationPart,
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
    writingCase(
      'writing-summary',
      "A summary of its group's passage that gets the spring tides wrong",
      'The tide comes in twice a day because the moon pulls the ocean. The highest tides come only at full moon.',
      [],
      undefined,
      { data: tidesSummary, group: tides },
    ),
    coachingCase('coaching-slips', 'A reading with a mispronounced "th" and a word left out', {
      assessment: forecast(true),
    }),
    coachingCase('coaching-clean', 'A reading the engine marked correct throughout', {
      assessment: forecast(false),
    }),
    coachingCase(
      'coaching-from-grade',
      'The same slips, from a stored grade: marks without sounds',
      { fromGradeOnly: true },
    ),
    coachingCase(
      'coaching-in-spanish',
      'The same slips, with coaching asked for in Spanish',
      { assessment: forecast(true) },
      'es',
    ),
    critiqueCase(
      'critique-second-answer',
      'A question whose distractor "Tomato" is botanically a fruit',
      'multiple-choice',
      fruit,
      { level: 'A1' },
    ),
    critiqueCase(
      'critique-level',
      'A writing task far above the A1 level it is set for',
      'written-response',
      tooHard,
      { level: 'A1' },
    ),
    critiqueCase(
      'critique-clean',
      'A cloze with nothing wrong in it',
      'fill-in-the-blanks',
      cleanCloze,
      {
        level: 'A2',
      },
    ),
    critiqueCase(
      'critique-in-spanish',
      'The fruit question, reviewed in Spanish for its author',
      'multiple-choice',
      fruit,
      { level: 'A1', authorLocale: 'es' },
    ),
    draftsCase(
      'drafts-questions',
      'Four multiple-choice questions on a short reading',
      ['multiple-choice'],
      { kind: 'passage', text: MARKET },
      { count: 4, level: 'A2', locale: 'en' },
    ),
    draftsCase(
      'drafts-cloze',
      'A cloze on the same reading, from its transcript',
      ['fill-in-the-blanks'],
      { kind: 'transcript', text: MARKET },
      { count: 1, level: 'A2', locale: 'en', instructions: 'Blank the verbs.' },
    ),
    draftsCase(
      'drafts-gaps',
      'A choose-the-word item on the same reading',
      ['gap-select'],
      { kind: 'passage', text: MARKET },
      { count: 1, level: 'A2', locale: 'en' },
    ),
    draftsCase(
      'drafts-writing',
      'A writing task that follows on from the reading',
      ['written-response'],
      { kind: 'passage', text: MARKET },
      { count: 1, level: 'A2', locale: 'en' },
    ),
    draftsCase(
      'drafts-video',
      'A video quiz from timed captions: multiple choice, then dictation, then read-aloud, as many as the video is worth',
      ['multiple-choice', 'dictation', 'read-aloud'],
      { kind: 'captions', cues: MARKET_CAPTIONS },
      { level: 'A2', locale: 'en', settings: { 'read-aloud': READ_ALOUD_SETTINGS } },
    ),
    draftsCase(
      'drafts-script',
      'The same video from its script alone, with no times, and what the author asked for',
      ['multiple-choice', 'dictation', 'read-aloud'],
      { kind: 'transcript', text: MARKET },
      {
        level: 'A2',
        locale: 'en',
        instructions: 'Focus on what Maria and her grandmother buy.',
        settings: { 'read-aloud': READ_ALOUD_SETTINGS },
      },
    ),
    gradingCase(
      'grading-on-task',
      'An essay that does the task, with one slip in its tenses',
      'Last weekend I went to the market with my sister and we bought some apples. In the afternoon we watched a film at home, and on Sunday I visit my grandmother.',
    ),
    gradingCase(
      'grading-mistakes',
      'An essay with tense, article and agreement mistakes, each to quote as written',
      "Last weekend I go to the market and buyed a apple. My friends was there too, so we don't go home early. Then I go to the cinema.",
    ),
    gradingCase(
      'grading-off-task',
      'An essay about something other than last weekend',
      'My favourite food is pizza. I like it with cheese and tomato, and I eat it every Friday with my family at a small restaurant near our house.',
    ),
    gradingCase(
      'grading-summary',
      "A summary graded against its group's passage, getting the spring tides wrong",
      'The tide comes in twice a day because the moon pulls the ocean. The highest tides come only at full moon.',
      { data: tidesSummaryExam, group: tidesExam },
    ),
    gradingCase(
      'grading-in-spanish',
      'The essay with mistakes, with comments asked for in Spanish',
      "Last weekend I go to the market and buyed a apple. My friends was there too, so we don't go home early. Then I go to the cinema.",
      { learnerLocale: 'es' },
    ),
  ];
}
