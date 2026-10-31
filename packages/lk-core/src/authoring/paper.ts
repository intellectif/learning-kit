import { containsWords, fold, passageWithoutPlaceholders } from '../answer-leak.js';
import type { ItemFinding } from '../types/authoring.js';
import {
  AI_VARIANT_NEAR_COPY_THRESHOLD,
  keysOf,
  shownScore,
  textSimilarity,
  textsOf,
  wordsOf,
} from '../variant-rules.js';
import { finding } from './findings.js';
import { type DraftFields, isRecord } from './issues.js';

/**
 * The paper critic: what only a whole paper shows, over every item of a set —
 * loose questions and the items of groups alike. Each finding sits at one of
 * the items involved and names the others in `related`.
 */

const listOf = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);
const stringOf = (value: unknown): string => (typeof value === 'string' ? value : '');

interface PaperItem {
  path: string[];
  item: DraftFields;
  /** The group it sits in: its path, so its own material is not searched for its answers. */
  group?: string[];
}

interface Place {
  path: string[];
  /** The item it belongs to, or the group whose material it is. */
  owner: string;
  words: string[];
}

const key = (path: readonly string[]): string => path.join('.');

function itemsOf(entries: readonly unknown[]): PaperItem[] {
  return entries.flatMap((entry, index): PaperItem[] => {
    if (!isRecord(entry)) {
      return [];
    }
    if (entry.type === 'item-group') {
      const group = [String(index)];
      return listOf(entry.items).flatMap((item, at) =>
        isRecord(item) ? [{ path: [...group, 'items', String(at)], item, group }] : [],
      );
    }
    return typeof entry.type === 'string' ? [{ path: [String(index)], item: entry }] : [];
  });
}

/** The single-answer multiple choices a learner can see the key position of: unshuffled. */
function singleAnswer(item: DraftFields): { key: number; options: readonly unknown[] } | null {
  if (item.type !== 'multiple-choice' || item.mode !== 'single') {
    return null;
  }
  const options = listOf(item.options);
  const keys = options.flatMap((option, index) =>
    isRecord(option) && option.isCorrect === true ? [index] : [],
  );
  return keys.length === 1 ? { key: keys[0] as number, options } : null;
}

// ── Key positions ──────────────────────────────────────────────────────

/** Questions a position needs before "more than half" reads as a habit, not chance. */
const POSITION_BIAS_MINIMUM = 6;
/** Keys a set needs before "never here" reads as a habit. */
const POSITION_NEVER_MINIMUM = 8;

const letter = (position: number): string =>
  position < 26 ? String.fromCharCode(65 + position) : String(position + 1);

function keyPositionBias(items: readonly PaperItem[]): ItemFinding[] {
  const placed = items.flatMap((one) => {
    if (one.item.shuffle === true) {
      return [];
    }
    const single = singleAnswer(one.item);
    return single === null ? [] : [{ one, key: single.key, size: single.options.length }];
  });
  if (placed.length < POSITION_BIAS_MINIMUM || placed.every((at) => at.key === placed[0]?.key)) {
    // Every key in one place is `set_key_position_same`'s to say.
    return [];
  }
  const counts = new Map<number, PaperItem[]>();
  for (const at of placed) {
    counts.set(at.key, [...(counts.get(at.key) ?? []), at.one]);
  }
  for (const [position, holders] of counts) {
    if (holders.length * 2 > placed.length) {
      return [
        {
          ...finding(
            'set_key_position_bias',
            [],
            `${holders.length} of ${placed.length} single-answer questions put the right option at ${letter(position)}. Spread the keys across positions, or shuffle the options.`,
          ),
          related: holders.map((one) => one.path),
        },
      ];
    }
  }
  if (placed.length >= POSITION_NEVER_MINIMUM) {
    const everywhere = Math.min(...placed.map((at) => at.size));
    for (let position = 0; position < everywhere; position += 1) {
      if (!counts.has(position)) {
        return [
          {
            ...finding(
              'set_key_position_bias',
              [],
              `None of ${placed.length} single-answer questions puts the right option at ${letter(position)}, which every one of them has. A learner can rule it out.`,
            ),
            related: placed.map((at) => at.one.path),
          },
        ];
      }
    }
  }
  return [];
}

