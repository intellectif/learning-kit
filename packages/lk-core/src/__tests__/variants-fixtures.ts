/**
 * An exam section to vary, and a model's reply that varies it well: the shapes
 * the variants tests and vectors start from. Every entry is a finished item,
 * as an exam's Form v1 is.
 */

type Fields = Record<string, unknown>;

export const listening = (): Fields => ({
  schemaVersion: '1.0',
  type: 'item-group',
  id: 'v1-part1',
  title: 'Part 1',
  slotKey: 'listening-1',
  stimulus: {
    id: 'v1-part1-stimulus',
    kind: 'audio',
    media: {
      type: 'audio',
      url: 'https://cdn.example.com/exams/v1/part1.mp3',
      playback: { maxPlays: 2, seek: 'none' },
    },
    script: [
      {
        speaker: 'Anna',
        text: 'Hi Tom, are you coming to the cinema on Friday evening?',
        voiceId: 'v-anna',
      },
      {
        speaker: 'Tom',
        text: 'I would love to, but I have to work late on Friday this week.',
        voiceId: 'v-tom',
      },
      { speaker: 'Anna', text: 'What about Saturday afternoon? The film starts at three o clock.' },
      {
        speaker: 'Tom',
        text: 'Saturday is perfect. Shall we meet outside the station at half past two?',
      },
      {
        speaker: 'Anna',
        text: 'Great idea. I will bring the tickets, and you can buy the popcorn.',
      },
      { speaker: 'Tom', text: 'Deal. See you on Saturday then, and thanks for asking me.' },
    ],
  },
  items: [
    {
      schemaVersion: '1.0',
      type: 'multiple-choice',
      id: 'v1-q1',
      title: 'Question 1',
      question: 'Why can Tom not go to the cinema on Friday?',
      mode: 'single',
      options: [
        { id: 'v1-q1-a', text: 'He has to work late.', isCorrect: true },
        { id: 'v1-q1-b', text: 'He does not like films.', isCorrect: false },
        { id: 'v1-q1-c', text: 'He is visiting his family.', isCorrect: false },
      ],
      scoringStrategy: 'all-or-nothing',
      learningObjectives: ['https://example.com/cefr/a2/listening/specific-information'],
    },
    {
      schemaVersion: '1.0',
      type: 'multiple-choice',
      id: 'v1-q2',
      title: 'Question 2',
      question: 'Where will Anna and Tom meet on Saturday afternoon?',
      mode: 'single',
      options: [
        { id: 'v1-q2-a', text: 'At the cinema.', isCorrect: false },
        { id: 'v1-q2-b', text: 'Outside the station.', isCorrect: true },
        { id: 'v1-q2-c', text: "At Anna's house.", isCorrect: false },
      ],
      scoringStrategy: 'all-or-nothing',
    },
  ],
});

export const dictation = (): Fields => ({
  schemaVersion: '1.0',
  type: 'dictation',
  id: 'v1-dictation',
  title: 'Listen and write',
  transcript: 'My brother usually walks to school with his two best friends.',
  media: {
    type: 'audio',
    url: 'https://cdn.example.com/exams/v1/dictation.mp3',
    playback: { seek: 'none' },
  },
  slowMedia: { type: 'audio', url: 'https://cdn.example.com/exams/v1/dictation-slow.mp3' },
  tolerance: { equivalences: [{ from: '2', to: 'two' }] },
  locale: 'en-US',
});

export const gapSelect = (): Fields => ({
  schemaVersion: '1.0',
  type: 'gap-select',
  id: 'v1-gs',
  title: 'My weekend',
  instructions: 'Choose the right word for each gap.',
  passage:
    'Last weekend I {{g1}} to the beach with my cousins. We {{g2}} a big picnic and {{g3}} in the sea.',
  banks: [
    {
      id: 'bank-1',
      choices: [
        { id: 'c1', text: 'went' },
        { id: 'c2', text: 'had' },
        { id: 'c3', text: 'swam' },
        { id: 'c4', text: 'go' },
        { id: 'c5', text: 'have' },
      ],
    },
  ],
  gaps: [
    { id: 'g1', bankId: 'bank-1', correctChoiceId: 'c1' },
    { id: 'g2', bankId: 'bank-1', correctChoiceId: 'c2' },
    { id: 'g3', bankId: 'bank-1', correctChoiceId: 'c3' },
  ],
  scoringStrategy: 'partial',
});

export const fillIn = (): Fields => ({
  schemaVersion: '1.0',
  type: 'fill-in-the-blanks',
  id: 'v1-fib',
  title: 'Complete the sentences',
  instructions: 'Complete each sentence. Use ONE word.',
  passage: 'If I {{a}} rich, I would travel around the world. She has lived here {{b}} 2010.',
  blanks: [
    { id: 'a', acceptedAnswers: ['were', 'was'], caseSensitive: false },
    { id: 'b', acceptedAnswers: ['since'], match: { levenshtein: 1 } },
  ],
  scoringStrategy: 'partial',
});

