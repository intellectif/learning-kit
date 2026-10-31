import { AI_MATERIAL_MAX_LENGTH } from './ai-material.js';
import { provenanceOf, usageOf } from './ai-text.js';
import { keyPositionFinding } from './authoring/critique.js';
import {
  critiqueDraft,
  critiqueItemGroupDraft,
  validateDraft,
  validateItemGroupDraft,
} from './authoring/index.js';
import { paperFindings } from './authoring/paper.js';
import { transcriptOf } from './media-refs.js';
import { getActivityTypeDescriptor } from './registry/index.js';
import { PLACEHOLDER_RE } from './schemas/fill-in-the-blanks.js';
import { seededShuffle } from './shuffle.js';
import type { ActivityType } from './types/activity.js';
import type {
  AiDraftProblem,
  AiDraftSettings,
  AiDraftsCall,
  AiGeneratedVariant,
  AiRefusal,
  AiVariantDifficulty,
  AiVariantExemplarFacts,
  AiVariantImage,
  AiVariantLevelFacts,
  AiVariantMismatch,
  AiVariantMissing,
  AiVariantPair,
  AiVariantSkip,
  AiVariantSkipCode,
  AiVariants,
  AiVariantsRequest,
  AiVariantsRun,
  AiVariantTargets,
} from './types/ai.js';
import type { ItemFinding } from './types/authoring.js';
import {
  AI_VARIANT_NEAR_COPY_THRESHOLD,
  inPassageOrder,
  keysOf,
  type LengthTolerance,
  lengthMisses,
  lengthTargets,
  optionSet,
  sharedAnswers,
  shownScore,
  structureMisses,
  structureTargets,
  textSimilarity,
  textsOf,
} from './variant-rules.js';

export {
  AI_VARIANT_LENGTH_BANDS,
  AI_VARIANT_NEAR_COPY_THRESHOLD,
  type LengthTolerance,
} from './variant-rules.js';

/** The most exemplars one request may vary: a long section is sent in parts. */
export const AI_VARIANTS_MAX_EXEMPLARS = 20;

/** The most repair passes `generateVariants` makes. */
export const AI_VARIANTS_MAX_REPAIRS = 3;

/** The longest passage or script, in characters, an exemplar may carry into the facts. */
export const AI_VARIANTS_MAX_MATERIAL_LENGTH = AI_MATERIAL_MAX_LENGTH;

/**
 * Every code a variant can be reported with, and its severity: a contract,
 * as the critic's codes are. `docs/ai.md` documents this table and a test
 * holds the two together.
 */
export const AI_VARIANT_CODE_SEVERITY = {
  variant_missing: 'invalid',
  variant_type: 'invalid',
  variant_structure: 'invalid',
  variant_length: 'warning',
  variant_near_copy: 'warning',
  variant_same_key: 'warning',
} as const;

/** The activity types the SDK writes variants of: the ones whose every field it knows. */
const VARIANT_TYPES: readonly string[] = [
  'multiple-choice',
  'fill-in-the-blanks',
  'gap-select',
  'dictation',
  'read-aloud',
  'written-response',
] satisfies readonly ActivityType[];

const DIFFICULTIES: readonly string[] = ['easier', 'same', 'harder'];

type Fields = Record<string, unknown>;

const isRecord = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const listOf = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);
const stringOf = (value: unknown): string => (typeof value === 'string' ? value : '');
const written = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;
const textList = (value: unknown): string[] =>
  listOf(value).filter((one): one is string => typeof one === 'string');
/** A copy of plain content, so a variant never shares an object with its exemplar. */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const isRecording = (media: unknown): boolean =>
  isRecord(media) && ['audio', 'video', 'embed'].includes(stringOf(media.type));
const isImage = (media: unknown): boolean => isRecord(media) && media.type === 'image';

// ── What a model is told: rules, and levers ───────────────────────────

const RULES = [
  'Write one variant for each exemplar, naming its exemplar index and its type.',
  "Keep each exemplar's targets.structure exactly: the same number of options and of right options, blanks, gaps, choices and banks, items in the same order, and speakers.",
  "Write every word a learner reads or hears, in new words: never the exemplar's sentences with a few words changed. Write nothing else: no ids, HTML, addresses or settings.",
  'Keep each text within its targets.lengths, counted in words.',
  "Test the same skill with the same kind of thinking at the same level: a literal question stays literal, an inference stays an inference, and wrong options stay as plausible as the exemplar's.",
  "Give each item a right answer other than its exemplar's, and other than the answers in avoid, unless the skill tested leaves only one.",
  "Keep the task in instructions as the exemplar's; change its wording only where the new item needs it.",
  'Keep a title that is a label (Part 1) as it is; give a title that names the topic a new one that gives no answer away.',
  'Do not repeat the flaws listed in targets.exemplarFindings.',
  'A listening script keeps the number of speakers, with new names, and about as many turns.',
];

const DESCRIBE_RULE =
  'Where an exemplar shows a picture, describe a new picture in its media alt, specific enough for a person to find or draw it, and ask about that picture.';
const REUSE_RULE =
  'Where an exemplar shows a picture, keep it: write new questions about the same picture, which its alt describes.';
const DIFFICULTY_RULE =
  'Where targets.difficulty is easier or harder, move one step, inside the level, using targets.levers. Never write for another level.';
const LEVEL_FACTS_RULE =
  'Use only grammar and vocabulary that levelFacts lists as taught, and keep away from the topics it lists.';

/** The ways a type is made easier or harder: one step inside a level. */
const LEVERS: Readonly<Record<string, Readonly<Record<'easier' | 'harder', readonly string[]>>>> = {
  'multiple-choice': {
    easier: [
      'Make the wrong options clearly wrong to a learner who understood, though still plausible to one who did not.',
      'Ask about what is said directly rather than what is implied.',
      'Word the right option closer to the words of the text or recording.',
    ],
    harder: [
      'Make the wrong options closer to the right one, each wrong for a reason the text or recording makes clear.',
      'Ask for an inference rather than a fact stated directly.',
      'Paraphrase the right option rather than repeat the words of the text or recording.',
    ],
  },
  'fill-in-the-blanks': {
    easier: ['Give more context around each blank that points to the answer.'],
    harder: [
      'Give less context around each blank, so the learner must know the form rather than infer it.',
    ],
  },
  'gap-select': {
    easier: [
      'Give more context around each gap that points to the answer.',
      'Make the wrong choices clearly wrong in context.',
    ],
    harder: [
      'Give less context around each gap.',
      'Make the wrong choices closer to the right one.',
    ],
  },
  dictation: {
    easier: ['Use shorter sentences and more frequent words of the level, inside the length band.'],
    harder: [
      'Use longer sentences and less frequent words of the level, inside the length band.',
      'Use more connected-speech features: contractions, linking, weak forms.',
    ],
  },
  'read-aloud': {
    easier: ['Use shorter sentences and more frequent words of the level, inside the length band.'],
    harder: [
      'Use longer sentences and less frequent words of the level, inside the length band.',
      'Use more words with sounds and stress the level finds hard.',
    ],
  },
  'written-response': {
    easier: ['Make the task more specific, and supply more of the content to write about.'],
    harder: ['Make the task more open, so the learner supplies more of the content.'],
  },
  reading: {
    easier: [
      'Ask about what the passage says directly rather than what it implies.',
      'Use more frequent words of the level, and shorter sentences with simpler syntax.',
    ],
    harder: [
      'Ask for inferences rather than facts stated directly.',
      'Use less frequent words of the level, and longer sentences.',
    ],
  },
  listening: {
    easier: [
      'Describe a slower pace in the script, and have a speaker repeat the key information.',
      'Use more frequent words of the level.',
    ],
    harder: [
      'Describe a natural pace in the script, and give the key information once.',
      'Use less frequent words of the level.',
    ],
  },
};

function leversFor(entry: Fields, difficulty: AiVariantDifficulty): string[] | undefined {
  if (difficulty === 'same') {
    return undefined;
  }
  let kind = stringOf(entry.type);
  if (kind === 'item-group') {
    const stimulus = isRecord(entry.stimulus) ? entry.stimulus : {};
    kind = stimulus.kind === 'audio' || stimulus.kind === 'video' ? 'listening' : 'reading';
  }
  const levers = LEVERS[kind];
  return levers !== undefined ? [...levers[difficulty]] : undefined;
}

// ── The exemplar, as a model is shown it ──────────────────────────────

/** A passage with its placeholders numbered in order: `{{1}}`, `{{2}}`… — how a variant writes them. */
function renumbered(passage: string): string {
  let position = 0;
  return passage.replace(PLACEHOLDER_RE, () => {
    position += 1;
    return `{{${position}}}`;
  });
}

const turnsOf = (holder: Fields): { speaker: string; text: string }[] =>
  listOf(holder.script).flatMap((turn) =>
    isRecord(turn) ? [{ speaker: stringOf(turn.speaker), text: stringOf(turn.text) }] : [],
  );

const hasScript = (holder: Fields): boolean => listOf(holder.script).some(isRecord);

/** What a model is shown of a media object: a picture's description, or what a recording says. */
function mediaContent(
  media: unknown,
  ownText: boolean,
  ref: string | undefined,
): Fields | undefined {
  if (!isRecord(media)) {
    return undefined;
  }
  if (isImage(media)) {
    return { alt: stringOf(media.alt), ...(ref !== undefined ? { ref } : {}) };
  }
  if (ownText || !isRecording(media)) {
    return undefined;
  }
  if (hasScript(media)) {
    return { script: turnsOf(media) };
  }
  return typeof media.transcript === 'string' ? { transcript: media.transcript } : undefined;
}

