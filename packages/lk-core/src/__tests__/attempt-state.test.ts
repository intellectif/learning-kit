import { describe, expect, it } from 'vitest';
import { planAttempt } from '../attempt-plan.js';
import { diffResponses, restoreAttemptState, serializeAttemptState } from '../attempt-state.js';
import type { LearnerResponse } from '../types/activity.js';
import type { SequenceEntry } from '../types/item-group.js';

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

const entries: SequenceEntry<Item>[] = [
  item('q1', { slotKey: 'a' }),
  item('q2', { slotKey: 'b' }),
  item('q3', { slotKey: 'c' }),
];
const plan = planAttempt(entries);

const pick = (...ids: string[]): LearnerResponse => ({
  type: 'multiple-choice',
  selectedOptionIds: ids,
});

describe('serializeAttemptState', () => {
  it('captures answers, submissions and position against the plan', () => {
    const state = serializeAttemptState(plan, {
      responses: { a: pick('x'), b: pick('y') },
      submittedSlotIds: ['a'],
      index: 1,
      savedAt: '2026-09-04T10:00:00.000Z',
    });

    expect(state).toEqual({
      stateVersion: '1.0',
      planHash: plan.planHash,
      responses: { a: pick('x'), b: pick('y') },
      submittedSlotIds: ['a'],
      index: 1,
      savedAt: '2026-09-04T10:00:00.000Z',
    });
  });

  it('defaults to the first question with nothing submitted', () => {
    const state = serializeAttemptState(plan, { responses: {} });
    expect(state.index).toBe(0);
    expect(state.submittedSlotIds).toEqual([]);
    expect(state).not.toHaveProperty('savedAt');
  });

  it('snapshots rather than aliases, so the live attempt cannot mutate it', () => {
    const live: Record<string, LearnerResponse> = { a: pick('x') };
    const state = serializeAttemptState(plan, { responses: live });
    live.b = pick('y');
    expect(Object.keys(state.responses)).toEqual(['a']);
  });

  it('copies DEEPLY — an answer edited in place must not rewrite the snapshot', () => {
    // A one-level spread hands back the caller's same response objects, so a
    // reducer that mutates (an Immer draft, a push onto a multi-select) edits
    // every snapshot ever taken. The stored answer then retroactively becomes
    // the new one and diffResponses sees nothing to save.
    const live: Record<string, LearnerResponse> = { a: pick('x') };
    const snapshot = serializeAttemptState(plan, { responses: live });

    (live.a as { selectedOptionIds: string[] }).selectedOptionIds.push('y');

    expect(snapshot.responses.a).toEqual(pick('x'));
    expect(snapshot.responses.a).not.toBe(live.a);
    // And the delta the docs recommend must SEE the change.
    const next = serializeAttemptState(plan, { responses: live });
    expect(diffResponses(snapshot, next).map((d) => d.change)).toEqual(['changed']);
  });

  it('copies deeply for a nested fill-in-the-blanks answer too', () => {
    const answer: LearnerResponse = { type: 'fill-in-the-blanks', answers: { b1: 'blue' } };
    const live: Record<string, LearnerResponse> = { a: answer };
    const snapshot = serializeAttemptState(plan, { responses: live });
    (live.a as { answers: Record<string, string> }).answers.b2 = 'green';
    expect(snapshot.responses.a).toEqual({ type: 'fill-in-the-blanks', answers: { b1: 'blue' } });
  });

  it('refuses a response for a slot the paper does not contain', () => {
    // Finding this when a learner tries to resume is finding it far too late.
    expect(() =>
      serializeAttemptState(plan, { responses: { a: pick('x'), ghost: pick('y') } }),
    ).toThrow(/does not contain: ghost/);
  });

  it('refuses a submitted slot the paper does not contain', () => {
    expect(() =>
      serializeAttemptState(plan, { responses: {}, submittedSlotIds: ['nope'] }),
    ).toThrow(/submitted slot\(s\) the plan does not contain: nope/);
  });

  it.each([-1, 3, 1.5, Number.NaN])('refuses index %s, which is no position at all', (index) => {
    expect(() => serializeAttemptState(plan, { responses: {}, index })).toThrow(
      /is not a position/,
    );
  });

  it('accepts the last valid position', () => {
    expect(serializeAttemptState(plan, { responses: {}, index: 2 }).index).toBe(2);
  });

  it('admits only index 0 for an empty plan', () => {
    // Guarding the range check behind `slots.length > 0` skipped it entirely
    // here, so a zero-slot paper accepted any index at all.
    const empty = planAttempt([]);
    expect(serializeAttemptState(empty, { responses: {} }).index).toBe(0);
    expect(() => serializeAttemptState(empty, { responses: {}, index: 1 })).toThrow(
      /is not a position in a 0-slot plan/,
    );
  });

  it('round-trips a slot id that collides with a prototype key', () => {
    // Slot ids are author-controlled strings; `constructor` must be storage,
    // not a reference to Object.prototype.constructor.
    const keyed = planAttempt([item('q1', { slotKey: 'constructor' })]);
    const answer: LearnerResponse = { type: 'multiple-choice', selectedOptionIds: ['x'] };
    const state = serializeAttemptState(keyed, {
      responses: Object.fromEntries([['constructor', answer]]),
    });
    const back = restoreAttemptState(keyed, JSON.parse(JSON.stringify(state)) as typeof state);
    expect(Object.keys(back.responses)).toEqual(['constructor']);
    expect(back.responses.constructor).toEqual(answer);
  });
});

