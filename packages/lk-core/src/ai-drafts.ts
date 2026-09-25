import { provenanceOf, usageOf } from './ai-text.js';
import { containsWords, fold } from './answer-leak.js';
import { keyPositionFinding } from './authoring/critique.js';
import {
  critiqueDraft,
  critiqueItemGroupDraft,
  validateDraft,
  validateItemGroupDraft,
} from './authoring/index.js';
import type { ActivityMedia } from './types/activity.js';
import type {
  AiDraftCaption,
  AiDraftProblem,
  AiDraftSettings,
  AiDraftSource,
  AiDrafts,
  AiDraftsCall,
  AiDraftsRequest,
  AiDraftsRun,
  AiDraftType,
  AiGeneratedDraft,
  AiRefusal,
  AiVideoDraft,
} from './types/ai.js';

/** The most drafts one request may ask for, and the most a reply may hold when it names no count. */
export const AI_DRAFTS_MAX_COUNT = 50;

/** The most repair passes `generateDrafts` makes. */
export const AI_DRAFTS_MAX_REPAIRS = 3;

const DRAFT_TYPES: readonly string[] = [
  'multiple-choice',
  'fill-in-the-blanks',
  'gap-select',
  'dictation',
  'read-aloud',
  'written-response',
] satisfies readonly AiDraftType[];

type Fields = Record<string, unknown>;

const isRecord = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// ── The shape a model writes ───────────────────────────────────────────

const text = (description: string) => ({ type: 'string', description });

const FEEDBACK = {
  type: 'object',
  description: 'Optional overall feedback, shown after answering.',
  properties: {
    correct: text('Shown when the learner passes.'),
    incorrect: text('Shown when the learner does not.'),
  },
};

/** Every field a model writes, and the shape of each. A name means one thing in every type that uses it. */
const FIELDS: Readonly<Record<string, Fields>> = {
  title: text(
    'A short name for the item, shown to the learner above it. Never the answer, or any part of it.',
  ),
  question: text('The question, as plain text.'),
  mode: {
    type: 'string',
    enum: ['single', 'multi'],
    description: '`single`: exactly one option is right. `multi`: one or more are.',
  },
  options: {
    type: 'array',
    minItems: 2,
    maxItems: 26,
    items: {
      type: 'object',
      required: ['text', 'isCorrect'],
      properties: {
        text: text('The option as the learner reads it.'),
        isCorrect: { type: 'boolean' },
        feedback: text('Why this option is right or wrong, shown after answering.'),
      },
    },
  },
  passage: text(
    'The passage as plain text, with {{1}}, {{2}}, … where each gap goes, numbered in the order they appear.',
  ),
  blanks: {
    type: 'array',
    minItems: 1,
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
        hint: text('Optional. Helps without giving the answer or any of its words.'),
      },
    },
  },
  gaps: {
    type: 'array',
    minItems: 1,
    description: 'One per gap, in the order the gaps appear: the first is {{1}}.',
    items: {
      type: 'object',
      required: ['choices'],
      properties: {
        choices: {
          type: 'array',
          minItems: 2,
          description: 'What the learner chooses from. Exactly one is right.',
          items: {
            type: 'object',
            required: ['text', 'isCorrect'],
            properties: { text: text('A choice.'), isCorrect: { type: 'boolean' } },
          },
        },
      },
    },
  },
  transcript: text(
    'What the learner hears and types: words from the source, as they are said there.',
  ),
  referenceText: text('What the learner reads aloud: a sentence or two from the source.'),
  instructions: text('Optional. How to read it, shown to the learner.'),
  prompt: text('The writing task, as plain text.'),
  minWords: { type: 'integer', minimum: 0 },
  maxWords: { type: 'integer', minimum: 1 },
  rubric: {
    type: 'object',
    description: 'Optional. What the writing is assessed on; every criterion is weighted equally.',
    properties: {
      criteria: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['name'],
          properties: { name: text('A short name.'), description: text('What it looks for.') },
        },
      },
    },
  },
  feedback: FEEDBACK,
};