function feedbackContent(holder: Fields): Fields {
  if (!isRecord(holder.feedback)) {
    return {};
  }
  const { correct, incorrect } = holder.feedback;
  return {
    feedback: {
      ...(typeof correct === 'string' ? { correct } : {}),
      ...(typeof incorrect === 'string' ? { incorrect } : {}),
    },
  };
}

type RefOf = (path: readonly (string | number)[]) => string | undefined;

function itemContent(item: Fields, refOf: RefOf, at: readonly (string | number)[]): Fields {
  const type = stringOf(item.type);
  const ownText = type === 'dictation' || type === 'read-aloud';
  const media = mediaContent(item.media, ownText, refOf([...at, 'media']));
  const content: Fields = {
    type,
    title: stringOf(item.title),
    ...(typeof item.instructions === 'string' ? { instructions: item.instructions } : {}),
  };
  switch (type) {
    case 'multiple-choice':
      Object.assign(content, {
        question: stringOf(item.question),
        options: listOf(item.options).map((option, index) => {
          const fields = isRecord(option) ? option : {};
          const optionMedia = mediaContent(
            fields.media,
            false,
            refOf([...at, 'options', index, 'media']),
          );
          return {
            text: stringOf(fields.text),
            isCorrect: fields.isCorrect === true,
            ...(typeof fields.feedback === 'string' ? { feedback: fields.feedback } : {}),
            ...(optionMedia !== undefined ? { media: optionMedia } : {}),
          };
        }),
      });
      break;
    case 'fill-in-the-blanks':
      Object.assign(content, {
        passage: renumbered(stringOf(item.passage)),
        blanks: inPassageOrder(item, 'blanks').map(({ value }) => {
          const blank = isRecord(value) ? value : {};
          return {
            acceptedAnswers: textList(blank.acceptedAnswers),
            ...(typeof blank.hint === 'string' ? { hint: blank.hint } : {}),
            ...(typeof blank.feedback === 'string' ? { feedback: blank.feedback } : {}),
          };
        }),
      });
      break;
    case 'gap-select': {
      const banks = listOf(item.banks).filter(isRecord);
      Object.assign(content, {
        passage: renumbered(stringOf(item.passage)),
        gaps: inPassageOrder(item, 'gaps').map(({ value }) => {
          const gap = isRecord(value) ? value : {};
          const feedback = typeof gap.feedback === 'string' ? { feedback: gap.feedback } : {};
          const bank = banks.find((one) => one.id === gap.bankId);
          if (listOf(gap.choices).length === 0 && bank !== undefined) {
            const right = listOf(bank.choices).find(
              (choice) => isRecord(choice) && choice.id === gap.correctChoiceId,
            );
            return { answer: isRecord(right) ? stringOf(right.text) : '', ...feedback };
          }
          return {
            choices: listOf(gap.choices).map((choice) => ({
              text: isRecord(choice) ? stringOf(choice.text) : '',
              isCorrect: isRecord(choice) && choice.id === gap.correctChoiceId,
            })),
            ...feedback,
          };
        }),
        ...(banks.length > 0
          ? {
              banks: banks.map((bank) => ({
                choices: listOf(bank.choices).map((choice) =>
                  isRecord(choice) ? stringOf(choice.text) : '',
                ),
              })),
            }
          : {}),
      });
      break;
    }
    case 'dictation':
      Object.assign(content, {
        transcript: stringOf(item.transcript),
        ...(Array.isArray(item.acceptedTranscripts)
          ? { acceptedTranscripts: textList(item.acceptedTranscripts) }
          : {}),
      });
      break;
    case 'read-aloud':
      content.referenceText = stringOf(item.referenceText);
      break;
    default:
      content.prompt = stringOf(item.prompt);
  }
  return {
    ...content,
    ...(media !== undefined ? { media } : {}),
    ...feedbackContent(item),
  };
}

function entryContent(entry: Fields, refOf: RefOf): Fields {
  if (entry.type !== 'item-group') {
    return itemContent(entry, refOf, []);
  }
  const stimulus = isRecord(entry.stimulus) ? entry.stimulus : {};
  const ownText = hasScript(stimulus) || typeof stimulus.transcript === 'string';
  const media = mediaContent(stimulus.media, ownText, refOf(['stimulus', 'media']));
  return {
    type: 'item-group',
    ...(typeof entry.title === 'string' ? { title: entry.title } : {}),
    stimulus: {
      kind: stringOf(stimulus.kind),
      ...(typeof stimulus.title === 'string' ? { title: stimulus.title } : {}),
      ...(typeof stimulus.body === 'string' ? { body: stimulus.body } : {}),
      ...(hasScript(stimulus)
        ? { script: turnsOf(stimulus) }
        : typeof stimulus.transcript === 'string'
          ? { transcript: stimulus.transcript }
          : {}),
      ...(media ?? {}),
    },
    items: listOf(entry.items).map((item, index) =>
      isRecord(item) ? itemContent(item, refOf, ['items', index]) : {},
    ),
  };
}

/** Every picture an entry shows: an item's, an option's, and a group's material's. */
function imageSlots(entry: Fields): { path: string[]; media: Fields }[] {
  const ofItem = (item: unknown, at: string[]): { path: string[]; media: Fields }[] => {
    if (!isRecord(item)) {
      return [];
    }
    return [
      ...(isImage(item.media) ? [{ path: [...at, 'media'], media: item.media as Fields }] : []),
      ...listOf(item.options).flatMap((option, index) =>
        isRecord(option) && isImage(option.media)
          ? [{ path: [...at, 'options', String(index), 'media'], media: option.media as Fields }]
          : [],
      ),
    ];
  };
  if (entry.type !== 'item-group') {
    return ofItem(entry, []);
  }
  const stimulus = isRecord(entry.stimulus) ? entry.stimulus : {};
  return [
    ...(isImage(stimulus.media)
      ? [{ path: ['stimulus', 'media'], media: stimulus.media as Fields }]
      : []),
    ...listOf(entry.items).flatMap((item, index) => ofItem(item, ['items', String(index)])),
  ];
}

// ── Exemplars that cannot be varied ────────────────────────────────────

/** Whether a recording the item's meaning depends on says nothing the facts can carry. */
function unheard(entry: Fields): boolean {
  const itemUnheard = (item: unknown): boolean => {
    if (!isRecord(item) || item.type === 'dictation' || item.type === 'read-aloud') {
      return false;
    }
    return (
      (isRecording(item.media) && transcriptOf(item.media) === null) ||
      listOf(item.options).some(
        (option) =>
          isRecord(option) && isRecording(option.media) && transcriptOf(option.media) === null,
      )
    );
  };
  if (entry.type !== 'item-group') {
    return itemUnheard(entry);
  }
  const stimulus = isRecord(entry.stimulus) ? entry.stimulus : {};
  const listening =
    stimulus.kind === 'audio' || stimulus.kind === 'video' || isRecording(stimulus.media);
  return (listening && transcriptOf(stimulus) === null) || listOf(entry.items).some(itemUnheard);
}

function skipOf(
  entry: Fields,
  exemplarIndex: number,
  imagePolicy: 'describe' | 'reuse',
): AiVariantSkip | undefined {
  const skip = (code: AiVariantSkipCode, message: string): AiVariantSkip => ({
    exemplarIndex,
    code,
    message,
  });
  const group = entry.type === 'item-group';
  if (group && entry.timeline !== undefined && entry.timeline !== null) {
    return skip(
      'variant_exemplar_timeline',
      'An interactive video is not varied: its questions are timed to its video.',
    );
  }
  const types = group
    ? listOf(entry.items).map((item) => (isRecord(item) ? stringOf(item.type) : ''))
    : [stringOf(entry.type)];
  const unsupported = types.find(
    (type) => getActivityTypeDescriptor(type) !== undefined && !VARIANT_TYPES.includes(type),
  );
  if (unsupported !== undefined) {
    return skip(
      'variant_exemplar_unsupported',
      `The SDK does not write variants of ${unsupported}: it does not know which of its fields are words and which are settings.`,
    );
  }
  if (
    imagePolicy === 'reuse' &&
    imageSlots(entry).some((slot) => written(slot.media.alt) === undefined)
  ) {
    return skip(
      'variant_exemplar_unseen',
      'A picture this depends on has no description (alt), so a model cannot write questions about it.',
    );
  }
  const validation = group
    ? validateItemGroupDraft(entry)
    : validateDraft(entry.type as ActivityType, entry);
  if (validation.status !== 'complete') {
    const first = validation.issues[0];
    return skip(
      'variant_exemplar_incomplete',
      `This is not a finished item (${first !== undefined ? `${first.code} at ${first.path.join('.') || 'its root'}` : validation.status}), so it has no structure to copy.`,
    );
  }
  if (unheard(entry)) {
    return skip(
      'variant_exemplar_unheard',
      'A recording this depends on has no transcript or script, so a model cannot know what it says.',
    );
  }
  const long = textsOf(entry).find((text) => text.text.length > AI_VARIANTS_MAX_MATERIAL_LENGTH);
  if (long !== undefined) {
    return skip(
      'variant_exemplar_too_long',
      `${long.path.join('.')} is longer than ${AI_VARIANTS_MAX_MATERIAL_LENGTH} characters. Send a shorter part.`,
    );
  }
  return undefined;
}

