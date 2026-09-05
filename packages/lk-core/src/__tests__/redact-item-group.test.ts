import { describe, expect, it } from 'vitest';
import { planAttempt } from '../attempt-plan.js';
import { ActivitySchemaError } from '../errors.js';
import { flattenSequence } from '../item-group.js';
import { assertRedacted, assertRedactedItemGroup, redact, redactItemGroup } from '../redact.js';
import type {
  FillInTheBlanksData,
  MultipleChoiceData,
  WrittenResponseData,
} from '../types/activity.js';
import type { ItemGroup } from '../types/item-group.js';

const mc: MultipleChoiceData = {
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'q1',
  title: 'Q1',
  question: 'What time does the train leave?',
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  options: [
    { id: 'a', text: '9:15', isCorrect: true, feedback: 'Right.' },
    { id: 'b', text: '9:50', isCorrect: false },
  ],
};

const fib: FillInTheBlanksData = {
  schemaVersion: '1.0',
  type: 'fill-in-the-blanks',
  id: 'q2',
  title: 'Q2',
  passage: 'The train leaves from platform {{p}}.',
  blanks: [{ id: 'p', acceptedAnswers: ['4', 'four'], hint: 'a number' }],
  scoringStrategy: 'partial',
};

const wr: WrittenResponseData = {
  schemaVersion: '1.0',
  type: 'written-response',
  id: 'q3',
  title: 'Q3',
  prompt: 'Summarise the announcement.',
  minWords: 20,
  maxWords: 60,
  rubric: { criteria: [{ name: 'Accuracy', weight: 1 }] },
};

const media = { type: 'audio' as const, url: 'https://cdn.example.com/announcement.mp3' };

const group: ItemGroup = {
  schemaVersion: '1.0',
  type: 'item-group',
  id: 'g1',
  title: 'Listening — Part 1',
  stimulus: {
    id: 's1',
    kind: 'audio',
    body: 'Listen to the station announcement and answer the questions.',
    media,
    transcript: 'The 9:15 service to Leeds departs from platform four.',
    attribution: 'Studio recording',
    locale: 'en-GB',
  },
  items: [mc, fib, wr],
  shuffle: 'within-group',
};

