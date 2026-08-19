import { describe, expect, it } from 'vitest';
import { UnknownActivityTypeError } from '../../errors.js';
import type { ActivityType } from '../../types/activity.js';
import {
  jsonSchemaFor,
  MediaSchema,
  MediaUrlSchema,
  multipleChoiceJsonSchema,
  validateActivity,
  writtenResponseJsonSchema,
} from '../index.js';

/** Builds a valid multiple-choice payload; spread overrides on top. */
function mcData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: '1.0',
    type: 'multiple-choice',
    id: 'mc-1',
    title: 'MC',
    question: 'Q?',
    mode: 'single',
    scoringStrategy: 'all-or-nothing',
    options: [
      { id: 'a', text: 'A', isCorrect: true },
      { id: 'b', text: 'B', isCorrect: false },
    ],
    ...overrides,
  };
}

/** Builds `count` options with unique ids and exactly one correct (the first). */
function makeOptions(count: number): Array<Record<string, unknown>> {
  return Array.from({ length: count }, (_, i) => ({
    id: `opt-${i}`,
    text: `Option ${i}`,
    isCorrect: i === 0,
  }));
}

/** Builds a valid fill-in-the-blanks payload; spread overrides on top. */
function fibData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: '1.0',
    type: 'fill-in-the-blanks',
    id: 'fib-1',
    title: 'FIB',
    passage: 'The capital of France is {{capital}}.',
    blanks: [{ id: 'capital', acceptedAnswers: ['Paris'] }],
    scoringStrategy: 'partial',
    ...overrides,
  };
}

/** Builds a minimal valid written-response payload; spread overrides on top. */
function wrData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: '1.0',
    type: 'written-response',
    id: 'wr-1',
    title: 'WR',
    prompt: 'Describe your weekend.',
    minWords: 10,
    maxWords: 100,
    ...overrides,
  };
}

/** Recursively walks a JSON tree looking for `additionalProperties: false`. */
function containsAdditionalPropertiesFalse(node: unknown): boolean {
  if (Array.isArray(node)) {
    return node.some(containsAdditionalPropertiesFalse);
  }
  if (node !== null && typeof node === 'object') {
    return Object.entries(node).some(
      ([key, value]) =>
        (key === 'additionalProperties' && value === false) ||
        containsAdditionalPropertiesFalse(value),
    );
  }
  return false;
}

describe('unknown-key preservation (B7 fix)', () => {
  it('preserves top-level and option-level unknown keys on multiple-choice', () => {
    const r = validateActivity(
      'multiple-choice',
      mcData({
        vendorX: { tenant: 'acme' },
        options: [
          { id: 'a', text: 'A', isCorrect: true, customTag: 'keep-me' },
          { id: 'b', text: 'B', isCorrect: false },
        ],
      }),
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect((r.data as unknown as Record<string, unknown>).vendorX).toEqual({ tenant: 'acme' });
      const option = r.data.options[0] as unknown as Record<string, unknown>;
      expect(option.customTag).toBe('keep-me');
    }
  });

  it('preserves top-level and blank-level unknown keys on fill-in-the-blanks', () => {
    const r = validateActivity(
      'fill-in-the-blanks',
      fibData({
        vendorX: 'sidecar',
        blanks: [{ id: 'capital', acceptedAnswers: ['Paris'], annotation: { source: 'ai' } }],
      }),
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect((r.data as unknown as Record<string, unknown>).vendorX).toBe('sidecar');
      const blank = r.data.blanks[0] as unknown as Record<string, unknown>;
      expect(blank.annotation).toEqual({ source: 'ai' });
    }
  });

  it('preserves top-level and rubric-level unknown keys on written-response', () => {
    const r = validateActivity(
      'written-response',
      wrData({
        vendorX: 42,
        rubric: {
          label: 'Grading',
          criteria: [{ name: 'Grammar', weight: 1 }],
          aiModel: 'grader-v2',
        },
      }),
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect((r.data as unknown as Record<string, unknown>).vendorX).toBe(42);
      expect(r.data.rubric).toBeDefined();
      const rubric = r.data.rubric as unknown as Record<string, unknown>;
      expect(rubric.aiModel).toBe('grader-v2');
    }
  });
});

describe('multiple-choice validation holes closed', () => {
  it('rejects duplicate option ids', () => {
    const r = validateActivity(
      'multiple-choice',
      mcData({
        options: [
          { id: 'dup', text: 'A', isCorrect: true },
          { id: 'dup', text: 'B', isCorrect: false },
        ],
      }),
    );
    expect(r.success).toBe(false);
  });

  it('accepts 26 options and rejects 27', () => {
    const ok = validateActivity('multiple-choice', mcData({ options: makeOptions(26) }));
    expect(ok.success).toBe(true);
    const bad = validateActivity('multiple-choice', mcData({ options: makeOptions(27) }));
    expect(bad.success).toBe(false);
  });
});