// ── The shape a model writes ───────────────────────────────────────────

const text = (description: string) => ({ type: 'string', description });

const SCRIPT_SHAPE = {
  type: 'array',
  minItems: 1,
  description:
    'The recording as turns, in order: a new name for each speaker, as many speakers as the exemplar.',
  items: {
    type: 'object',
    required: ['speaker', 'text'],
    properties: { speaker: text('Who speaks.'), text: text('What they say.') },
  },
};

const MEDIA_SHAPE = {
  type: 'object',
  description:
    "Only where the exemplar's content has media: for a picture, its alt; for a recording, its script — or transcript where the exemplar has no script.",
  properties: {
    alt: text('What the picture shows.'),
    transcript: text('What the recording says.'),
    script: SCRIPT_SHAPE,
  },
};

const FEEDBACK_SHAPE = {
  type: 'object',
  description: 'Only where the exemplar has feedback: shown after answering.',
  properties: {
    correct: text('Shown when the learner passes.'),
    incorrect: text('Shown when the learner does not.'),
  },
};

const FIELD_SHAPES: Readonly<Record<string, Fields>> = {
  title: text('A short name for the item, shown above it. Never the answer, or any part of it.'),
  instructions: text(
    'Only where the exemplar has instructions: the same task, worded for the new item.',
  ),
  question: text('The question, as plain text.'),
  options: {
    type: 'array',
    description: "As many as the exemplar's, as many of them right.",
    items: {
      type: 'object',
      required: ['text', 'isCorrect'],
      properties: {
        text: text('The option as the learner reads it.'),
        isCorrect: { type: 'boolean' },
        feedback: text("Only where the exemplar's options have feedback."),
        media: MEDIA_SHAPE,
      },
    },
  },
  passage: text('The passage as plain text, with {{1}}, {{2}}, … where each gap goes, in order.'),
  blanks: {
    type: 'array',
    description: 'One per gap, in the order the gaps appear: the first is {{1}}.',
    items: {
      type: 'object',
      required: ['acceptedAnswers'],
      properties: {
        acceptedAnswers: {
          type: 'array',
          minItems: 1,
          items: { type: 'string' },
          description: 'Every answer that is right, spelled as a learner would type it.',
        },
        hint: text("Only where the exemplar's blank has a hint. Never gives the answer away."),
        feedback: text("Only where the exemplar's blank has feedback."),
      },
    },
  },
  gaps: {
    type: 'array',
    description:
      'One per gap, in the order the gaps appear. A gap with its own choices writes `choices`, exactly one right; a gap drawing on a bank writes `answer`, the text of its right choice in that bank.',
    items: {
      type: 'object',
      properties: {
        choices: {
          type: 'array',
          items: {
            type: 'object',
            required: ['text', 'isCorrect'],
            properties: { text: text('A choice.'), isCorrect: { type: 'boolean' } },
          },
        },
        answer: text("The right choice's text, exactly as its bank writes it."),
        feedback: text("Only where the exemplar's gap has feedback."),
      },
    },
  },
  banks: {
    type: 'array',
    description: "The shared choice lists, as many as the exemplar's, each with as many choices.",
    items: {
      type: 'object',
      required: ['choices'],
      properties: { choices: { type: 'array', items: { type: 'string' } } },
    },
  },
  transcript: text('What the learner hears and types.'),
  acceptedTranscripts: {
    type: 'array',
    items: { type: 'string' },
    description:
      'Only where the exemplar has them: other writings of the transcript that are right, of the same kind.',
  },
  referenceText: text('What the learner reads aloud.'),
  prompt: text(
    "The writing task, of the same genre and purpose as the exemplar's, about something new.",
  ),
  media: MEDIA_SHAPE,
  feedback: FEEDBACK_SHAPE,
};

const WRITES: Readonly<Record<string, readonly string[]>> = {
  'multiple-choice': ['title', 'instructions', 'question', 'options', 'media', 'feedback'],
  'fill-in-the-blanks': ['title', 'instructions', 'passage', 'blanks', 'media', 'feedback'],
  'gap-select': ['title', 'instructions', 'passage', 'gaps', 'banks', 'media', 'feedback'],
  dictation: ['title', 'transcript', 'acceptedTranscripts', 'feedback'],
  'read-aloud': ['title', 'instructions', 'referenceText', 'feedback'],
  'written-response': ['title', 'prompt', 'media', 'feedback'],
};

function itemProperties(types: readonly string[]): Fields {
  const properties: Fields = {};
  for (const type of types) {
    for (const name of WRITES[type] ?? []) {
      properties[name] = FIELD_SHAPES[name];
    }
  }
  return properties;
}

/** The types an entry holds, a group's items included. */
const typesIn = (entry: Fields): string[] =>
  entry.type === 'item-group'
    ? listOf(entry.items).map((item) => (isRecord(item) ? stringOf(item.type) : ''))
    : [stringOf(entry.type)];

function replyShape(entries: readonly Fields[], exactly: number): Fields {
  const top = [...new Set(entries.map((entry) => stringOf(entry.type)))];
  const itemTypes = [
    ...new Set(entries.filter((entry) => entry.type === 'item-group').flatMap(typesIn)),
  ].filter((type) => VARIANT_TYPES.includes(type));
  const properties: Fields = {
    exemplar: {
      type: 'integer',
      minimum: 0,
      description: "The exemplar's index, as the facts give it.",
    },
    type: { type: 'string', enum: top, description: "The exemplar's type." },
    ...itemProperties(top.filter((type) => type !== 'item-group')),
  };
  if (top.includes('item-group')) {
    properties.title = FIELD_SHAPES.title;
    properties.stimulus = {
      type: 'object',
      description: 'The new material: a passage, or what a recording says.',
      properties: {
        title: text("Only where the exemplar's material has a title."),
        body: text('The passage, as plain text.'),
        transcript: text('What the recording says, where the exemplar has no script.'),
        script: SCRIPT_SHAPE,
        alt: text('For a picture: what it shows.'),
      },
    };
    properties.items = {
      type: 'array',
      description: "The questions about the new material: the exemplar's types, in its order.",
      items: {
        type: 'object',
        required: ['type'],
        properties: { type: { type: 'string', enum: itemTypes }, ...itemProperties(itemTypes) },
      },
    };
  }
  return {
    type: 'object',
    required: ['variants'],
    properties: {
      variants: {
        type: 'array',
        minItems: exactly,
        maxItems: exactly,
        items: { type: 'object', required: ['exemplar', 'type'], properties },
      },
    },
  };
}

// ── The request ────────────────────────────────────────────────────────

const facing = (path: readonly string[]): string =>
  path.join('.').replace(/^stimulus\.media\./, 'stimulus.');

function targetsOf(
  entry: Fields,
  difficulty: AiVariantDifficulty,
  reason: string | undefined,
  itemDifficulty: AiVariantTargets['itemDifficulty'],
  tolerance: LengthTolerance | undefined,
): AiVariantTargets {
  const group = entry.type === 'item-group';
  const levers = leversFor(entry, difficulty);
  const findings = group
    ? critiqueItemGroupDraft(entry)
    : critiqueDraft(entry.type as ActivityType, entry);
  return {
    type: stringOf(entry.type),
    structure: structureTargets(entry),
    lengths: Object.fromEntries(
      lengthTargets(entry, tolerance).map((target) => [facing(target.path), target.bounds]),
    ),
    difficulty,
    ...(difficulty !== 'same' && reason !== undefined ? { difficultyReason: reason } : {}),
    ...(levers !== undefined ? { levers } : {}),
    ...(itemDifficulty !== undefined ? { itemDifficulty } : {}),
    exemplarFindings: findings.map((found) => ({ code: found.code, message: found.message })),
  };
}

const idOf = (value: unknown): string | undefined =>
  isRecord(value) && typeof value.id === 'string' ? value.id : undefined;

/**
 * What a model is given to write a variant of each exemplar — a parallel item:
 * the exemplar's type, structure, scoring and settings, with every word a
 * learner reads or hears new — and what `checkAiVariants` needs to check the
 * reply against.
 *
 * `exemplars` are loose activities and item groups as stored, answer keys and
 * author-only transcripts included, in paper order; one variant is written for
 * each that can be varied. An exemplar that cannot is left out of the facts
 * and listed in `skipped`: a recording with nothing to say what it says
 * (`variant_exemplar_unheard`), a picture with no description to reuse
 * (`variant_exemplar_unseen`), an unfinished item
 * (`variant_exemplar_incomplete`), an interactive video
 * (`variant_exemplar_timeline`), a type the SDK does not vary
 * (`variant_exemplar_unsupported`) or material over
 * {@link AI_VARIANTS_MAX_MATERIAL_LENGTH} characters
 * (`variant_exemplar_too_long`). When every exemplar is skipped the request has
 * none, and `generateVariants` makes no call.
 *
 * The facts give each exemplar's content in the shape a variant is written in,
 * and its `targets`: the structure to keep, the length of each text in words,
 * its difficulty with the levers to move it, and the critic's findings on it
 * not to repeat. `rules` are what every variant must respect, as sentences a
 * prompt can quote. Pictures are listed in `images`, for a host that attaches
 * them; no recording's address reaches the facts. `avoid` is the other forms'
 * items: compared with every variant, never varied.
 *
 * Nothing passed is changed.
 *
 * @throws RangeError when `exemplars` is empty or longer than
 *   {@link AI_VARIANTS_MAX_EXEMPLARS}, an exemplar is neither an item group nor
 *   a registered activity type, `level` is empty, a difficulty is not `easier`,
 *   `same` or `harder`, `images` is neither `describe` nor `reuse`, or
 *   `difficultyFor` names an id no exemplar has.
 */
