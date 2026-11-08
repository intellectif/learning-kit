import { describe, expect, it } from 'vitest';
import { validateWhatHappensData } from '../templates/what-happens/schema.js';
import { matchSupportsInAnswer } from '../templates/what-happens/underline.js';

function clip(freezeAt: number, durationS?: number) {
  return {
    schemaVersion: '1.0',
    type: 'what-happens',
    id: 'bounds',
    title: 'Bounds',
    locale: 'en',
    style: { presetId: 'default' },
    clips: [
      {
        id: 'one',
        title: 'One',
        video: {
          assetKey: 'one',
          aspect: '9:16',
          ...(durationS !== undefined ? { durationS } : {}),
        },
        freezeAt,
        answer: { text: 'The baker folds the dough twice.' },
        supports: ['dough', 'twice', 'xyz'],
      },
    ],
  };
}

describe('What Happens properties', () => {
  it('accepts freezeAt only when 0 < freezeAt < duration', () => {
    for (const durationS of [1, 2, 5, 10, 30]) {
      for (const freezeAt of [0.01, durationS / 2, durationS - 0.01]) {
        expect(
          validateWhatHappensData(clip(freezeAt, durationS)).success,
          `${freezeAt} of ${durationS}`,
        ).toBe(true);
      }
      for (const freezeAt of [0, durationS, durationS + 1, -1]) {
        expect(
          validateWhatHappensData(clip(freezeAt, durationS)).success,
          `${freezeAt} of ${durationS}`,
        ).toBe(false);
      }
    }
  });

  it('underlines support items that occur verbatim, first match winning overlaps', () => {
    const answer = 'She adds flour and a pinch of salt.';
    const matches = matchSupportsInAnswer(answer, [
      'flour',
      'a pinch of salt',
      'missing',
      'flour and',
    ]);
    expect(matches.map((match) => match.support)).toEqual(['flour', 'a pinch of salt']);
    expect(matches[0]).toMatchObject({ start: answer.indexOf('flour') });

    const overlap = matchSupportsInAnswer('aaab', ['aaa', 'aab']);
    expect(overlap).toEqual([{ support: 'aaa', start: 0, end: 3 }]);
    expect(matchSupportsInAnswer('hello', ['xyz'])).toEqual([]);
  });

  it('does not require support items to appear in the answer', () => {
    const result = validateWhatHappensData(clip(2, 5));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clips[0]?.supports).toContain('xyz');
      expect(result.data.clips[0]?.answer.text.includes('xyz')).toBe(false);
    }
  });
});