describe('fill-in-the-blanks validation', () => {
  it('rejects a duplicate {{id}} placeholder in the passage', () => {
    const r = validateActivity(
      'fill-in-the-blanks',
      fibData({ passage: 'First {{capital}} then again {{capital}}.' }),
    );
    expect(r.success).toBe(false);
  });

  it('rejects duplicate blank ids in blanks[]', () => {
    const r = validateActivity(
      'fill-in-the-blanks',
      fibData({
        passage: '{{capital}} and {{river}}.',
        blanks: [
          { id: 'capital', acceptedAnswers: ['Paris'] },
          { id: 'capital', acceptedAnswers: ['Paris'] },
        ],
      }),
    );
    expect(r.success).toBe(false);
  });

  it('accepts an honest 1:1 placeholder-to-blank correspondence', () => {
    const r = validateActivity(
      'fill-in-the-blanks',
      fibData({
        passage: '{{capital}} sits on the {{river}}.',
        blanks: [
          { id: 'capital', acceptedAnswers: ['Paris'] },
          { id: 'river', acceptedAnswers: ['Seine'] },
        ],
      }),
    );
    expect(r.success).toBe(true);
  });

  it('rejects a whitespace-only accepted answer', () => {
    const r = validateActivity(
      'fill-in-the-blanks',
      fibData({ blanks: [{ id: 'capital', acceptedAnswers: [' '] }] }),
    );
    expect(r.success).toBe(false);
  });

  it('accepts valid non-empty accepted answers', () => {
    const r = validateActivity(
      'fill-in-the-blanks',
      fibData({ blanks: [{ id: 'capital', acceptedAnswers: ['Paris', 'paris'] }] }),
    );
    expect(r.success).toBe(true);
  });

  it('accepts a blank with a valid TextMatchPolicy in match', () => {
    const r = validateActivity(
      'fill-in-the-blanks',
      fibData({
        blanks: [
          {
            id: 'capital',
            acceptedAnswers: ['Paris'],
            match: {
              caseSensitive: false,
              trim: true,
              normalize: 'NFC',
              foldDiacritics: true,
              collapseInnerWhitespace: true,
              ignorePunctuation: false,
              levenshtein: 1,
              locale: 'fr',
            },
          },
        ],
      }),
    );
    expect(r.success).toBe(true);
  });

  it('rejects an invalid TextMatchPolicy (levenshtein: -1)', () => {
    const r = validateActivity(
      'fill-in-the-blanks',
      fibData({
        blanks: [{ id: 'capital', acceptedAnswers: ['Paris'], match: { levenshtein: -1 } }],
      }),
    );
    expect(r.success).toBe(false);
  });
});

describe('media URL policy', () => {
  it('accepts https absolute, root-relative, data:, and blob: URLs', () => {
    expect(MediaUrlSchema.safeParse('https://cdn.example.com/a.mp3').success).toBe(true);
    expect(MediaUrlSchema.safeParse('/media/x.mp3').success).toBe(true);
    expect(MediaUrlSchema.safeParse('data:audio/mpeg;base64,SUQz').success).toBe(true);
    expect(
      MediaUrlSchema.safeParse('blob:https://example.com/550e8400-e29b-41d4-a716-446655440000')
        .success,
    ).toBe(true);
    expect(MediaSchema.safeParse({ type: 'audio', url: '/media/x.mp3' }).success).toBe(true);
  });

  it('rejects javascript:, ftp:, and protocol-relative URLs', () => {
    expect(MediaUrlSchema.safeParse('javascript:alert(1)').success).toBe(false);
    expect(MediaUrlSchema.safeParse('ftp://x/y').success).toBe(false);
    expect(MediaUrlSchema.safeParse('//cdn.example.com/x').success).toBe(false);
    expect(MediaSchema.safeParse({ type: 'audio', url: 'javascript:alert(1)' }).success).toBe(
      false,
    );
  });

  it('applies the same policy to captionsUrl', () => {
    expect(
      MediaSchema.safeParse({
        type: 'video',
        url: 'https://x.test/v.mp4',
        captionsUrl: '/media/v.vtt',
      }).success,
    ).toBe(true);
    expect(
      MediaSchema.safeParse({
        type: 'video',
        url: 'https://x.test/v.mp4',
        captionsUrl: 'javascript:alert(1)',
      }).success,
    ).toBe(false);
    expect(
      MediaSchema.safeParse({
        type: 'video',
        url: 'https://x.test/v.mp4',
        captionsUrl: '//cdn.example.com/v.vtt',
      }).success,
    ).toBe(false);
  });
});

