import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { flattenSequence, isItemGroup } from '../item-group.js';
import { defineActivityType, registerActivityType } from '../registry/index.js';
import type { ItemGroup, SequenceEntry } from '../types/item-group.js';

/** flattenSequence is generic over the item shape; a minimal one keeps the tests about ordering. */
interface Item {
  id: string;
  type: 'multiple-choice';
}

const item = (id: string): Item => ({ id, type: 'multiple-choice' });

const group = (
  id: string,
  ids: readonly string[],
  shuffle?: 'none' | 'within-group',
): ItemGroup<Item> => ({
  schemaVersion: '1.0',
  type: 'item-group',
  id,
  title: `Group ${id}`,
  stimulus: { id: `s-${id}`, kind: 'text', body: 'Read this.' },
  items: ids.map(item),
  ...(shuffle !== undefined ? { shuffle } : {}),
});

describe('flattenSequence', () => {
  it('flattens in authored order with authored-position slot ids', () => {
    const slots = flattenSequence<Item>([item('q1'), group('g1', ['a', 'b', 'c']), item('q2')]);

    expect(slots.map((slot) => slot.slotId)).toEqual(['0', '1.0', '1.1', '1.2', '2']);
    expect(slots.map((slot) => slot.index)).toEqual([0, 1, 2, 3, 4]);
    expect(slots.map((slot) => slot.activity.id)).toEqual(['q1', 'a', 'b', 'c', 'q2']);
    expect(slots[0]?.group).toBeUndefined();
    expect(slots[1]?.group).toEqual({
      id: 'g1',
      title: 'Group g1',
      stimulus: { id: 's-g1', kind: 'text', body: 'Read this.' },
      position: 0,
      size: 3,
    });
    expect(slots[3]?.group?.position).toBe(2);
    expect(slots[4]?.group).toBeUndefined();
  });

  it('omits group.title when the group has none', () => {
    const untitled: ItemGroup<Item> = {
      schemaVersion: '1.0',
      type: 'item-group',
      id: 'g',
      stimulus: { id: 's', kind: 'text', body: 'x' },
      items: [item('a')],
    };
    const [slot] = flattenSequence<Item>([untitled]);
    expect(slot?.group).not.toHaveProperty('title');
  });

  it('refuses an empty group rather than deleting it from the sequence', () => {
    // Producing no slots would remove the stimulus AND its questions from a
    // sequence that still looks well-formed, and composeAssessmentScore would
    // then report a `final` grade over whatever survived.
    const empty: ItemGroup<Item> = { ...group('g', ['a']), items: [] };
    expect(() => flattenSequence<Item>([item('q1'), empty, item('q2')])).toThrow(
      /item group "g" has no items/,
    );
  });

  it('gives the same activity in two entries two distinct slots', () => {
    const slots = flattenSequence<Item>([item('dup'), item('dup')]);
    expect(slots.map((slot) => slot.slotId)).toEqual(['0', '1']);
  });

  it('requires a seed only when something actually shuffles', () => {
    expect(() => flattenSequence<Item>([group('g', ['a', 'b'], 'within-group')])).toThrow(
      /seed is required/,
    );
    expect(() => flattenSequence<Item>([item('q')], { shuffleEntries: true })).toThrow(
      /seed is required/,
    );
    expect(() => flattenSequence<Item>([group('g', ['a', 'b'], 'none'), item('q')])).not.toThrow();
    expect(() =>
      flattenSequence<Item>([group('g', ['a', 'b'])], { shuffleEntries: false }),
    ).not.toThrow();
  });

  it('within-group shuffle permutes the items, keeps them contiguous, and keeps authored slot ids', () => {
    const authored = ['a', 'b', 'c', 'd', 'e', 'f'];
    const entries: SequenceEntry<Item>[] = [
      item('q1'),
      group('g', authored, 'within-group'),
      item('q2'),
    ];
    const slots = flattenSequence(entries, { seed: 'attempt-1' });

    expect(slots[0]?.activity.id).toBe('q1');
    expect(slots[7]?.activity.id).toBe('q2');
    const presented = slots.slice(1, 7);
    expect([...presented.map((slot) => slot.activity.id)].sort()).toEqual(authored);
    expect(presented.map((slot) => slot.activity.id)).not.toEqual(authored);
    // The slot id follows the ITEM (authored position), not where it is shown.
    for (const slot of presented) {
      expect(slot.slotId).toBe(`1.${authored.indexOf(slot.activity.id)}`);
    }
    expect(presented.map((slot) => slot.group?.position)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(presented.every((slot) => slot.group?.size === 6)).toBe(true);

    expect(flattenSequence(entries, { seed: 'attempt-1' })).toEqual(slots);
    expect(
      flattenSequence(entries, { seed: 'attempt-2' }).map((slot) => slot.activity.id),
    ).not.toEqual(slots.map((slot) => slot.activity.id));
  });

  it('shuffleEntries moves a group as one block', () => {
    const entries: SequenceEntry<Item>[] = [
      item('q1'),
      item('q2'),
      group('g', ['a', 'b', 'c']),
      item('q3'),
      item('q4'),
    ];
    const slots = flattenSequence(entries, { shuffleEntries: true, seed: 'attempt-7' });
    const groupIndices = slots.filter((slot) => slot.group?.id === 'g').map((slot) => slot.index);
    const first = groupIndices[0] ?? 0;
    expect(groupIndices).toEqual([first, first + 1, first + 2]);
    expect(slots.filter((slot) => slot.group?.id === 'g').map((slot) => slot.activity.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect([...slots.map((slot) => slot.slotId)].sort()).toEqual(
      ['0', '1', '2.0', '2.1', '2.2', '3', '4'].sort(),
    );
  });

  it('property: groups stay contiguous and slot identities survive any shuffle', () => {
    const itemArb = fc.string({ minLength: 1 }).map(item);
    const specArb = fc.oneof(
      itemArb.map((activity) => ({ kind: 'item' as const, activity })),
      fc
        .record({
          items: fc.array(itemArb, { minLength: 1, maxLength: 5 }),
          shuffle: fc.constantFrom<'none' | 'within-group' | undefined>(
            'none',
            'within-group',
            undefined,
          ),
        })
        .map(({ items, shuffle }) => ({ kind: 'group' as const, items, shuffle })),
    );

    fc.assert(
      fc.property(
        fc.array(specArb, { maxLength: 8 }),
        fc.string(),
        fc.boolean(),
        (specs, seed, shuffleEntries) => {
          const entries: SequenceEntry<Item>[] = specs.map((spec, entryIndex) =>
            spec.kind === 'item'
              ? spec.activity
              : {
                  ...group(`g${entryIndex}`, []),
                  items: spec.items,
                  ...(spec.shuffle !== undefined ? { shuffle: spec.shuffle } : {}),
                },
          );
          // Authored identities, derived from the spec rather than from a
          // seedless baseline call (which a within-group spec would reject).
          const expectedIds = specs.flatMap((spec, entryIndex) =>
            spec.kind === 'item'
              ? [String(entryIndex)]
              : spec.items.map((_, k) => `${entryIndex}.${k}`),
          );
          const slots = flattenSequence(entries, { seed, shuffleEntries });

          // index is the array position
          expect(slots.map((slot) => slot.index)).toEqual(slots.map((_, i) => i));

          // the same slot identities, each exactly once
          const ids = slots.map((slot) => slot.slotId);
          expect(new Set(ids).size).toBe(ids.length);
          expect([...ids].sort()).toEqual([...expectedIds].sort());

          for (const [entryIndex, spec] of specs.entries()) {
            if (spec.kind !== 'group') {
              continue;
            }
            const members = slots.filter((slot) => slot.group?.id === `g${entryIndex}`);
            const start = members[0]?.index ?? 0;
            // contiguous, positions 0..n-1, size = item count
            expect(members.map((slot) => slot.index)).toEqual(members.map((_, k) => start + k));
            expect(members.map((slot) => slot.group?.position)).toEqual(members.map((_, k) => k));
            expect(members.every((slot) => slot.group?.size === spec.items.length)).toBe(true);
            // authored order inside the group unless it opted in
            if (spec.shuffle !== 'within-group') {
              expect(members.map((slot) => slot.slotId)).toEqual(
                spec.items.map((_, k) => `${entryIndex}.${k}`),
              );
            }
          }

          // entry order is authored order unless entries were shuffled
          if (!shuffleEntries) {
            const entryOrder = slots.map((slot) => Number(slot.slotId.split('.')[0]));
            expect(entryOrder).toEqual([...entryOrder].sort((a, b) => a - b));
          }

          expect(flattenSequence(entries, { seed, shuffleEntries })).toEqual(slots);
        },
      ),
    );
  });
});

describe('isItemGroup', () => {
  it('narrows on the type discriminator', () => {
    expect(isItemGroup<Item>(group('g', ['a']))).toBe(true);
    expect(isItemGroup<Item>(item('q'))).toBe(false);
  });
});

describe('registerActivityType', () => {
  it('reserves "item-group": it is a container, not an activity type', () => {
    const bogus = defineActivityType<{ type: 'item-group' }, unknown>({
      type: 'item-group',
      schema: z.object({ type: z.literal('item-group') }) as unknown as z.ZodType<{
        type: 'item-group';
      }>,
      scoring: {
        kind: 'sync',
        score: () => ({ score: 0, maxScore: 1, feedback: null, details: [] }),
      },
    });
    expect(() => registerActivityType(bogus)).toThrow(/reserved/);
  });
});
