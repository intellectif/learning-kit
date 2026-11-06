import { ORDERING_MAX_ITEMS } from '../ordering.js';
import type { ActivityTypeAuthoring } from '../registry/registry.js';
import { orderingTextKey } from '../schemas/ordering.js';
import type { OrderingData } from '../types/activity.js';
import type { DraftIssue, ItemFinding } from '../types/authoring.js';
import { finding } from './findings.js';
import {
  checkIdentity,
  checkScoringStrategy,
  checkSharedOptional,
  type DraftFields,
  isMissingId,
  isRecord,
  issue,
  isUnset,
  isUnwritten,
} from './issues.js';

/**
 * Draft support for `ordering`.
 *
 * A new draft has two empty items, the fewest an ordering can have, each with
 * an id from `newId` — ids that say nothing about the order, which is what an
 * exam copy needs — and `scoringStrategy` starts at `all-or-nothing`, as on
 * every built-in. Items are written in their right order.
 */
export const orderingAuthoring: ActivityTypeAuthoring<OrderingData> = {
  createDraft: ({ newId }) => ({
    schemaVersion: '1.0',
    type: 'ordering',
    id: newId(),
    title: '',
    items: [
      { id: newId(), text: '' },
      { id: newId(), text: '' },
    ],
    scoringStrategy: 'all-or-nothing',
  }),
  checkDraft: checkOrderingDraft,
  critique: critiqueOrdering,
};

function checkOrderingDraft(draft: DraftFields): DraftIssue[] {
  const issues = checkIdentity(draft, 'ordering');
  issues.push(...checkScoringStrategy(draft));

  const items = isUnset(draft.items) ? [] : draft.items;
  if (Array.isArray(items)) {
    if (items.length < 2) {
      issues.push(
        issue(
          'or_items_required',
          ['items'],
          `Write at least two items to put in order; there ${items.length === 1 ? 'is one' : 'are none'}.`,
        ),
      );
    } else if (items.length > ORDERING_MAX_ITEMS) {
      issues.push(
        issue(
          'or_items_too_many',
          ['items'],
          `An ordering holds at most ${ORDERING_MAX_ITEMS} items; this one has ${items.length}. Split it.`,
        ),
      );
    }
    issues.push(...checkItems(items));
  }

  issues.push(...checkSharedOptional(draft));
  return issues;
}

/** Every item, each at its own path, where the schema reports it. */
function checkItems(items: readonly unknown[]): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const ids = new Map<string, number>();
  const texts = new Map<string, number>();
  for (const [index, item] of items.entries()) {
    if (!isRecord(item)) {
      continue;
    }
    const ordinal = index + 1;
    if (isMissingId(item.id)) {
      issues.push(
        issue('or_item_id_required', ['items', index, 'id'], `Item ${ordinal} has no id.`),
      );
    } else if (typeof item.id === 'string') {
      const first = ids.get(item.id);
      if (first === undefined) {
        ids.set(item.id, index);
      } else {
        issues.push(
          issue(
            'or_item_id_duplicate',
            ['items', index, 'id'],
            `Item ${ordinal} has the same id as item ${first + 1}. Each item needs its own.`,
          ),
        );
      }
    }
    if (isUnwritten(item.text)) {
      issues.push(
        issue(
          'or_item_text_required',
          ['items', index, 'text'],
          `Write item ${ordinal}, or remove it.`,
        ),
      );
    } else if (typeof item.text === 'string') {
      const key = orderingTextKey(item.text);
      const first = texts.get(key);
      if (first === undefined) {
        texts.set(key, index);
      } else {
        issues.push(
          issue(
            'or_item_text_duplicate',
            ['items', index, 'text'],
            `Item ${ordinal} reads the same as item ${first + 1}, so no order between them is right. Change one of them.`,
          ),
        );
      }
    }
  }
  return issues;
}

// ── Critic ──────────────────────────────────────────────────────────────

/** The texts and ids of a draft's items, or `null` while any is unwritten. */
function itemsOf(draft: DraftFields): { id: string; text: string }[] | null {
  if (!Array.isArray(draft.items)) {
    return null;
  }
  const items: { id: string; text: string }[] = [];
  for (const item of draft.items) {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      typeof item.text !== 'string' ||
      isUnwritten(item.text)
    ) {
      return null;
    }
    items.push({ id: item.id, text: item.text });
  }
  return items;
}

/** The longest start every one of `values` shares. */
function sharedStart(values: readonly string[]): string {
  let shared = values[0] ?? '';
  for (const value of values) {
    while (!value.startsWith(shared)) {
      shared = shared.slice(0, -1);
    }
  }
  return shared;
}

/**
 * Whether the ids count through the items: once a start and an end every id
 * shares are set aside, what is left is a number, or a single letter, in each
 * — `s1`, `s2`, `s3`; `a`, `b`, `c`; `step-1-x`, `step-2-x` — and those run in
 * the right order. Random ids almost never do.
 */
function idsCountInOrder(ids: readonly string[]): boolean {
  const start = sharedStart(ids);
  const reversed = ids.map((id) => [...id.slice(start.length)].reverse().join(''));
  const end = sharedStart(reversed).length;
  const middles = ids.map((id) => id.slice(start.length, id.length - end));
  const numbers = middles.every((middle) => /^\d+$/u.test(middle));
  const letters = middles.every((middle) => /^\p{L}$/u.test(middle));
  if (!numbers && !letters) {
    return false;
  }
  const ranks = middles.map((middle) => (numbers ? Number(middle) : middle.toLowerCase()));
  return ranks.every((rank, index) => index === 0 || (ranks[index - 1] as typeof rank) < rank);
}

/** A number, a letter or a roman numeral that opens an item as a list marker: `1.`, `b)`, `(iii)`. */
const LIST_MARKER = /^\s*\(?(?:\d{1,2}|[a-z]|[ivx]{1,4})[.)]\s/iu;

export function critiqueOrdering(draft: DraftFields): ItemFinding[] {
  const findings: ItemFinding[] = [];
  const items = itemsOf(draft);
  if (items === null || items.length < 2) {
    return findings;
  }

  if (idsCountInOrder(items.map((item) => item.id))) {
    findings.push(
      finding(
        'or_ids_reveal_order',
        ['items'],
        'The item ids count up in the right order. Ids reach the learner with the items, so anyone who reads the page source can sort by them. Give the items ids that say nothing about their place.',
      ),
    );
  }

  const numbered = items
    .map((item, index) => (LIST_MARKER.test(item.text) ? index + 1 : null))
    .filter((ordinal): ordinal is number => ordinal !== null);
  if (numbered.length >= 2) {
    findings.push(
      finding(
        'or_items_numbered',
        ['items'],
        `Items ${numbered.slice(0, -1).join(', ')} and ${numbered.at(-1)} start with a number or letter, which may tell the learner where they go. Remove the numbering.`,
      ),
    );
  }

  if (items.length === 2) {
    findings.push(
      finding(
        'or_items_too_few',
        ['items'],
        'With two items there are only two orders, so a guess is right half the time. Add an item if you can.',
      ),
    );
  }

  return findings;
}