describe('written-response schema', () => {
  it('accepts a minimal valid payload', () => {
    const r = validateActivity('written-response', wrData());
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.id).toBe('wr-1');
      expect(r.data.minWords).toBe(10);
      expect(r.data.maxWords).toBe(100);
    }
  });

  it('rejects maxWords < minWords', () => {
    const r = validateActivity('written-response', wrData({ minWords: 100, maxWords: 50 }));
    expect(r.success).toBe(false);
  });

  it('rejects a rubric with empty criteria', () => {
    const r = validateActivity('written-response', wrData({ rubric: { criteria: [] } }));
    expect(r.success).toBe(false);
  });

  it('rejects a rubric criterion with weight -1', () => {
    const r = validateActivity(
      'written-response',
      wrData({ rubric: { criteria: [{ name: 'Grammar', weight: -1 }] } }),
    );
    expect(r.success).toBe(false);
  });

  it('rejects minWords -1', () => {
    const r = validateActivity('written-response', wrData({ minWords: -1 }));
    expect(r.success).toBe(false);
  });

  it('treats promptHtml, languageTarget, and passThreshold as optional', () => {
    const withOptionals = validateActivity(
      'written-response',
      wrData({
        promptHtml: '<p>Describe your weekend.</p>',
        languageTarget: 'es-MX',
        passThreshold: 0.7,
      }),
    );
    expect(withOptionals.success).toBe(true);
    if (withOptionals.success) {
      expect(withOptionals.data.promptHtml).toBe('<p>Describe your weekend.</p>');
      expect(withOptionals.data.languageTarget).toBe('es-MX');
      expect(withOptionals.data.passThreshold).toBe(0.7);
    }
    // Minimal payload (all three absent) also passes.
    expect(validateActivity('written-response', wrData()).success).toBe(true);
  });

  it('enforces the type and schemaVersion literals', () => {
    expect(validateActivity('written-response', wrData({ type: 'essay' })).success).toBe(false);
    expect(validateActivity('written-response', wrData({ schemaVersion: '2.0' })).success).toBe(
      false,
    );
  });
});

describe('validateActivity dispatch', () => {
  it('throws UnknownActivityTypeError for an unregistered type', () => {
    expect(() => validateActivity('nope' as ActivityType, {})).toThrow(UnknownActivityTypeError);
  });
});

describe('JSON Schema exports (v0.3)', () => {
  it('jsonSchemaFor returns an object for every built-in type', () => {
    for (const type of ['multiple-choice', 'fill-in-the-blanks', 'written-response']) {
      const schema = jsonSchemaFor(type);
      expect(typeof schema).toBe('object');
      expect(schema).not.toBeNull();
    }
  });

  it('jsonSchemaFor throws UnknownActivityTypeError for an unregistered type', () => {
    expect(() => jsonSchemaFor('nope')).toThrow(UnknownActivityTypeError);
  });

  it('exports writtenResponseJsonSchema', () => {
    expect(writtenResponseJsonSchema).toBeDefined();
    expect(typeof writtenResponseJsonSchema).toBe('object');
  });

  it('multipleChoiceJsonSchema contains no additionalProperties:false anywhere', () => {
    expect(containsAdditionalPropertiesFalse(multipleChoiceJsonSchema)).toBe(false);
  });
});

describe('embed media scheme restriction (release-review fix)', () => {
  const embed = (url: string) => MediaSchema.safeParse({ type: 'embed', url, alt: 'player' });

  it('accepts absolute http(s) provider URLs for embeds', () => {
    expect(embed('https://www.youtube.com/embed/abc').success).toBe(true);
  });

  it('rejects data:, blob:, and root-relative URLs for embeds (allow-scripts iframe)', () => {
    expect(embed('data:text/html,<script>alert(1)</script>').success).toBe(false);
    expect(embed('blob:https://example.com/uuid').success).toBe(false);
    expect(embed('/local/embed.html').success).toBe(false);
  });

  it('still accepts data:/root-relative for non-embed media', () => {
    expect(
      MediaSchema.safeParse({ type: 'audio', url: 'data:audio/mpeg;base64,AAAA' }).success,
    ).toBe(true);
    expect(MediaSchema.safeParse({ type: 'image', url: '/img/x.png', alt: 'x' }).success).toBe(
      true,
    );
  });
});