/** The fields a model writes for each type: a draft's own names, never an id or a setting. */
const WRITES: Readonly<Record<AiDraftType, readonly string[]>> = {
  'multiple-choice': ['title', 'question', 'mode', 'options', 'feedback'],
  'fill-in-the-blanks': ['title', 'passage', 'blanks', 'feedback'],
  'gap-select': ['title', 'passage', 'gaps', 'feedback'],
  dictation: ['title', 'transcript', 'feedback'],
  'read-aloud': ['title', 'referenceText', 'instructions', 'feedback'],
  'written-response': ['title', 'prompt', 'minWords', 'maxWords', 'rubric'],
};

/**
 * One draft, as a model writes it: its `type`, and the fields that type uses —
 * one object for every chosen type, since a structured output that must pick
 * between schemas is the thing providers support least.
 */
function itemShape(types: readonly AiDraftType[], captions: boolean): Fields {
  const properties: Fields = {
    type: {
      type: 'string',
      enum: [...types],
      description: `The item's type, and the fields it fills. ${types
        .map((type) => `${type}: ${WRITES[type].filter((name) => name !== 'title').join(', ')}`)
        .join('. ')}.`,
    },
  };
  for (const type of types) {
    for (const name of WRITES[type]) {
      properties[name] = FIELDS[name];
    }
  }
  if (captions) {
    properties.caption = {
      type: 'integer',
      minimum: 0,
      description: 'The index of the caption the item is about. It opens when that caption ends.',
    };
  }
  return {
    type: 'object',
    required: captions ? ['type', 'title', 'caption'] : ['type', 'title'],
    properties,
  };
}

/** A reply of up to `max` drafts — exactly `exactly` on a repair. */
function replyShape(
  types: readonly AiDraftType[],
  captions: boolean,
  max: number,
  exactly?: number,
): Fields {
  return {
    type: 'object',
    required: ['drafts'],
    properties: {
      drafts: {
        type: 'array',
        ...(exactly !== undefined ? { minItems: exactly, maxItems: exactly } : { maxItems: max }),
        items: itemShape(types, captions),
      },
    },
  };
}

// ── The request ────────────────────────────────────────────────────────

/**
 * What a model is given to draft items from a source, or `null` when there is
 * no source to draft from: an empty text, or no caption with words in it.
 *
 * `types` are the ones the author chose, in the author's order: the model
 * leans on the first, and where several drafts share a moment of a video — or
 * the end of one — they are shown in this order. `count` is how many to write
 * at most; left out, the model writes as many as the source is worth, up to
 * {@link AI_DRAFTS_MAX_COUNT}.
 *
 * The facts are the source — a caption list numbered, with its times in
 * seconds — the types, the count, and the language, level and instructions
 * the author gave. `shape` is the JSON Schema of the reply: each draft names
 * its type and writes that type's own fields, with no ids, no HTML, no media
 * and no settings. Those are not a model's to write. `settings` are yours, put
 * on every draft of a type: a read-aloud's `recording` and `scoring`, say, which
 * the SDK has no default for.
 *
 * @throws RangeError when `types` is empty, repeats a type or names one a model
 *   does not draft, or `count` is not a whole number from 1 to
 *   {@link AI_DRAFTS_MAX_COUNT}.
 */
