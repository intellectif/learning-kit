import { describe, expect, it } from 'vitest';
import { critiqueDraft } from '../authoring/index.js';
import { assertRedacted, redact } from '../redact.js';
import { readRubricLevels } from '../rubric-levels.js';
import { validateActivity } from '../schemas/index.js';
import type { WrittenResponseData } from '../types/activity.js';

/**
 * A rubric criterion's levels: what the grading functions read, and what 1.x
 * leaves valid. `validateActivity` passes your own fields through, so a
 * `levels` field it cannot use stays valid content; redaction drops it rather
 * than throw, and the item critic tells the author.
 */

const LEVELS = [
  { label: 'Limited', description: 'Errors often obscure meaning.' },
  { label: 'Developing' },
  { label: 'Secure', description: 'Errors are rare and never obscure meaning.' },
];

const essay = (levels: unknown): WrittenResponseData =>
  ({
    schemaVersion: '1.0',
    type: 'written-response',
    id: 'wr-levels',
    title: 'Your weekend',
    prompt: 'Write about your weekend.',
    minWords: 10,
    maxWords: 100,
    rubric: {
      criteria: [
        { name: 'Task', weight: 1 },
        { name: 'Grammar', weight: 1, ...(levels === undefined ? {} : { levels }) },
      ],
    },
  }) as WrittenResponseData;

/** Levels with an empty slot in the middle, made on purpose: a literal would be a lint error. */
function holed(): unknown[] {
  const levels: unknown[] = [{ label: 'Low' }];
  levels[2] = { label: 'High' };
  return levels;
}

const JUNK: [string, unknown][] = [
  ['a string', 'B1-C1'],
  ['one level', [{ label: 'Only' }]],
  ['eleven levels', Array.from({ length: 11 }, (_, i) => ({ label: `L${i}` }))],
  ['a level that is a number', [{ label: 'Low' }, 7]],
  ['a level with no label', [{ label: 'Low' }, { description: 'High' }]],
  ['a label that is a number', [{ label: 'Low' }, { label: 5 }]],
  ['a blank label', [{ label: 'Low' }, { label: '   ' }]],
  ['a description that is not text', [{ label: 'Low' }, { label: 'High', description: 3 }]],
  ['two labels alike', [{ label: 'B1' }, { label: ' b1 ' }]],
  ['a hole', holed()],
];

describe('readRubricLevels', () => {
  it('reads absent or null as no levels, and levels as written', () => {
    expect(readRubricLevels(undefined)).toEqual({ ok: true, levels: null });
    expect(readRubricLevels(null)).toEqual({ ok: true, levels: null });
    expect(readRubricLevels(LEVELS)).toEqual({ ok: true, levels: LEVELS });
  });

  it('takes 2 levels and 10, and no fewer or more', () => {
    const of = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `L${i}` }));
    expect(readRubricLevels(of(2)).ok).toBe(true);
    expect(readRubricLevels(of(10)).ok).toBe(true);
    expect(readRubricLevels(of(1))).toEqual({ ok: false, problem: 'too-few' });
    expect(readRubricLevels(of(11))).toEqual({ ok: false, problem: 'too-many' });
    expect(readRubricLevels([])).toEqual({ ok: false, problem: 'too-few' });
  });

  it('names the problem and the level it is about', () => {
    expect(readRubricLevels('B1')).toEqual({ ok: false, problem: 'not-a-list' });
    expect(readRubricLevels([{ label: 'a' }, null])).toEqual({
      ok: false,
      problem: 'not-a-level',
      index: 1,
    });
    expect(readRubricLevels([{ label: 'a' }, ['b']])).toMatchObject({ problem: 'not-a-level' });
    expect(readRubricLevels([{ label: 'a' }, { label: '' }])).toMatchObject({
      problem: 'no-label',
      index: 1,
    });
    expect(readRubricLevels([{ label: 'a', description: null }, { label: 'b' }])).toMatchObject({
      problem: 'bad-description',
      index: 0,
    });
  });

  it('compares labels composed, trimmed, spaced once and lower-cased', () => {
    const composed = `${String.fromCodePoint(0xc9)}l`;
    // Built from code points: a formatter or an editor may compose an escape.
    const decomposed = `E${String.fromCodePoint(0x301)}l`;
    expect(readRubricLevels([{ label: composed }, { label: decomposed }])).toMatchObject({
      problem: 'duplicate-label',
      index: 1,
    });
    expect(readRubricLevels([{ label: 'Very  good' }, { label: 'very good' }])).toMatchObject({
      problem: 'duplicate-label',
    });
    // Punctuation is part of a label: A2 and A2+ are two levels.
    expect(readRubricLevels([{ label: 'A2' }, { label: 'A2+' }]).ok).toBe(true);
  });

  it('reads each level and field once', () => {
    const reads: string[] = [];
    const counted = (label: string) =>
      Object.defineProperties(
        {},
        {
          label: {
            enumerable: true,
            get: () => {
              reads.push(label);
              return label;
            },
          },
        },
      );
    const result = readRubricLevels([counted('Low'), counted('High')]);
    expect(result).toEqual({ ok: true, levels: [{ label: 'Low' }, { label: 'High' }] });
    expect(reads).toEqual(['Low', 'High']);
  });
});

