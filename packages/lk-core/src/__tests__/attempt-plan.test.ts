import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { planAttempt, scoredItemsFromPlan, verifyAttemptPlan } from '../attempt-plan.js';
import { canonicalJson, contentHash, fingerprint } from '../content-hash.js';
import { composeAssessmentScore } from '../scoring/compose.js';
import type { ItemOutcome } from '../types/activity.js';
import type { ItemGroup, SequenceEntry } from '../types/item-group.js';

interface Item {
  id: string;
  type: 'multiple-choice';
  question?: string;
  slotKey?: string;
}

const item = (id: string, over: Partial<Item> = {}): Item => ({
  id,
  type: 'multiple-choice',
  question: `${id}?`,
  ...over,
});

const group = (
  id: string,
  ids: readonly string[],
  over: Partial<ItemGroup<Item>> = {},
): ItemGroup<Item> => ({
  schemaVersion: '1.0',
  type: 'item-group',
  id,
  stimulus: { id: `s-${id}`, kind: 'text', body: 'Read this passage.' },
  items: ids.map((i) => item(i)),
  ...over,
});

const scored = (score: number): ItemOutcome => ({
  status: 'scored',
  score,
  maxScore: 1,
  passed: score >= 0.7,
  feedback: null,
  details: [],
});

describe('canonicalJson', () => {
  it('is independent of the order keys were written in', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });

  it('preserves array order, which IS content', () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it('omits undefined properties, matching JSON.stringify', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe(canonicalJson({ a: 1 }));
  });

  it('distinguishes the non-finite numbers JSON.stringify collapses to null', () => {
    const values = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, null];
    const rendered = values.map((v) => canonicalJson({ x: v }));
    expect(new Set(rendered).size).toBe(values.length);
  });

  it('treats -0 and 0 as the same content', () => {
    expect(canonicalJson({ x: -0 })).toBe(canonicalJson({ x: 0 }));
  });

  it('reports a circular reference instead of overflowing the stack', () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    expect(() => canonicalJson(cyclic)).toThrow(/circular reference/);
  });

  it('allows the same object in two sibling positions', () => {
    const shared = { a: 1 };
    expect(() => canonicalJson({ x: shared, y: shared })).not.toThrow();
    expect(canonicalJson({ x: shared, y: shared })).toBe(
      canonicalJson({ x: { a: 1 }, y: { a: 1 } }),
    );
  });
});

describe('fingerprint', () => {
  it('is deterministic and 16 hex digits', () => {
    expect(fingerprint('abc')).toBe(fingerprint('abc'));
    expect(fingerprint('abc')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('changes when the input changes', () => {
    expect(fingerprint('abc')).not.toBe(fingerprint('abd'));
    expect(fingerprint('')).not.toBe(fingerprint('a'));
  });

  it('property: equal content hashes equal, and differing content almost never collides', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => {
        expect(contentHash({ v: a })).toBe(contentHash({ v: a }));
        if (a !== b) {
          expect(contentHash({ v: a })).not.toBe(contentHash({ v: b }));
        }
      }),
    );
  });
});

