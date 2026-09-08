import { describe, expect, it } from 'vitest';
import { ActivitySchemaError } from '../errors.js';
import { assertRedacted, assertRedactedItemGroup, redact, redactItemGroup } from '../redact.js';

/**
 * The fail-open hole these tests pin.
 *
 * `media` was classified with a scalar `'public'`, which classifies the WHOLE
 * field: `redact()` returned the author's object by reference without
 * recursing into it, and the strict redacted schemas embedded the LOOSE
 * `MediaSchema`, so strictness stopped at the media boundary too. An
 * unclassified key nested under `media` therefore survived `redact()` AND
 * satisfied `assertRedacted()` — the SDK's documented fail-closed contract
 * ("a field the policy does not classify is removed") had an exception nobody
 * had written down. Every assertion here fails against 0.7.1.
 */
const leakyMedia = {
  type: 'audio' as const,
  url: 'https://cdn.example.com/announcement.mp3',
  playback: { maxPlays: 2 },
  secretAnswerHint: 'the 9:15 leaves from platform four',
};

const mc = {
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'q1',
  title: 'Q1',
  question: 'What time does the train leave?',
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  media: leakyMedia,
  options: [
    { id: 'a', text: '9:15', isCorrect: true },
    { id: 'b', text: '9:50', isCorrect: false },
  ],
};

const group = {
  schemaVersion: '1.0' as const,
  type: 'item-group' as const,
  id: 'g1',
  title: 'Listening — Part 1',
  stimulus: {
    id: 's1',
    kind: 'audio' as const,
    media: leakyMedia,
    transcript: 'The 9:15 service to Leeds departs from platform four.',
  },
  items: [mc],
};

/** The public projection of `leakyMedia`: everything the policy classifies, nothing else. */
const safeMedia = {
  type: 'audio',
  url: 'https://cdn.example.com/announcement.mp3',
  playback: { maxPlays: 2 },
};

function pathsOf(assert: () => void): string[] {
  try {
    assert();
  } catch (error) {
    expect(error).toBeInstanceOf(ActivitySchemaError);
    return (error as ActivitySchemaError).errors.map((issue) => issue.path.join('.'));
  }
  throw new Error('expected a throw');
}

describe('redact() recurses into media', () => {
  it('drops an unclassified key nested under an activity’s media', () => {
    const result = redact(mc);
    expect(result.media).toEqual(safeMedia);
    expect(result.media).not.toHaveProperty('secretAnswerHint');
  });

  it('drops an unclassified key nested under a group’s stimulus media', () => {
    const redacted = redactItemGroup(group);
    expect(redacted.stimulus.media).toEqual(safeMedia);
    expect(redacted.stimulus.media).not.toHaveProperty('secretAnswerHint');
    expect(redacted.stimulus).not.toHaveProperty('transcript');
  });

  it('returns a NEW media object rather than the author’s by reference', () => {
    // Reference identity is what made the hole invisible: an object returned
    // whole cannot have been filtered, whatever the projection appears to say.
    const result = redact(mc);
    expect(result.media).not.toBe(leakyMedia);
    expect((result.media as { playback: unknown }).playback).not.toBe(leakyMedia.playback);
    expect(redactItemGroup(group).stimulus.media).not.toBe(leakyMedia);
  });
});

describe('the redacted schemas are strict at the media boundary', () => {
  // Built by hand, NOT via redact(): the assertions exist to catch a payload
  // some other code path assembled — a hand-rolled projection, a cached row
  // from an older build — which is exactly the case a round trip through
  // redact() cannot exercise.
  const handBuiltActivity = {
    redacted: true,
    schemaVersion: '1.0',
    type: 'multiple-choice',
    id: 'q1',
    title: 'Q1',
    question: 'What time does the train leave?',
    mode: 'single',
    media: { ...safeMedia, secretAnswerHint: 'platform four' },
    options: [
      { id: 'a', text: '9:15' },
      { id: 'b', text: '9:50' },
    ],
  };

  const handBuiltGroup = {
    redacted: true,
    schemaVersion: '1.0',
    type: 'item-group',
    id: 'g1',
    title: 'Listening — Part 1',
    stimulus: {
      id: 's1',
      kind: 'audio',
      media: { ...safeMedia, secretAnswerHint: 'platform four' },
    },
    items: [{ ...handBuiltActivity, media: safeMedia }],
  };

  it('assertRedacted rejects an unknown key under media', () => {
    expect(pathsOf(() => assertRedacted(handBuiltActivity))).toContain('media');
  });

  it('assertRedactedItemGroup rejects an unknown key under stimulus media', () => {
    expect(pathsOf(() => assertRedactedItemGroup(handBuiltGroup))).toContain('stimulus.media');
  });

  it('accepts the same payloads once the extra key is gone', () => {
    expect(() => assertRedacted({ ...handBuiltActivity, media: safeMedia })).not.toThrow();
    expect(() =>
      assertRedactedItemGroup({
        ...handBuiltGroup,
        stimulus: { ...handBuiltGroup.stimulus, media: safeMedia },
      }),
    ).not.toThrow();
  });

  it('still accepts the playback policy itself — it is learner-visible by necessity', () => {
    // "1 play remaining" is text the learner has to read, and the client is
    // the thing that enforces the budget. A listening paper's answer key is
    // `stimulus.transcript`, which stays author-only.
    expect(() => assertRedacted(redact(mc))).not.toThrow();
    expect(() => assertRedactedItemGroup(redactItemGroup(group))).not.toThrow();
    expect(redact(mc).media).toHaveProperty('playback', { maxPlays: 2 });
  });
});