export function aiDraftsRequest(input: {
  types: readonly AiDraftType[];
  source: AiDraftSource;
  count?: number;
  locale?: string;
  level?: string;
  instructions?: string;
  settings?: AiDraftSettings;
}): AiDraftsRequest | null {
  const { types, source, count, locale, level, instructions, settings } = input;
  if (
    !Array.isArray(types) ||
    types.length === 0 ||
    new Set(types).size !== types.length ||
    !types.every((type) => DRAFT_TYPES.includes(type))
  ) {
    throw new RangeError(
      `aiDraftsRequest: types must be one or more of ${DRAFT_TYPES.join(', ')}, each once, in the author's order.`,
    );
  }
  if (
    count !== undefined &&
    (!Number.isInteger(count) || count < 1 || count > AI_DRAFTS_MAX_COUNT)
  ) {
    throw new RangeError(
      `aiDraftsRequest: count must be a whole number from 1 to ${AI_DRAFTS_MAX_COUNT}, or left out, not ${String(count)}.`,
    );
  }
  let facts: AiDraftsRequest['facts']['source'];
  if (source.kind === 'captions') {
    const captions: AiDraftCaption[] = (Array.isArray(source.cues) ? source.cues : []).flatMap(
      (cue, index) =>
        isRecord(cue) &&
        typeof cue.text === 'string' &&
        cue.text.trim() !== '' &&
        Number.isFinite(cue.start) &&
        Number.isFinite(cue.end)
          ? [{ index, start: cue.start, end: cue.end, text: cue.text }]
          : [],
    );
    if (captions.length === 0) {
      return null;
    }
    facts = { kind: 'captions', captions };
  } else {
    if (typeof source.text !== 'string' || source.text.trim() === '') {
      return null;
    }
    facts = { kind: source.kind, text: source.text };
  }
  return {
    feature: 'draft-generation',
    facts: {
      activityTypes: [...types],
      source: facts,
      ...(count !== undefined ? { count } : {}),
      ...(locale !== undefined ? { locale } : {}),
      ...(level !== undefined ? { level } : {}),
      ...(instructions !== undefined ? { instructions } : {}),
    },
    shape: replyShape(types, facts.kind === 'captions', count ?? AI_DRAFTS_MAX_COUNT),
    ...(settings !== undefined ? { settings } : {}),
  };
}

// ── From a reply to drafts ─────────────────────────────────────────────

const stringOf = (value: unknown): string => (typeof value === 'string' ? value : '');
const listOf = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);
const written = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;

function feedbackOf(entry: Fields): Fields {
  if (!isRecord(entry.feedback)) {
    return {};
  }
  const correct = written(entry.feedback.correct);
  const incorrect = written(entry.feedback.incorrect);
  return correct === undefined && incorrect === undefined
    ? {}
    : {
        feedback: {
          ...(correct !== undefined ? { correct } : {}),
          ...(incorrect !== undefined ? { incorrect } : {}),
        },
      };
}

/** A type's content, read from what a model wrote. */
function contentOf(type: AiDraftType, entry: Fields, newId: () => string): Fields {
  switch (type) {
    case 'multiple-choice':
      return {
        question: stringOf(entry.question),
        ...(typeof entry.mode === 'string' ? { mode: entry.mode } : {}),
        options: listOf(entry.options).map((option) => {
          const fields = isRecord(option) ? option : {};
          const feedback = written(fields.feedback);
          return {
            id: newId(),
            text: stringOf(fields.text),
            isCorrect: fields.isCorrect === true,
            ...(feedback !== undefined ? { feedback } : {}),
          };
        }),
        ...feedbackOf(entry),
      };
    case 'fill-in-the-blanks':
      return {
        passage: stringOf(entry.passage),
        blanks: listOf(entry.blanks).map((blank, index) => {
          const fields = isRecord(blank) ? blank : {};
          const hint = written(fields.hint);
          return {
            id: String(index + 1),
            acceptedAnswers: listOf(fields.acceptedAnswers).filter(
              (answer): answer is string => typeof answer === 'string',
            ),
            ...(hint !== undefined ? { hint } : {}),
          };
        }),
        ...feedbackOf(entry),
      };
    case 'gap-select':
      return {
        passage: stringOf(entry.passage),
        gaps: listOf(entry.gaps).map((gap, index) => {
          const marked = listOf(isRecord(gap) ? gap.choices : undefined);
          const choices = marked.map((choice) => ({
            id: newId(),
            text: stringOf(isRecord(choice) ? choice.text : undefined),
          }));
          // Exactly one marked right is a key; none, or several, is no key —
          // which validateDraft asks for, and a repair then supplies.
          const right = marked.flatMap((choice, at) =>
            isRecord(choice) && choice.isCorrect === true ? [at] : [],
          );
          return {
            id: String(index + 1),
            choices,
            correctChoiceId: right.length === 1 ? choices[right[0] as number]?.id : '',
          };
        }),
        ...feedbackOf(entry),
      };
    case 'dictation':
      return { transcript: stringOf(entry.transcript), ...feedbackOf(entry) };
    case 'read-aloud': {
      const instructions = written(entry.instructions);
      return {
        referenceText: stringOf(entry.referenceText),
        ...(instructions !== undefined ? { instructions } : {}),
        ...feedbackOf(entry),
      };
    }
    default: {
      const criteria = listOf(isRecord(entry.rubric) ? entry.rubric.criteria : undefined);
      return {
        prompt: stringOf(entry.prompt),
        ...(entry.minWords !== undefined ? { minWords: entry.minWords } : {}),
        ...(entry.maxWords !== undefined ? { maxWords: entry.maxWords } : {}),
        ...(criteria.length > 0
          ? {
              rubric: {
                criteria: criteria.map((criterion) => {
                  const fields = isRecord(criterion) ? criterion : {};
                  const description = written(fields.description);
                  return {
                    name: stringOf(fields.name),
                    ...(description !== undefined ? { description } : {}),
                    weight: 1,
                  };
                }),
              },
            }
          : {}),
      };
    }
  }
}

