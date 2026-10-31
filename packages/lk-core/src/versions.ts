import { listMediaRefs } from './media-refs.js';
import type {
  VersionComparison,
  VersionFinding,
  VersionPaper,
  VersionSlot,
} from './types/authoring.js';
import {
  AI_VARIANT_NEAR_COPY_THRESHOLD,
  keysOf,
  type LengthTolerance,
  lengthMisses,
  optionSet,
  sharedAnswers,
  shownScore,
  structureMisses,
  textSimilarity,
  textsOf,
} from './variant-rules.js';

/**
 * Every code `critiqueVersions` reports, and its severity: a contract, as the
 * critic's codes are. `versions_shared_media` is `advice` for a picture both
 * forms may show, and a `warning` otherwise.
 */
export const VERSION_FINDING_SEVERITY = {
  versions_section_mismatch: 'invalid',
  versions_entry_count: 'invalid',
  versions_type_mismatch: 'invalid',
  versions_structure_mismatch: 'invalid',
  versions_objectives_mismatch: 'warning',
  versions_length_out_of_band: 'warning',
  versions_near_copy: 'warning',
  versions_same_key: 'warning',
  versions_shared_media: 'warning',
} as const;

type VersionCode = keyof typeof VERSION_FINDING_SEVERITY;
type Fields = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const listOf = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);
const stringOf = (value: unknown): string => (typeof value === 'string' ? value : '');
const key = (path: readonly string[]): string => path.join('.');

function report(
  code: VersionCode,
  message: string,
  a: readonly string[] | undefined,
  b: readonly string[] | undefined,
  severity: VersionFinding['severity'] = VERSION_FINDING_SEVERITY[code],
): VersionFinding {
  return {
    path: [...(b ?? a ?? [])],
    message,
    code,
    severity,
    ...(a !== undefined ? { a: [...a] } : {}),
    ...(b !== undefined ? { b: [...b] } : {}),
  };
}

interface Entry {
  path: string[];
  section: number;
  index: number;
  value: Fields;
}

function entriesOf(paper: VersionPaper): Entry[] {
  return listOf(paper?.sections).flatMap((section, s) =>
    listOf(isRecord(section) ? section.entries : undefined).flatMap((value, index) =>
      isRecord(value)
        ? [{ path: ['sections', String(s), 'entries', String(index)], section: s, index, value }]
        : [],
    ),
  );
}

/** A group's items, or the entry itself: the slots a learner answers. */
const itemsOf = (entry: Entry): { path: string[]; value: Fields }[] =>
  entry.value.type === 'item-group'
    ? listOf(entry.value.items).flatMap((item, at) =>
        isRecord(item) ? [{ path: [...entry.path, 'items', String(at)], value: item }] : [],
      )
    : [{ path: entry.path, value: entry.value }];

const typeName = (value: Fields): string => stringOf(value.type) || 'no type';

/** Two entries paired, then each of their items with its own pair. */
interface Pair {
  a: Entry;
  b: Entry;
  by: VersionSlot['by'];
}

function pairEntries(
  aEntries: readonly Entry[],
  bEntries: readonly Entry[],
  given: readonly { a: readonly string[]; b: readonly string[] }[] | undefined,
): Pair[] {
  const pairs: Pair[] = [];
  const takenA = new Set<string>();
  const takenB = new Set<string>();
  const add = (a: Entry, b: Entry, by: VersionSlot['by']) => {
    pairs.push({ a, b, by });
    takenA.add(key(a.path));
    takenB.add(key(b.path));
  };
  const aByPath = new Map(aEntries.map((one) => [key(one.path), one]));
  const bByPath = new Map(bEntries.map((one) => [key(one.path), one]));
  for (const pair of given ?? []) {
    const a = aByPath.get(key(pair.a.map(String)));
    const b = bByPath.get(key(pair.b.map(String)));
    if (
      a !== undefined &&
      b !== undefined &&
      !takenA.has(key(a.path)) &&
      !takenB.has(key(b.path))
    ) {
      add(a, b, 'pairs');
    }
  }
  for (const a of aEntries) {
    const slotKey = a.value.slotKey;
    if (takenA.has(key(a.path)) || typeof slotKey !== 'string') {
      continue;
    }
    const b = bEntries.find((one) => one.value.slotKey === slotKey && !takenB.has(key(one.path)));
    if (b !== undefined) {
      add(a, b, 'slotKey');
    }
  }
  for (const a of aEntries) {
    if (takenA.has(key(a.path))) {
      continue;
    }
    const b = bEntries.find(
      (one) => one.section === a.section && one.index === a.index && !takenB.has(key(one.path)),
    );
    if (b !== undefined) {
      add(a, b, 'position');
    }
  }
  return pairs;
}

