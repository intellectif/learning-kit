import { afterEach, describe, expect, it } from 'vitest';
import { validateDraft, validateItemGroupDraft } from '../authoring/index.js';
import { validateActivity } from '../schemas/index.js';
import { scopeCache, withValidationScope } from '../validation-scope.js';

const KEY = Symbol('test cache');

describe('withValidationScope', () => {
  it('gives no cache outside a scope, one cache per outermost scope, and shares it with nested ones', () => {
    expect(scopeCache(KEY, () => new Map())).toBeUndefined();
    const seen: unknown[] = [];
    withValidationScope(() => {
      const outer = scopeCache(KEY, () => new Map());
      seen.push(outer);
      withValidationScope(() => {
        expect(scopeCache(KEY, () => new Map())).toBe(outer);
      });
      expect(scopeCache(KEY, () => new Map())).toBe(outer);
    });
    expect(scopeCache(KEY, () => new Map())).toBeUndefined();
    withValidationScope(() => {
      expect(scopeCache(KEY, () => new Map())).not.toBe(seen[0]);
    });
  });

  it('closes the scope when the work throws, and returns what the work returns', () => {
    expect(() =>
      withValidationScope(() => {
        scopeCache(KEY, () => new Map());
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(scopeCache(KEY, () => new Map())).toBeUndefined();
    expect(withValidationScope(() => 42)).toBe(42);
  });
});

describe('draft validation normalises each dictation string once', () => {
  const original = String.prototype.normalize;
  afterEach(() => {
    String.prototype.normalize = original;
  });

  /** How many times `run` normalises exactly `text`, the first step of the dictation normaliser. */
  const normalisationsOf = (text: string, run: () => void): number => {
    let count = 0;
    String.prototype.normalize = function (this: string, form?: string) {
      if (this === text) {
        count += 1;
      }
      return original.call(this, form);
    };
    try {
      run();
    } finally {
      String.prototype.normalize = original;
    }
    return count;
  };

  const title = 'A title long enough to be told apart from anything else in the draft';
  const dictation = {
    schemaVersion: '1.0',
    type: 'dictation',
    id: 'dc',
    title,
    // Each written so that no normalised form of any of them is the string itself.
    transcript: 'Hello World',
    acceptedTranscripts: ['Hello, there, World!'],
    media: { type: 'audio', url: '/a.mp3', alt: 'The recording, read at normal speed' },
    slowMedia: { type: 'audio', url: '/b.mp3', alt: 'The recording, read slowly' },
    tolerance: { equivalences: [{ from: 'isnt', to: 'is not' }] },
  };
  const shown = [
    title,
    dictation.transcript,
    'Hello, there, World!',
    dictation.media.alt,
    dictation.slowMedia.alt,
  ];

  it('once in validateDraft, where the draft checks and the schema read the same strings', () => {
    for (const text of shown) {
      expect(
        normalisationsOf(text, () => validateActivity('dictation', dictation)),
        text,
      ).toBe(1);
      expect(
        normalisationsOf(text, () => validateDraft('dictation', dictation)),
        text,
      ).toBe(1);
    }
    expect(validateDraft('dictation', dictation).status).toBe('complete');
  });

  it('applies the rules to a string once, however many checks read the result', () => {
    // "a title that isnt" rewritten is "a title that is not": read by the
    // punctuation strip and the spaced form once each, and by nothing else.
    const rewritten = { ...dictation, title: 'A title that isnt the transcript' };
    expect(
      normalisationsOf('a title that is not the transcript', () =>
        validateDraft('dictation', rewritten),
      ),
    ).toBe(2);
    expect(validateDraft('dictation', rewritten).status).toBe('complete');
  });

  it('once in validateItemGroupDraft, which checks each item and then the whole group', () => {
    const group = {
      schemaVersion: '1.0',
      type: 'item-group',
      id: 'group',
      stimulus: { id: 'stimulus', kind: 'text', body: 'Read this.' },
      items: [dictation],
    };
    for (const text of shown) {
      expect(
        normalisationsOf(text, () => validateItemGroupDraft(group)),
        text,
      ).toBe(1);
    }
    expect(validateItemGroupDraft(group).status).toBe('complete');
  });

  it('never reuses a result for a string that changed between calls', () => {
    const first = validateDraft('dictation', { ...dictation, title: 'Listen: hello world' });
    expect(first.issues.map((found) => found.code)).toEqual(['dc_transcript_revealed']);
    expect(validateDraft('dictation', { ...dictation, title: 'Listen and type' }).status).toBe(
      'complete',
    );
  });
});
