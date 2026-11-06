import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ORDERING_MAX_ITEMS, orderingStart } from '../../ordering.js';
import { assertRedacted, redact } from '../../redact.js';
import { getActivityTypeDescriptor } from '../../registry/index.js';
import { validateActivity } from '../../schemas/index.js';
import type { OrderingData, OrderingLearnerResponse } from '../../types/activity.js';
import { xapiDefinitionFor } from '../../xapi/index.js';
import { evaluate, score } from '../index.js';

// Right order: k q w e r
const data: OrderingData = {
  schemaVersion: '1.0',
  type: 'ordering',
  id: 'or1',
  title: 'Making pasta',
  instructions: 'Put the steps in order.',
  items: [
    { id: 'k', text: 'Fill a pot with water.' },
    { id: 'q', text: 'Bring it to the boil.', feedback: 'Pasta goes into boiling water.' },
    { id: 'w', text: 'Add the pasta.' },
    { id: 'e', text: 'Cook it for ten minutes.' },
    { id: 'r', text: 'Drain it.' },
  ],
  scoringStrategy: 'partial',
};

const order = (ids: unknown[]): OrderingLearnerResponse =>
  ({ type: 'ordering', order: ids }) as OrderingLearnerResponse;

const errorsOf = (item: unknown): [string, string][] => {
  const result = validateActivity('ordering', item);
  return result.success ? [] : result.errors.map((error) => [error.path.join('.'), error.message]);
};

const itemsOf = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: `x${index}`, text: `Step ${index}` }));

describe('ordering — the start order', () => {
  it('is the same on every call, and moves nothing in place', () => {
    const start = orderingStart(data).map((item) => item.id);
    expect(start).toEqual(orderingStart(data).map((item) => item.id));
    expect([...start].sort()).toEqual(['e', 'k', 'q', 'r', 'w']);
    expect(data.items.map((item) => item.id)).toEqual(['k', 'q', 'w', 'e', 'r']);
    // Pinned: the start is part of what a learner sees, release to release.
    expect(start).toMatchInlineSnapshot(`
      [
        "r",
        "e",
        "q",
        "k",
        "w",
      ]
    `);
  });

  it('never scores, for any id and any number of items', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.integer({ min: 2, max: ORDERING_MAX_ITEMS }),
        (id, count) => {
          const item: OrderingData = { ...data, id, items: itemsOf(count) };
          const start = orderingStart(item).map((entry) => entry.id);
          expect(new Set(start).size).toBe(count);
          expect(score('ordering', item, order(start)).score).toBe(0);
        },
      ),
    );
  });

  it('is the other order of two items, and the only order of one', () => {
    expect(orderingStart({ id: 'a', items: itemsOf(2) }).map((item) => item.id)).toEqual([
      'x1',
      'x0',
    ]);
    expect(orderingStart({ id: 'a', items: itemsOf(1) }).map((item) => item.id)).toEqual(['x0']);
  });
});

describe('ordering — schema guards', () => {
  it('accepts a well-formed activity', () => {
    expect(errorsOf(data)).toEqual([]);
  });

  it('refuses fewer than two items, or more than thirty', () => {
    expect(errorsOf({ ...data, items: data.items.slice(0, 1) })[0]?.[0]).toBe('items');
    expect(errorsOf({ ...data, items: itemsOf(ORDERING_MAX_ITEMS) })).toEqual([]);
    expect(errorsOf({ ...data, items: itemsOf(ORDERING_MAX_ITEMS + 1) })[0]?.[0]).toBe('items');
  });

  it('refuses a shared id, and two items that read the same, at the later item', () => {
    expect(
      errorsOf({
        ...data,
        items: [
          { id: 'k', text: 'One.' },
          { id: 'q', text: 'Two.' },
          { id: 'k', text: 'Three.' },
          { id: 'z', text: ' Two. ' },
        ],
      }),
    ).toEqual([
      ['items.2.id', 'Item ids must be unique.'],
      ['items.3.text', 'Two items read the same, so no order between them is right.'],
    ]);
  });
});

