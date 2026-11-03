import { describe, expect, it } from 'vitest';
import { BASE, PROPOSAL } from '../../contracts/__tests__/appendix.js';
import { KIT, practice, state, steps } from '../../contracts/__tests__/fixtures.js';
import { run } from '../../log/__tests__/fixtures.js';
import type { JsonSchemaObject } from '../../types.js';
import { frozenCopy, plainCopy } from '../copy.js';
import {
  candidatesJsonSchema,
  decompositionJsonSchema,
  evidenceSchema,
  gradeResultJsonSchema,
  gradeResultSchema,
  practiceStateJsonSchema,
  practiceStateSchema,
  reviewLogEntryJsonSchema,
  reviewLogEntrySchema,
  standardSchema,
  VENDOR,
} from '../index.js';

/**
 * A validator for the JSON Schema keywords the package's documents use, so
 * the test needs no dependency. It throws on a keyword it does not know, so a
 * new keyword in a document fails here until the validator learns it.
 */
const KNOWN = new Set([
  '$schema',
  'title',
  'description',
  'type',
  'const',
  'enum',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'minLength',
  'items',
  'minItems',
  'maxItems',
  'properties',
  'required',
  'additionalProperties',
  'oneOf',
]);

function valid(schema: JsonSchemaObject | boolean, value: unknown): boolean {
  if (typeof schema === 'boolean') return schema;
  const s = schema as Record<string, unknown>;
  for (const key of Object.keys(s)) {
    if (!KNOWN.has(key)) throw new Error(`unknown keyword ${key}`);
  }
  if (s.type !== undefined) {
    const types = Array.isArray(s.type) ? s.type : [s.type];
    if (!types.some((type) => isType(type as string, value))) return false;
  }
  if ('const' in s && JSON.stringify(s.const) !== JSON.stringify(value)) return false;
  if (Array.isArray(s.enum) && !s.enum.some((option) => option === value)) return false;
  if (typeof value === 'number') {
    if (typeof s.minimum === 'number' && value < s.minimum) return false;
    if (typeof s.maximum === 'number' && value > s.maximum) return false;
    if (typeof s.exclusiveMinimum === 'number' && value <= s.exclusiveMinimum) return false;
  }
  if (typeof value === 'string' && typeof s.minLength === 'number') {
    if ([...value].length < s.minLength) return false;
  }
  if (Array.isArray(value)) {
    if (typeof s.minItems === 'number' && value.length < s.minItems) return false;
    if (typeof s.maxItems === 'number' && value.length > s.maxItems) return false;
    if (s.items !== undefined && !value.every((item) => valid(s.items as JsonSchemaObject, item))) {
      return false;
    }
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const properties = (s.properties ?? {}) as Record<string, JsonSchemaObject>;
    for (const name of (s.required ?? []) as string[]) if (!(name in record)) return false;
    for (const [name, item] of Object.entries(record)) {
      const own = properties[name];
      if (own !== undefined) {
        if (!valid(own, item)) return false;
      } else if (s.additionalProperties !== undefined) {
        if (!valid(s.additionalProperties as JsonSchemaObject | boolean, item)) return false;
      }
    }
  }
  if (Array.isArray(s.oneOf)) {
    if (s.oneOf.filter((option) => valid(option as JsonSchemaObject, value)).length !== 1) {
      return false;
    }
  }
  return true;
}

function isType(type: string, value: unknown): boolean {
  switch (type) {
    case 'null':
      return value === null;
    case 'array':
      return Array.isArray(value);
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    case 'integer':
      return Number.isInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    default:
      return typeof value === type;
  }
}

const grade = {
  score: 2,
  maxScore: 3,
  passed: false,
  criteria: [{ name: 'a1', score: 1, maxScore: 1 }],
  confidence: 'high',
  feedback: 'ok',
  grader: { kind: 'ai', id: 'g' },
};
const candidate = {
  id: 'c1',
  skills: [{ skillId: 'k', weight: 1 }],
  stage: 'complete',
  difficulty: 0.4,
  criteria: [{ name: 'k1', skillId: 'k' }],
  content: { prompt: 'fill the blanks', code: ['a', 1, null, true] },
};
const entries = run(practice, steps, KIT).entries;

