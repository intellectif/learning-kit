import { describe, expect, it } from 'vitest';
import { cueIndexAt, parseWebVtt } from '../vtt.js';

/**
 * The player parses WebVTT itself — see `parseWebVtt` — so these are the rules
 * a `<track>` would otherwise have applied for it. A caption file is content a
 * host fetched from somewhere: the parser is input handling, and every case
 * here is a file that must not break the player.
 */
describe('parseWebVtt', () => {
  const file = (body: string): string => `WEBVTT\n\n${body}`;

  it('reads a cue', () => {
    expect(parseWebVtt(file('00:00:01.000 --> 00:00:03.500\nHello there\n'))).toEqual([
      { start: 1, end: 3.5, text: 'Hello there' },
    ]);
  });

  it('reads the short timestamp, and hours', () => {
    expect(parseWebVtt(file('01:02.250 --> 01:04.000\nShort'))[0]).toEqual({
      start: 62.25,
      end: 64,
      text: 'Short',
    });
    expect(parseWebVtt(file('01:00:00.000 --> 01:00:02.000\nPast an hour'))[0]?.start).toBe(3600);
  });

  it('keeps a cue identifier and its settings out of the text', () => {
    const cues = parseWebVtt(
      file('intro\n00:00:00.000 --> 00:00:02.000 line:90% align:middle\nWords'),
    );
    expect(cues).toEqual([{ start: 0, end: 2, text: 'Words' }]);
  });

  it('reads the words a learner sees, not the markup around them', () => {
    const cues = parseWebVtt(
      file('00:00:00.000 --> 00:00:02.000\n<v Ana>It&apos;s <i>her</i> turn &amp; mine'),
    );
    expect(cues[0]?.text).toBe("It's her turn & mine");
  });

  it('decodes numeric character references, and leaves an impossible one alone', () => {
    expect(parseWebVtt(file('00:00:00.000 --> 00:00:01.000\n&#72;&#x69;'))[0]?.text).toBe('Hi');
    expect(parseWebVtt(file('00:00:00.000 --> 00:00:01.000\n&#xZZ; &notreal;'))[0]?.text).toBe(
      '&#xZZ; &notreal;',
    );
  });

  it('joins a two-line cue with a space', () => {
    expect(
      parseWebVtt(file('00:00:00.000 --> 00:00:02.000\nfirst line\nsecond line'))[0]?.text,
    ).toBe('first line second line');
  });

  it('sorts by start and keeps the file order within one moment', () => {
    const cues = parseWebVtt(
      file(
        '00:00:09.000 --> 00:00:10.000\nlast\n\n00:00:01.000 --> 00:00:02.000\nfirst\n\n' +
          '00:00:01.000 --> 00:00:03.000\nfirst also',
      ),
    );
    expect(cues.map((cue) => cue.text)).toEqual(['first', 'first also', 'last']);
  });

  it('answers nothing for text that is not WebVTT', () => {
    expect(parseWebVtt('{"captions": []}')).toEqual([]);
    expect(parseWebVtt('')).toEqual([]);
    expect(parseWebVtt('<!doctype html><title>Sign in</title>')).toEqual([]);
  });

  it('accepts the header with a note after it, and a byte-order mark before it', () => {
    const body = '00:00:00.000 --> 00:00:01.000\nOne';
    expect(parseWebVtt(`WEBVTT - Lesson 2\n\n${body}`)).toHaveLength(1);
    expect(parseWebVtt(`${String.fromCharCode(0xfeff)}WEBVTT\n\n${body}`)).toHaveLength(1);
  });

  it('reads CRLF files, as a file made on Windows arrives', () => {
    expect(parseWebVtt('WEBVTT\r\n\r\n00:00:00.000 --> 00:00:01.000\r\nWindows\r\n')).toEqual([
      { start: 0, end: 1, text: 'Windows' },
    ]);
  });

  it('skips a malformed cue and keeps the rest of the file', () => {
    const cues = parseWebVtt(
      file(
        'NOTE this block has no timing\n\n00:00:xx.000 --> 00:00:02.000\nbad stamp\n\n' +
          '00:00:05.000 --> 00:00:04.000\nends before it starts\n\n' +
          '00:00:06.000 --> 00:00:07.000\n\n\n00:00:08.000 --> 00:00:09.000\ngood',
      ),
    );
    expect(cues).toEqual([{ start: 8, end: 9, text: 'good' }]);
  });

  it('holds a huge file to its limits instead of rendering all of it', () => {
    const many = Array.from(
      { length: 10_050 },
      (_, index) =>
        `00:00:${String(index % 60).padStart(2, '0')}.000 --> 00:00:${String(index % 60).padStart(2, '0')}.500\nline ${index}`,
    ).join('\n\n');
    expect(parseWebVtt(file(many))).toHaveLength(10_000);

    const long = `${'x'.repeat(2_000_000)}\n\n00:00:01.000 --> 00:00:02.000\nafter the cut`;
    expect(parseWebVtt(file(long))).toEqual([]);
  });

  it('is unmoved by something that is not a string', () => {
    expect(parseWebVtt(undefined as unknown as string)).toEqual([]);
    expect(parseWebVtt({ toString: () => 'WEBVTT' } as unknown as string)).toEqual([]);
  });
});

describe('cueIndexAt', () => {
  const cues = parseWebVtt(
    'WEBVTT\n\n' +
      '00:00:00.000 --> 00:00:02.000\none\n\n' +
      '00:00:04.000 --> 00:00:06.000\ntwo\n\n' +
      '00:00:06.000 --> 00:00:10.000\nthree',
  );

  it('finds the line being spoken', () => {
    expect(cueIndexAt(cues, 0)).toBe(0);
    expect(cueIndexAt(cues, 1.999)).toBe(0);
    expect(cueIndexAt(cues, 5)).toBe(1);
    expect(cueIndexAt(cues, 9.5)).toBe(2);
  });

  it('answers -1 in a gap, before the first line and after the last', () => {
    expect(cueIndexAt(cues, 3)).toBe(-1);
    expect(cueIndexAt(cues, -1)).toBe(-1);
    expect(cueIndexAt(cues, 20)).toBe(-1);
    expect(cueIndexAt([], 5)).toBe(-1);
  });

  it('prefers the line that started last where two overlap', () => {
    const overlapping = parseWebVtt(
      'WEBVTT\n\n00:00:00.000 --> 00:00:10.000\nlong\n\n00:00:02.000 --> 00:00:03.000\nshort',
    );
    expect(cueIndexAt(overlapping, 2.5)).toBe(1);
    // …and falls back to the one still running when the newer has ended.
    expect(cueIndexAt(overlapping, 4)).toBe(0);
  });
});