interface ItemPair {
  a: { path: string[]; value: Fields };
  b: { path: string[]; value: Fields };
  by: VersionSlot['by'];
}

/** A paired group's items, by their own `slotKey` when both have one, else by position. */
function pairItems(pair: Pair): ItemPair[] {
  const aItems = itemsOf(pair.a);
  const bItems = itemsOf(pair.b);
  if (pair.a.value.type !== 'item-group' || pair.b.value.type !== 'item-group') {
    const one = aItems[0];
    const two = bItems[0];
    return one !== undefined && two !== undefined ? [{ a: one, b: two, by: pair.by }] : [];
  }
  const taken = new Set<number>();
  const pairs: ItemPair[] = [];
  aItems.forEach((a) => {
    const slotKey = a.value.slotKey;
    const found =
      typeof slotKey === 'string'
        ? bItems.findIndex((b, index) => b.value.slotKey === slotKey && !taken.has(index))
        : -1;
    if (found !== -1) {
      taken.add(found);
      pairs.push({ a, b: bItems[found] as ItemPair['b'], by: 'slotKey' });
    }
  });
  aItems.forEach((a, at) => {
    if (pairs.some((one) => one.a === a) || at >= bItems.length || taken.has(at)) {
      return;
    }
    taken.add(at);
    pairs.push({ a, b: bItems[at] as ItemPair['b'], by: 'position' });
  });
  return pairs.sort((x, y) => aItems.indexOf(x.a) - aItems.indexOf(y.a));
}

const objectives = (value: Fields): string =>
  [...listOf(value.learningObjectives).filter((one): one is string => typeof one === 'string')]
    .sort()
    .join('\n');

/**
 * Compares two forms of an exam slot by slot, and the whole of one with the
 * whole of the other: whether they are parallel — the same blueprint, types,
 * structure and scoring (`invalid` when not) — and whether a learner who sat
 * one would meet the other again: a near copy anywhere in the other form, a
 * shared right answer in a paired slot, the same recording (`warning`), or
 * the same picture (`advice` while `allowSharedImages`, its default).
 * Objectives and lengths that differ are warnings.
 *
 * Slots are paired by `pairs` (paths from each paper's root, as
 * `generateVariants`' pairs give them once a host places them), then by
 * `slotKey`, then by position: the same entry of the same section. A paired
 * group's items pair by their own `slotKey`, then by position.
 *
 * It reads content as stored, finished or not, and never throws.
 */
