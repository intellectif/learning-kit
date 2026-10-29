/**
 * `withoutAuthorOnly` is for practice an app scores in the browser: the
 * learner may hold the key, never the author's material. It must take out
 * exactly the author-only fields and leave an item that scores as stored.
 *
 * The proof is the grade-stability corpus. Every vector that scores an item is
 * replayed with the item's recording given a transcript and a script, then
 * stripped: the stripped item must be the original, field for field, and must
 * grade exactly as frozen. (`redact()` cannot serve here: its output carries
 * the `redacted` marker, and every scorer refuses it.)
 *
 * Plain ESM, as `scoring-vectors.test.mjs` is: it reads the corpus from disk.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decode, encode, runVector } from '../../vectors/replay.mjs';
import * as core from '../index.ts';

const corpus = JSON.parse(
  readFileSync(new URL('../../vectors/scoring.json', import.meta.url), 'utf8'),
);

/** Where each scoring function takes the item. */
const ITEM_ARGUMENT = { score: 1, evaluate: 0, evaluateTries: 0, gradeReadAloud: 0 };

const isItem = (value) =>
  typeof value === 'object' &&
  value !== null &&
  typeof value.type === 'string' &&
  core.getActivityTypeDescriptor(value.type) !== undefined;

const AUTHOR_TEXT = {
  transcript: 'What the recording says.',
  script: [{ speaker: 'Narrator', text: 'What the recording says.' }],
};

/** The item with a transcript and a script on every recording it has. */
function planted(item) {
  const copy = structuredClone(item);
  if (typeof copy.media === 'object' && copy.media !== null) {
    Object.assign(copy.media, AUTHOR_TEXT);
  }
  for (const option of Array.isArray(copy.options) ? copy.options : []) {
    if (typeof option?.media === 'object' && option.media !== null) {
      Object.assign(option.media, AUTHOR_TEXT);
    }
  }
  return copy;
}

describe('withoutAuthorOnly', () => {
  it('gives back the stored item, which grades as frozen, on every vector that scores one', () => {
    let replayed = 0;
    let withRecording = 0;
    const changed = [];
    for (const vector of corpus.vectors) {
      const at = vector.fn === undefined ? undefined : ITEM_ARGUMENT[vector.fn];
      if (at === undefined || vector.args === undefined) continue;
      const args = vector.args.map(decode);
      const item = args[at];
      if (!isItem(item)) continue;
      const seeded = planted(item);
      if (JSON.stringify(seeded) !== JSON.stringify(item)) withRecording += 1;
      const stripped = core.withoutAuthorOnly(seeded);
      expect(stripped, vector.id).toEqual(item);
      args[at] = stripped;
      const result = runVector(core, { ...vector, args: args.map(encode) });
      replayed += 1;
      if (!result.ok) changed.push(`${vector.id}: ${result.expected} → ${result.actual}`);
    }
    expect(changed).toEqual([]);
    // A filter that silently matched nothing would pass the checks above.
    expect(replayed).toBeGreaterThan(200);
    expect(withRecording).toBeGreaterThan(20);
  });

  it('strips a group’s stimulus and every item, and keeps the host’s own fields', () => {
    const group = {
      schemaVersion: '1.0',
      type: 'item-group',
      id: 'g',
      hostNote: 'kept',
      stimulus: {
        id: 's',
        kind: 'audio',
        media: { type: 'audio', url: '/a.mp3', ...AUTHOR_TEXT, hostTag: 'kept' },
        ...AUTHOR_TEXT,
      },
      items: [
        {
          schemaVersion: '1.0',
          type: 'dictation',
          id: 'd',
          title: 'Type it',
          transcript: 'The key, which practice holds.',
          media: { type: 'audio', url: '/d.mp3', ...AUTHOR_TEXT },
        },
      ],
    };
    expect(core.withoutAuthorOnly(group)).toEqual({
      schemaVersion: '1.0',
      type: 'item-group',
      id: 'g',
      hostNote: 'kept',
      stimulus: {
        id: 's',
        kind: 'audio',
        media: { type: 'audio', url: '/a.mp3', hostTag: 'kept' },
      },
      items: [
        {
          schemaVersion: '1.0',
          type: 'dictation',
          id: 'd',
          title: 'Type it',
          transcript: 'The key, which practice holds.',
          media: { type: 'audio', url: '/d.mp3' },
        },
      ],
    });
    // The input is left as it was.
    expect(group.stimulus.transcript).toBe(AUTHOR_TEXT.transcript);
  });

  it('refuses what it cannot classify', () => {
    expect(() => core.withoutAuthorOnly({ type: 'not-registered' })).toThrow(
      core.UnknownActivityTypeError,
    );
    expect(() => core.withoutAuthorOnly(null)).toThrow(TypeError);
  });
});