describe('planAttempt', () => {
  const entries: SequenceEntry<Item>[] = [item('q1'), group('g', ['a', 'b']), item('q2')];

  it('freezes order, identity, points and a content fingerprint per slot', () => {
    const plan = planAttempt(entries);

    expect(plan.planVersion).toBe('1.0');
    expect(plan.slots.map((s) => s.slotId)).toEqual(['0', '1.0', '1.1', '2']);
    expect(plan.slots.map((s) => s.index)).toEqual([0, 1, 2, 3]);
    expect(plan.slots.map((s) => s.activityId)).toEqual(['q1', 'a', 'b', 'q2']);
    expect(plan.slots.every((s) => /^[0-9a-f]{16}$/.test(s.contentHash))).toBe(true);
    expect(plan.slots[1]?.group?.id).toBe('g');
    expect(plan.slots[1]?.group?.stimulusHash).toBe(plan.slots[2]?.group?.stimulusHash);
    expect(plan.slots[0]?.group).toBeUndefined();
  });

  it('defaults every slot to 1 point and totals them', () => {
    const plan = planAttempt(entries);
    expect(plan.slots.every((s) => s.points === 1)).toBe(true);
    expect(plan.totalPoints).toBe(4);
  });

  it('resolves points from the paper, not from the content', () => {
    const plan = planAttempt(entries, {
      points: (slot) => (slot.group === undefined ? 3 : 1),
    });
    expect(plan.slots.map((s) => s.points)).toEqual([3, 1, 1, 3]);
    expect(plan.totalPoints).toBe(8);
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    -1,
  ])('refuses %s points rather than poisoning the total', (points) => {
    expect(() => planAttempt(entries, { points: () => points })).toThrow(/finite, non-negative/);
  });

  it('is deterministic: the same entries and seed produce an identical plan', () => {
    const a = planAttempt(entries, { shuffleEntries: true, seed: 'attempt-1' });
    const b = planAttempt(entries, { shuffleEntries: true, seed: 'attempt-1' });
    expect(a).toEqual(b);
    expect(a.planHash).toBe(b.planHash);
    expect(a.seed).toBe('attempt-1');
  });

  it('records the presented order under a shuffle, keeping the group contiguous', () => {
    const plan = planAttempt(entries, { shuffleEntries: true, seed: 'attempt-7' });
    const groupIndices = plan.slots.filter((s) => s.group?.id === 'g').map((s) => s.index);
    expect(groupIndices).toEqual([groupIndices[0], (groupIndices[0] ?? 0) + 1]);
    expect([...plan.slots.map((s) => s.slotId)].sort()).toEqual(['0', '1.0', '1.1', '2']);
  });

  it('inherits flattenSequence’s refusals', () => {
    expect(() => planAttempt([group('g', [])])).toThrow(/has no items/);
    expect(() => planAttempt(entries, { shuffleEntries: true })).toThrow(/seed is required/);
  });
});

describe('slotKey — identity that survives editing', () => {
  it('uses an authored key instead of the positional path', () => {
    const entries: SequenceEntry<Item>[] = [
      item('q1', { slotKey: 'intro' }),
      group('g', ['a', 'b'], { slotKey: 'reading' }),
    ];
    const plan = planAttempt(entries);
    expect(plan.slots.map((s) => s.slotId)).toEqual(['intro', 'reading.0', 'reading.1']);
  });

  it('keeps stored ids valid when a question is inserted above — the whole point', () => {
    const keyed: SequenceEntry<Item>[] = [
      item('q1', { slotKey: 'a' }),
      item('q2', { slotKey: 'b' }),
    ];
    const before = planAttempt(keyed).slots.map((s) => s.slotId);

    const edited: SequenceEntry<Item>[] = [item('new', { slotKey: 'z' }), ...keyed];
    const after = planAttempt(edited).slots.map((s) => s.slotId);

    // 'a' still means q1 and 'b' still means q2.
    expect(after).toEqual(['z', ...before]);

    // Without keys, the same insertion silently re-maps every stored id.
    const positional = planAttempt([item('q1'), item('q2')]).slots.map((s) => s.slotId);
    const positionalAfter = planAttempt([item('new'), item('q1'), item('q2')]).slots;
    expect(positional).toEqual(['0', '1']);
    expect(positionalAfter.find((s) => s.slotId === '0')?.activityId).toBe('new');
  });

  it('refuses two entries that collide on a key', () => {
    expect(() =>
      planAttempt([item('q1', { slotKey: 'same' }), item('q2', { slotKey: 'same' })]),
    ).toThrow(/duplicate slot id "same"/);
  });

  it('refuses a key containing the group separator', () => {
    expect(() => planAttempt([item('q1', { slotKey: 'a.b' })])).toThrow(/contains a "\."/);
  });

  it('refuses an empty key rather than falling back silently', () => {
    expect(() => planAttempt([item('q1', { slotKey: '' })])).toThrow(/non-empty string/);
  });

  it('refuses a loose entry and a group sharing one key', () => {
    // Their slot ids never collide ("reading" vs "reading.0"), but everything
    // reading the entry prefix — the pager's stimulus grouping — treats them
    // as one entry and shows the group's passage above the loose question.
    expect(() =>
      planAttempt([
        item('loose', { slotKey: 'reading' }),
        group('g', ['x'], { slotKey: 'reading' }),
      ]),
    ).toThrow(/duplicate entry key "reading"/);
  });

  it('uses an authored key on an item INSIDE a group', () => {
    const plan = planAttempt([
      group('g', [], {
        slotKey: 'reading',
        items: [item('x', { slotKey: 'q1' }), item('y', { slotKey: 'q2' })],
      }),
    ]);
    expect(plan.slots.map((s) => s.slotId)).toEqual(['reading.q1', 'reading.q2']);
  });
});

