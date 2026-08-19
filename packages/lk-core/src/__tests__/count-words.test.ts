import { describe, expect, it } from 'vitest';
import { countWords } from '../count-words.js';

describe('countWords', () => {
  it('returns 0 for the empty string', () => {
    expect(countWords('')).toBe(0);
  });

  it('returns 0 for a whitespace-only string', () => {
    expect(countWords('   ')).toBe(0);
    expect(countWords('\t\n  \r\n')).toBe(0);
  });

  it('counts a single word', () => {
    expect(countWords('hello')).toBe(1);
  });

  it('counts words separated by multiple spaces as one word each', () => {
    expect(countWords('one    two     three')).toBe(3);
  });

  it('counts words separated by tabs and newlines', () => {
    expect(countWords('one\ttwo\nthree\r\nfour')).toBe(4);
    expect(countWords('one \t \n two')).toBe(2);
  });

  it('counts a hyphenated form as a single word', () => {
    expect(countWords('well-known')).toBe(1);
    expect(countWords('a well-known fact')).toBe(3);
  });

  it('ignores leading and trailing whitespace', () => {
    expect(countWords('  hello world  ')).toBe(2);
    expect(countWords('\n\thello\t\n')).toBe(1);
  });
});