// ── The key is the longest ─────────────────────────────────────────────

const LONGEST_MINIMUM = 5;
const LONGEST_SHARE = 0.6;

function keyLongestBias(items: readonly PaperItem[]): ItemFinding[] {
  const judged = items.flatMap((one) => {
    const single = singleAnswer(one.item);
    if (
      single === null ||
      single.options.length < 3 ||
      !single.options.every(
        (option) =>
          isRecord(option) &&
          option.media === undefined &&
          typeof option.text === 'string' &&
          option.text.trim() !== '',
      )
    ) {
      return [];
    }
    const lengths = single.options.map(
      (option) => [...stringOf((option as DraftFields).text).trim()].length,
    );
    const keyLength = lengths[single.key] as number;
    const longest = lengths.every((length, index) => index === single.key || length < keyLength);
    return [{ one, longest }];
  });
  const longest = judged.filter((at) => at.longest);
  if (judged.length < LONGEST_MINIMUM || longest.length < judged.length * LONGEST_SHARE) {
    return [];
  }
  return [
    {
      ...finding(
        'set_key_longest_bias',
        [],
        `In ${longest.length} of ${judged.length} single-answer questions the right option is the longest. A learner who picks the longest option scores well without knowing the answers.`,
      ),
      related: longest.map((at) => at.one.path),
    },
  ];
}

// ── Stems that repeat ──────────────────────────────────────────────────

/** Stems shorter than this are not compared: "Choose the correct answer." repeats by design. */
const STEM_MINIMUM_WORDS = 6;

function stemDuplicates(items: readonly PaperItem[]): ItemFinding[] {
  const stems = items.flatMap((one) =>
    textsOf(one.item)
      .filter((text) => text.kind !== 'material' && wordsOf(text.text).length >= STEM_MINIMUM_WORDS)
      .map((text) => ({ one, path: [...one.path, ...text.path], text: text.text })),
  );
  const findings: ItemFinding[] = [];
  stems.forEach((later, at) => {
    let best: { path: string[]; score: number } | undefined;
    for (const earlier of stems.slice(0, at)) {
      if (earlier.one === later.one) {
        continue;
      }
      const score = textSimilarity(earlier.text, later.text);
      if (score >= AI_VARIANT_NEAR_COPY_THRESHOLD && (best === undefined || score > best.score)) {
        best = { path: earlier.path, score };
      }
    }
    if (best !== undefined) {
      findings.push({
        ...finding(
          'set_stem_duplicate',
          later.path,
          best.score === 1
            ? 'This reads the same as another item of the set. One piece of knowledge answers both.'
            : `This reads like another item of the set (similarity ${shownScore(best.score)}). One piece of knowledge may answer both.`,
        ),
        related: [best.path],
      });
    }
  });
  return findings;
}

// ── An answer printed in another item ──────────────────────────────────

/**
 * The 100 most common English words (Oxford English Corpus), with the forms
 * of be, have and do: a key that is one of them is everywhere, so finding it
 * in another item says nothing.
 */
const COMMON_WORDS: ReadonlySet<string> = new Set(
  `the be to of and a in that have i it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take people into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because any these give day most us is are was were been being am has had having does did done`.split(
    ' ',
  ),
);

/** Whether an answer is worth looking for in other items: more than two characters, and not a common word alone. */
function distinctive(words: readonly string[]): boolean {
  return (
    words.join(' ').length > 2 && !(words.length === 1 && COMMON_WORDS.has(words[0] as string))
  );
}

