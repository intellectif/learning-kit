import { fold, passageWithoutPlaceholders, placeholderOrder } from './answer-leak.js';
import { canonicalJson } from './content-hash.js';
import { policyFor } from './scoring/activity-scorers/fill-in-the-blanks.js';
import type { BlankConfig } from './types/activity.js';

/**
 * What makes two items parallel, as rules: their structure, the length of what
 * a learner reads or hears, whether one copies the other, and whether they
 * share a right answer. One module, read by the variants a model writes
 * (`checkAiVariants`), by the paper critic (`critiqueDrafts`) and by the
 * comparison of two forms (`critiqueVersions`), so the three never disagree.
 *
 * Every rule reads content as stored, finished or not: it looks only at the
 * fields that are there and never throws.
 */

type Fields = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const listOf = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);
const stringOf = (value: unknown): string => (typeof value === 'string' ? value : '');
const same = (a: unknown, b: unknown): boolean =>
  canonicalJson(a ?? null) === canonicalJson(b ?? null);

/**
 * A passage's blanks or gaps in the order its placeholders appear, each with
 * its index in the list: the order a learner meets them, which is how two
 * items are compared and how a model writes them. The list's own order where
 * the passage does not name each of them once.
 */
export function inPassageOrder(
  item: Fields,
  field: 'blanks' | 'gaps',
): { at: number; value: unknown }[] {
  const list = listOf(item[field]);
  const order = typeof item.passage === 'string' ? placeholderOrder(item.passage) : [];
  const found = order.map((id) => list.findIndex((one) => isRecord(one) && one.id === id));
  if (
    found.length === list.length &&
    found.every((at) => at !== -1) &&
    new Set(found).size === found.length
  ) {
    return found.map((at) => ({ at, value: list[at] }));
  }
  return list.map((value, at) => ({ at, value }));
}

// ── Similarity ─────────────────────────────────────────────────────────

/**
 * How alike two texts must be to count as one copying the other: the share of
 * their word triples (3-word shingles) they have in common, as Jaccard
 * similarity. 0.5 means half of everything either text says, three words at a
 * time, is in the other.
 */
export const AI_VARIANT_NEAR_COPY_THRESHOLD = 0.5;

/** Texts shorter than this, in words, are compared whole: word triples say nothing about them. */
const SHORT_TEXT_WORDS = 6;

/**
 * The words of a text as every comparison here reads them: placeholders
 * (`{{1}}`) taken out, compatibility forms read as what they stand for, accents
 * and case ignored, and punctuation — typographic quotes included — gone.
 */
export function wordsOf(text: string): string[] {
  return fold(passageWithoutPlaceholders(text));
}

function triples(words: readonly string[]): Set<string> {
  const found = new Set<string>();
  for (let at = 0; at + 3 <= words.length; at += 1) {
    found.add(`${words[at]} ${words[at + 1]} ${words[at + 2]}`);
  }
  return found;
}

/**
 * How alike two texts are, from 0 to 1: the Jaccard similarity of their word
 * triples, or — when either has fewer than six words — 1 if they read the same
 * and 0 if not. A text with no words is like nothing.
 */
export function textSimilarity(a: string, b: string): number {
  const left = wordsOf(a);
  const right = wordsOf(b);
  if (left.length === 0 || right.length === 0) {
    return 0;
  }
  if (left.length < SHORT_TEXT_WORDS || right.length < SHORT_TEXT_WORDS) {
    return left.join(' ') === right.join(' ') ? 1 : 0;
  }
  const one = triples(left);
  const two = triples(right);
  let shared = 0;
  for (const triple of one) {
    if (two.has(triple)) {
      shared += 1;
    }
  }
  return shared / (one.size + two.size - shared);
}

/** A similarity as a message shows it: two decimals. */
export const shownScore = (score: number): string => score.toFixed(2);

// ── The texts of an item ───────────────────────────────────────────────

/**
 * What a text is, for comparing it with another: a question's own words
 * (`stem`: a question, a passage with gaps, a writing task), words a learner
 * hears or says (`spoken`: a dictation's transcript, a read-aloud's text), or
 * the material questions are about (`material`: a passage, a listening
 * script, what a recording says). Texts are compared with texts of their kind.
 */