describe('redactItemGroup', () => {
  it('keeps the stimulus, removes the transcript, and redacts every item', () => {
    const redacted = redactItemGroup(group);

    expect(redacted.redacted).toBe(true);
    expect(redacted.type).toBe('item-group');
    expect(redacted.title).toBe('Listening — Part 1');
    expect(redacted.shuffle).toBe('within-group');
    expect(redacted.stimulus).toEqual({
      id: 's1',
      kind: 'audio',
      body: 'Listen to the station announcement and answer the questions.',
      media,
      attribution: 'Studio recording',
      locale: 'en-GB',
    });
    expect(redacted.stimulus).not.toHaveProperty('transcript');

    expect(redacted.items).toHaveLength(3);
    const [mcOut, fibOut, wrOut] = redacted.items as unknown as [
      { redacted: true; options: Record<string, unknown>[] } & Record<string, unknown>,
      { redacted: true; blanks: Record<string, unknown>[] } & Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(mcOut.redacted).toBe(true);
    expect(mcOut).not.toHaveProperty('scoringStrategy');
    expect(mcOut.options[0]).toEqual({ id: 'a', text: '9:15' });
    expect(fibOut.blanks[0]).toEqual({ id: 'p', hint: 'a number' });
    expect(wrOut).toMatchObject({ redacted: true, type: 'written-response', minWords: 20 });
    // A rubric is learner-visible by default (it says what the learner is graded on).
    expect(wrOut).toHaveProperty('rubric');
  });

  it('drops unclassified fields on the group and the stimulus (fail-closed)', () => {
    const redacted = redactItemGroup({
      ...group,
      vendorGroupField: 'x',
      stimulus: { ...group.stimulus, vendorStimulusField: 'y' },
    } as ItemGroup);
    expect(redacted).not.toHaveProperty('vendorGroupField');
    expect(redacted.stimulus).not.toHaveProperty('vendorStimulusField');
  });

  it('does not mutate its input', () => {
    const before = JSON.stringify(group);
    redactItemGroup(group);
    expect(JSON.stringify(group)).toBe(before);
  });

  it('produces a payload assertRedactedItemGroup accepts', () => {
    expect(() => assertRedactedItemGroup(redactItemGroup(group))).not.toThrow();
  });

  it('reveal: after-submit keeps item answer keys, still drops the transcript, and is NOT learner-safe', () => {
    const revealed = redactItemGroup(group, { reveal: 'after-submit' });
    const mcOut = revealed.items[0] as unknown as { options: { isCorrect?: boolean }[] };
    expect(mcOut.options[0]?.isCorrect).toBe(true);
    expect(revealed.stimulus).not.toHaveProperty('transcript');
    expect(() => assertRedactedItemGroup(revealed)).toThrow(ActivitySchemaError);
  });

  it('forwards a per-call policy to every item', () => {
    const tightened = redactItemGroup(group, { policy: { rubric: 'author-only' } });
    expect(tightened.items[2]).not.toHaveProperty('rubric');
    expect(() => assertRedactedItemGroup(tightened)).not.toThrow();
  });
});

describe('slot identity across the exam boundary', () => {
  // The whole plan/render agreement rests on this. redact() is fail-closed:
  // anything its policy does not classify is dropped — so an unclassified
  // slotKey vanished, the client derived positional ids from the redacted
  // payload while the server's stored plan held keyed ones, and the responses
  // could not be matched back to the attempt.
  const keyedGroup: ItemGroup = {
    ...group,
    slotKey: 'reading',
    items: [
      { ...mc, slotKey: 'q1' },
      { ...fib, slotKey: 'q2' },
    ],
  };

  it('a group keeps its slotKey through redaction', () => {
    const redacted = redactItemGroup(keyedGroup);
    expect(redacted.slotKey).toBe('reading');
    expect((redacted.items[0] as { slotKey?: string }).slotKey).toBe('q1');
  });

  it('the client derives the SAME slot ids the server planned', () => {
    // The group shuffles within itself, so both sides need the attempt's seed —
    // which is exactly the contract the exam path relies on.
    const seed = 'attempt-42';
    const planned = planAttempt([keyedGroup], { seed }).slots.map((slot) => slot.slotId);
    const rendered = flattenSequence([redactItemGroup(keyedGroup)], { seed }).map(
      (slot) => slot.slotId,
    );
    expect([...planned].sort()).toEqual(['reading.q1', 'reading.q2']);
    expect(rendered).toEqual(planned);
  });

  it('a loose activity keeps its slotKey too, and stays learner-safe', () => {
    const redacted = redact({ ...mc, slotKey: 'intro' });
    expect(redacted.slotKey).toBe('intro');
    expect(redacted).not.toHaveProperty('scoringStrategy');
    expect(() => assertRedacted(redacted)).not.toThrow();
  });

  it('assertRedactedItemGroup still accepts the keyed projection', () => {
    expect(() => assertRedactedItemGroup(redactItemGroup(keyedGroup))).not.toThrow();
  });
});

describe('assertRedactedItemGroup', () => {
  const safe = redactItemGroup(group);

  it('rejects a non-object', () => {
    expect(() => assertRedactedItemGroup(null)).toThrow(ActivitySchemaError);
    expect(() => assertRedactedItemGroup('nope')).toThrow(ActivitySchemaError);
  });

  it('rejects a payload without the marker', () => {
    const { redacted: _marker, ...unmarked } = safe;
    try {
      assertRedactedItemGroup(unmarked);
      throw new Error('expected a throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ActivitySchemaError);
      expect((error as ActivitySchemaError).errors[0]?.path).toEqual(['redacted']);
    }
  });

  it('rejects the full (unredacted) group even with a forged marker', () => {
    expect(() => assertRedactedItemGroup({ ...group, redacted: true })).toThrow(
      ActivitySchemaError,
    );
  });

  it('rejects a stimulus that still carries a transcript', () => {
    const leaky = { ...safe, stimulus: { ...safe.stimulus, transcript: 'leaked' } };
    try {
      assertRedactedItemGroup(leaky);
      throw new Error('expected a throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ActivitySchemaError);
      expect((error as ActivitySchemaError).errors[0]?.path[0]).toBe('stimulus');
    }
  });

  it('rejects an item that still carries its answer key, reported at items.<index>', () => {
    const leaky = { ...safe, items: [safe.items[0], { ...fib, redacted: true }, safe.items[2]] };
    try {
      assertRedactedItemGroup(leaky);
      throw new Error('expected a throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ActivitySchemaError);
      const schemaError = error as ActivitySchemaError;
      expect(schemaError.activityType).toBe('item-group');
      expect(schemaError.errors[0]?.path.slice(0, 2)).toEqual(['items', '1']);
    }
  });

  it('rejects a container of the wrong type', () => {
    expect(() => assertRedactedItemGroup({ ...safe, type: 'multiple-choice' })).toThrow(
      ActivitySchemaError,
    );
  });
});