describe('restoreAttemptState', () => {
  const state = serializeAttemptState(plan, {
    responses: { a: pick('x') },
    submittedSlotIds: ['a'],
    index: 1,
  });

  it('reopens a snapshot against its own plan', () => {
    expect(restoreAttemptState(plan, state)).toEqual(state);
  });

  it('refuses a snapshot from a different paper', () => {
    // Slot ids are short and stable, so answers from last term's midterm would
    // line up against these questions and look entirely plausible doing it.
    const otherPaper = planAttempt([
      item('other1', { slotKey: 'a' }),
      item('other2', { slotKey: 'b' }),
      item('other3', { slotKey: 'c' }),
    ]);
    expect(otherPaper.planHash).not.toBe(plan.planHash);
    expect(() => restoreAttemptState(otherPaper, state)).toThrow(/different paper/);
  });

  it('refuses a snapshot edited in storage to reference an unknown slot', () => {
    const tampered = { ...state, responses: { ...state.responses, ghost: pick('z') } };
    expect(() => restoreAttemptState(plan, tampered)).toThrow(/does not contain: ghost/);
  });

  it('refuses an envelope version it does not understand, rather than restamping it', () => {
    // The one field added so a snapshot survives an envelope change was the
    // one field never read — and restamping destroyed the evidence.
    const future = { ...state, stateVersion: '2.0' } as unknown as typeof state;
    expect(() => restoreAttemptState(plan, future)).toThrow(/unsupported stateVersion "2\.0"/);
  });

  it('reports a NULL responses column instead of a bare TypeError', () => {
    const broken = { ...state, responses: null } as unknown as typeof state;
    expect(() => restoreAttemptState(plan, broken)).toThrow(/carries no responses object/);
  });

  it('refuses a snapshot whose position no longer exists', () => {
    const shorter = planAttempt([entries[0] as Item]);
    const forShorter = serializeAttemptState(shorter, { responses: {}, index: 0 });
    expect(() => restoreAttemptState(shorter, { ...forShorter, index: 5 })).toThrow(
      /is not a position/,
    );
  });
});

describe('diffResponses', () => {
  it('reports additions, removals and changes, sorted by slot id', () => {
    const before = { responses: { a: pick('x'), b: pick('y') } };
    const after = { responses: { a: pick('x'), b: pick('z'), c: pick('w') } };

    expect(diffResponses(before, after)).toEqual([
      { slotId: 'b', change: 'changed', before: pick('y'), after: pick('z') },
      { slotId: 'c', change: 'added', after: pick('w') },
    ]);
  });

  it('sees an answer the learner CLEARED, which the later snapshot alone cannot', () => {
    const diff = diffResponses({ responses: { a: pick('x') } }, { responses: {} });
    expect(diff).toEqual([{ slotId: 'a', change: 'removed', before: pick('x') }]);
  });

  it('is empty when nothing moved', () => {
    const responses = { a: pick('x') };
    expect(diffResponses({ responses }, { responses: { a: pick('x') } })).toEqual([]);
  });

  it('does not report a JSON round-trip as a change the learner never made', () => {
    const before = { responses: { a: { type: 'multiple-choice', selectedOptionIds: ['x'] } } };
    // Same content, keys written in the other order.
    const after = { responses: { a: { selectedOptionIds: ['x'], type: 'multiple-choice' } } };
    expect(diffResponses(before as never, after as never)).toEqual([]);
  });

  it('treats a reordered selection as a real change', () => {
    // Selection order is content: it is what the learner picked, in the order
    // the response records it.
    const diff = diffResponses(
      { responses: { a: pick('x', 'y') } },
      { responses: { a: pick('y', 'x') } },
    );
    expect(diff.map((entry) => entry.change)).toEqual(['changed']);
  });
});