export type TextKind = 'stem' | 'spoken' | 'material';

export interface ItemText {
  /** Where the text is, from the entry. */
  path: string[];
  kind: TextKind;
  /** Which length band applies: the material's, or an item text's. */
  band: 'material' | 'item';
  text: string;
}

const RECORDING_TYPES: readonly string[] = ['audio', 'video', 'embed'];

/** A recording's words: its script's turns, speakers left out, else its transcript. */
function recordingText(holder: Fields): { field: 'script' | 'transcript'; text: string } | null {
  const turns = listOf(holder.script).flatMap((turn) =>
    isRecord(turn) && typeof turn.text === 'string' && turn.text.trim() !== '' ? [turn.text] : [],
  );
  if (turns.length > 0) {
    return { field: 'script', text: turns.join('\n') };
  }
  return typeof holder.transcript === 'string' && holder.transcript.trim() !== ''
    ? { field: 'transcript', text: holder.transcript }
    : null;
}

function mediaTexts(media: unknown, at: readonly string[]): ItemText[] {
  if (!isRecord(media) || !RECORDING_TYPES.includes(stringOf(media.type))) {
    return [];
  }
  const said = recordingText(media);
  return said === null
    ? []
    : [{ path: [...at, said.field], kind: 'material', band: 'material', text: said.text }];
}

/** The fields an activity type keeps its own text in, and what each is. */
const OWN_TEXT: Readonly<Record<string, { field: string; kind: TextKind }>> = {
  'multiple-choice': { field: 'question', kind: 'stem' },
  'fill-in-the-blanks': { field: 'passage', kind: 'stem' },
  'gap-select': { field: 'passage', kind: 'stem' },
  'written-response': { field: 'prompt', kind: 'stem' },
  dictation: { field: 'transcript', kind: 'spoken' },
  'read-aloud': { field: 'referenceText', kind: 'spoken' },
};

/**
 * Every text of an entry a near copy or a length is judged on: an item's own
 * text and what its recording says; for an item group, its stimulus's passage
 * and recording, then each item's under `items.N`. A dictation's or a
 * read-aloud's recording says the item's own text, so it is not read twice.
 */
export function textsOf(entry: unknown): ItemText[] {
  if (!isRecord(entry)) {
    return [];
  }
  if (entry.type === 'item-group') {
    const stimulus = isRecord(entry.stimulus) ? entry.stimulus : {};
    const own = recordingText(stimulus);
    return [
      ...(typeof stimulus.body === 'string' && stimulus.body.trim() !== ''
        ? [
            {
              path: ['stimulus', 'body'],
              kind: 'material' as const,
              band: 'material' as const,
              text: stimulus.body,
            },
          ]
        : []),
      ...(own !== null
        ? [
            {
              path: ['stimulus', own.field],
              kind: 'material' as const,
              band: 'material' as const,
              text: own.text,
            },
          ]
        : mediaTexts(stimulus.media, ['stimulus', 'media'])),
      ...listOf(entry.items).flatMap((item, index) =>
        textsOf(item).map((found) => ({ ...found, path: ['items', String(index), ...found.path] })),
      ),
    ];
  }
  const own = OWN_TEXT[stringOf(entry.type)];
  if (own === undefined) {
    return [];
  }
  const text = entry[own.field];
  return [
    ...(typeof text === 'string' && text.trim() !== ''
      ? [{ path: [own.field], kind: own.kind, band: 'item' as const, text }]
      : []),
    ...(own.kind === 'spoken' ? [] : mediaTexts(entry.media, ['media'])),
  ];
}

// ── Keys ───────────────────────────────────────────────────────────────

