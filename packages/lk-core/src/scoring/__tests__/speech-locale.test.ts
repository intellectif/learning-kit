import { describe, expect, it } from 'vitest';
import { CANONICAL_LOCALE_RE } from '../speech/locale.js';

describe('CANONICAL_LOCALE_RE', () => {
  it.each([
    'en-US',
    'en-GB',
    'de-DE',
    'es-419',
    'pt-BR',
    'zh-Hant-TW',
    'zh-Hans-CN',
    'fil-PH',
    'yue-Hant-HK',
  ])('accepts %s', (tag) => {
    expect(CANONICAL_LOCALE_RE.test(tag)).toBe(true);
  });

  it.each([
    '',
    'en',
    'eng',
    'en-Latn',
    'en_US',
    'en-us',
    'EN-US',
    'En-US',
    'en-USA',
    'en-4',
    'en-41',
    'e-US',
    'engl-US',
    'zh-hant-TW',
    'zh-HANT-TW',
    'zh-Hant-TW-x-private',
    'en-US-u-ca-gregory',
    ' en-US',
    'en-US ',
  ])('refuses %s', (tag) => {
    expect(CANONICAL_LOCALE_RE.test(tag)).toBe(false);
  });

  it('refuses a tag with a trailing newline', () => {
    // `$` in JavaScript matches the end of the input, not the end of a line —
    // but a locale read from a file is exactly where a stray newline arrives.
    expect(CANONICAL_LOCALE_RE.test('en-US\n')).toBe(false);
  });

  it('is stateless, so two tests of the same tag agree', () => {
    // A `g` flag would carry `lastIndex` from one call into the next.
    expect(CANONICAL_LOCALE_RE.flags).toBe('');
    expect(CANONICAL_LOCALE_RE.test('en-US')).toBe(true);
    expect(CANONICAL_LOCALE_RE.test('en-US')).toBe(true);
  });
});
