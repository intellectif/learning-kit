import { describe, expect, it } from 'vitest';
import type { z } from 'zod/v4';
import { resolvePlaybackPolicy } from '../../media-budget.js';
import type { ValidationResult } from '../../types/activity.js';
import { MediaSchema, validateActivity, validateItemGroup } from '../index.js';

const audio = { type: 'audio' as const, url: 'https://cdn.example.com/part2.mp3' };

const mc = {
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'q1',
  title: 'Q1',
  question: 'What time does the train leave?',
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  options: [
    { id: 'a', text: '9:15', isCorrect: true },
    { id: 'b', text: '9:50', isCorrect: false },
  ],
};

const mcWithMedia = (media: unknown) => ({ ...mc, media });

function issuePaths(result: z.ZodSafeParseResult<unknown>): string[] {
  if (result.success) {
    throw new Error('expected failure');
  }
  return result.error.issues.map((issue) => issue.path.map(String).join('.'));
}

function failurePaths(result: ValidationResult<unknown>): string[] {
  if (result.success) {
    throw new Error('expected failure');
  }
  return result.errors.map((error) => error.path.join('.'));
}

describe('playback policy: where it may be attached', () => {
  // The SDK can only honour a policy it owns the transport for. An embed is a
  // third-party iframe with no reliable JS API, an image has nothing to play,
  // and video is deferred. Accepting the key on those types would ship an exam
  // whose author believes a budget is enforced while nothing enforces it.
  const nonAudio: [string, Record<string, unknown>][] = [
    ['video', { type: 'video', url: 'https://cdn.example.com/clip.mp4' }],
    ['image', { type: 'image', url: 'https://cdn.example.com/chart.png', alt: 'A chart' }],
    ['embed', { type: 'embed', url: 'https://www.youtube.com/embed/abc', alt: 'A recording' }],
  ];

  it.each(nonAudio)('refuses a playback policy on %s media', (_kind, media) => {
    const result = validateActivity(
      'multiple-choice',
      mcWithMedia({ ...media, playback: { maxPlays: 2 } }),
    );
    expect(failurePaths(result)).toContain('media.playback');
  });

  it('accepts it on audio', () => {
    expect(validateActivity('multiple-choice', mcWithMedia({ ...audio })).success).toBe(true);
    expect(
      validateActivity('multiple-choice', mcWithMedia({ ...audio, playback: { maxPlays: 2 } }))
        .success,
    ).toBe(true);
  });
});

describe('playback policy: what resolves and what must be written out', () => {
  // The reason nothing here is co-required. An author writes the promise
  // ("two plays") and the SDK derives the only settings that can keep it; a
  // schema that demanded `controls` and `seek` alongside would make the common
  // case the verbose one and invite the wrong combination.
  it('accepts maxPlays alone as a complete policy, and resolves the rest', () => {
    expect(MediaSchema.safeParse({ ...audio, playback: { maxPlays: 2 } }).success).toBe(true);
    expect(resolvePlaybackPolicy({ ...audio, playback: { maxPlays: 2 } })).toEqual({
      controls: 'minimal',
      maxPlays: 2,
      seek: 'none',
      rate: 'allow',
      nativeControlHints: [],
    });
  });

  it('refuses controls: "native" with a budget, at the control that cannot honour it', () => {
    // The browser bar keeps its play button enabled once the budget is spent —
    // a control that looks operable and does nothing (WCAG 3.2.2 / 4.1.3).
    expect(
      issuePaths(
        MediaSchema.safeParse({ ...audio, playback: { controls: 'native', maxPlays: 2 } }),
      ),
    ).toContain('playback.controls');
  });

  it('refuses maxPlays with seek: "allow"', () => {
    // Scrubbing back mid-play replays the whole recording without spending a
    // play, so the pair silently voids the budget rather than enforcing it.
    expect(
      issuePaths(MediaSchema.safeParse({ ...audio, playback: { maxPlays: 2, seek: 'allow' } })),
    ).toContain('playback.seek');
  });

  it('refuses controls: "minimal" with nothing to enforce', () => {
    // Trading the browser's localized, familiar bar for the SDK's buys nothing
    // unless something is actually being restricted.
    expect(
      issuePaths(MediaSchema.safeParse({ ...audio, playback: { controls: 'minimal' } })),
    ).toContain('playback.controls');
  });

  it('refuses nativeControlHints alongside an enforcing policy', () => {
    // The hints address the native bar, which an enforcing policy replaces —
    // so they would be accepted and then be inert.
    expect(
      issuePaths(
        MediaSchema.safeParse({
          ...audio,
          playback: { maxPlays: 2, nativeControlHints: ['hide-download'] },
        }),
      ),
    ).toContain('playback.nativeControlHints');
  });

  it('accepts nativeControlHints on an otherwise unrestricted recording', () => {
    expect(
      MediaSchema.safeParse({ ...audio, playback: { nativeControlHints: ['hide-download'] } })
        .success,
    ).toBe(true);
  });
});

describe('playback policy: strictness and bounds', () => {
  // MediaSchema is loose, so without a STRICT playback object a typo one level
  // down would be preserved as an unknown key and the policy would quietly do
  // nothing on an exam that believed it was enforced.
  it.each(['maxPlay', 'seeking'])('refuses the near-miss key %s', (key) => {
    const result = MediaSchema.safeParse({ ...audio, playback: { [key]: 2 } });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.code === 'unrecognized_keys')).toBe(true);
    }
  });

  it.each([0, 21, 2.5])('refuses maxPlays: %s', (maxPlays) => {
    expect(issuePaths(MediaSchema.safeParse({ ...audio, playback: { maxPlays } }))).toContain(
      'playback.maxPlays',
    );
  });

  it.each([1, 20])('accepts maxPlays: %s', (maxPlays) => {
    expect(MediaSchema.safeParse({ ...audio, playback: { maxPlays } }).success).toBe(true);
  });
});

describe('SlotKeySchema', () => {
  // `flattenSequence` splits a slot id on its first ".", so a key containing
  // one makes the slot ambiguous. `keyOf` already threw at flatten time; this
  // pins the rejection at validateItemGroup, where an author sees it instead
  // of a learner opening the paper.
  it('rejects a slotKey containing "." on the group', () => {
    const result = validateItemGroup({
      schemaVersion: '1.0',
      type: 'item-group',
      id: 'g1',
      slotKey: 'sec2.listening',
      stimulus: { id: 's1', kind: 'audio', media: audio },
      items: [mc],
    });
    expect(failurePaths(result)).toContain('slotKey');
  });

  it('accepts the same key without the dot', () => {
    const result = validateItemGroup({
      schemaVersion: '1.0',
      type: 'item-group',
      id: 'g1',
      slotKey: 'sec2-listening',
      stimulus: { id: 's1', kind: 'audio', media: audio },
      items: [mc],
    });
    expect(result.success).toBe(true);
  });
});
