import type {
  DictationData,
  FillInTheBlanksData,
  GapSelectData,
  ItemGroup,
  MultipleChoiceData,
  SequenceEntry,
} from '@intellectif/lk-core';

// Inline SVG data URI so the demo needs no network/asset hosting.
const sampleImage =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="160">' +
      '<rect width="480" height="160" fill="#18181b"/>' +
      '<text x="50%" y="50%" fill="#fafafa" font-family="sans-serif" font-size="20" ' +
      'text-anchor="middle" dominant-baseline="middle">Sample question media</text></svg>',
  );

export const sampleMultipleChoice: MultipleChoiceData = {
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'demo-mc-capitals',
  title: 'World Capitals',
  question: 'Which city is the capital of Japan?',
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  media: { type: 'image', url: sampleImage, alt: 'Illustrative banner for the question' },
  options: [
    { id: 'tokyo', text: 'Tokyo', isCorrect: true },
    { id: 'seoul', text: 'Seoul', isCorrect: false },
    { id: 'beijing', text: 'Beijing', isCorrect: false },
    { id: 'bangkok', text: 'Bangkok', isCorrect: false },
  ],
  shuffle: true,
};

export const sampleFillInTheBlanks: FillInTheBlanksData = {
  schemaVersion: '1.0',
  type: 'fill-in-the-blanks',
  id: 'demo-fib-water-cycle',
  title: 'The Water Cycle',
  // Embedded video the question is based on (provider embed URL — not the
  // watch page; YouTube watch links cannot play in a <video> element).
  media: {
    type: 'embed',
    url: 'https://www.youtube.com/embed/TD3XSIE4ymo',
    alt: 'Video: how the water cycle works',
  },
  passage:
    'Liquid water becomes vapour through {{evaporation}}, then returns to the ground as {{precipitation}}.',
  blanks: [
    {
      id: 'evaporation',
      acceptedAnswers: ['evaporation'],
      hint: 'Starts with the letter E',
      feedback: 'Heat turns liquid water into vapour.',
    },
    {
      id: 'precipitation',
      acceptedAnswers: ['precipitation', 'rain'],
      feedback: 'Rain, snow and hail are all precipitation.',
    },
  ],
  scoringStrategy: 'partial',
  feedback: {
    correct: 'You understand the water cycle!',
    incorrect: 'Review the hints and retry.',
  },
};

export const sampleFillInTheBlanks2: FillInTheBlanksData = {
  schemaVersion: '1.0',
  type: 'fill-in-the-blanks',
  id: 'demo-fib-water-cycle-2',
  title: 'The Water Cycle — Part 2',
  passage:
    'Water collected in clouds is stored as {{condensation}}, and water that soaks into the soil becomes {{groundwater}}.',
  blanks: [
    { id: 'condensation', acceptedAnswers: ['condensation'], hint: 'Opposite of evaporation' },
    { id: 'groundwater', acceptedAnswers: ['groundwater', 'ground water'] },
  ],
  scoringStrategy: 'partial',
};

/** A set of same-kind questions, shown via the in-place ActivitySequence pager. */
export const sampleFibSet: FillInTheBlanksData[] = [sampleFillInTheBlanks, sampleFillInTheBlanks2];

/**
 * A reading-comprehension testlet: one passage serving three questions. The
 * group is a CONTAINER, not an activity — the pager flattens it into
 * consecutive questions and keeps the passage on screen beside each of them.
 */
/**
 * The dropdown cloze. One shared word bank across both gaps, so two of its four
 * prepositions answer no gap at all — the distractors that make it a
 * comprehension item rather than two coin flips.
 */
export const sampleGapSelect: GapSelectData = {
  schemaVersion: '1.0',
  type: 'gap-select',
  id: 'gs-prepositions',
  title: 'Prepositions of origin',
  passage: "Where are you {{a}}? I'm {{b}} Spain, but I live {{c}} Berlin.",
  banks: [
    {
      id: 'prep',
      choices: [
        { id: 'of', text: 'of' },
        { id: 'from', text: 'from' },
        { id: 'to', text: 'to' },
        { id: 'in', text: 'in' },
      ],
    },
  ],
  gaps: [
    { id: 'a', bankId: 'prep', correctChoiceId: 'from' },
    { id: 'b', bankId: 'prep', correctChoiceId: 'from', feedback: 'from + your place of origin' },
    { id: 'c', bankId: 'prep', correctChoiceId: 'in', feedback: 'in + the city you live in' },
  ],
  scoringStrategy: 'partial',
};

/**
 * A real, silent WAV as a data URI, built here so the demo needs no hosted
 * audio and carries no multi-kilobyte literal. Two different lengths give the
 * dictation two DIFFERENT files — the schema refuses one recording standing in
 * for both the normal and the slow version — and Chromium plays a silent WAV,
 * so "starting one pauses the other" can be exercised for real.
 */
