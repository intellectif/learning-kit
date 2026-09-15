import { describe, expect, it } from 'vitest';
import { codePoints, editDistance, similarity } from '../dictation/edit-distance.js';

describe('editDistance and similarity', () => {
  it('counts code points, with a lone surrogate as one of them', () => {
    expect(codePoints('a\u{1f600}b')).toEqual([0x61, 0x1f600, 0x62]);
    expect(codePoints(`a${String.fromCharCode(0xd800)}b`)).toEqual([0x61, 0xd800, 0x62]);
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('', 'abc')).toBe(3);
    expect(editDistance('abc', '')).toBe(3);
    expect(editDistance('\u{1f600}', '\u{1f603}')).toBe(1);
  });

  it('is one correctly rounded division, and 0 for two empty strings', () => {
    expect(similarity('', '')).toBe(0);
    expect(similarity('a', 'a')).toBe(1);
    expect(similarity('a'.repeat(67).concat('b'.repeat(33)), 'a'.repeat(100))).toBe(0.67);
    expect(similarity('abc', '')).toBe(0);
  });
});