export const writing = (): Fields => ({
  schemaVersion: '1.0',
  type: 'written-response',
  id: 'v1-wr',
  title: 'An email to a friend',
  prompt:
    'Write an email to your friend Sam about your last holiday. Say where you went, what you did and what you liked most.',
  minWords: 60,
  maxWords: 90,
  rubric: {
    criteria: [
      { name: 'Content', weight: 2, levels: [{ label: 'Weak' }, { label: 'Good' }] },
      { name: 'Organisation', weight: 1 },
      { name: 'Language', weight: 1 },
    ],
  },
  difficultyLevel: 3,
});

export const readAloud = (): Fields => ({
  schemaVersion: '1.0',
  type: 'read-aloud',
  id: 'v1-ra',
  title: 'Read the sentence aloud',
  referenceText: 'The weather is lovely today, so we will walk to the park.',
  locale: 'en-US',
  recording: { maxSeconds: 20, minSeconds: 2 },
  scoring: {
    dimensions: [
      { name: 'accuracy', weight: 2 },
      { name: 'fluency', weight: 1 },
    ],
  },
});

/** The section, in paper order. */
export const section = (): Fields[] => [
  listening(),
  dictation(),
  gapSelect(),
  fillIn(),
  writing(),
  readAloud(),
];

/** What a model writes for each of the section's exemplars: new words, the same structure. */
export const goodVariants = (): Fields[] => [
  {
    exemplar: 0,
    type: 'item-group',
    title: 'Part 1',
    stimulus: {
      script: [
        {
          speaker: 'Maria',
          text: 'Hello Ben, would you like to play tennis with me on Sunday morning?',
        },
        {
          speaker: 'Ben',
          text: 'Sorry, I cannot on Sunday morning because my grandparents are visiting.',
        },
        {
          speaker: 'Maria',
          text: 'No problem. Could we play on Monday after school instead of Sunday?',
        },
        {
          speaker: 'Ben',
          text: 'Monday works well. Let us meet next to the sports centre at four.',
        },
        { speaker: 'Maria', text: 'Perfect. I will book a court, and you can bring some balls.' },
        {
          speaker: 'Ben',
          text: 'Sounds good to me. Thanks for the invitation, see you on Monday.',
        },
      ],
    },
    items: [
      {
        type: 'multiple-choice',
        title: 'Question 1',
        question: 'What stops Ben from playing tennis on Sunday morning?',
        options: [
          { text: 'His grandparents are visiting.', isCorrect: true },
          { text: 'He has a football match.', isCorrect: false },
          { text: 'He is feeling ill.', isCorrect: false },
        ],
      },
      {
        type: 'multiple-choice',
        title: 'Question 2',
        question: 'Where are Maria and Ben going to meet on Monday?',
        options: [
          { text: 'At the school gate.', isCorrect: false },
          { text: 'Next to the sports centre.', isCorrect: true },
          { text: 'In the park.', isCorrect: false },
        ],
      },
    ],
  },
  {
    exemplar: 1,
    type: 'dictation',
    title: 'Listen and write',
    transcript: 'Our neighbour often cycles to work with her three young children.',
  },
  {
    exemplar: 2,
    type: 'gap-select',
    title: 'A school trip',
    instructions: 'Choose the right word for each gap.',
    passage:
      'Last month our class {{1}} to a farm near the river. We {{2}} lunch outside and {{3}} the animals all afternoon.',
    banks: [{ choices: ['travelled', 'ate', 'watched', 'travel', 'eat'] }],
    gaps: [{ answer: 'travelled' }, { answer: 'ate' }, { answer: 'watched' }],
  },
  {
    exemplar: 3,
    type: 'fill-in-the-blanks',
    title: 'Finish the sentences',
    instructions: 'Complete each sentence. Use ONE word.',
    passage:
      'If he {{1}} more time, he would learn the guitar. They have worked together {{2}} January.',
    blanks: [{ acceptedAnswers: ['had'] }, { acceptedAnswers: ['since'] }],
  },
  {
    exemplar: 4,
    type: 'written-response',
    title: 'A message to a cousin',
    prompt:
      'Write a message to your cousin Alex about a weekend trip you took. Say where you stayed, what you saw and what you enjoyed.',
  },
  {
    exemplar: 5,
    type: 'read-aloud',
    title: 'Read the sentence aloud',
    referenceText: 'The sun is shining this morning, so we can cycle to the lake.',
  },
];

/** A counter for ids: `id-1`, `id-2`… */
export function counter(prefix = 'id'): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}-${n}`;
  };
}