function silentWavDataUri(seconds: number): string {
  const rate = 8000;
  const frames = Math.round(rate * seconds);
  const buffer = new ArrayBuffer(44 + frames);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + frames, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate, true); // byte rate: 8-bit mono
  view.setUint16(32, 1, true); // block align
  view.setUint16(34, 8, true); // bits per sample
  ascii(36, 'data');
  view.setUint32(40, frames, true);
  new Uint8Array(buffer, 44).fill(128); // 8-bit PCM silence sits at 128
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

/**
 * The English contraction preset from the authoring guide: sixteen whole-word
 * rewrites applied to both sides before comparing, so "isn't" and "is not"
 * score alike. It is content, not scorer code — an author adds `let's` here
 * without changing any historical grade.
 */
const ENGLISH_CONTRACTIONS: DictationData['tolerance'] = {
  equivalences: [
    { from: "what's", to: 'what is' },
    { from: "you're", to: 'you are' },
    { from: "i'm", to: 'i am' },
    { from: "he's", to: 'he is' },
    { from: "she's", to: 'she is' },
    { from: "it's", to: 'it is' },
    { from: "we're", to: 'we are' },
    { from: "they're", to: 'they are' },
    { from: "don't", to: 'do not' },
    { from: "doesn't", to: 'does not' },
    { from: "won't", to: 'will not' },
    { from: "can't", to: 'cannot' },
    { from: "isn't", to: 'is not' },
    { from: "aren't", to: 'are not' },
    { from: "wasn't", to: 'was not' },
    { from: "weren't", to: 'were not' },
  ],
};

/**
 * Listen and type. Two recordings (the slow one follows the same locked
 * scrubber and fixed speed), progressive word hints, and the contraction
 * preset — so "The cat isn't on the mat" and "The cat is not on the mat" both
 * score 100.
 */
export const sampleDictation: DictationData = {
  schemaVersion: '1.0',
  type: 'dictation',
  id: 'demo-dictation-cat',
  title: 'Listen and type the sentence',
  transcript: "The cat isn't on the mat.",
  media: {
    type: 'audio',
    url: silentWavDataUri(0.5),
    alt: 'Recording',
    playback: { seek: 'none', rate: 'fixed' },
  },
  slowMedia: { type: 'audio', url: silentWavDataUri(1), alt: 'Recording, slow' },
  hints: { mode: 'progressive-words' },
  tolerance: ENGLISH_CONTRACTIONS,
  feedback: { correct: 'Well heard!', incorrect: 'Play it once more and listen for every word.' },
};

export const sampleReadingGroup: ItemGroup = {
  schemaVersion: '1.0',
  type: 'item-group',
  id: 'demo-reading-tides',
  title: 'Reading — Tides',
  stimulus: {
    id: 'demo-passage-tides',
    kind: 'text',
    title: 'Tides',
    body:
      'Along most coasts the tide comes in twice a day. It is pulled by the moon: as the Earth turns, ' +
      'the ocean nearest the moon bulges towards it, and so does the ocean on the far side.\n\n' +
      'The highest tides, called spring tides, happen when the sun and the moon line up.',
    attribution: 'Adapted from a public-domain primer on ocean tides',
  },
  items: [
    {
      schemaVersion: '1.0',
      type: 'multiple-choice',
      id: 'demo-tides-q1',
      title: 'Tides — frequency',
      question: 'According to the passage, how often does the tide come in?',
      mode: 'single',
      scoringStrategy: 'all-or-nothing',
      options: [
        { id: 'twice', text: 'Twice a day', isCorrect: true },
        { id: 'once', text: 'Once a day', isCorrect: false },
        { id: 'weekly', text: 'Once a week', isCorrect: false },
      ],
    },
    {
      schemaVersion: '1.0',
      type: 'multiple-choice',
      id: 'demo-tides-q2',
      title: 'Tides — spring tides',
      question: 'When do spring tides happen?',
      mode: 'single',
      scoringStrategy: 'all-or-nothing',
      options: [
        { id: 'aligned', text: 'When the sun and the moon line up', isCorrect: true },
        { id: 'season', text: 'Only in spring', isCorrect: false },
        { id: 'storm', text: 'During storms', isCorrect: false },
      ],
    },
    {
      schemaVersion: '1.0',
      type: 'fill-in-the-blanks',
      id: 'demo-tides-q3',
      title: 'Tides — cause',
      passage: 'The tide is pulled by the {{moon}}.',
      blanks: [{ id: 'moon', acceptedAnswers: ['moon'] }],
      scoringStrategy: 'all-or-nothing',
    },
  ],
};

/** Two loose questions followed by a reading group — what the pager presents. */
export const sampleQuestionSet: SequenceEntry[] = [...sampleFibSet, sampleReadingGroup];
