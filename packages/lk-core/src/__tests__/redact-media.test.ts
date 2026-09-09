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

/**
 * The same fail-open shape as the media hole, one field along.
 *
 * `rubric` was classified as a single `public` leaf, so `redactValue` returned
 * the author's object by reference without recursing, and the strict redacted
 * schema embedded the LOOSE rubric schema. A grader's `modelAnswer` parked on
 * the rubric therefore reached the exam client and `assertRedacted` blessed it.
 *
 * The rubric itself is deliberately learner-visible — it tells the learner what
 * they are graded on. That has to mean its DOCUMENTED fields are visible, not
 * that anything anyone stashes under it is.
 */
describe('redact(): the rubric is public field by field, not wholesale', () => {
  const essay = {
    schemaVersion: '1.0',
    type: 'written-response',
    id: 'w1',
    title: 'Essay',
    prompt: 'Describe your last holiday.',
    minWords: 10,
    maxWords: 200,
    rubric: {
      label: 'Writing rubric',
      criteria: [{ name: 'Grammar', description: 'Accuracy of form', weight: 1 }],
      modelAnswer: 'THE SECRET MODEL ANSWER',
      aiModel: 'grader-v2',
    },
  } as never;

  it('drops an unclassified key nested under the rubric', () => {
    const projection = redact(essay) as { rubric?: Record<string, unknown> };
    expect(projection.rubric).not.toHaveProperty('modelAnswer');
    expect(projection.rubric).not.toHaveProperty('aiModel');
  });

  it('keeps the fields a learner is meant to read', () => {
    const projection = redact(essay) as {
      rubric?: { label?: string; criteria?: { name: string; weight: number }[] };
    };
    expect(projection.rubric?.label).toBe('Writing rubric');
    expect(projection.rubric?.criteria).toEqual([
      { name: 'Grammar', description: 'Accuracy of form', weight: 1 },
    ]);
  });

  it('returns a copy of the rubric, not the author’s object', () => {
    const projection = redact(essay) as { rubric?: unknown };
    expect(projection.rubric).not.toBe((essay as { rubric: unknown }).rubric);
  });

  it('rejects a hand-built payload carrying a secret under the rubric', () => {
    const clean = redact(essay) as unknown as Record<string, unknown> & {
      rubric: Record<string, unknown>;
    };
    // Prove the rejection is not vacuous: the same payload passes without the
    // planted key.
    expect(() => assertRedacted(clean)).not.toThrow();
    expect(() =>
      assertRedacted({ ...clean, rubric: { ...clean.rubric, modelAnswer: 'LEAK' } }),
    ).toThrow();
  });
});

/**
 * The same fail-open shape once more, on the answer-key object leaves.
 *
 * `feedback` and `blanks[].match` were scalar `answer-key` classifications, so
 * `redactValue` assigned the author's object by reference without recursing.
 * Under the default `reveal: 'none'` that is invisible — the whole field is
 * dropped — but `reveal: 'after-submit'` keeps it, and kept it WHOLE: a
 * grader's private note or tuning knob parked beside the documented fields
 * went to the learner with the answer key, and the projection aliased the
 * caller's object. Third instance of the pattern, after `media` and `rubric`.
 */
describe('redact(): answer-key objects are classified field by field too', () => {
  const mc = {
    schemaVersion: '1.0',
    type: 'multiple-choice',
    id: 'm1',
    title: 'Q',
    question: 'Pick one',
    mode: 'single',
    scoringStrategy: 'all-or-nothing',
    feedback: {
      correct: 'Well done',
      incorrect: 'Try again',
      graderNote: 'INTERNAL: flag for review',
      costCents: 42,
    },
    options: [
      { id: 'a', text: 'A', isCorrect: true },
      { id: 'b', text: 'B', isCorrect: false },
    ],
  } as never;

  const fib = {
    schemaVersion: '1.0',
    type: 'fill-in-the-blanks',
    id: 'f1',
    title: 'F',
    passage: 'The capital is {{b1}}.',
    scoringStrategy: 'partial',
    blanks: [
      {
        id: 'b1',
        acceptedAnswers: ['Tokyo'],
        match: { levenshtein: 1, internalTuning: 'SECRET-KNOB', graderHint: 'accept Tokio' },
      },
    ],
  } as never;

  it('reveals only the documented feedback fields after submit', () => {
    const revealed = redact(mc, { reveal: 'after-submit' }) as {
      feedback?: Record<string, unknown>;
    };
    expect(revealed.feedback).toEqual({ correct: 'Well done', incorrect: 'Try again' });
    expect(revealed.feedback).not.toHaveProperty('graderNote');
    expect(revealed.feedback).not.toHaveProperty('costCents');
  });

  it('reveals only the documented match keys after submit', () => {
    const revealed = redact(fib, { reveal: 'after-submit' }) as {
      blanks?: { match?: Record<string, unknown> }[];
    };
    expect(revealed.blanks?.[0]?.match).toEqual({ levenshtein: 1 });
  });

  it('does not alias the author’s objects into the projection', () => {
    const revealedMc = redact(mc, { reveal: 'after-submit' }) as { feedback?: unknown };
    const revealedFib = redact(fib, { reveal: 'after-submit' }) as {
      blanks?: { match?: unknown }[];
    };
    expect(revealedMc.feedback).not.toBe((mc as { feedback: unknown }).feedback);
    expect(revealedFib.blanks?.[0]?.match).not.toBe(
      (fib as { blanks: { match: unknown }[] }).blanks[0]?.match,
    );
  });

  it('still drops them entirely under the default reveal', () => {
    const projection = redact(mc) as Record<string, unknown>;
    expect(Object.hasOwn(projection, 'feedback')).toBe(false);
    const blanks = (redact(fib) as unknown as { blanks: Record<string, unknown>[] }).blanks;
    expect(Object.hasOwn(blanks[0] as object, 'match')).toBe(false);
  });

  it('drops an unclassified key planted on a rubric CRITERION, not just the root', () => {
    // The root-level cases above would still pass if `criteria` were
    // reclassified as a scalar, so the nesting needs its own probe.
    const essay = {
      schemaVersion: '1.0',
      type: 'written-response',
      id: 'w2',
      title: 'Essay',
      prompt: 'Write.',
      minWords: 1,
      maxWords: 50,
      rubric: {
        label: 'R',
        criteria: [{ name: 'Grammar', weight: 1, modelAnswer: 'SECRET ON THE CRITERION' }],
      },
    } as never;
    const projection = redact(essay) as { rubric?: { criteria?: Record<string, unknown>[] } };
    expect(projection.rubric?.criteria?.[0]).toEqual({ name: 'Grammar', weight: 1 });
  });
});