export function aiVariantsRequest(input: {
  exemplars: readonly unknown[];
  level: string;
  difficulty?: AiVariantDifficulty;
  difficultyFor?: Readonly<Record<string, { difficulty: AiVariantDifficulty; reason?: string }>>;
  locale?: string;
  levelFacts?: AiVariantLevelFacts;
  avoid?: readonly unknown[];
  images?: 'describe' | 'reuse';
  instructions?: string;
  settings?: AiDraftSettings;
  lengthTolerance?: LengthTolerance;
  balanceKeyPositions?: { seed: string };
}): AiVariantsRequest {
  const { exemplars, level, locale, levelFacts, avoid, instructions, settings } = input;
  const difficulty = input.difficulty ?? 'same';
  const imagePolicy = input.images ?? 'describe';
  if (
    !Array.isArray(exemplars) ||
    exemplars.length === 0 ||
    exemplars.length > AI_VARIANTS_MAX_EXEMPLARS
  ) {
    throw new RangeError(
      `aiVariantsRequest: exemplars must hold 1 to ${AI_VARIANTS_MAX_EXEMPLARS} entries; send a longer section in parts.`,
    );
  }
  if (typeof level !== 'string' || level.trim() === '') {
    throw new RangeError('aiVariantsRequest: level is required: a variant must stay inside it.');
  }
  if (!DIFFICULTIES.includes(difficulty)) {
    throw new RangeError(
      `aiVariantsRequest: difficulty must be easier, same or harder, not ${String(difficulty)}.`,
    );
  }
  if (imagePolicy !== 'describe' && imagePolicy !== 'reuse') {
    throw new RangeError(
      `aiVariantsRequest: images must be describe or reuse, not ${String(imagePolicy)}.`,
    );
  }
  exemplars.forEach((entry, index) => {
    const type = isRecord(entry) ? entry.type : undefined;
    if (
      typeof type !== 'string' ||
      (type !== 'item-group' && getActivityTypeDescriptor(type) === undefined)
    ) {
      throw new RangeError(
        `aiVariantsRequest: exemplar ${index} is neither an item group nor a registered activity type.`,
      );
    }
  });
  const entries = exemplars as readonly Fields[];
  const ids = new Set(
    entries
      .flatMap((entry) => [idOf(entry), ...listOf(entry.items).map(idOf)])
      .filter((id): id is string => id !== undefined),
  );
  for (const [id, wanted] of Object.entries(input.difficultyFor ?? {})) {
    if (!ids.has(id)) {
      throw new RangeError(
        `aiVariantsRequest: difficultyFor names "${id}", which no exemplar has.`,
      );
    }
    if (!isRecord(wanted) || !DIFFICULTIES.includes(wanted.difficulty as string)) {
      throw new RangeError(
        `aiVariantsRequest: difficultyFor["${id}"] must be easier, same or harder.`,
      );
    }
  }
  const moved = (id: string | undefined) =>
    id !== undefined ? input.difficultyFor?.[id] : undefined;

  const skipped: AiVariantSkip[] = [];
  const images: AiVariantImage[] = [];
  const facts: AiVariantExemplarFacts[] = [];
  entries.forEach((entry, exemplarIndex) => {
    const skip = skipOf(entry, exemplarIndex, imagePolicy);
    if (skip !== undefined) {
      skipped.push(skip);
      return;
    }
    const refs = new Map<string, string>();
    for (const slot of imageSlots(entry)) {
      const ref = `img-${images.length + 1}`;
      refs.set(slot.path.join('.'), ref);
      images.push({
        ref,
        exemplarIndex,
        path: slot.path,
        ...(typeof slot.media.alt === 'string' ? { alt: slot.media.alt } : {}),
        url: stringOf(slot.media.url),
      });
    }
    const own = moved(idOf(entry));
    const entryDifficulty = own?.difficulty ?? difficulty;
    const items = entry.type === 'item-group' ? listOf(entry.items) : [];
    const perItem = items.map((item, at) => {
      const wanted = moved(idOf(item));
      return {
        item: at,
        difficulty: wanted?.difficulty ?? entryDifficulty,
        ...(wanted?.reason !== undefined ? { difficultyReason: wanted.reason } : {}),
      };
    });
    const itemDifficulty = perItem.some(
      (one) => one.difficulty !== entryDifficulty || one.difficultyReason !== undefined,
    )
      ? perItem.map((one) => {
          const levers = leversFor(items[one.item] as Fields, one.difficulty);
          return { ...one, ...(levers !== undefined ? { levers } : {}) };
        })
      : undefined;
    facts.push({
      exemplar: exemplarIndex,
      type: stringOf(entry.type),
      content: entryContent(entry, (path) => refs.get(path.map(String).join('.'))),
      ...(Array.isArray(entry.learningObjectives)
        ? { learningObjectives: textList(entry.learningObjectives) }
        : {}),
      targets: targetsOf(
        entry,
        entryDifficulty,
        own?.reason,
        itemDifficulty,
        input.lengthTolerance,
      ),
    });
  });

  const rules = [
    ...RULES,
    ...(images.length > 0 ? [imagePolicy === 'describe' ? DESCRIBE_RULE : REUSE_RULE] : []),
    ...(facts.some(
      (one) =>
        one.targets.difficulty !== 'same' ||
        (one.targets.itemDifficulty ?? []).some((item) => item.difficulty !== 'same'),
    )
      ? [DIFFICULTY_RULE]
      : []),
    ...(levelFacts !== undefined ? [LEVEL_FACTS_RULE] : []),
  ];
  const varied = facts.map((one) => entries[one.exemplar] as Fields);
  return {
    feature: 'variant-generation',
    facts: {
      exemplars: facts,
      level,
      ...(locale !== undefined
        ? { locale }
        : typeof entries[0]?.locale === 'string'
          ? { locale: entries[0].locale }
          : {}),
      difficulty,
      ...(levelFacts !== undefined ? { levelFacts: clone(levelFacts) } : {}),
      imagePolicy,
      ...(images.length > 0 ? { images } : {}),
      ...(avoid !== undefined && avoid.length > 0
        ? {
            avoid: avoid.map((entry) => ({
              texts: textsOf(entry).map((one) => one.text),
              keys: (isRecord(entry) && entry.type === 'item-group'
                ? listOf(entry.items)
                : [entry]
              ).flatMap((item) => keysOf(item).map((slot) => slot.shown)),
            })),
          }
        : {}),
      ...(instructions !== undefined ? { instructions } : {}),
      rules,
    },
    shape: replyShape(varied, varied.length),
    exemplars,
    ...(avoid !== undefined ? { avoid } : {}),
    ...(settings !== undefined ? { settings } : {}),
    ...(input.lengthTolerance !== undefined
      ? { lengthTolerance: { ...input.lengthTolerance } }
      : {}),
    ...(input.balanceKeyPositions !== undefined
      ? { balanceKeyPositions: { seed: input.balanceKeyPositions.seed } }
      : {}),
    skipped,
  };
}

// ── From a reply to a variant ──────────────────────────────────────────

/** Fields every activity copies from its exemplar: what scores it, and what it tests. */
const COPIED_COMMON = [
  'scoringStrategy',
  'shuffle',
  'passThreshold',
  'locale',
  'ai',
  'learningObjectives',
  'slotKey',
];

const COPIED: Readonly<Record<string, readonly string[]>> = {
  'multiple-choice': ['mode'],
  'fill-in-the-blanks': [],
  'gap-select': ['presentation', 'shuffleChoices'],
  dictation: ['tolerance', 'hints'],
  'read-aloud': ['recording', 'scoring'],
  'written-response': ['rubric', 'minWords', 'maxWords', 'languageTarget'],
};

function pick(from: Fields, names: readonly string[]): Fields {
  const out: Fields = {};
  for (const name of names) {
    if (from[name] !== undefined) {
      out[name] = clone(from[name]);
    }
  }
  return out;
}

/** The author's 1–5 difficulty, one step along with the variant's, inside the scale. */
function steppedLevel(level: unknown, difficulty: AiVariantDifficulty): Fields {
  if (typeof level !== 'number') {
    return {};
  }
  const step = difficulty === 'easier' ? -1 : difficulty === 'harder' ? 1 : 0;
  return { difficultyLevel: Math.min(5, Math.max(1, level + step)) };
}

interface Build {
  request: AiVariantsRequest;
  ids: () => string;
}

const scriptFrom = (value: unknown): { speaker: string; text: string }[] =>
  listOf(value).flatMap((turn) =>
    isRecord(turn) ? [{ speaker: stringOf(turn.speaker), text: stringOf(turn.text) }] : [],
  );

/**
 * A variant's media in place of the exemplar's: a picture described anew, or
 * kept with `reuse`; a recording with no file yet — the host records it — its
 * playback policy, and the words the model wrote for it. An address, captions,
 * tracks and a poster belong to the old recording and are not copied.
 */
