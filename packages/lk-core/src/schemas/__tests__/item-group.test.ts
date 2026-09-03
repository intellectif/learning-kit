import { describe, expect, it } from 'vitest';
import type { z } from 'zod/v4';
import {
  ItemGroupSchema,
  itemGroupJsonSchema,
  StimulusSchema,
  stimulusJsonSchema,
  validateItemGroup,
} from '../index.js';

const mc = {
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'q1',
  title: 'Q1',
  question: 'According to the passage, how often does the tide come in?',
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  options: [
    { id: 'a', text: 'Twice a day', isCorrect: true },
    { id: 'b', text: 'Once a week', isCorrect: false },
  ],
};

const fib = {
  schemaVersion: '1.0',
  type: 'fill-in-the-blanks',
  id: 'q2',
  title: 'Q2',
  passage: 'The tide comes in {{n}} a day.',
  blanks: [{ id: 'n', acceptedAnswers: ['twice'] }],
  scoringStrategy: 'partial',
};

const passage = {
  id: 'p1',
  kind: 'text',
  title: 'Tides',
  body: 'The tide comes in twice a day, pulled by the moon.',
};

const audio = { type: 'audio', url: 'https://cdn.example.com/clip.mp3' };

const validGroup = {
  schemaVersion: '1.0',
  type: 'item-group',
  id: 'g1',
  stimulus: passage,
  items: [mc, fib],
};

function firstIssue(result: z.ZodSafeParseResult<unknown>): {
  path: PropertyKey[];
  message: string;
} {
  if (result.success) {
    throw new Error('expected failure');
  }
  const issue = result.error.issues[0];
  if (issue === undefined) {
    throw new Error('expected at least one issue');
  }
  return { path: issue.path, message: issue.message };
}