/**
 * What a new draft of a type starts with, where the model writes nothing: a
 * scoring strategy on the three that have one — `all-or-nothing`, as a new
 * draft has — and a read-aloud's recording and scoring left unset, as a new
 * draft leaves them, for the host's settings or the author to fill.
 */
function startOf(type: AiDraftType): Fields {
  switch (type) {
    case 'multiple-choice':
    case 'fill-in-the-blanks':
    case 'gap-select':
      return { scoringStrategy: 'all-or-nothing' };
    case 'read-aloud':
      return { recording: { maxSeconds: 0 }, scoring: { dimensions: [] } };
    default:
      return {};
  }
}

/**
 * A draft from what a model wrote. Lenient: every field it can read is kept as
 * written, and anything it cannot is left for `validateDraft` to name — which
 * is what a repair tells the model. Ids are the host's; a blank's and a gap's
 * are the numbers of their placeholders, as the passage names them. In order:
 * what a new draft starts with, the language asked for, the host's settings,
 * then what the model wrote — so a setting never overrides the content, and
 * nothing overrides what the draft is.
 */
function draftFrom(
  type: AiDraftType,
  entry: Fields,
  id: string,
  newId: () => string,
  request: AiDraftsRequest,
): Fields {
  const locale = request.facts.locale;
  return {
    ...startOf(type),
    ...(locale !== undefined ? { locale } : {}),
    ...request.settings?.[type],
    title: stringOf(entry.title),
    ...contentOf(type, entry, newId),
    schemaVersion: '1.0',
    type,
    id,
  };
}

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

/** Drafts in the author's order of types, and within a type in the order the model wrote them. */
function inAuthorsOrder(
  drafts: readonly AiGeneratedDraft[],
  types: readonly AiDraftType[],
): AiGeneratedDraft[] {
  return [...drafts].sort(
    (a, b) => types.indexOf(a.type) - types.indexOf(b.type) || a.index - b.index,
  );
}

function check(
  raw: unknown,
  request: AiDraftsRequest,
  newId: () => string,
  keep: readonly (string | undefined)[] = [],
): { ok: true; drafts: AiDrafts } | { ok: false; refusal: AiRefusal } {
  const types = request.facts.activityTypes;
  if (
    !isRecord(raw) ||
    !Array.isArray(raw.drafts) ||
    !raw.drafts.every((entry) => isRecord(entry) && types.includes(entry.type as AiDraftType))
  ) {
    return { ok: false, refusal: 'malformed' };
  }
  const entries = raw.drafts as Fields[];
  const repair = request.repair;
  const most = request.facts.count ?? AI_DRAFTS_MAX_COUNT;
  if (repair !== undefined ? entries.length !== repair.length : entries.length > most) {
    return { ok: false, refusal: repair !== undefined ? 'malformed' : 'too-long' };
  }
  const source = request.facts.source;
  const drafts = entries.map((entry, position): AiGeneratedDraft => {
    const type = entry.type as AiDraftType;
    const draft = draftFrom(type, entry, keep[position] ?? newId(), newId, request);
    const caption =
      source.kind === 'captions' && Number.isInteger(entry.caption)
        ? source.captions.find((one) => one.index === entry.caption)
        : undefined;
    // A dictation's recording can be cut from the video only where the video
    // says its words: the caption it named, holding its transcript.
    const said = fold(stringOf(entry.transcript));
    const clip =
      type === 'dictation' && caption !== undefined && containsWords(fold(caption.text), said)
        ? { start: caption.start, end: caption.end }
        : undefined;
    return {
      index: repair !== undefined ? (repair[position]?.index as number) : position,
      type,
      draft,
      validation: validateDraft(type, draft),
      findings: critiqueDraft(type, draft),
      ...(caption !== undefined ? { at: caption.end } : {}),
      ...(clip !== undefined ? { clip } : {}),
      generated: entry,
    };
  });
  const ordered = inAuthorsOrder(drafts, types);
  const provenance = provenanceOf(raw.provenance);
  const usage = usageOf(raw.usage);
  return {
    ok: true,
    drafts: {
      drafts: ordered,
      findings: keyPositionFinding(
        ordered.map((one) => one.draft),
        [],
      ),
      ...(provenance !== undefined ? { provenance } : {}),
      ...(usage !== undefined ? { usage } : {}),
    },
  };
}