function variantMedia(
  exemplar: Fields,
  wrote: unknown,
  ownText: boolean,
  imagePolicy: 'describe' | 'reuse',
): Fields {
  const model = isRecord(wrote) ? wrote : {};
  if (isImage(exemplar)) {
    return imagePolicy === 'reuse'
      ? pick(exemplar, ['type', 'url', 'alt'])
      : { type: 'image', url: null, alt: stringOf(model.alt) };
  }
  const media: Fields = { type: exemplar.type, url: null, ...pick(exemplar, ['playback']) };
  if (!ownText) {
    if (hasScript(exemplar)) {
      media.script = scriptFrom(model.script);
    } else if (typeof exemplar.transcript === 'string') {
      media.transcript = stringOf(model.transcript);
    }
  }
  return media;
}

/** The feedback the model wrote, on the keys the exemplar's feedback has. */
function feedbackFrom(exemplar: Fields, wrote: Fields): Fields {
  if (!isRecord(exemplar.feedback) || !isRecord(wrote.feedback)) {
    return {};
  }
  const out: Fields = {};
  for (const name of ['correct', 'incorrect']) {
    const said = written(wrote.feedback[name]);
    if (exemplar.feedback[name] !== undefined && said !== undefined) {
      out[name] = said;
    }
  }
  return Object.keys(out).length > 0 ? { feedback: out } : {};
}

function difficultyFor(
  request: AiVariantsRequest,
  exemplarIndex: number,
  item?: number,
): AiVariantDifficulty {
  const targets = request.facts.exemplars.find((one) => one.exemplar === exemplarIndex)?.targets;
  const own =
    item !== undefined ? targets?.itemDifficulty?.find((one) => one.item === item) : undefined;
  return own?.difficulty ?? targets?.difficulty ?? request.facts.difficulty;
}

function buildActivity(
  exemplar: Fields,
  wrote: Fields,
  type: string,
  build: Build,
  difficulty: AiVariantDifficulty,
  id: string,
): Fields {
  const { request, ids } = build;
  const imagePolicy = request.facts.imagePolicy;
  const alike = exemplar.type === type;
  const content: Fields = { title: stringOf(wrote.title) };
  if (typeof exemplar.instructions === 'string') {
    content.instructions = written(wrote.instructions) ?? exemplar.instructions;
  }
  switch (type) {
    case 'multiple-choice': {
      const before = listOf(exemplar.options);
      const withFeedback = before.some(
        (option) => isRecord(option) && option.feedback !== undefined,
      );
      content.question = stringOf(wrote.question);
      content.options = listOf(wrote.options).map((option, index) => {
        const fields = isRecord(option) ? option : {};
        const was = before[index];
        const feedback = withFeedback ? written(fields.feedback) : undefined;
        return {
          id: ids(),
          text: stringOf(fields.text),
          isCorrect: fields.isCorrect === true,
          ...(feedback !== undefined ? { feedback } : {}),
          ...(isRecord(was) && isRecord(was.media)
            ? { media: variantMedia(was.media, fields.media, false, imagePolicy) }
            : {}),
        };
      });
      break;
    }
    case 'fill-in-the-blanks': {
      const before = alike ? inPassageOrder(exemplar, 'blanks').map((one) => one.value) : [];
      content.passage = stringOf(wrote.passage);
      content.blanks = listOf(wrote.blanks).map((blank, index) => {
        const fields = isRecord(blank) ? blank : {};
        const was = isRecord(before[index]) ? (before[index] as Fields) : {};
        const hint = was.hint !== undefined ? written(fields.hint) : undefined;
        const feedback = was.feedback !== undefined ? written(fields.feedback) : undefined;
        return {
          id: String(index + 1),
          acceptedAnswers: textList(fields.acceptedAnswers),
          ...(hint !== undefined ? { hint } : {}),
          ...(feedback !== undefined ? { feedback } : {}),
          ...pick(was, ['match', 'caseSensitive', 'trimWhitespace']),
        };
      });
      break;
    }
    case 'gap-select': {
      const beforeGaps = alike ? inPassageOrder(exemplar, 'gaps').map((one) => one.value) : [];
      const beforeBanks = alike ? listOf(exemplar.banks) : [];
      const banks = beforeBanks.length
        ? listOf(wrote.banks).map((bank) => ({
            id: ids(),
            choices: listOf(isRecord(bank) ? bank.choices : undefined).map((choice) => ({
              id: ids(),
              text:
                typeof choice === 'string' ? choice : isRecord(choice) ? stringOf(choice.text) : '',
            })),
          }))
        : [];
      content.passage = stringOf(wrote.passage);
      content.gaps = listOf(wrote.gaps).map((gap, index) => {
        const fields = isRecord(gap) ? gap : {};
        const was = isRecord(beforeGaps[index]) ? (beforeGaps[index] as Fields) : {};
        const feedback = was.feedback !== undefined ? written(fields.feedback) : undefined;
        const drawsOn =
          listOf(was.choices).length === 0
            ? beforeBanks.findIndex((bank) => isRecord(bank) && bank.id === was.bankId)
            : -1;
        const bank = drawsOn !== -1 ? banks[drawsOn] : undefined;
        if (bank !== undefined) {
          const answer = stringOf(fields.answer).trim().toLowerCase();
          const right = bank.choices.find((choice) => choice.text.trim().toLowerCase() === answer);
          return {
            id: String(index + 1),
            bankId: bank.id,
            correctChoiceId: answer !== '' && right !== undefined ? right.id : '',
            ...(feedback !== undefined ? { feedback } : {}),
          };
        }
        const marked = listOf(fields.choices);
        const choices = marked.map((choice) => ({
          id: ids(),
          text: isRecord(choice) ? stringOf(choice.text) : '',
        }));
        // Exactly one marked right is a key; none, or several, is no key —
        // which validateDraft asks for, and a repair then supplies.
        const right = marked.flatMap((choice, at) =>
          isRecord(choice) && choice.isCorrect === true ? [at] : [],
        );
        return {
          id: String(index + 1),
          choices,
          correctChoiceId: right.length === 1 ? (choices[right[0] as number]?.id as string) : '',
          ...(feedback !== undefined ? { feedback } : {}),
        };
      });
      if (banks.length > 0) {
        content.banks = banks;
      }
      break;
    }
    case 'dictation':
      content.transcript = stringOf(wrote.transcript);
      if (Array.isArray(exemplar.acceptedTranscripts) && Array.isArray(wrote.acceptedTranscripts)) {
        const accepted = textList(wrote.acceptedTranscripts).filter((one) => one.trim() !== '');
        if (accepted.length > 0) {
          content.acceptedTranscripts = accepted;
        }
      }
      break;
    case 'read-aloud':
      content.referenceText = stringOf(wrote.referenceText);
      break;
    default:
      content.prompt = stringOf(wrote.prompt);
  }
  const ownText = type === 'dictation' || type === 'read-aloud';
  return {
    ...pick(exemplar, alike ? [...COPIED_COMMON, ...(COPIED[type] ?? [])] : COPIED_COMMON),
    ...steppedLevel(exemplar.difficultyLevel, difficulty),
    ...request.settings?.[type as keyof AiDraftSettings],
    ...content,
    ...(isRecord(exemplar.media)
      ? { media: variantMedia(exemplar.media, wrote.media, ownText, imagePolicy) }
      : {}),
    ...(ownText && isRecord(exemplar.slowMedia) ? { slowMedia: { type: 'audio', url: null } } : {}),
    ...feedbackFrom(exemplar, wrote),
    schemaVersion: typeof exemplar.schemaVersion === 'string' ? exemplar.schemaVersion : '1.0',
    type,
    id,
  };
}

function buildStimulus(exemplar: Fields, wrote: unknown, build: Build): Fields {
  const model = isRecord(wrote) ? wrote : {};
  const ownText = hasScript(exemplar) || typeof exemplar.transcript === 'string';
  const title = typeof exemplar.title === 'string' ? written(model.title) : undefined;
  return {
    id: build.ids(),
    kind: exemplar.kind,
    ...(title !== undefined ? { title } : {}),
    ...(typeof exemplar.body === 'string' ? { body: stringOf(model.body) } : {}),
    ...(hasScript(exemplar)
      ? { script: scriptFrom(model.script) }
      : typeof exemplar.transcript === 'string'
        ? { transcript: stringOf(model.transcript) }
        : {}),
    ...(isRecord(exemplar.media)
      ? { media: variantMedia(exemplar.media, model, ownText, build.request.facts.imagePolicy) }
      : {}),
    ...pick(exemplar, ['locale']),
  };
}

function buildEntry(
  exemplar: Fields,
  exemplarIndex: number,
  wrote: Fields,
  build: Build,
  id: string,
): Fields {
  const difficulty = difficultyFor(build.request, exemplarIndex);
  if (exemplar.type !== 'item-group') {
    return buildActivity(exemplar, wrote, stringOf(exemplar.type), build, difficulty, id);
  }
  const before = listOf(exemplar.items);
  const title =
    typeof exemplar.title === 'string' ? (written(wrote.title) ?? exemplar.title) : undefined;
  return {
    ...pick(exemplar, ['slotKey', 'shuffle']),
    ...(title !== undefined ? { title } : {}),
    stimulus: buildStimulus(
      isRecord(exemplar.stimulus) ? exemplar.stimulus : {},
      wrote.stimulus,
      build,
    ),
    items: listOf(wrote.items).map((item, index) => {
      const fields = isRecord(item) ? item : {};
      const was = isRecord(before[index]) ? (before[index] as Fields) : {};
      const type = VARIANT_TYPES.includes(stringOf(fields.type))
        ? stringOf(fields.type)
        : stringOf(was.type);
      return buildActivity(
        was,
        fields,
        type,
        build,
        difficultyFor(build.request, exemplarIndex, index),
        build.ids(),
      );
    }),
    schemaVersion: typeof exemplar.schemaVersion === 'string' ? exemplar.schemaVersion : '1.0',
    type: 'item-group',
    id,
  };
}