/** What a learner reads or hears of an item: its own text, and its options' and choices'. */
function placeOf(one: PaperItem): Place {
  const item = one.item;
  const texts = [
    ...textsOf(item).map((text) => text.text),
    ...listOf(item.options).map((option) => (isRecord(option) ? stringOf(option.text) : '')),
    ...listOf(item.gaps).flatMap((gap) =>
      isRecord(gap)
        ? listOf(gap.choices).map((choice) => (isRecord(choice) ? stringOf(choice.text) : ''))
        : [],
    ),
    ...listOf(item.banks).flatMap((bank) =>
      isRecord(bank)
        ? listOf(bank.choices).map((choice) => (isRecord(choice) ? stringOf(choice.text) : ''))
        : [],
    ),
  ];
  return {
    path: one.path,
    owner: key(one.path),
    words: fold(passageWithoutPlaceholders(texts.join('\n'))),
  };
}

/** An item's own words, where its answer must not already be: its stem, not its options. */
function ownWords(item: DraftFields): string[] {
  return fold(
    passageWithoutPlaceholders(
      textsOf(item)
        .filter((text) => text.kind !== 'material')
        .map((text) => text.text)
        .join('\n'),
    ),
  );
}

function answersInOtherItems(
  entries: readonly unknown[],
  items: readonly PaperItem[],
): ItemFinding[] {
  const places: Place[] = [
    ...items.map(placeOf),
    ...entries.flatMap((entry, index): Place[] => {
      if (!isRecord(entry) || entry.type !== 'item-group') {
        return [];
      }
      const material = textsOf({ type: 'item-group', stimulus: entry.stimulus })
        .map((text) => text.text)
        .join('\n');
      return material === ''
        ? []
        : [{ path: [String(index), 'stimulus'], owner: `group:${index}`, words: fold(material) }];
    }),
  ];
  const findings: ItemFinding[] = [];
  for (const one of items) {
    const own = ownWords(one.item);
    const ownGroup = one.group !== undefined ? `group:${one.group[0]}` : undefined;
    const reported = new Set<string>();
    for (const slot of keysOf(one.item)) {
      for (const answer of slot.answers) {
        const words = fold(answer);
        if (!distinctive(words) || containsWords(own, words)) {
          continue;
        }
        for (const place of places) {
          if (
            place.owner === key(one.path) ||
            place.owner === ownGroup ||
            reported.has(place.owner)
          ) {
            continue;
          }
          if (containsWords(place.words, words)) {
            reported.add(place.owner);
            findings.push({
              ...finding(
                'set_item_answers_item',
                [...one.path, ...slot.path],
                `The answer "${answer}" is printed elsewhere in the set: a learner can find it there.`,
              ),
              related: [place.path],
            });
          }
        }
      }
    }
  }
  return findings;
}

// ── One answer, many items ─────────────────────────────────────────────

const REPEATED_KEY_MINIMUM = 3;

function repeatedKeys(items: readonly PaperItem[]): ItemFinding[] {
  const holders = new Map<string, string[][]>();
  for (const one of items) {
    const seen = new Set<string>();
    for (const slot of keysOf(one.item)) {
      for (const answer of slot.answers) {
        if (!seen.has(answer)) {
          seen.add(answer);
          holders.set(answer, [...(holders.get(answer) ?? []), [...one.path, ...slot.path]]);
        }
      }
    }
  }
  return [...holders].flatMap(([answer, paths]) =>
    paths.length >= REPEATED_KEY_MINIMUM
      ? [
          {
            ...finding(
              'set_key_repeated',
              paths[0] as string[],
              `"${answer}" is the answer to ${paths.length} items. The set tests less than its length suggests.`,
            ),
            related: paths.slice(1),
          },
        ]
      : [],
  );
}

/**
 * What only a whole paper shows, over every item of `entries` — loose
 * questions and the items of groups: keys clustered in one position, keys
 * that are the longest option, stems that repeat, an answer printed in another
 * item, and one answer to many items. Paths are from the set's root.
 */
export function paperFindings(entries: readonly unknown[]): ItemFinding[] {
  const items = itemsOf(entries);
  return [
    ...keyPositionBias(items),
    ...keyLongestBias(items),
    ...stemDuplicates(items),
    ...answersInOtherItems(entries, items),
    ...repeatedKeys(items),
  ];
}
