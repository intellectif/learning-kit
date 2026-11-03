import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { canonicalize, canonicalJson, formatPath } from '../canonical.js';
import { fnv1a64, hashCanonical } from '../fnv.js';

describe('fnv1a64', () => {
  // Published FNV-1a 64 test values (draft-eastlake-fnv; the reference test_fnv.c).
  it.each([
    ['', 'cbf29ce484222325'],
    ['a', 'af63dc4c8601ec8c'],
    ['b', 'af63df4c8601f1a5'],
    ['foobar', '85944171f73967e8'],
  ])('hashes %j to %s', (input, expected) => {
    expect(fnv1a64(input)).toBe(expected);
  });

  it('hashes the UTF-8 bytes, not UTF-16 code units', () => {
    // U+00E9 is two UTF-8 bytes; the decomposed form is three.
    expect(fnv1a64('\u00e9')).not.toBe(fnv1a64('e\u0301'));
    expect(fnv1a64('\u00e9')).toBe(fnv1a64(String.fromCodePoint(0xe9)));
  });

  // (revised in M8) fnv1a64 runs on two 32-bit halves; this is the BigInt form it replaced.
  it('equals the BigInt computation on any string', () => {
    const reference = (input: string): string => {
      let hash = 0xcbf29ce484222325n;
      for (const byte of new TextEncoder().encode(input)) {
        hash = ((hash ^ BigInt(byte)) * 0x100000001b3n) & 0xffffffffffffffffn;
      }
      return hash.toString(16).padStart(16, '0');
    };
    fc.assert(
      fc.property(
        fc.oneof(fc.string({ unit: 'binary' }), fc.string({ unit: 'binary', maxLength: 2000 })),
        (input) => fnv1a64(input) === reference(input),
      ),
      { numRuns: 1000 },
    );
    for (let i = 0; i < 256; i += 1) {
      const input = String.fromCharCode(i).repeat(i % 17);
      expect(fnv1a64(input)).toBe(reference(input));
    }
  });

  it('always returns 16 lowercase hex characters', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (input) => /^[0-9a-f]{16}$/.test(fnv1a64(input))),
      { numRuns: 200 },
    );
  });

  it('hashCanonical is fnv1a64 of the canonical JSON', () => {
    expect(hashCanonical({ b: 1, a: [true, null] })).toBe(fnv1a64('{"a":[true,null],"b":1}'));
    expect(() => hashCanonical({ a: undefined })).toThrow(TypeError);
  });
});

describe('canonicalJson', () => {
  it('sorts keys by UTF-16 code unit, keeps array order and drops whitespace', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, 1, 2], c: 'x' }, B: 0, é: 1 })).toBe(
      '{"B":0,"a":{"c":"x","d":[3,1,2]},"b":1,"é":1}',
    );
  });

  it('writes -0 as 0 and scalars as JSON does', () => {
    expect(canonicalJson(-0)).toBe('0');
    expect(canonicalJson([1.5, 'a"b', false, null])).toBe('[1.5,"a\\"b",false,null]');
  });

  it('accepts a null-prototype object and a value reused without a cycle', () => {
    const shared = { x: 1 };
    const bare = Object.assign(Object.create(null) as object, { k: shared });
    expect(canonicalJson({ p: bare, q: shared })).toBe('{"p":{"k":{"x":1}},"q":{"x":1}}');
  });

  it.each([
    ['NaN', { a: [Number.NaN] }, ['a', 0], 'NaN is not a finite number'],
    ['Infinity', Number.POSITIVE_INFINITY, [], 'Infinity is not a finite number'],
    [
      'undefined',
      { a: { b: undefined } },
      ['a', 'b'],
      'a value of type undefined has no JSON form',
    ],
    ['a function', { f: () => 1 }, ['f'], 'a value of type function has no JSON form'],
    ['a symbol', [Symbol('s')], [0], 'a value of type symbol has no JSON form'],
    ['a bigint', { n: 1n }, ['n'], 'a value of type bigint has no JSON form'],
    // biome-ignore lint/suspicious/noSparseArray: the hole is the case under test.
    ['an array hole', [1, , 3], [1], 'an array hole has no JSON form'],
    ['a class instance', { m: new Map() }, ['m'], 'only plain objects and arrays have a JSON form'],
    ['a symbol key', { [Symbol('k')]: 1 }, [], 'a symbol key has no JSON form'],
  ])('rejects %s with its path', (_, value, path, message) => {
    expect(canonicalize(value)).toEqual({ ok: false, path, message });
    expect(() => canonicalJson(value)).toThrow(TypeError);
  });

  it('rejects a circular reference', () => {
    const loop: Record<string, unknown> = { a: 1 };
    loop.self = { back: loop };
    expect(canonicalize(loop)).toEqual({
      ok: false,
      path: ['self', 'back'],
      message: 'a circular reference has no JSON form',
    });
  });

  it('names the path in the thrown message', () => {
    expect(() => canonicalJson({ a: [{ b: Number.NaN }] })).toThrow(
      'canonicalJson: NaN is not a finite number at a.0.b',
    );
    expect(() => canonicalJson(undefined)).toThrow('at (root)');
  });

  it('rethrows an error that is not a canonicalisation failure', () => {
    const hostile = {
      get boom(): never {
        throw new RangeError('getter');
      },
    };
    expect(() => canonicalize(hostile)).toThrow(RangeError);
  });

  it('formatPath joins the path or names the root', () => {
    expect(formatPath([])).toBe('(root)');
    expect(formatPath(['a', 0, 'b'])).toBe('a.0.b');
  });

  it('is independent of key insertion order', () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.jsonValue()), (record) => {
        const reversed = Object.fromEntries(Object.entries(record).reverse());
        return canonicalJson(record) === canonicalJson(reversed);
      }),
      { numRuns: 200 },
    );
  });

  it('round-trips through JSON.parse to the same canonical text', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const json = canonicalJson(value);
        return canonicalJson(JSON.parse(json)) === json;
      }),
      { numRuns: 200 },
    );
  });
});