// ── Checking a variant ─────────────────────────────────────────────────

function variantFinding(
  code: 'variant_length' | 'variant_near_copy' | 'variant_same_key',
  path: readonly string[],
  message: string,
): ItemFinding {
  return { path: [...path], message, code, severity: AI_VARIANT_CODE_SEVERITY[code] };
}

/** The items of an entry with their paths: the entry itself, or a group's items. */
const itemsWithPaths = (entry: unknown): { path: string[]; item: unknown }[] =>
  isRecord(entry) && entry.type === 'item-group'
    ? listOf(entry.items).map((item, index) => ({ path: ['items', String(index)], item }))
    : [{ path: [], item: entry }];

/** The other forms' entries in this exemplar's place: the same `slotKey`, or the same position in each form. */
function avoidedFor(
  request: AiVariantsRequest,
  exemplarIndex: number,
): { entry: unknown; label: string }[] {
  const avoid = request.avoid ?? [];
  const exemplar = request.exemplars[exemplarIndex];
  const slotKey = isRecord(exemplar) ? exemplar.slotKey : undefined;
  const forms = avoid.length % request.exemplars.length === 0;
  return avoid.flatMap((entry, index) => {
    const theirs = isRecord(entry) ? entry.slotKey : undefined;
    const paired =
      slotKey !== undefined && theirs !== undefined
        ? slotKey === theirs
        : slotKey === undefined &&
          theirs === undefined &&
          forms &&
          index % request.exemplars.length === exemplarIndex;
    return paired ? [{ entry, label: `avoid[${index}]` }] : [];
  });
}

function nearCopies(entry: Fields, exemplar: Fields, request: AiVariantsRequest): ItemFinding[] {
  const mine = new Map(textsOf(exemplar).map((one) => [one.path.join('.'), one]));
  const avoided = (request.avoid ?? []).flatMap((other, index) =>
    textsOf(other).map((one) => ({ ...one, label: `avoid[${index}]` })),
  );
  const findings: ItemFinding[] = [];
  for (const one of textsOf(entry)) {
    let best: { score: number; what: string } | undefined;
    const consider = (score: number, what: string) => {
      if (score >= AI_VARIANT_NEAR_COPY_THRESHOLD && (best === undefined || score > best.score)) {
        best = { score, what };
      }
    };
    const theirs = mine.get(one.path.join('.'));
    if (theirs !== undefined) {
      consider(textSimilarity(theirs.text, one.text), `the exemplar's ${theirs.path.join('.')}`);
    }
    for (const other of avoided) {
      if (other.kind === one.kind) {
        consider(
          textSimilarity(other.text, one.text),
          `${other.label} ${other.path.join('.') || 'text'}`,
        );
      }
    }
    if (best !== undefined) {
      findings.push(
        variantFinding(
          'variant_near_copy',
          one.path,
          `This reads like ${best.what} (similarity ${shownScore(best.score)}). Write it in new words.`,
        ),
      );
    }
  }
  const exemplarItems = new Map(
    itemsWithPaths(exemplar).map((one) => [one.path.join('.'), one.item]),
  );
  const avoidedOptions = (request.avoid ?? []).flatMap((other, index) =>
    itemsWithPaths(other).map((one) => ({ set: optionSet(one.item), label: `avoid[${index}]` })),
  );
  for (const { path, item } of itemsWithPaths(entry)) {
    const options = optionSet(item);
    if (options === null) {
      continue;
    }
    const sameAs = (other: string[] | null) =>
      other !== null && other.join('\n') === options.join('\n');
    const source = sameAs(optionSet(exemplarItems.get(path.join('.'))))
      ? "the exemplar's"
      : avoidedOptions.find((other) => sameAs(other.set))?.label;
    if (source !== undefined) {
      findings.push(
        variantFinding(
          'variant_near_copy',
          [...path, 'options'],
          `These are ${source === "the exemplar's" ? "the exemplar's options" : `${source}'s options`}, in another order. Write new options.`,
        ),
      );
    }
  }
  return findings;
}

function sameKeys(
  entry: Fields,
  exemplar: Fields,
  exemplarIndex: number,
  request: AiVariantsRequest,
): ItemFinding[] {
  const against = [
    { entry: exemplar as unknown, label: 'the exemplar' },
    ...avoidedFor(request, exemplarIndex),
  ];
  const findings: ItemFinding[] = [];
  for (const { path, item } of itemsWithPaths(entry)) {
    const slots = keysOf(item);
    const reported = new Set<string>();
    for (const other of against) {
      const theirs = itemsWithPaths(other.entry).find(
        (one) => one.path.join('.') === path.join('.'),
      );
      const theirSlots = keysOf(theirs?.item);
      for (const slot of slots) {
        const match = theirSlots.find((one) => one.slot === slot.slot);
        const shared = match !== undefined ? sharedAnswers(slot, match) : [];
        if (shared.length > 0 && !reported.has(slot.slot)) {
          reported.add(slot.slot);
          findings.push(
            variantFinding(
              'variant_same_key',
              [...path, ...slot.path],
              `The right answer "${shared[0]}" is ${other.label === 'the exemplar' ? "the exemplar's" : `${other.label}'s`} too: a learner who sat that form scores again by memory.`,
            ),
          );
        }
      }
    }
  }
  return findings;
}

/** Whether a recording the exemplar's item has words for came back with none. */
function wordlessRecordings(exemplar: Fields, entry: Fields): AiVariantMismatch[] {
  const mismatch = (path: string[], message: string): AiVariantMismatch => ({
    path,
    message,
    code: 'variant_structure',
    severity: 'invalid',
  });
  const out: AiVariantMismatch[] = [];
  const pairsOf = (a: unknown, b: unknown, at: string[]) => {
    if (!isRecord(a) || !isRecord(b) || a.type === 'dictation' || a.type === 'read-aloud') {
      return;
    }
    if (isRecording(a.media) && transcriptOf(a.media) !== null && transcriptOf(b.media) === null) {
      out.push(
        mismatch(
          [...at, 'media', hasScript(a.media as Fields) ? 'script' : 'transcript'],
          'The recording has no words to record: write what it says.',
        ),
      );
    }
  };
  if (exemplar.type === 'item-group') {
    const before = isRecord(exemplar.stimulus) ? exemplar.stimulus : {};
    const after = isRecord(entry.stimulus) ? entry.stimulus : {};
    if (transcriptOf(before) !== null && transcriptOf(after) === null) {
      out.push(
        mismatch(
          [
            'stimulus',
            hasScript(before) || (isRecord(before.media) && hasScript(before.media))
              ? 'script'
              : 'transcript',
          ],
          'The recording has no words to record: write what it says.',
        ),
      );
    }
    listOf(exemplar.items).forEach((item, index) => {
      pairsOf(item, listOf(entry.items)[index], ['items', String(index)]);
    });
  } else {
    pairsOf(exemplar, entry, []);
  }
  return out;
}

function pairsOf(exemplar: Fields, entry: Fields): AiVariantPair[] {
  const top: AiVariantPair = {
    exemplarPath: [],
    variantPath: [],
    exemplarId: stringOf(exemplar.id),
    variantId: stringOf(entry.id),
  };
  if (exemplar.type !== 'item-group') {
    return [top];
  }
  const theirs = listOf(entry.items);
  return [
    top,
    ...listOf(exemplar.items).flatMap((item, index) =>
      index < theirs.length
        ? [
            {
              exemplarPath: ['items', String(index)],
              variantPath: ['items', String(index)],
              exemplarId: idOf(item) ?? '',
              variantId: idOf(theirs[index]) ?? '',
            },
          ]
        : [],
    ),
  ];
}

interface Built {
  exemplarIndex: number;
  wroteType: string;
  entry: Fields;
  generated: Fields;
}

function evaluate(built: Built, request: AiVariantsRequest): AiGeneratedVariant {
  const exemplar = request.exemplars[built.exemplarIndex] as Fields;
  const type = stringOf(exemplar.type);
  const { entry } = built;
  const group = type === 'item-group';
  const validation = group
    ? validateItemGroupDraft(entry)
    : validateDraft(type as ActivityType, entry);
  const mismatches: AiVariantMismatch[] =
    built.wroteType !== type
      ? [
          {
            path: ['type'],
            message: `This was written as ${built.wroteType || 'no type'}; the exemplar is ${type}.`,
            code: 'variant_type',
            severity: 'invalid',
          },
        ]
      : [
          ...structureMisses(exemplar, entry).map(
            (miss): AiVariantMismatch => ({
              ...miss,
              code: 'variant_structure',
              severity: 'invalid',
            }),
          ),
          ...wordlessRecordings(exemplar, entry),
        ];
  const findings = [
    ...(group ? critiqueItemGroupDraft(entry) : critiqueDraft(type as ActivityType, entry)),
    ...lengthMisses(exemplar, entry, request.lengthTolerance).map((miss) =>
      variantFinding(
        'variant_length',
        miss.path,
        `${miss.words} words; the exemplar's has ${miss.exemplarWords}, so ${miss.bounds[0]} to ${miss.bounds[1]}.`,
      ),
    ),
    ...nearCopies(entry, exemplar, request),
    ...sameKeys(entry, exemplar, built.exemplarIndex, request),
  ];
  const status =
    validation.status === 'invalid' || mismatches.length > 0
      ? 'invalid'
      : validation.status === 'incomplete'
        ? 'incomplete'
        : 'complete';
  return {
    exemplarIndex: built.exemplarIndex,
    type,
    entry,
    status,
    validation,
    mismatches,
    findings,
    pairs: pairsOf(exemplar, entry),
    generated: built.generated,
  };
}