export function critiqueVersions(
  a: VersionPaper,
  b: VersionPaper,
  options: {
    pairs?: readonly { a: readonly string[]; b: readonly string[] }[];
    lengthTolerance?: LengthTolerance;
    allowSharedImages?: boolean;
  } = {},
): VersionComparison {
  const findings: VersionFinding[] = [];
  const aSections = listOf(a?.sections);
  const bSections = listOf(b?.sections);

  // The blueprint: sections, and how many entries each holds.
  if (aSections.length !== bSections.length) {
    findings.push(
      report(
        'versions_section_mismatch',
        `The second form has ${bSections.length} sections; the first has ${aSections.length}.`,
        undefined,
        undefined,
      ),
    );
  }
  for (let s = 0; s < Math.min(aSections.length, bSections.length); s += 1) {
    const one = isRecord(aSections[s]) ? (aSections[s] as Fields) : {};
    const two = isRecord(bSections[s]) ? (bSections[s] as Fields) : {};
    const at = ['sections', String(s)];
    if (one.key !== two.key || one.title !== two.title) {
      findings.push(
        report(
          'versions_section_mismatch',
          `Section ${s + 1} is "${stringOf(two.title) || stringOf(two.key)}" in the second form and "${stringOf(one.title) || stringOf(one.key)}" in the first.`,
          at,
          at,
        ),
      );
    }
    const aCount = listOf(one.entries).length;
    const bCount = listOf(two.entries).length;
    if (aCount !== bCount) {
      findings.push(
        report(
          'versions_entry_count',
          `Section ${s + 1} has ${bCount} entries in the second form and ${aCount} in the first.`,
          [...at, 'entries'],
          [...at, 'entries'],
        ),
      );
    }
  }

  const aEntries = entriesOf(a);
  const bEntries = entriesOf(b);
  const pairs = pairEntries(aEntries, bEntries, options.pairs);
  let structureMismatches = 0;
  let paired = 0;
  const slots: VersionSlot[] = [];

  for (const pair of pairs) {
    slots.push({ a: pair.a.path, b: pair.b.path, by: pair.by });
    if (pair.a.value.type !== pair.b.value.type) {
      structureMismatches += 1;
      findings.push(
        report(
          'versions_type_mismatch',
          `The second form has ${typeName(pair.b.value)} here; the first has ${typeName(pair.a.value)}.`,
          pair.a.path,
          pair.b.path,
        ),
      );
      continue;
    }
    const misses = structureMisses(pair.a.value, pair.b.value);
    if (misses.length > 0) {
      structureMismatches += 1;
    }
    for (const miss of misses) {
      const code: VersionCode =
        miss.path[miss.path.length - 1] === 'type'
          ? 'versions_type_mismatch'
          : miss.path.length === 1 && miss.path[0] === 'items'
            ? 'versions_entry_count'
            : 'versions_structure_mismatch';
      findings.push(
        report(code, miss.message, [...pair.a.path, ...miss.path], [...pair.b.path, ...miss.path]),
      );
    }
    for (const miss of lengthMisses(pair.a.value, pair.b.value, options.lengthTolerance)) {
      findings.push(
        report(
          'versions_length_out_of_band',
          `${miss.words} words; the first form's has ${miss.exemplarWords}, so ${miss.bounds[0]} to ${miss.bounds[1]}.`,
          [...pair.a.path, ...miss.path],
          [...pair.b.path, ...miss.path],
        ),
      );
    }
    const items = pairItems(pair);
    if (pair.a.value.type === 'item-group') {
      for (const item of items) {
        slots.push({ a: item.a.path, b: item.b.path, by: item.by });
      }
    }
    for (const item of items) {
      if (item.a.value.type !== item.b.value.type) {
        continue;
      }
      paired += 1;
      if (
        (item.a.value.learningObjectives !== undefined ||
          item.b.value.learningObjectives !== undefined) &&
        objectives(item.a.value) !== objectives(item.b.value)
      ) {
        findings.push(
          report(
            'versions_objectives_mismatch',
            'The two forms test different learning objectives here.',
            item.a.path,
            item.b.path,
          ),
        );
      }
      const aKeys = keysOf(item.a.value);
      for (const slot of keysOf(item.b.value)) {
        const match = aKeys.find((one) => one.slot === slot.slot);
        const shared = match !== undefined ? sharedAnswers(slot, match) : [];
        if (shared.length > 0) {
          findings.push(
            report(
              'versions_same_key',
              `The right answer "${shared[0]}" is the same in both forms: a learner who sat the first scores again by memory.`,
              [...item.a.path, ...(match as { path: string[] }).path],
              [...item.b.path, ...slot.path],
            ),
          );
        }
      }
    }
  }

  // Slots no pair holds.
  const pairedA = new Set(slots.flatMap((slot) => (slot.a !== null ? [key(slot.a)] : [])));
  const pairedB = new Set(slots.flatMap((slot) => (slot.b !== null ? [key(slot.b)] : [])));
  for (const entry of aEntries) {
    for (const one of entry.value.type === 'item-group'
      ? [{ path: entry.path }, ...itemsOf(entry)]
      : [entry]) {
      if (!pairedA.has(key(one.path))) {
        slots.push({ a: one.path, b: null, by: 'position' });
      }
    }
  }
  for (const entry of bEntries) {
    for (const one of entry.value.type === 'item-group'
      ? [{ path: entry.path }, ...itemsOf(entry)]
      : [entry]) {
      if (!pairedB.has(key(one.path))) {
        slots.push({ a: null, b: one.path, by: 'position' });
      }
    }
  }

  // A near copy anywhere: a model can copy question 3 into slot 7.
  const aTexts = aEntries.flatMap((entry) =>
    textsOf(entry.value).map((text) => ({ ...text, path: [...entry.path, ...text.path] })),
  );
  for (const entry of bEntries) {
    for (const text of textsOf(entry.value)) {
      let best: { score: number; path: string[] } | undefined;
      for (const other of aTexts) {
        if (other.kind !== text.kind) {
          continue;
        }
        const score = textSimilarity(other.text, text.text);
        if (score >= AI_VARIANT_NEAR_COPY_THRESHOLD && (best === undefined || score > best.score)) {
          best = { score, path: other.path };
        }
      }
      if (best !== undefined) {
        findings.push(
          report(
            'versions_near_copy',
            `This reads like the first form's text here (similarity ${shownScore(best.score)}).`,
            best.path,
            [...entry.path, ...text.path],
          ),
        );
      }
    }
  }
  const aOptions = aEntries.flatMap((entry) =>
    itemsOf(entry).flatMap((item) => {
      const set = optionSet(item.value);
      return set !== null ? [{ path: item.path, set: set.join('\n') }] : [];
    }),
  );
  for (const entry of bEntries) {
    for (const item of itemsOf(entry)) {
      const set = optionSet(item.value);
      const match =
        set !== null ? aOptions.find((other) => other.set === set.join('\n')) : undefined;
      if (match !== undefined) {
        findings.push(
          report(
            'versions_near_copy',
            "These options are the first form's, in another order.",
            [...match.path, 'options'],
            [...item.path, 'options'],
          ),
        );
      }
    }
  }

  // The same file in both forms.
  const allowImages = options.allowSharedImages !== false;
  const aFiles = new Map<string, string[]>();
  for (const entry of aEntries) {
    for (const ref of listMediaRefs(entry.value)) {
      if (ref.url !== null && ref.url !== '' && !aFiles.has(ref.url)) {
        aFiles.set(ref.url, [...entry.path, ...ref.path.map(String)]);
      }
    }
  }
  for (const entry of bEntries) {
    for (const ref of listMediaRefs(entry.value)) {
      const first = ref.url !== null ? aFiles.get(ref.url) : undefined;
      if (first === undefined) {
        continue;
      }
      const picture = ref.kind === 'image';
      findings.push(
        report(
          'versions_shared_media',
          picture
            ? 'Both forms show this picture.'
            : 'Both forms use this file: a learner who sat the first hears or sees it again.',
          first,
          [...entry.path, ...ref.path.map(String)],
          picture && allowImages ? 'advice' : 'warning',
        ),
      );
    }
  }

  const count = (entries: readonly Entry[]) =>
    entries.reduce((sum, entry) => sum + itemsOf(entry).length, 0);
  return {
    findings,
    slots,
    summary: { aItems: count(aEntries), bItems: count(bEntries), paired, structureMismatches },
  };
}