describe('ordering — scoring', () => {
  it('gives full marks for the right order, and reports each item', () => {
    const result = score('ordering', data, order(['k', 'q', 'w', 'e', 'r']));
    expect(result.score).toBe(1);
    expect(result.details).toEqual([
      {
        itemId: 'k',
        outcome: 'correct',
        learnerResponse: '',
        correctResponse: '',
        weight: 1,
      },
      { itemId: 'q', outcome: 'correct', learnerResponse: 'k', correctResponse: 'k', weight: 1 },
      { itemId: 'w', outcome: 'correct', learnerResponse: 'q', correctResponse: 'q', weight: 1 },
      { itemId: 'e', outcome: 'correct', learnerResponse: 'w', correctResponse: 'w', weight: 1 },
      { itemId: 'r', outcome: 'correct', learnerResponse: 'e', correctResponse: 'e', weight: 1 },
    ]);
  });

  it('costs an item moved to the front two items, not every one after it', () => {
    // r first, then the rest in order: k loses "first", r loses "after e".
    const result = score('ordering', data, order(['r', 'k', 'q', 'w', 'e']));
    expect(result.score).toBe(3 / 5);
    expect(result.details.map((detail) => [detail.itemId, detail.outcome])).toEqual([
      ['k', 'incorrect'],
      ['q', 'correct'],
      ['w', 'correct'],
      ['e', 'correct'],
      ['r', 'incorrect'],
    ]);
  });

  it('scores a reversed order 0', () => {
    expect(score('ordering', data, order(['r', 'e', 'w', 'q', 'k'])).score).toBe(0);
  });

  it('ignores ids that name no item and repeats, and marks an item left out as not placed', () => {
    const result = score('ordering', data, order(['k', 'zz', 'q', 'k', 7, 'e', 'r']));
    // k first ✓, q after k ✓, w not placed, e after q ✗, r after e ✓.
    expect(result.score).toBe(3 / 5);
    expect(result.details.map((detail) => [detail.itemId, detail.outcome])).toEqual([
      ['k', 'correct'],
      ['q', 'correct'],
      ['w', 'incorrect-omission'],
      ['e', 'incorrect'],
      ['r', 'correct'],
    ]);
    expect(score('ordering', data, { type: 'ordering' } as never).score).toBe(0);
  });

  it('scores zero for content with no item, which the schema refuses', () => {
    const result = score('ordering', { ...data, items: [] }, order([]));
    expect(result).toMatchObject({ score: 0, details: [] });
  });

  it('gives all-or-nothing full marks only for the right order', () => {
    const strict = { ...data, scoringStrategy: 'all-or-nothing' as const };
    expect(score('ordering', strict, order(['k', 'q', 'w', 'e', 'r'])).score).toBe(1);
    expect(score('ordering', strict, order(['k', 'q', 'w', 'r', 'e'])).score).toBe(0);
    expect(score('ordering', strict, order(['k', 'q', 'w', 'e'])).score).toBe(0);
  });

  it('evaluates to a scored outcome, and counts a response with an order as answered', () => {
    const outcome = evaluate(data, order(['k', 'q', 'w', 'e', 'r']));
    expect(outcome).toMatchObject({ status: 'scored', score: 1, passed: true });
    const descriptor = getActivityTypeDescriptor('ordering');
    expect(descriptor?.isAnswered?.(order(['k']) as never)).toBe(true);
    expect(descriptor?.isAnswered?.(order([]) as never)).toBe(false);
  });
});

describe('ordering — redaction and interop', () => {
  it("lists a learner's copy in the start order, without feedback or scoring", () => {
    const redacted = redact(data, { reveal: 'none' });
    expect(() => assertRedacted(redacted)).not.toThrow();
    expect(redacted).toEqual({
      schemaVersion: '1.0',
      type: 'ordering',
      id: 'or1',
      title: 'Making pasta',
      instructions: 'Put the steps in order.',
      items: orderingStart(data).map(({ id, text }) => ({ id, text })),
      redacted: true,
    });
    // An after-submit copy reveals the key on purpose: the right order, and feedback.
    const after = redact(data, { reveal: 'after-submit' }) as unknown as OrderingData;
    expect(after.items.map((item) => item.id)).toEqual(['k', 'q', 'w', 'e', 'r']);
    expect(after.items[1]?.feedback).toBe('Pasta goes into boiling water.');
  });

  it('refuses a hand-built copy that still carries feedback', () => {
    expect(() =>
      assertRedacted({ ...redact(data), items: data.items.map((item) => ({ ...item })) }),
    ).toThrow();
  });

  it('publishes the xAPI sequencing pattern of the right order', () => {
    expect(xapiDefinitionFor(data)).toMatchObject({
      interactionType: 'sequencing',
      correctResponsesPattern: ['k[,]q[,]w[,]e[,]r'],
    });
  });
});