/** A key as compared: folded, and kept in its case when its blank matches case. */
export function keyOf(text: string, caseSensitive = false): string {
  if (!caseSensitive) {
    return fold(text).join(' ');
  }
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * One place an item keeps a right answer: a multiple choice's correct options
 * (`options`), a blank (`blanks.N`) or a gap (`gaps.N`). `answers` are the
 * keys as compared, `shown` the first as written.
 */
export interface KeySlot {
  slot: string;
  path: string[];
  answers: string[];
  shown: string;
}

function choiceText(item: Fields, gap: Fields): string | undefined {
  const own = listOf(gap.choices);
  const bank = listOf(item.banks).find((one) => isRecord(one) && one.id === gap.bankId);
  const choices = own.length > 0 ? own : isRecord(bank) ? listOf(bank.choices) : [];
  const right = choices.find((choice) => isRecord(choice) && choice.id === gap.correctChoiceId);
  return isRecord(right) && typeof right.text === 'string' ? right.text : undefined;
}

/** The right answers of one item (not a group), slot by slot. */
export function keysOf(item: unknown): KeySlot[] {
  if (!isRecord(item)) {
    return [];
  }
  const slots: KeySlot[] = [];
  const add = (slot: string, path: string[], written: readonly string[], caseSensitive = false) => {
    const answers = [...new Set(written.map((one) => keyOf(one, caseSensitive)))].filter(
      (one) => one !== '',
    );
    if (answers.length > 0) {
      slots.push({ slot, path, answers, shown: (written[0] as string).trim() });
    }
  };
  if (item.type === 'multiple-choice') {
    const options = listOf(item.options);
    const first = options.findIndex((option) => isRecord(option) && option.isCorrect === true);
    add(
      'options',
      ['options', String(first), 'text'],
      options.flatMap((option) =>
        isRecord(option) && option.isCorrect === true && typeof option.text === 'string'
          ? [option.text]
          : [],
      ),
    );
  } else if (item.type === 'fill-in-the-blanks') {
    inPassageOrder(item, 'blanks').forEach(({ at, value: blank }, position) => {
      if (isRecord(blank)) {
        add(
          `blanks.${position}`,
          ['blanks', String(at), 'acceptedAnswers'],
          listOf(blank.acceptedAnswers).filter((one): one is string => typeof one === 'string'),
          policyFor(blank as unknown as BlankConfig).caseSensitive === true,
        );
      }
    });
  } else if (item.type === 'gap-select') {
    inPassageOrder(item, 'gaps').forEach(({ at, value: gap }, position) => {
      const text = isRecord(gap) ? choiceText(item, gap) : undefined;
      if (text !== undefined) {
        add(`gaps.${position}`, ['gaps', String(at), 'correctChoiceId'], [text]);
      }
    });
  }
  return slots;
}

/** The answers two key slots share, as the first slot writes them. */
export function sharedAnswers(a: KeySlot, b: KeySlot): string[] {
  return a.answers.filter((answer) => b.answers.includes(answer));
}

/** A multiple choice's options as a set of texts, for "the same options in another order". */
export function optionSet(item: unknown): string[] | null {
  if (!isRecord(item) || item.type !== 'multiple-choice') {
    return null;
  }
  const texts = listOf(item.options).map((option) =>
    isRecord(option) ? fold(stringOf(option.text)).join(' ') : '',
  );
  return texts.length === 0 || texts.some((one) => one === '') ? null : [...texts].sort();
}

// ── Length ─────────────────────────────────────────────────────────────

/**
 * How far a parallel text may stray from its exemplar's length, in words:
 * `ratio` of the exemplar's words either way, and never less than `minWords`.
 * Material — a passage, a listening script, what a recording says — is held
 * closer than an item's own text, because how much a candidate reads or hears
 * is what makes one form of a part harder than another.
 */
export const AI_VARIANT_LENGTH_BANDS = {
  material: { ratio: 0.1, minWords: 5 },
  item: { ratio: 0.25, minWords: 2 },
} as const;

/** A host's own ratios, overriding the bands above: `{ material: 0.15 }`. */
export interface LengthTolerance {
  material?: number;
  item?: number;
}

/** Inclusive bounds, in words, for a text the exemplar writes in `words` words. */
export function lengthBand(
  words: number,
  band: 'material' | 'item',
  tolerance: LengthTolerance = {},
): [number, number] {
  const rule = AI_VARIANT_LENGTH_BANDS[band];
  const asked = tolerance[band];
  const ratio =
    typeof asked === 'number' && Number.isFinite(asked) && asked >= 0 ? asked : rule.ratio;
  const leeway = Math.max(words * ratio, rule.minWords);
  return [Math.max(0, Math.ceil(words - leeway - 1e-9)), Math.floor(words + leeway + 1e-9)];
}

/** Every text of an entry with its band: path, kind and bounds. */
export function lengthTargets(
  entry: unknown,
  tolerance?: LengthTolerance,
): { path: string[]; band: 'material' | 'item'; words: number; bounds: [number, number] }[] {
  return textsOf(entry).map((found) => {
    const words = wordsOf(found.text).length;
    return {
      path: found.path,
      band: found.band,
      words,
      bounds: lengthBand(words, found.band, tolerance),
    };
  });
}

export interface LengthMiss {
  path: string[];
  band: 'material' | 'item';
  words: number;
  bounds: [number, number];
  exemplarWords: number;
}

/** The texts of `candidate` whose length falls outside the band of the same text in `exemplar`. */
export function lengthMisses(
  exemplar: unknown,
  candidate: unknown,
  tolerance?: LengthTolerance,
): LengthMiss[] {
  const theirs = new Map(textsOf(candidate).map((found) => [found.path.join('.'), found]));
  return lengthTargets(exemplar, tolerance).flatMap((target) => {
    const found = theirs.get(target.path.join('.'));
    if (found === undefined) {
      return [];
    }
    const words = wordsOf(found.text).length;
    return words < target.bounds[0] || words > target.bounds[1]
      ? [
          {
            path: target.path,
            band: target.band,
            words,
            bounds: target.bounds,
            exemplarWords: target.words,
          },
        ]
      : [];
  });
}

// ── Structure ──────────────────────────────────────────────────────────

/** One way a candidate's structure differs from its exemplar's. */
export interface StructureMiss {
  path: string[];
  message: string;
}

const count = (n: number, what: string): string => `${n} ${what}${n === 1 ? '' : 's'}`;

/** A script's speakers, by name, and its turns. */
function scriptShape(holder: Fields): { speakers: number; turns: number } | null {
  const turns = listOf(holder.script).filter(isRecord);
  if (turns.length === 0) {
    return null;
  }
  return {
    speakers: new Set(turns.map((turn) => stringOf(turn.speaker).trim().toLowerCase())).size,
    turns: turns.length,
  };
}

/** The script a stimulus carries, on itself or on its media. */
function stimulusScript(stimulus: Fields): { speakers: number; turns: number } | null {
  return scriptShape(stimulus) ?? (isRecord(stimulus.media) ? scriptShape(stimulus.media) : null);
}

/** How many turns a script of `turns` turns may have in a variant: within a quarter, at least one either way. */
export function turnBand(turns: number): [number, number] {
  const leeway = Math.max(turns * 0.25, 1);
  return [Math.max(1, Math.ceil(turns - leeway - 1e-9)), Math.floor(turns + leeway + 1e-9)];
}

const mediaKind = (media: unknown): string | null =>
  isRecord(media) && typeof media.type === 'string' ? media.type : null;

function isOneWord(answer: string): boolean {
  const trimmed = answer.trim();
  return trimmed !== '' && !/\s/.test(trimmed);
}

/**
 * Which bank each gap draws on, by the bank's position, or `null` for a gap
 * with its own choices: in passage order.
 */
function gapBanks(item: Fields): (number | null)[] {
  const banks = listOf(item.banks);
  return inPassageOrder(item, 'gaps').map(({ value: gap }) => {
    if (!isRecord(gap) || listOf(gap.choices).length > 0) {
      return null;
    }
    const at = banks.findIndex((bank) => isRecord(bank) && bank.id === gap.bankId);
    return at === -1 ? null : at;
  });
}

/**
 * The structure a variant must keep, as plain facts a model can be told: the
 * counts it must hit. Read from the exemplar; nothing here is checked.
 */
export function structureTargets(entry: unknown): Record<string, unknown> {
  if (!isRecord(entry)) {
    return {};
  }
  switch (entry.type) {
    case 'item-group': {
      const stimulus = isRecord(entry.stimulus) ? entry.stimulus : {};
      const script = stimulusScript(stimulus);
      return {
        stimulus: stringOf(stimulus.kind),
        items: listOf(entry.items).map((item) => ({
          type: isRecord(item) ? stringOf(item.type) : '',
          ...structureTargets(item),
        })),
        ...(script !== null ? { speakers: script.speakers, turns: turnBand(script.turns) } : {}),
      };
    }
    case 'multiple-choice': {
      const options = listOf(entry.options);
      const media = options.map((option) => (isRecord(option) ? mediaKind(option.media) : null));
      return {
        mode: stringOf(entry.mode),
        options: options.length,
        correct: options.filter((option) => isRecord(option) && option.isCorrect === true).length,
        ...(media.some((one) => one !== null) ? { optionMedia: media } : {}),
      };
    }
    case 'fill-in-the-blanks':
      return {
        blanks: inPassageOrder(entry, 'blanks').map(({ value: blank }) => {
          const answers = isRecord(blank)
            ? listOf(blank.acceptedAnswers).filter((one): one is string => typeof one === 'string')
            : [];
          return {
            oneWord: answers.length > 0 && answers.every(isOneWord),
            acceptedAnswers: [Math.max(1, answers.length - 2), answers.length + 2],
          };
        }),
      };
    case 'gap-select': {
      const banks = listOf(entry.banks);
      const drawn = gapBanks(entry);
      return {
        gaps: inPassageOrder(entry, 'gaps').map(({ value: gap }, index) =>
          drawn[index] !== null
            ? { bank: drawn[index] }
            : { choices: isRecord(gap) ? listOf(gap.choices).length : 0 },
        ),
        ...(banks.length > 0
          ? {
              banks: banks.map((bank) => ({
                choices: isRecord(bank) ? listOf(bank.choices).length : 0,
              })),
            }
          : {}),
      };
    }
    case 'written-response':
      return {
        minWords: entry.minWords,
        maxWords: entry.maxWords,
        ...(isRecord(entry.rubric)
          ? {
              criteria: listOf(entry.rubric.criteria).map((criterion) =>
                isRecord(criterion) ? stringOf(criterion.name) : '',
              ),
            }
          : {}),
      };
    default:
      return {};
  }
}

/** The settings two items must share to be scored alike, per type. */
const SCORED_ALIKE: Readonly<Record<string, readonly string[]>> = {
  'multiple-choice': ['mode', 'scoringStrategy'],
  'fill-in-the-blanks': ['scoringStrategy'],
  'gap-select': ['scoringStrategy', 'presentation'],
  dictation: ['tolerance', 'hints'],
  'read-aloud': ['recording', 'scoring', 'locale'],
  'written-response': ['rubric', 'minWords', 'maxWords', 'languageTarget'],
};

const DIFFERS: Readonly<Record<string, string>> = {
  mode: 'The mode differs',
  scoringStrategy: 'The scoring strategy differs',
  presentation: 'The presentation differs',
  tolerance: 'The tolerance differs',
  hints: 'The hints differ',
  recording: 'The recording bounds differ',
  scoring: 'The scored dimensions differ',
  locale: 'The locale differs',
  rubric: 'The rubric differs',
  minWords: 'The minimum word count differs',
  maxWords: 'The maximum word count differs',
  languageTarget: 'The language target differs',
};

function itemMisses(exemplar: Fields, candidate: Fields): StructureMiss[] {
  const misses: StructureMiss[] = [];
  const miss = (path: (string | number)[], message: string) =>
    misses.push({ path: path.map(String), message });
  const type = stringOf(exemplar.type);

  for (const field of SCORED_ALIKE[type] ?? []) {
    if (!same(exemplar[field], candidate[field])) {
      miss([field], `${DIFFERS[field]} from the exemplar's.`);
    }
  }
  if ((exemplar.shuffle === true) !== (candidate.shuffle === true)) {
    miss(['shuffle'], 'Shuffling differs from the exemplar.');
  }
  if (mediaKind(exemplar.media) !== mediaKind(candidate.media)) {
    miss(
      ['media'],
      `The exemplar has ${mediaKind(exemplar.media) ?? 'no'} media; this has ${mediaKind(candidate.media) ?? 'none'}.`,
    );
  }
  if (type === 'dictation' || type === 'read-aloud') {
    if (isRecord(exemplar.slowMedia) !== isRecord(candidate.slowMedia)) {
      miss(
        ['slowMedia'],
        isRecord(exemplar.slowMedia)
          ? 'The exemplar has a slow recording; this has none.'
          : 'This has a slow recording; the exemplar has none.',
      );
    }
  }

  if (type === 'multiple-choice') {
    const mine = listOf(exemplar.options);
    const theirs = listOf(candidate.options);
    if (mine.length !== theirs.length) {
      miss(['options'], `${count(theirs.length, 'option')}; the exemplar has ${mine.length}.`);
    }
    const right = (list: readonly unknown[]) =>
      list.filter((option) => isRecord(option) && option.isCorrect === true).length;
    if (right(mine) !== right(theirs)) {
      miss(
        ['options'],
        `${count(right(theirs), 'correct option')}; the exemplar has ${right(mine)}.`,
      );
    }
    const media = (list: readonly unknown[]) =>
      list
        .map((option) => (isRecord(option) ? mediaKind(option.media) : null))
        .filter((one) => one !== null)
        .sort()
        .join(',');
    if (media(mine) !== media(theirs)) {
      miss(['options'], "The options with media differ from the exemplar's.");
    }
  } else if (type === 'fill-in-the-blanks') {
    const mine = inPassageOrder(exemplar, 'blanks');
    const theirs = inPassageOrder(candidate, 'blanks');
    if (mine.length !== theirs.length) {
      miss(['blanks'], `${count(theirs.length, 'blank')}; the exemplar has ${mine.length}.`);
    }
    mine.forEach(({ value: blank }, index) => {
      const at = theirs[index]?.at;
      const other = theirs[index]?.value;
      if (!isRecord(blank) || !isRecord(other)) {
        return;
      }
      const policy = (one: Fields) => ({
        match: one.match,
        caseSensitive: one.caseSensitive,
        trimWhitespace: one.trimWhitespace,
      });
      if (!same(policy(blank), policy(other))) {
        miss(
          ['blanks', at as number],
          `Blank ${index + 1} matches answers differently from the exemplar's.`,
        );
      }
      const answers = (one: Fields) =>
        listOf(one.acceptedAnswers).filter(
          (answer): answer is string => typeof answer === 'string',
        );
      const exemplarAnswers = answers(blank);
      const candidateAnswers = answers(other);
      if (
        exemplarAnswers.length > 0 &&
        exemplarAnswers.every(isOneWord) &&
        !candidateAnswers.every(isOneWord)
      ) {
        miss(
          ['blanks', at as number, 'acceptedAnswers'],
          `Blank ${index + 1} takes one word in the exemplar; every answer here must be one word.`,
        );
      }
      if (Math.abs(candidateAnswers.length - exemplarAnswers.length) > 2) {
        miss(
          ['blanks', at as number, 'acceptedAnswers'],
          `Blank ${index + 1} accepts ${count(candidateAnswers.length, 'answer')}; the exemplar accepts ${exemplarAnswers.length}, and two more or fewer is the most.`,
        );
      }
    });
  } else if (type === 'gap-select') {
    const mine = inPassageOrder(exemplar, 'gaps');
    const theirs = inPassageOrder(candidate, 'gaps');
    if (mine.length !== theirs.length) {
      miss(['gaps'], `${count(theirs.length, 'gap')}; the exemplar has ${mine.length}.`);
    }
    const myBanks = listOf(exemplar.banks);
    const theirBanks = listOf(candidate.banks);
    if (myBanks.length !== theirBanks.length) {
      miss(['banks'], `${count(theirBanks.length, 'bank')}; the exemplar has ${myBanks.length}.`);
    }
    myBanks.forEach((bank, index) => {
      const other = theirBanks[index];
      const size = (one: unknown) => (isRecord(one) ? listOf(one.choices).length : 0);
      if (other !== undefined && size(bank) !== size(other)) {
        miss(
          ['banks', index, 'choices'],
          `Bank ${index + 1} offers ${count(size(other), 'choice')}; the exemplar's offers ${size(bank)}.`,
        );
      }
    });
    const myDraws = gapBanks(exemplar);
    const theirDraws = gapBanks(candidate);
    mine.forEach(({ value: gap }, index) => {
      const at = theirs[index]?.at;
      const other = theirs[index]?.value;
      if (at === undefined) {
        return;
      }
      if (myDraws[index] !== theirDraws[index]) {
        miss(
          ['gaps', at],
          `Gap ${index + 1} draws on its choices differently from the exemplar's.`,
        );
      } else if (myDraws[index] === null) {
        const size = (one: unknown) => (isRecord(one) ? listOf(one.choices).length : 0);
        if (size(gap) !== size(other)) {
          miss(
            ['gaps', at, 'choices'],
            `Gap ${index + 1} offers ${count(size(other), 'choice')}; the exemplar's offers ${size(gap)}.`,
          );
        }
      }
    });
    if ((exemplar.shuffleChoices === true) !== (candidate.shuffleChoices === true)) {
      miss(['shuffleChoices'], 'Shuffling the choices differs from the exemplar.');
    }
  }
  return misses;
}

/**
 * How `candidate`'s structure differs from `exemplar`'s: what makes the two
 * no parallel items — the type, the counts a learner answers (options and how
 * many are right, blanks, gaps, banks, a part's items and speakers), and the
 * settings that score them. Empty when they are parallel. Lengths, copies and
 * keys are not structure; see {@link lengthMisses}, {@link textSimilarity} and
 * {@link keysOf}.
 */
export function structureMisses(exemplar: unknown, candidate: unknown): StructureMiss[] {
  if (!isRecord(exemplar) || !isRecord(candidate)) {
    return [];
  }
  if (exemplar.type !== candidate.type) {
    return [
      {
        path: ['type'],
        message: `This is ${stringOf(candidate.type) || 'no type'}; the exemplar is ${stringOf(exemplar.type)}.`,
      },
    ];
  }
  if (exemplar.type !== 'item-group') {
    return itemMisses(exemplar, candidate);
  }
  const misses: StructureMiss[] = [];
  const mine = isRecord(exemplar.stimulus) ? exemplar.stimulus : {};
  const theirs = isRecord(candidate.stimulus) ? candidate.stimulus : {};
  if (mine.kind !== theirs.kind) {
    misses.push({
      path: ['stimulus', 'kind'],
      message: `The material is ${stringOf(theirs.kind) || 'of no kind'}; the exemplar's is ${stringOf(mine.kind)}.`,
    });
  }
  const myScript = stimulusScript(mine);
  const theirScript = stimulusScript(theirs);
  if (myScript !== null) {
    if (theirScript === null) {
      misses.push({
        path: ['stimulus', 'script'],
        message: "The exemplar's recording has a script; this has none.",
      });
    } else {
      if (theirScript.speakers !== myScript.speakers) {
        misses.push({
          path: ['stimulus', 'script'],
          message: `${count(theirScript.speakers, 'speaker')}; the exemplar has ${myScript.speakers}.`,
        });
      }
      const [low, high] = turnBand(myScript.turns);
      if (theirScript.turns < low || theirScript.turns > high) {
        misses.push({
          path: ['stimulus', 'script'],
          message: `${count(theirScript.turns, 'turn')}; the exemplar has ${myScript.turns}, so ${low} to ${high}.`,
        });
      }
    }
  }
  if ((exemplar.shuffle ?? 'none') !== (candidate.shuffle ?? 'none')) {
    misses.push({ path: ['shuffle'], message: 'Shuffling differs from the exemplar.' });
  }
  const myItems = listOf(exemplar.items);
  const theirItems = listOf(candidate.items);
  if (myItems.length !== theirItems.length) {
    misses.push({
      path: ['items'],
      message: `${count(theirItems.length, 'item')}; the exemplar has ${myItems.length}.`,
    });
  }
  myItems.forEach((item, index) => {
    const other = theirItems[index];
    if (other !== undefined) {
      for (const found of structureMisses(item, other)) {
        misses.push({ path: ['items', String(index), ...found.path], message: found.message });
      }
    }
  });
  return misses;
}