describe('JSON Schema documents', () => {
  const documents = [
    practiceStateJsonSchema,
    reviewLogEntryJsonSchema,
    gradeResultJsonSchema,
    candidatesJsonSchema,
    decompositionJsonSchema,
  ];

  it('are frozen draft 2020-12 documents with a title and a description', () => {
    for (const document of documents) {
      expect(document.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(typeof document.title).toBe('string');
      expect(typeof document.description).toBe('string');
      expect(Object.isFrozen(document)).toBe(true);
      expect(JSON.parse(JSON.stringify(document))).toEqual(document);
    }
  });

  it('accept what the checks accept', () => {
    expect(valid(practiceStateJsonSchema, JSON.parse(JSON.stringify(state)))).toBe(true);
    for (const entry of entries) expect(valid(reviewLogEntryJsonSchema, entry)).toBe(true);
    expect(valid(gradeResultJsonSchema, grade)).toBe(true);
    expect(valid(candidatesJsonSchema, [candidate])).toBe(true);
    expect(valid(decompositionJsonSchema, PROPOSAL)).toBe(true);
    expect(valid(decompositionJsonSchema, { skills: BASE.skills, edges: BASE.edges })).toBe(true);
  });

  it('reject what breaks a field rule', () => {
    expect(valid(gradeResultJsonSchema, { ...grade, extra: 1 })).toBe(false);
    expect(valid(gradeResultJsonSchema, { ...grade, maxScore: -1 })).toBe(false);
    expect(valid(gradeResultJsonSchema, { ...grade, grader: { kind: 'robot', id: 'g' } })).toBe(
      false,
    );
    expect(valid(candidatesJsonSchema, [])).toBe(false);
    expect(
      valid(
        candidatesJsonSchema,
        Array.from({ length: 21 }, () => candidate),
      ),
    ).toBe(false);
    expect(valid(candidatesJsonSchema, [{ ...candidate, id: '' }])).toBe(false);
    expect(valid(candidatesJsonSchema, [{ ...candidate, skills: [] }])).toBe(false);
    const { content: _content, ...bare } = candidate;
    expect(valid(candidatesJsonSchema, [bare])).toBe(false);
    expect(valid(decompositionJsonSchema, { skills: PROPOSAL.skills })).toBe(false);
    expect(
      valid(decompositionJsonSchema, {
        ...PROPOSAL,
        skills: [{ id: 'a', knowledge: 'tacit' }],
      }),
    ).toBe(false);
    expect(valid(practiceStateJsonSchema, { ...state, schemaVersion: 2 })).toBe(false);
  });
});

describe('Standard Schema objects', () => {
  const schemas = [practiceStateSchema, reviewLogEntrySchema, evidenceSchema, gradeResultSchema];

  it('are frozen Standard Schema v1 objects of the package vendor', () => {
    for (const schema of schemas) {
      expect(schema['~standard'].version).toBe(1);
      expect(schema['~standard'].vendor).toBe(VENDOR);
      expect(VENDOR).toBe('lk-practice');
      expect(Object.isFrozen(schema)).toBe(true);
      expect(Object.isFrozen(schema['~standard'])).toBe(true);
    }
  });

  it('return a frozen copy of a valid value', () => {
    const cases: [typeof practiceStateSchema | typeof gradeResultSchema, unknown][] = [
      [practiceStateSchema, state],
      [reviewLogEntrySchema as never, entries[0]],
      [evidenceSchema as never, steps[0] && 'evidence' in steps[0] ? steps[0].evidence : null],
      [gradeResultSchema, grade],
    ];
    for (const [schema, value] of cases) {
      const result = schema['~standard'].validate(value) as { value: unknown; issues?: unknown };
      expect(result.issues).toBeUndefined();
      expect(result.value).toEqual(value);
      expect(result.value).not.toBe(value);
      expect(Object.isFrozen(result.value)).toBe(true);
    }
  });

  it('return the issues with their codes and paths for an invalid value', () => {
    for (const schema of schemas) {
      const result = schema['~standard'].validate({ nope: 1 }) as {
        issues: { code: string; message: string; path: unknown[] }[];
      };
      expect(result.issues.length).toBeGreaterThan(0);
      for (const found of result.issues) {
        expect(typeof found.code).toBe('string');
        expect(typeof found.message).toBe('string');
        expect(Array.isArray(found.path)).toBe(true);
      }
    }
    const range = gradeResultSchema['~standard'].validate({ ...grade, score: 4 }) as unknown as {
      issues: { code: string; path: unknown[] }[];
    };
    expect(range.issues).toMatchObject([{ code: 'GRADE_SCORE_OUT_OF_RANGE', path: ['score'] }]);
  });

  it('wrap any total check', () => {
    const schema = standardSchema<number>((value) =>
      typeof value === 'number'
        ? { ok: true, value }
        : { ok: false, issues: [{ code: 'SHAPE_INVALID', path: ['x', 0], message: 'm' }] },
    );
    expect(schema['~standard'].validate(1)).toEqual({ value: 1 });
    expect(schema['~standard'].validate('a')).toEqual({
      issues: [{ code: 'SHAPE_INVALID', path: ['x', 0], message: 'm' }],
    });
  });
});

describe('frozenCopy and plainCopy', () => {
  it('copy, canonicalise and freeze a JSON value', () => {
    const value = { b: [1, { c: -0 }], a: 'x' };
    const copied = frozenCopy<typeof value>(value);
    expect(copied).toEqual({ ok: true, value: { a: 'x', b: [1, { c: 0 }] } });
    expect(copied.ok && Object.isFrozen(copied.value.b[1])).toBe(true);
    expect(plainCopy(value)).toEqual(copied.ok && copied.value);
  });

  it('give SHAPE_INVALID at the path of a value with no JSON form', () => {
    const sparse: unknown[] = [];
    sparse[2] = 1;
    expect(frozenCopy({ a: sparse })).toMatchObject({
      ok: false,
      issues: [{ code: 'SHAPE_INVALID', path: ['a', 0] }],
    });
    expect(frozenCopy({ a: Number.NaN })).toMatchObject({
      ok: false,
      issues: [{ code: 'SHAPE_INVALID', path: ['a'] }],
    });
  });
});