describe('verifyAttemptPlan', () => {
  const entries: SequenceEntry<Item>[] = [
    item('q1', { slotKey: 'a' }),
    group('g', ['x', 'y'], { slotKey: 'r' }),
  ];
  const original = planAttempt(entries);

  it('reports a clean match against unchanged content', () => {
    const drift = verifyAttemptPlan(original, planAttempt(entries));
    expect(drift).toEqual({
      matches: true,
      missingSlotIds: [],
      addedSlotIds: [],
      changedSlotIds: [],
      changedStimulusSlotIds: [],
      changedPointsSlotIds: [],
      reorderedSlotIds: [],
    });
  });

  it('catches an edit to a question the ids alone would hide', () => {
    const edited: SequenceEntry<Item>[] = [
      item('q1', { slotKey: 'a', question: 'reworded?' }),
      group('g', ['x', 'y'], { slotKey: 'r' }),
    ];
    const drift = verifyAttemptPlan(original, planAttempt(edited));
    expect(drift.matches).toBe(false);
    expect(drift.changedSlotIds).toEqual(['a']);
    expect(drift.changedStimulusSlotIds).toEqual([]);
  });

  it('catches a corrected passage, which changes every question under it', () => {
    const edited: SequenceEntry<Item>[] = [
      item('q1', { slotKey: 'a' }),
      group('g', ['x', 'y'], {
        slotKey: 'r',
        stimulus: { id: 's-g', kind: 'text', body: 'Read this corrected passage.' },
      }),
    ];
    const drift = verifyAttemptPlan(original, planAttempt(edited));
    expect(drift.changedStimulusSlotIds).toEqual(['r.0', 'r.1']);
    expect(drift.changedSlotIds).toEqual([]);
  });

  it('reports removed and added slots separately', () => {
    const drift = verifyAttemptPlan(
      original,
      planAttempt([item('q1', { slotKey: 'a' }), item('extra', { slotKey: 'new' })]),
    );
    expect(drift.missingSlotIds).toEqual(['r.0', 'r.1']);
    expect(drift.addedSlotIds).toEqual(['new']);
  });

  it('reports a re-order even when nothing else changed', () => {
    const reordered: SequenceEntry<Item>[] = [
      group('g', ['x', 'y'], { slotKey: 'r' }),
      item('q1', { slotKey: 'a' }),
    ];
    const drift = verifyAttemptPlan(original, planAttempt(reordered));
    expect(drift.reorderedSlotIds).toEqual(['a', 'r.0', 'r.1']);
    expect(drift.changedSlotIds).toEqual([]);
  });

  it('catches a reweight, which moves the grade without touching a question', () => {
    const base = planAttempt(entries, { points: () => 1 });
    const heavier = planAttempt(entries, { points: (s) => (s.index === 0 ? 5 : 1) });
    const drift = verifyAttemptPlan(base, heavier);
    expect(drift.matches).toBe(false);
    expect(drift.changedPointsSlotIds).toEqual(['a']);
    expect(drift.changedSlotIds).toEqual([]);
    // `matches` and `planHash` must never disagree about whether the paper moved.
    expect(base.planHash).not.toBe(heavier.planHash);
  });

  it('a slotKey annotation is identity, not a content edit', () => {
    // Adding the key that PINS an item's identity must not report as
    // "this question was edited" — that is exactly backwards.
    const unkeyed = planAttempt([item('q1')]);
    const keyed = planAttempt([item('q1', { slotKey: '0' })]);
    expect(keyed.slots[0]?.slotId).toBe(unkeyed.slots[0]?.slotId);
    expect(keyed.slots[0]?.contentHash).toBe(unkeyed.slots[0]?.contentHash);
    expect(verifyAttemptPlan(unkeyed, keyed).matches).toBe(true);
  });

  it('reproduces a shuffled attempt from the plan’s own recorded options', () => {
    const many: SequenceEntry<Item>[] = [item('a'), item('b'), item('c'), item('d')];
    const stored = planAttempt(many, { shuffleEntries: true, seed: 'att-1' });
    expect(stored.shuffleEntries).toBe(true);

    // The documented recipe: re-plan with what the plan recorded.
    const now = planAttempt(many, {
      ...(stored.seed !== undefined ? { seed: stored.seed } : {}),
      ...(stored.shuffleEntries !== undefined ? { shuffleEntries: stored.shuffleEntries } : {}),
    });
    expect(verifyAttemptPlan(stored, now).matches).toBe(true);

    // Dropping the flag rebuilds authored order and invents drift.
    const withoutFlag = planAttempt(many, {
      ...(stored.seed !== undefined ? { seed: stored.seed } : {}),
    });
    expect(verifyAttemptPlan(stored, withoutFlag).matches).toBe(false);
  });

  it('planHash alone distinguishes an edited paper', () => {
    const edited = planAttempt([
      item('q1', { slotKey: 'a', question: 'different?' }),
      group('g', ['x', 'y'], { slotKey: 'r' }),
    ]);
    expect(edited.planHash).not.toBe(original.planHash);
  });
});