/**
 * Reads a model's reply to {@link aiDraftsRequest} into drafts an editor can
 * show for approval: each with ids from `newId`, your settings for its type,
 * what `validateDraft` says of it, what the item critic finds in it, and — from
 * captions — where it goes, and for a dictation the stretch of the video that
 * says its words. They come back in the author's order of types.
 *
 * Drafts are independent: one that is unfinished or wrong is returned as such,
 * for an author or {@link aiDraftsRepairRequest} to fix, beside the ones that
 * are complete. `complete` means valid, never approved: a model wrote it, and a
 * person decides whether learners see it. The whole reply is refused only when
 * it is not `{ drafts: [...] }` of objects of the chosen types (`malformed`), or
 * holds more drafts than asked for (`too-long`) — on a repair, not exactly one
 * per draft to fix (`malformed`).
 *
 * Only the fields a type's shape names are read: a model cannot set an id,
 * HTML, media, a switch or a scoring setting through this. A question is scored
 * `all-or-nothing` unless your settings say otherwise, a written response's
 * criteria are weighted equally, and a dictation carries no recording — attach
 * one, or cut it from the video at `clip`.
 *
 * @throws Error when `newId` returns an empty or repeated id.
 */
export function checkAiDrafts(
  raw: unknown,
  request: AiDraftsRequest,
  options: { newId: () => string },
): { ok: true; drafts: AiDrafts } | { ok: false; refusal: AiRefusal } {
  return check(raw, request, idSource(options.newId, 'checkAiDrafts'));
}

// ── Repair ─────────────────────────────────────────────────────────────

/**
 * Where a model wrote what a problem names: the draft's paths, but a gap's key
 * is its choices, and a reading too long for the host's recording time is the
 * text the model chose.
 */
function pathForModel(type: AiDraftType, problem: AiDraftProblem): string[] {
  const { path, code } = problem;
  if (
    type === 'gap-select' &&
    path.length === 3 &&
    path[0] === 'gaps' &&
    path[2] === 'correctChoiceId'
  ) {
    return ['gaps', path[1] as string, 'choices'];
  }
  return code === 'ra_text_long_for_time' ? ['referenceText'] : [...path];
}

/**
 * What is wrong with a draft that the model can fix: every issue and warning
 * at a field the model writes. A read-aloud with no recording time, or a
 * dictation in a video with no recording, is the host's to finish, and is not
 * sent back.
 */