describe('levels in 1.x content', () => {
  it.each(JUNK)('%s stays valid content: validateActivity does not check levels', (_l, levels) => {
    expect(validateActivity('written-response', essay(levels)).success).toBe(true);
  });

  it('keeps levels a grader can use when redacting, and only their documented fields', () => {
    const levels = [
      { label: 'Low', description: 'Errors obscure meaning.', graderNote: 'secret' },
      { label: 'High' },
    ];
    const out = redact(essay(levels)) as unknown as {
      rubric: { criteria: { levels?: unknown }[] };
    };
    expect(out.rubric.criteria[1]?.levels).toEqual([
      { label: 'Low', description: 'Errors obscure meaning.' },
      { label: 'High' },
    ]);
    expect(JSON.stringify(out)).not.toContain('secret');
    expect(() => assertRedacted(out)).not.toThrow();
    const after = redact(essay(levels), { reveal: 'after-submit' }) as unknown as typeof out;
    expect(after.rubric.criteria[1]?.levels).toHaveLength(2);
  });

  it.each(JUNK)('drops %s when redacting, rather than throw', (_l, levels) => {
    const out = redact(essay(levels)) as unknown as {
      rubric: { criteria: Record<string, unknown>[] };
    };
    expect(out.rubric.criteria[1]).not.toHaveProperty('levels');
    expect(out.rubric.criteria[1]).toMatchObject({ name: 'Grammar', weight: 1 });
    expect(() => assertRedacted(out)).not.toThrow();
  });

  it('refuses a redacted payload carrying levels redaction would have dropped', () => {
    const good = redact(essay(LEVELS)) as unknown as {
      rubric: { criteria: Record<string, unknown>[] };
    };
    expect(() => assertRedacted(good)).not.toThrow();
    const smuggled = structuredClone(good);
    (smuggled.rubric.criteria[1] as Record<string, unknown>).levels = [{ label: 'Only' }];
    expect(() => assertRedacted(smuggled)).toThrow();
  });
});

describe('the item critic warns about levels a grader cannot use', () => {
  it('says which criterion, which level, and why', () => {
    const findings = critiqueDraft('written-response', essay([{ label: 'B1' }, { label: 'b1' }]));
    expect(findings).toEqual([
      {
        code: 'wr_levels_unreadable',
        severity: 'warning',
        path: ['rubric', 'criteria', '1', 'levels'],
        message:
          'Level 2 of criterion 2 has the label of an earlier level, so a grader cannot judge against them.',
      },
    ]);
  });

  it.each(JUNK)('warns for %s', (_l, levels) => {
    const codes = critiqueDraft('written-response', essay(levels)).map((one) => one.code);
    expect(codes).toEqual(['wr_levels_unreadable']);
  });

  it('says nothing about usable levels, null or none', () => {
    for (const levels of [LEVELS, null, undefined]) {
      expect(critiqueDraft('written-response', essay(levels))).toEqual([]);
    }
  });

  it('words a whole-list problem without a level', () => {
    const [one] = critiqueDraft('written-response', essay('B1'));
    expect(one?.message).toBe(
      "Criterion 2's levels are not a list, so a grader cannot judge against them.",
    );
  });
});
