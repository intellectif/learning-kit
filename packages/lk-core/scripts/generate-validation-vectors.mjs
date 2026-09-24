/**
 * Writes `vectors/validation.json` from the BUILT package: what each validator
 * does with every input `vectors/validation.mjs` builds from the seeds.
 *
 * A new case is added freely. An expectation that changed, or a case that
 * disappeared, is refused without `--accept-validation-change`: it means some
 * content is now accepted or refused differently, or an error moved path or
 * changed code — what 1.x promises not to do outside a major (see
 * docs/stability.md). Say so in the changeset when you accept one.
 *
 * The seeds are frozen with the corpus. The first run takes them from the
 * grade-stability corpus: for each activity type the item with the most
 * fields, and the two speech assessments with the most.
 *
 * Usage: `pnpm build && node scripts/generate-validation-vectors.mjs`.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VALIDATION_CORPUS_VERSION, validationCases } from '../vectors/validation.mjs';

const require = createRequire(import.meta.url);
const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS = join(PKG_ROOT, 'vectors', 'validation.json');
const accept = process.argv.includes('--accept-validation-change');

const core = require(join(PKG_ROOT, 'dist', 'index.cjs'));
const { version } = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'));
const previous = existsSync(CORPUS) ? JSON.parse(readFileSync(CORPUS, 'utf8')) : undefined;

function seedsFromScoringCorpus() {
  const TYPES = [
    'multiple-choice',
    'fill-in-the-blanks',
    'gap-select',
    'written-response',
    'dictation',
    'read-aloud',
  ];
  const { vectors } = JSON.parse(readFileSync(join(PKG_ROOT, 'vectors', 'scoring.json'), 'utf8'));
  const activities = {};
  const assessments = [];
  const visit = (node) => {
    if (Array.isArray(node)) {
      for (const entry of node) {
        visit(entry);
      }
      return;
    }
    if (node === null || typeof node !== 'object') {
      return;
    }
    if (TYPES.includes(node.type) && node.schemaVersion === '1.0' && typeof node.id === 'string') {
      const best = activities[node.type];
      if (best === undefined || Object.keys(node).length > Object.keys(best).length) {
        activities[node.type] = node;
      }
    }
    if (node.assessmentVersion === '1.0') {
      assessments.push(node);
    }
    for (const value of Object.values(node)) {
      visit(value);
    }
  };
  for (const vector of vectors) {
    visit(vector.args);
  }
  const [first, second] = [...assessments].sort(
    (a, b) => JSON.stringify(b).length - JSON.stringify(a).length,
  );
  const choices = Object.values(activities).filter((item) => item.type === 'multiple-choice');
  return {
    activities,
    assessments: { richest: first, second },
    itemGroup: {
      schemaVersion: '1.0',
      type: 'item-group',
      id: 'group-1',
      stimulus: { id: 'stimulus-1', kind: 'text', body: 'A short passage.' },
      items: [
        { ...choices[0], id: 'item-1' },
        { ...choices[0], id: 'item-2' },
      ],
    },
    media: {
      audio: {
        type: 'audio',
        url: 'https://example.com/a.mp3',
        alt: 'A recording',
        playback: { maxPlays: 2, seek: 'none' },
      },
      video: {
        type: 'video',
        url: 'https://example.com/v.mp4',
        poster: 'https://example.com/poster.jpg',
        tracks: [
          { kind: 'captions', src: 'https://example.com/c.vtt', srclang: 'en', label: 'English' },
        ],
      },
      image: { type: 'image', url: 'https://example.com/i.png', alt: 'A picture' },
    },
    xapiStatement: {
      id: '12345678-1234-4123-8123-123456789abc',
      actor: { objectType: 'Agent', mbox: 'mailto:learner@example.com', name: 'A learner' },
      verb: { id: 'http://adlnet.gov/expapi/verbs/answered', display: { 'en-US': 'answered' } },
      object: {
        objectType: 'Activity',
        id: 'urn:learning-kit:activity:q1',
        definition: {
          name: { 'en-US': 'Q' },
          type: 'http://adlnet.gov/expapi/activities/cmi.interaction',
          interactionType: 'choice',
        },
      },
      result: {
        score: { scaled: 0.5, raw: 1, min: 0, max: 2 },
        success: false,
        completion: true,
        duration: 'PT5S',
        response: 'a',
      },
      timestamp: '2026-09-23T10:00:00.000Z',
      version: '1.0.3',
    },
  };
}

const seeds = previous?.seeds ?? seedsFromScoringCorpus();
const expect = {};
for (const { id, run } of validationCases(seeds)) {
  if (Object.hasOwn(expect, id)) {
    throw new Error(`Duplicate validation case id: ${id}`);
  }
  expect[id] = run(core);
}

let added = 0;
const refused = [];
if (previous !== undefined) {
  for (const [id, value] of Object.entries(expect)) {
    if (!Object.hasOwn(previous.expect, id)) {
      added += 1;
    } else if (JSON.stringify(previous.expect[id]) !== JSON.stringify(value)) {
      refused.push(`CHANGED  ${id}`);
    }
  }
  for (const id of Object.keys(previous.expect)) {
    if (!Object.hasOwn(expect, id)) {
      refused.push(`REMOVED  ${id}`);
    }
  }
} else {
  added = Object.keys(expect).length;
}

if (refused.length > 0) {
  for (const line of refused) {
    console.log(line);
  }
  if (!accept) {
    console.error(
      `\n${refused.length} expectations would change or disappear. Content would be accepted or refused differently, or an error would move: see docs/stability.md. Re-run with --accept-validation-change only if that is intended, and say so in the changeset.`,
    );
    process.exit(1);
  }
}

const corpus = {
  $comment:
    'Generated by scripts/generate-validation-vectors.mjs from the built package; replayed by src/__tests__/validation-vectors.test.mjs and scripts/verify-dist.mjs. Do not edit by hand. See vectors/validation.mjs.',
  corpusVersion: VALIDATION_CORPUS_VERSION,
  frozenFrom: `@intellectif/lk-core@${version}`,
  seeds,
  expect,
};
writeFileSync(CORPUS, `${JSON.stringify(corpus, null, 2)}\n`);
console.log(
  `Wrote ${Object.keys(expect).length} validation expectations (${added} new, ${refused.length} changed or removed) to vectors/validation.json`,
);