describe('scoredItemsFromPlan', () => {
  const plan = planAttempt([item('q1'), item('q2'), item('q3')], {
    points: (slot) => (slot.activity.id === 'q3' ? 3 : 1),
  });

  it('carries the plan’s frozen points into the scored items', () => {
    const items = scoredItemsFromPlan(plan, { '0': scored(1), '1': scored(1), '2': scored(1) });
    expect(items.map((i) => [i.slotId, i.points])).toEqual([
      ['0', 1],
      ['1', 1],
      ['2', 3],
    ]);
  });

  it('keeps an unanswered slot in the paper, as a non-terminal deferred', () => {
    const items = scoredItemsFromPlan(plan, { '0': scored(1) });
    expect(items).toHaveLength(3);
    expect(items[1]?.outcome.status).toBe('deferred');
    expect(items.map((i) => i.slotId)).toEqual(['0', '1', '2']);
  });

  it('ignores outcomes for slots the plan does not contain', () => {
    const items = scoredItemsFromPlan(plan, { '0': scored(1), 'not-in-plan': scored(1) });
    expect(items.map((i) => i.slotId)).toEqual(['0', '1', '2']);
  });

  it.each([
    'constructor',
    'toString',
    'valueOf',
    '__proto__',
  ])('does not resolve slot id %s through the prototype chain', (slotKey) => {
    // A bare `outcomes[slotId]` returns a FUNCTION for these keys, which
    // would reach composeAssessmentScore in place of an outcome.
    const keyed = planAttempt([item('q1', { slotKey })]);
    const items = scoredItemsFromPlan(keyed, {});
    expect(items).toHaveLength(1);
    expect(items[0]?.outcome.status).toBe('deferred');
    expect(typeof items[0]?.outcome).toBe('object');
  });

  it('still reads a real outcome stored under such a key', () => {
    const keyed = planAttempt([item('q1', { slotKey: 'constructor' })]);
    const items = scoredItemsFromPlan(keyed, { constructor: scored(1) });
    expect(items[0]?.outcome.status).toBe('scored');
  });
});