describe('StimulusSchema', () => {
  it('accepts a text passage and preserves unknown keys', () => {
    const result = StimulusSchema.safeParse({ ...passage, vendorField: 'kept' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveProperty('vendorField', 'kept');
    }
  });

  it('rejects a text stimulus without a body', () => {
    const issue = firstIssue(StimulusSchema.safeParse({ id: 'p', kind: 'text' }));
    expect(issue.path).toEqual(['body']);
    expect(issue.message).toMatch(/needs a non-empty body/);
  });

  it('rejects a whitespace-only body for text', () => {
    expect(StimulusSchema.safeParse({ id: 'p', kind: 'text', body: '   ' }).success).toBe(false);
  });

  it('rejects bodyHtml without a plain-text body', () => {
    const issue = firstIssue(
      StimulusSchema.safeParse({ id: 'p', kind: 'audio', media: audio, bodyHtml: '<p>Hi</p>' }),
    );
    expect(issue.path).toEqual(['body']);
    expect(issue.message).toMatch(/bodyHtml requires a plain-text body/);
  });

  it.each(['audio', 'video', 'image', 'mixed'])('requires media for kind %s', (kind) => {
    const issue = firstIssue(StimulusSchema.safeParse({ id: 'p', kind, body: 'Listen.' }));
    expect(issue.path).toEqual(['media']);
  });

  it('rejects media whose type does not fit the kind', () => {
    const issue = firstIssue(
      StimulusSchema.safeParse({
        id: 'p',
        kind: 'audio',
        media: { type: 'image', url: 'https://cdn.example.com/x.png', alt: 'x' },
      }),
    );
    expect(issue.path).toEqual(['media', 'type']);
  });

  it('accepts embed media for a video stimulus', () => {
    const result = StimulusSchema.safeParse({
      id: 'p',
      kind: 'video',
      media: { type: 'embed', url: 'https://www.youtube.com/embed/abc', alt: 'Interview' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts a mixed stimulus with a body and any media', () => {
    const result = StimulusSchema.safeParse({
      id: 'p',
      kind: 'mixed',
      body: 'Read the transcript while you listen.',
      media: audio,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a mixed stimulus without a body', () => {
    const issue = firstIssue(StimulusSchema.safeParse({ id: 'p', kind: 'mixed', media: audio }));
    expect(issue.path).toEqual(['body']);
  });

  it('accepts an audio stimulus with an author transcript and attribution', () => {
    const result = StimulusSchema.safeParse({
      id: 'p',
      kind: 'audio',
      media: audio,
      transcript: 'Good morning, and welcome…',
      attribution: 'Studio recording, 2024',
      locale: 'en-GB',
    });
    expect(result.success).toBe(true);
  });

  it('still validates the media contract (image alt required)', () => {
    const result = StimulusSchema.safeParse({
      id: 'p',
      kind: 'image',
      media: { type: 'image', url: 'https://cdn.example.com/chart.png' },
    });
    expect(result.success).toBe(false);
  });
});

describe('ItemGroupSchema', () => {
  it('accepts a valid group', () => {
    expect(ItemGroupSchema.safeParse(validGroup).success).toBe(true);
  });

  it('rejects an empty group', () => {
    const issue = firstIssue(ItemGroupSchema.safeParse({ ...validGroup, items: [] }));
    expect(issue.path).toEqual(['items']);
  });

  it('rejects nested groups', () => {
    const result = ItemGroupSchema.safeParse({ ...validGroup, items: [mc, validGroup] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => /do not nest/.test(issue.message))).toBe(true);
    }
  });

  it('rejects duplicate item ids', () => {
    const result = ItemGroupSchema.safeParse({ ...validGroup, items: [mc, { ...fib, id: 'q1' }] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => /unique within a group/.test(issue.message))).toBe(
        true,
      );
    }
  });

  it('rejects an invalid shuffle value', () => {
    expect(ItemGroupSchema.safeParse({ ...validGroup, shuffle: 'random' }).success).toBe(false);
  });

  it('checks items structurally only — item contracts are validateItemGroup’s job', () => {
    const result = ItemGroupSchema.safeParse({
      ...validGroup,
      items: [{ type: 'multiple-choice', id: 'x' }],
    });
    expect(result.success).toBe(true);
  });
});

describe('validateItemGroup', () => {
  it('validates every item against its registered schema and returns typed data', () => {
    const result = validateItemGroup(validGroup);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('item-group');
      expect(result.data.stimulus.kind).toBe('text');
      expect(result.data.items).toHaveLength(2);
      expect(result.data.items[0]?.type).toBe('multiple-choice');
      expect(result.data.items[1]?.type).toBe('fill-in-the-blanks');
    }
  });

  it('reports an unregistered item type instead of throwing', () => {
    const result = validateItemGroup({
      ...validGroup,
      items: [{ ...mc, type: 'not-a-type' }, fib],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toEqual([
        expect.objectContaining({
          path: ['items', '0', 'type'],
          code: 'unknown_activity_type',
        }),
      ]);
    }
  });

  it('prefixes item schema errors with items.<index>', () => {
    const twoCorrect = {
      ...mc,
      options: [
        { id: 'a', text: 'A', isCorrect: true },
        { id: 'b', text: 'B', isCorrect: true },
      ],
    };
    const result = validateItemGroup({ ...validGroup, items: [fib, twoCorrect] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[0]?.path).toEqual(['items', '1', 'options']);
      expect(result.errors[0]?.message).toMatch(/exactly one correct option/);
    }
  });

  it('collects errors from several items in one pass', () => {
    const result = validateItemGroup({
      ...validGroup,
      items: [
        { ...mc, options: [] },
        { ...fib, blanks: [] },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const prefixes = new Set(result.errors.map((error) => error.path.slice(0, 2).join('.')));
      expect(prefixes).toEqual(new Set(['items.0', 'items.1']));
    }
  });

  it('reports container errors when the group itself is invalid', () => {
    const { stimulus: _stimulus, ...noStimulus } = validGroup;
    const result = validateItemGroup(noStimulus);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[0]?.path).toEqual(['stimulus']);
    }
  });

  it('preserves unknown keys on the group, the stimulus and the items', () => {
    const result = validateItemGroup({
      ...validGroup,
      vendorGroupField: 1,
      stimulus: { ...passage, vendorStimulusField: 2 },
      items: [{ ...mc, vendorItemField: 3 }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveProperty('vendorGroupField', 1);
      expect(result.data.stimulus).toHaveProperty('vendorStimulusField', 2);
      expect(result.data.items[0]).toHaveProperty('vendorItemField', 3);
    }
  });
});

describe('JSON schema exports', () => {
  it('emit draft-7 schemas for the stimulus and the group container', () => {
    expect(stimulusJsonSchema.$schema).toContain('draft-07');
    expect(itemGroupJsonSchema.$schema).toContain('draft-07');
    expect((itemGroupJsonSchema.properties as Record<string, unknown>).stimulus).toBeDefined();
  });
});