// ── Keys spread across positions ───────────────────────────────────────

/**
 * Moves each single-answer, unshuffled multiple choice's right option to the
 * position used least so far across the variants, ties broken by an order
 * drawn from `seed`: as even as the counts allow, and the same every time.
 * An option moves with its id, text, feedback and media.
 */
function balanceKeys(built: readonly Built[], seed: string): Built[] {
  const counts = new Map<number, number>();
  let slot = 0;
  const visit = (item: unknown): unknown => {
    if (
      !isRecord(item) ||
      item.type !== 'multiple-choice' ||
      item.mode !== 'single' ||
      item.shuffle === true
    ) {
      return item;
    }
    const options = listOf(item.options);
    const keys = options.flatMap((option, index) =>
      isRecord(option) && option.isCorrect === true ? [index] : [],
    );
    if (keys.length !== 1) {
      return item;
    }
    const order = seededShuffle(
      options.map((_, index) => index),
      `${seed}:${slot}`,
      { version: 2 },
    );
    slot += 1;
    let target = order[0] as number;
    for (const position of order) {
      if ((counts.get(position) ?? 0) < (counts.get(target) ?? 0)) {
        target = position;
      }
    }
    counts.set(target, (counts.get(target) ?? 0) + 1);
    const key = options[keys[0] as number];
    const rest = options.filter((_, index) => index !== keys[0]);
    return { ...item, options: [...rest.slice(0, target), key, ...rest.slice(target)] };
  };
  return [...built]
    .sort((a, b) => a.exemplarIndex - b.exemplarIndex)
    .map((one) => ({
      ...one,
      entry:
        one.entry.type === 'item-group'
          ? { ...one.entry, items: listOf(one.entry.items).map(visit) }
          : (visit(one.entry) as Fields),
    }));
}

// ── Reading a reply ────────────────────────────────────────────────────

/** Ids from the host, checked as `createDraft` checks them. */
function idSource(newId: () => string, caller: string): () => string {
  const issued = new Set<string>();
  return () => {
    const id: unknown = newId();
    if (typeof id !== 'string' || id === '') {
      throw new Error(`${caller}: newId() must return a non-empty string.`);
    }
    if (issued.has(id)) {
      throw new Error(
        `${caller}: newId() returned "${id}" twice. Ids must differ — two options sharing an id cannot be scored apart.`,
      );
    }
    issued.add(id);
    return id;
  };
}

type Read =
  | { ok: false; refusal: AiRefusal }
  | { ok: true; built: Built[]; missing: AiVariantMissing[]; raw: Fields };

function missingOf(exemplarIndex: number): AiVariantMissing {
  return {
    exemplarIndex,
    code: 'variant_missing',
    message: `The reply has no variant of exemplar ${exemplarIndex}.`,
    severity: 'invalid',
  };
}

function read(
  raw: unknown,
  request: AiVariantsRequest,
  ids: () => string,
  keep: ReadonlyMap<number, string>,
): Read {
  if (!isRecord(raw) || !Array.isArray(raw.variants) || !raw.variants.every(isRecord)) {
    return { ok: false, refusal: 'malformed' };
  }
  const asked = request.repair
    ? request.repair.map((one) => one.exemplar)
    : request.facts.exemplars.map((one) => one.exemplar);
  if (raw.variants.length > asked.length) {
    return { ok: false, refusal: 'too-long' };
  }
  const seen = new Set<number>();
  for (const variant of raw.variants as Fields[]) {
    const index = variant.exemplar;
    if (typeof index !== 'number' || !asked.includes(index) || seen.has(index)) {
      return { ok: false, refusal: 'malformed' };
    }
    seen.add(index);
  }
  const build: Build = { request, ids };
  const built = (raw.variants as Fields[]).map((variant): Built => {
    const exemplarIndex = variant.exemplar as number;
    const exemplar = request.exemplars[exemplarIndex] as Fields;
    return {
      exemplarIndex,
      wroteType: stringOf(variant.type),
      entry: buildEntry(exemplar, exemplarIndex, variant, build, keep.get(exemplarIndex) ?? ids()),
      generated: variant,
    };
  });
  return {
    ok: true,
    built: built.sort((a, b) => a.exemplarIndex - b.exemplarIndex),
    missing: asked
      .filter((index) => !seen.has(index))
      .sort((a, b) => a - b)
      .map(missingOf),
    raw,
  };
}

function setFindings(variants: readonly AiGeneratedVariant[]): ItemFinding[] {
  const entries = variants.map((one) => one.entry);
  return [...keyPositionFinding(entries, []), ...paperFindings(entries)];
}

/**
 * Reads a model's reply to {@link aiVariantsRequest} into variants an editor
 * can show for approval: each made from what the model wrote and what its
 * exemplar is — type, structure, scoring and settings copied from the
 * exemplar, whatever the reply says of them — with ids from `newId`, checked
 * by `validateDraft` (or `validateItemGroupDraft`), compared with its exemplar
 * (`mismatches`: `variant_type`, `variant_structure`), critiqued, and checked
 * for length, near copies and repeated keys against the exemplar and every
 * entry in `avoid` (`findings`: `variant_length`, `variant_near_copy`,
 * `variant_same_key`). `pairs` line each exemplar item up with its variant's.
 *
 * A recording comes back with no file — `url: null`, its playback policy, and
 * a new script or transcript — and a picture to describe with no file and a
 * new `alt`: `media_url_required` until the host attaches one.
 *
 * Variants are independent: one that is wrong comes back as such, beside the
 * others. An exemplar the reply wrote nothing for is listed in `missing`. The
 * whole reply is refused only when it is not `{ variants: [...] }` of objects
 * each naming an exemplar of the facts once (`malformed`), or holds more
 * variants than exemplars (`too-long`).
 *
 * With `balanceKeyPositions` the single-answer keys are spread across
 * positions, from its seed.
 *
 * @throws Error when `newId` returns an empty or repeated id.
 */
export function checkAiVariants(
  raw: unknown,
  request: AiVariantsRequest,
  options: { newId: () => string },
): { ok: true; variants: AiVariants } | { ok: false; refusal: AiRefusal } {
  const result = read(raw, request, idSource(options.newId, 'checkAiVariants'), new Map());
  if (!result.ok) {
    return result;
  }
  const seed = request.balanceKeyPositions?.seed;
  const built = seed !== undefined ? balanceKeys(result.built, seed) : result.built;
  const variants = built.map((one) => evaluate(one, request));
  const provenance = provenanceOf(result.raw.provenance);
  const usage = usageOf(result.raw.usage);
  return {
    ok: true,
    variants: {
      variants,
      missing: result.missing,
      findings: setFindings(variants),
      ...(provenance !== undefined ? { provenance } : {}),
      ...(usage !== undefined ? { usage } : {}),
    },
  };
}

// ── Repair ─────────────────────────────────────────────────────────────

/** The fields a model writes, and inside media and material, the ones it writes there. */
const WRITTEN_FIELDS = new Set([
  'type',
  'title',
  'instructions',
  'question',
  'options',
  'passage',
  'blanks',
  'gaps',
  'banks',
  'transcript',
  'acceptedTranscripts',
  'referenceText',
  'prompt',
  'feedback',
  'media',
  'stimulus',
  'items',
]);
const WRITTEN_IN_MEDIA = new Set(['alt', 'transcript', 'script']);
const WRITTEN_IN_STIMULUS = new Set(['title', 'body', 'transcript', 'script', 'media', 'alt']);

function writable(path: readonly string[]): boolean {
  const rest = path[0] === 'items' && path.length > 2 ? path.slice(2) : path;
  const [first, second, third] = rest;
  if (first === undefined || !WRITTEN_FIELDS.has(first)) {
    return false;
  }
  if (first === 'media') {
    return second !== undefined && WRITTEN_IN_MEDIA.has(second);
  }
  if (first === 'stimulus') {
    if (second === 'media') {
      return third !== undefined && WRITTEN_IN_MEDIA.has(third);
    }
    return second !== undefined && WRITTEN_IN_STIMULUS.has(second);
  }
  if (first === 'options' && rest[2] === 'media') {
    return rest[3] !== undefined && WRITTEN_IN_MEDIA.has(rest[3]);
  }
  return true;
}

