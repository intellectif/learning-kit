import { describe, expect, it } from 'vitest';
import { containsUnspacedScript } from '../dictation/normalize.js';

/** Characters are built from their numbers so this file stays readable in a diff. */
const cp = (...points: number[]): string => String.fromCodePoint(...points);

describe('containsUnspacedScript', () => {
  it.each<[string, string]>([
    ['Han', cp(0x6211, 0x7231)],
    ['Hiragana', cp(0x3042, 0x3044)],
    ['Katakana', cp(0x30ab, 0x30ca)],
    ['the katakana prolonged sound mark', cp(0x30e9, 0x30fc)],
    ['Thai', cp(0x0e01, 0x0e34, 0x0e19)],
    ['Lao', cp(0x0ea5, 0x0eb2, 0x0ea7)],
    ['Khmer', cp(0x1781, 0x17d2, 0x1798)],
    ['Myanmar', cp(0x1019, 0x103c, 0x1014)],
    ['one Han letter standing inside Latin text', `read ${cp(0x4e2d)} aloud`],
  ])('is true for %s', (_label, text) => {
    expect(containsUnspacedScript(text)).toBe(true);
  });

  it.each<[string, string]>([
    ['an empty text', ''],
    ['Latin', 'The quick brown fox'],
    ['Latin with diacritics', cp(0x004e, 0x0069, 0x00f1, 0x006f)],
    ['Cyrillic', cp(0x041c, 0x043e, 0x0441, 0x043a, 0x0432, 0x0430)],
    ['Arabic', cp(0x0645, 0x0631, 0x062d, 0x0628, 0x0627)],
    ['Hangul', cp(0xc548, 0xb155, 0xd558, 0xc138, 0xc694)],
    ['Devanagari', cp(0x0928, 0x092e, 0x0938, 0x094d, 0x0924, 0x0947)],
    ['Latin digits', '12345'],
    ['Thai digits', cp(0x0e50, 0x0e51, 0x0e52)],
    ['Myanmar digits', cp(0x1040, 0x1041, 0x1042)],
    ['punctuation and symbols', '... !? $%'],
  ])('is false for %s', (_label, text) => {
    expect(containsUnspacedScript(text)).toBe(false);
  });

  it('counts letters only, not the punctuation those scripts share', () => {
    // Script_Extensions=Han matches the ideographic comma and full stop, so the
    // character class alone would refuse a Korean sentence punctuated with one —
    // and Korean is written with spaces between its words.
    expect(/\p{Script_Extensions=Han}/u.test(cp(0x3002))).toBe(true);
    expect(containsUnspacedScript(`${cp(0xc548, 0xb155)}${cp(0x3002)}`)).toBe(false);
    expect(containsUnspacedScript(`Ready${cp(0x3001)} steady${cp(0x3002)}`)).toBe(false);
    // The letters themselves are still found beside that punctuation.
    expect(containsUnspacedScript(`${cp(0x4eca, 0x65e5)}${cp(0x3002)}`)).toBe(true);
  });

  it('finds a letter wherever it stands, and answers the same on every call', () => {
    const text = `a ${cp(0x30ab)} b`;

    // No `g` flag, so there is no `lastIndex` to carry into the next call.
    expect(containsUnspacedScript(text)).toBe(true);
    expect(containsUnspacedScript(text)).toBe(true);
  });
});