function problemsOf(one: AiGeneratedDraft): AiDraftProblem[] {
  const writes = WRITES[one.type];
  return [
    ...one.validation.issues.map(
      (found): AiDraftProblem => ({
        path: found.path,
        code: found.code,
        message: found.message,
        severity: found.severity,
      }),
    ),
    ...one.findings
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
    .map((problem) => ({ ...problem, path: pathForModel(one.type, problem) }))
    .filter((problem) => writes.includes(problem.path[0] as string));
}

/**
 * A second request, for the drafts with something wrong the model can fix —
 * unfinished, wrong, or a flaw the critic warns about, at a field the model
 * writes — each as the model wrote it, with those problems at the paths the
 * model wrote. `null` when there is none.
 *
 * The reply holds one draft for each, in order; {@link checkAiDrafts} reads it
 * and gives each the `index` of the draft it replaces.
 */
export function aiDraftsRepairRequest(
  request: AiDraftsRequest,
  drafts: AiDrafts | readonly AiGeneratedDraft[],
): AiDraftsRequest | null {
  const list: readonly AiGeneratedDraft[] = 'drafts' in drafts ? drafts.drafts : drafts;
  const repair = list.flatMap((one) => {
    const problems = problemsOf(one);
    return problems.length === 0 ? [] : [{ index: one.index, draft: one.generated, problems }];
  });
  if (repair.length === 0) {
    return null;
  }
  const { repair: _previous, ...first } = request;
  return {
    ...first,
    shape: replyShape(
      request.facts.activityTypes,
      request.facts.source.kind === 'captions',
      repair.length,
      repair.length,
    ),
    repair,
  };
}

// ── The loop ───────────────────────────────────────────────────────────

const RANK = { complete: 2, incomplete: 1, invalid: 0 } as const;

/** Whether a repaired draft is at least as good as the one it would replace. */
function noWorse(repaired: AiGeneratedDraft, before: AiGeneratedDraft): boolean {
  const warnings = (one: AiGeneratedDraft): number =>
    one.findings.filter((found) => found.severity === 'warning').length;
  const now = RANK[repaired.validation.status];
  const was = RANK[before.validation.status];
  return now > was || (now === was && warnings(repaired) <= warnings(before));
}

/**
 * Drafts items from a source, with a bounded repair loop: asks the port with
 * `request`, reads the reply with {@link checkAiDrafts}, then — up to `repairs`
 * times — sends back the drafts with something wrong the model can fix
 * ({@link aiDraftsRepairRequest}), and keeps a repaired draft only when it is
 * no worse than the one it replaces. A repaired draft keeps its id.
 *
 * Never throws for a model's failure: a port that throws or a reply the SDK
 * refuses ends the loop, and is recorded in `calls` beside the provenance and
 * usage of every call — which the SDK never adds up. A first call that fails
 * leaves no drafts.
 *
 * ```ts
 * const run = await generateDrafts({
 *   request: aiDraftsRequest({ types: ['multiple-choice', 'dictation'], source: { kind: 'transcript', text } }),
 *   port: (request) => callMyModel(DRAFTS_PROMPT, request),
 *   newId: () => crypto.randomUUID(),
 * });
 * // run.drafts: store each as proposed, for a person to approve.
 * ```
 *
 * @throws RangeError when `repairs` is not a whole number from 0 to
 *   {@link AI_DRAFTS_MAX_REPAIRS} (default 1), and Error when `newId` returns an
 *   empty or repeated id.
 */
export async function generateDrafts(input: {
  request: AiDraftsRequest;
  port: (request: AiDraftsRequest) => Promise<unknown> | unknown;
  newId: () => string;
  repairs?: number;
}): Promise<AiDraftsRun> {
  const { request, port, newId } = input;
  const repairs = input.repairs ?? 1;
  if (!Number.isInteger(repairs) || repairs < 0 || repairs > AI_DRAFTS_MAX_REPAIRS) {
    throw new RangeError(
      `generateDrafts: repairs must be a whole number from 0 to ${AI_DRAFTS_MAX_REPAIRS}, not ${String(repairs)}.`,
    );
  }
  const calls: AiDraftsCall[] = [];
  // One source of ids for the whole run, so no id is issued twice across passes.
  const ids = idSource(newId, 'generateDrafts');

  const ask = async (
    asked: AiDraftsRequest,
    keep: readonly (string | undefined)[],
  ): Promise<AiDrafts | undefined> => {
    let raw: unknown;
    try {
      raw = await port(asked);
    } catch (error) {
      calls.push({ ok: false, error: error instanceof Error ? error.message : String(error) });
      return undefined;
    }
    const checked = check(raw, asked, ids, keep);
    if (!checked.ok) {
      calls.push({ ok: false, refusal: checked.refusal });
      return undefined;
    }
    const { provenance, usage } = checked.drafts;
    calls.push({
      ok: true,
      ...(provenance !== undefined ? { provenance } : {}),
      ...(usage !== undefined ? { usage } : {}),
    });
    return checked.drafts;
  };

  const first = await ask(request, []);
  if (first === undefined) {
    return { drafts: [], findings: [], calls };
  }
  let current = first.drafts;
  for (let pass = 0; pass < repairs; pass += 1) {
    const repairRequest = aiDraftsRepairRequest(request, current);
    if (repairRequest === null) {
      break;
    }
    const keep = (repairRequest.repair ?? []).map((wanted) => {
      const before = current.find((one) => one.index === wanted.index);
      return typeof before?.draft.id === 'string' ? before.draft.id : undefined;
    });
    const repaired = await ask(repairRequest, keep);
    if (repaired === undefined) {
      break;
    }
    current = current.map((before) => {
      const after = repaired.drafts.find((one) => one.index === before.index);
      return after !== undefined && noWorse(after, before) ? after : before;
    });
  }
  return {
    drafts: current,
    findings: keyPositionFinding(
      current.map((one) => one.draft),
      [],
    ),
    calls,
  };
}

// ── An interactive video ───────────────────────────────────────────────

/** The source as one text, kept with the video as its author-only transcript. */
function sourceText(request: AiDraftsRequest): string {
  const source = request.facts.source;
  return source.kind === 'captions'
    ? source.captions.map((caption) => caption.text).join('\n')
    : source.text;
}

/**
 * An interactive video made of drafts: an item group whose stimulus is
 * `video`, whose items are the drafts, and whose timeline opens a quiz at each
 * moment a draft was placed — drafts placed at one moment share its quiz, in
 * the author's order of types — and one more at `durationSeconds` for every
 * draft placed nowhere: all of them when the source had no times.
 *
 * The SDK never reads the video, so it cannot know where the end is: without
 * `durationSeconds` that last quiz has no time yet, which
 * `validateItemGroupDraft` reports for the author to set. The source is kept on
 * the stimulus as its author-only `transcript`.
 *
 * Like every draft it is checked (`validateItemGroupDraft`) and critiqued
 * (`critiqueItemGroupDraft`), never approved. A dictation still needs its own
 * recording; a type a video does not take — a written response — is reported,
 * not dropped.
 *
 * @throws Error when `newId` returns an empty or repeated id.
 */
export function interactiveVideoFromDrafts(input: {
  request: AiDraftsRequest;
  drafts: AiDrafts | AiDraftsRun | readonly AiGeneratedDraft[];
  video: ActivityMedia;
  durationSeconds?: number;
  title?: string;
  newId: () => string;
}): AiVideoDraft {
  const { request, drafts, video, durationSeconds, title } = input;
  const ids = idSource(input.newId, 'interactiveVideoFromDrafts');
  const types = request.facts.activityTypes;
  const list: readonly AiGeneratedDraft[] = 'drafts' in drafts ? drafts.drafts : drafts;
  const end =
    typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) && durationSeconds >= 0
      ? durationSeconds
      : undefined;
  // When each draft opens: its caption's end, or the end of the video.
  const placed = list.map((one) => ({ one, at: one.at ?? end }));
  const ordered = [...placed].sort(
    (a, b) =>
      (a.at ?? Number.POSITIVE_INFINITY) - (b.at ?? Number.POSITIVE_INFINITY) ||
      types.indexOf(a.one.type) - types.indexOf(b.one.type) ||
      a.one.index - b.one.index,
  );
  const cues: { id: string; at?: number; itemIds: string[] }[] = [];
  for (const { one, at } of ordered) {
    const itemId = String(one.draft.id);
    const last = cues[cues.length - 1];
    if (last !== undefined && last.at === at) {
      last.itemIds.push(itemId);
    } else {
      cues.push({ id: ids(), ...(at !== undefined ? { at } : {}), itemIds: [itemId] });
    }
  }
  const group = {
    schemaVersion: '1.0',
    type: 'item-group',
    id: ids(),
    ...(title !== undefined ? { title } : {}),
    stimulus: { id: ids(), kind: 'video', media: video, transcript: sourceText(request) },
    items: ordered.map(({ one }) => one.draft),
    timeline: { cues },
  };
  return {
    group,
    validation: validateItemGroupDraft(group),
    findings: critiqueItemGroupDraft(group),
  };
}