/** Where the model wrote what a problem names. */
function pathForModel(variant: AiGeneratedVariant, problem: AiDraftProblem): string[] {
  const { path, code } = problem;
  const prefix = path[0] === 'items' && path.length > 2 ? path.slice(0, 2) : [];
  const rest = path.slice(prefix.length);
  if (code === 'ra_text_long_for_time') {
    return [...prefix, 'referenceText'];
  }
  if (rest[0] === 'gaps' && rest.length === 3 && rest[2] === 'correctChoiceId') {
    const item = prefix.length > 0 ? listOf(variant.entry.items)[Number(prefix[1])] : variant.entry;
    const gap = isRecord(item) ? listOf(item.gaps)[Number(rest[1])] : undefined;
    return [
      ...prefix,
      'gaps',
      rest[1] as string,
      isRecord(gap) && gap.bankId !== undefined ? 'answer' : 'choices',
    ];
  }
  if (
    rest[0] === 'stimulus' &&
    rest[1] === 'media' &&
    (rest[2] === 'script' || rest[2] === 'transcript')
  ) {
    return ['stimulus', rest[2]];
  }
  return [...path];
}

function problemsOf(variant: AiGeneratedVariant): AiDraftProblem[] {
  return [
    ...variant.mismatches.map(
      (found): AiDraftProblem => ({
        path: found.path,
        code: found.code,
        message: found.message,
        severity: 'invalid',
      }),
    ),
    ...variant.validation.issues
      .filter((found) => found.code !== 'media_url_required')
      .map(
        (found): AiDraftProblem => ({
          path: found.path,
          code: found.code,
          message: found.message,
          severity: found.severity,
        }),
      ),
    ...variant.findings
      .filter((found) => found.severity === 'warning')
      .map(
        (found): AiDraftProblem => ({
          path: found.path,
          code: found.code,
          message: found.message,
          severity: 'warning',
        }),
      ),
  ]
    .map((problem) => ({ ...problem, path: pathForModel(variant, problem) }))
    .filter((problem) => writable(problem.path));
}

/**
 * A second request, for the variants with something the model can fix —
 * a wrong type or structure, an issue other than a missing file, or a warning
 * at a field the model writes — and the exemplars the reply wrote nothing for
 * (`variant_missing`). Each comes with its problems at the paths the model
 * wrote; the exemplar and its targets stay in the facts. `null` when there is
 * nothing to repair.
 *
 * The reply holds one variant for each, naming its exemplar;
 * {@link checkAiVariants} reads it.
 */
export function aiVariantsRepairRequest(
  request: AiVariantsRequest,
  variants: AiVariants | AiVariantsRun | readonly AiGeneratedVariant[],
): AiVariantsRequest | null {
  const list: readonly AiGeneratedVariant[] = Array.isArray(variants)
    ? (variants as readonly AiGeneratedVariant[])
    : (variants as AiVariants).variants;
  const missing: readonly AiVariantMissing[] = Array.isArray(variants)
    ? []
    : (variants as AiVariants).missing;
  const repair = [
    ...list.flatMap((one) => {
      const problems = problemsOf(one);
      return problems.length === 0
        ? []
        : [{ exemplar: one.exemplarIndex, variant: one.generated, problems }];
    }),
    ...missing.map((one) => ({
      exemplar: one.exemplarIndex,
      problems: [{ path: [], code: one.code, message: one.message, severity: 'invalid' as const }],
    })),
  ].sort((a, b) => a.exemplar - b.exemplar);
  if (repair.length === 0) {
    return null;
  }
  const { repair: _previous, ...first } = request;
  return {
    ...first,
    shape: replyShape(
      repair.map((one) => request.exemplars[one.exemplar] as Fields),
      repair.length,
    ),
    repair,
  };
}

// ── The loop ───────────────────────────────────────────────────────────

const RANK = { complete: 2, incomplete: 1, invalid: 0 } as const;

const invalidCount = (one: AiGeneratedVariant): number =>
  one.mismatches.length +
  one.validation.issues.filter((found) => found.severity === 'invalid').length;
const warningCount = (one: AiGeneratedVariant): number =>
  one.findings.filter((found) => found.severity === 'warning').length;

/** Whether a repaired variant is at least as good as the one it would replace. */
function noWorse(repaired: AiGeneratedVariant, before: AiGeneratedVariant): boolean {
  const now = RANK[repaired.status];
  const was = RANK[before.status];
  if (now !== was) {
    return now > was;
  }
  if (invalidCount(repaired) !== invalidCount(before)) {
    return invalidCount(repaired) < invalidCount(before);
  }
  return warningCount(repaired) <= warningCount(before);
}

/**
 * Writes variants of existing items, with a bounded repair loop: asks the port
 * with `request`, reads the reply as {@link checkAiVariants} does, then — up
 * to `repairs` times — sends back what the model can fix and what it did not
 * write ({@link aiVariantsRepairRequest}), keeping each variant's best pass:
 * by status, then fewer invalid problems, then fewer warnings. A repaired
 * variant keeps its id. With `balanceKeyPositions`, the keys are spread once,
 * over the variants as they end.
 *
 * Never throws for a model's failure: a port that throws or a reply the SDK
 * refuses ends the loop, and is recorded in `calls` beside the provenance and
 * usage of every call. A first call that fails leaves no variants. A request
 * with no exemplar to vary makes no call.
 *
 * ```ts
 * const run = await generateVariants({
 *   request: aiVariantsRequest({ exemplars: section, level: 'CEFR B1', avoid: otherForms }),
 *   port: (request) => callMyModel(VARIANTS_PROMPT, request),
 *   newId: () => crypto.randomUUID(),
 * });
 * // run.variants: store each as proposed, for a person to approve.
 * ```
 *
 * @throws RangeError when `repairs` is not a whole number from 0 to
 *   {@link AI_VARIANTS_MAX_REPAIRS} (default 1), and Error when `newId` returns
 *   an empty or repeated id.
 */
export async function generateVariants(input: {
  request: AiVariantsRequest;
  port: (request: AiVariantsRequest) => Promise<unknown> | unknown;
  newId: () => string;
  repairs?: number;
}): Promise<AiVariantsRun> {
  const { request, port, newId } = input;
  const repairs = input.repairs ?? 1;
  if (!Number.isInteger(repairs) || repairs < 0 || repairs > AI_VARIANTS_MAX_REPAIRS) {
    throw new RangeError(
      `generateVariants: repairs must be a whole number from 0 to ${AI_VARIANTS_MAX_REPAIRS}, not ${String(repairs)}.`,
    );
  }
  const calls: AiDraftsCall[] = [];
  const skipped = request.skipped;
  if (request.facts.exemplars.length === 0) {
    return { variants: [], missing: [], findings: [], skipped, calls };
  }
  // One source of ids for the whole run, so no id is issued twice across passes.
  const ids = idSource(newId, 'generateVariants');

  const ask = async (
    asked: AiVariantsRequest,
    keep: ReadonlyMap<number, string>,
  ): Promise<
    { built: Built[]; variants: AiGeneratedVariant[]; missing: AiVariantMissing[] } | undefined
  > => {
    let raw: unknown;
    try {
      raw = await port(asked);
    } catch (error) {
      calls.push({ ok: false, error: error instanceof Error ? error.message : String(error) });
      return undefined;
    }
    const result = read(raw, asked, ids, keep);
    if (!result.ok) {
      calls.push({ ok: false, refusal: result.refusal });
      return undefined;
    }
    const provenance = provenanceOf(result.raw.provenance);
    const usage = usageOf(result.raw.usage);
    calls.push({
      ok: true,
      ...(provenance !== undefined ? { provenance } : {}),
      ...(usage !== undefined ? { usage } : {}),
    });
    return {
      built: result.built,
      variants: result.built.map((one) => evaluate(one, request)),
      missing: result.missing,
    };
  };

  const first = await ask(request, new Map());
  if (first === undefined) {
    return { variants: [], missing: [], findings: [], skipped, calls };
  }
  const best = new Map<number, { built: Built; variant: AiGeneratedVariant }>();
  first.variants.forEach((variant, index) => {
    best.set(variant.exemplarIndex, { built: first.built[index] as Built, variant });
  });
  const wanted = request.facts.exemplars.map((one) => one.exemplar);
  const missingNow = () => wanted.filter((index) => !best.has(index)).map(missingOf);

  for (let pass = 0; pass < repairs; pass += 1) {
    const repairRequest = aiVariantsRepairRequest(request, {
      variants: [...best.values()].map((one) => one.variant),
      missing: missingNow(),
      findings: [],
    });
    if (repairRequest === null) {
      break;
    }
    const keep = new Map(
      (repairRequest.repair ?? []).flatMap((one) => {
        const before = best.get(one.exemplar);
        return before !== undefined
          ? [[one.exemplar, stringOf(before.variant.entry.id)] as const]
          : [];
      }),
    );
    const repaired = await ask(repairRequest, keep);
    if (repaired === undefined) {
      break;
    }
    repaired.variants.forEach((variant, index) => {
      const before = best.get(variant.exemplarIndex);
      if (before === undefined || noWorse(variant, before.variant)) {
        best.set(variant.exemplarIndex, { built: repaired.built[index] as Built, variant });
      }
    });
  }

  const ended = [...best.values()].sort(
    (a, b) => a.variant.exemplarIndex - b.variant.exemplarIndex,
  );
  const seed = request.balanceKeyPositions?.seed;
  const variants =
    seed !== undefined
      ? balanceKeys(
          ended.map((one) => one.built),
          seed,
        ).map((one) => evaluate(one, request))
      : ended.map((one) => one.variant);
  return { variants, missing: missingNow(), findings: setFindings(variants), skipped, calls };
}