// ---------------------------------------------------------------------------
// The missing-outcome policy. `unscorable` here meant "a grade is never
// coming", which drops the slot from the denominator AND lets the result go
// final — so a three-question paper with one answer composed to a final,
// passing 100%.
// ---------------------------------------------------------------------------

describe('scoredItemsFromPlan — a slot with no outcome', () => {
  const plan = planAttempt([item('q1'), item('q2'), item('q3')]);
  const policy = { passThreshold: 0.7, rounding: { mode: 'half-up' as const, dp: 2 } };
  const compose = (items: ReturnType<typeof scoredItemsFromPlan>) =>
    composeAssessmentScore([{ id: 's', weight: 1, items }], policy);

  it('does NOT let an unanswered paper compose to a final pass', () => {
    const result = compose(scoredItemsFromPlan(plan, { '0': scored(1) }));
    expect(result.status).toBe('provisional');
    expect(result.passed).toBeNull();
  });

  it('defaults to deferred, which is non-terminal', () => {
    const items = scoredItemsFromPlan(plan, { '0': scored(1) });
    expect(items.map((i) => i.outcome.status)).toEqual(['scored', 'deferred', 'deferred']);
    expect(items[1]?.outcome).toMatchObject({ reason: 'no_response_recorded' });
  });

  it('scores blanks as zero over the WHOLE paper when told the attempt is complete', () => {
    const result = compose(scoredItemsFromPlan(plan, { '0': scored(1) }, { missing: 'zero' }));
    // 1 of 3 points — the denominator is the paper, not the one answer.
    expect(result.score).toBeCloseTo(0.33, 2);
    expect(result.status).toBe('final');
    expect(result.passed).toBe(false);
  });

  it('accepts a caller-built outcome per slot', () => {
    const items = scoredItemsFromPlan(
      plan,
      {},
      {
        missing: (slot) => ({
          status: 'unscorable',
          reason: `skipped ${slot.slotId}`,
          maxScore: 1,
        }),
      },
    );
    expect(items.every((i) => i.outcome.status === 'unscorable')).toBe(true);
  });

  it('a fully answered paper is still final', () => {
    const result = compose(
      scoredItemsFromPlan(plan, { '0': scored(1), '1': scored(1), '2': scored(1) }),
    );
    expect(result.status).toBe('final');
    expect(result.score).toBe(1);
  });

  it('feeds composeAssessmentScore so points actually decide the grade', () => {
    // q3 is worth 3 of the 5 points. Getting only q3 right must beat getting
    // both 1-point questions right — which is the whole reason points exist.
    const weighted = planAttempt([item('q1'), item('q2'), item('q3')], {
      points: (slot) => (slot.activity.id === 'q3' ? 3 : 1),
    });
    const scoreOf = (outcomes: Record<string, ItemOutcome>) =>
      composeAssessmentScore(
        [{ id: 'only', weight: 1, items: scoredItemsFromPlan(weighted, outcomes) }],
        { passThreshold: 0.5, rounding: { mode: 'half-up', dp: 2 } },
      ).score;

    const onlyBigOne = scoreOf({ '0': scored(0), '1': scored(0), '2': scored(1) });
    const onlySmallOnes = scoreOf({ '0': scored(1), '1': scored(1), '2': scored(0) });

    expect(onlyBigOne).toBe(0.6);
    expect(onlySmallOnes).toBe(0.4);
    expect(onlyBigOne).toBeGreaterThan(onlySmallOnes);
  });
});
