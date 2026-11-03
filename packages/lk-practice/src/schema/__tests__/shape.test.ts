import { describe, expect, it } from 'vitest';
import { evidence, item, masterA, practice, run, T0 } from '../../log/__tests__/fixtures.js';
import type { ReviewLogEntry } from '../../types.js';
import { entryShape, isRecord, shapeIssues, stateShape } from '../shape.js';

const p = practice();
const [entry] = run(p, [{ evidence: evidence('e1', 'i1', T0), item: item('i1') }]).entries as [
  ReviewLogEntry,
];
// biome-ignore lint/suspicious/noExplicitAny: the tests edit parsed JSON in place.
const plain = (): Record<string, any> => JSON.parse(JSON.stringify(entry));

function messages(shape: typeof entryShape, value: unknown): [string, string][] {
  return shapeIssues(shape, value).map((found) => [found.path.join('.'), found.message]);
}

describe('entry shape', () => {
  it('accepts a recorded entry', () => {
    expect(shapeIssues(entryShape, plain())).toEqual([]);
  });

  it('asks for an object before reading its kind', () => {
    expect(messages(entryShape, 'x')).toEqual([['', 'an object.']]);
    expect(messages(entryShape, { ...plain(), kind: 'note' })).toEqual([
      ['kind', 'kind is one of evidence, host.'],
    ]);
  });

  it('asks for a non-empty task skill list', () => {
    const value = plain();
    value.task.skills = [];
    expect(messages(entryShape, value)).toEqual([
      ['task.skills', expect.stringContaining('a non-empty array')],
    ]);
  });

  it('checks passed against total in auto checks', () => {
    const value = plain();
    value.evidence.source = { ...value.evidence.source, checks: { passed: 3, total: 2 } };
    expect(messages(entryShape, value)).toEqual([
      ['evidence.source.checks.passed', 'passed is at most total.'],
    ]);
  });

  it('ties the entry instant, the task and its item to the evidence', () => {
    const late = plain();
    late.at += 1;
    expect(messages(entryShape, late)).toEqual([['at', 'at equals evidence.at.']]);

    const untasked = plain();
    delete untasked.task;
    expect(messages(entryShape, untasked)).toEqual([
      ['task', 'task is required unless the evidence confirms held evidence.'],
    ]);

    const confirmation = plain();
    confirmation.evidence.confirms = 'h1';
    expect(messages(entryShape, confirmation)).toEqual([
      ['task', 'A confirmation has no task; it uses the task of the held entry.'],
    ]);

    const other = plain();
    other.task.itemId = 'i9';
    expect(messages(entryShape, other)).toEqual([
      ['task.itemId', 'task.itemId equals evidence.itemId.'],
    ]);
  });
});

describe('state shape', () => {
  it('ties lastAt to the log length', () => {
    const state = JSON.parse(JSON.stringify(masterA(p).state));
    state.log.lastAt = null;
    expect(messages(stateShape, state)).toEqual([
      ['log.lastAt', 'lastAt is null exactly when the log is empty.'],
    ]);
    const empty = JSON.parse(
      JSON.stringify(p.initState('l1', { version: 'g1', skills: [], edges: [] })),
    );
    empty.log.lastAt = T0;
    expect(messages(stateShape, empty)).toHaveLength(1);
  });

  it('reads hypotheses as a record, absent in an old state (revised in M12)', () => {
    const state = JSON.parse(
      JSON.stringify(p.initState('l1', { version: 'g1', skills: [], edges: [] })),
    );
    expect(messages(stateShape, state)).toEqual([]);
    delete state.hypotheses;
    expect(messages(stateShape, state)).toEqual([]);
    for (const value of [1, [], null]) {
      state.hypotheses = value;
      expect(messages(stateShape, state).map(([path]) => path)).toEqual(['hypotheses']);
    }
  });
});

describe('isRecord', () => {
  it('takes a plain or null-prototype object, and nothing else', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord(Object.create(null))).toBe(true);
    expect(isRecord(new Map())).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
  });
});
