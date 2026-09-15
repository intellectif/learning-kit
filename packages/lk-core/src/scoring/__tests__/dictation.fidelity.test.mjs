/**
 * The dictation scorer against the behaviour corpus of the reference
 * implementation it reproduces (`fixtures/dictation-reference-corpus.json`).
 *
 * Two locks, so that "reproduces the reference" is a fact rather than a claim:
 *
 * 1. Replaying the corpus through the SDK with the reference's own 16 English
 *    contraction rules as equivalences must match the reference on every case
 *    in three dimensions — the score at two decimals, the word pairings, and
 *    pass/fail at 70% — EXCEPT the cases listed below, each with the deliberate
 *    change that moves it (documented in the authoring guide). A listed case
 *    must differ: a change that silently re-aligned the SDK with the reference
 *    on one of them would be noticed too.
 * 2. The reference's arithmetic re-implemented on the SDK's own code-unit
 *    primitive — `levenshteinDistance(a, b, Infinity)` — reproduces the corpus
 *    on every case. So the two implementations agree on the distance, and only
 *    the normalisation policy and the unit of comparison differ.
 *
 * Plain ESM, like `scoring-vectors.test.mjs`: it reads a fixture from disk, and
 * lk-core's typecheck carries no Node types for a `.ts` test to use.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { alignDictation } from '../dictation/index.ts';
import { evaluate } from '../index.ts';
import { levenshteinDistance } from '../text-match.ts';

const corpus = JSON.parse(
  readFileSync(new URL('./fixtures/dictation-reference-corpus.json', import.meta.url), 'utf8'),
);

/** The reference implementation's contraction table, as the equivalence preset the guide publishes. */
const EN_CONTRACTIONS = [
  ["what's", 'what is'],
  ["you're", 'you are'],
  ["i'm", 'i am'],
  ["he's", 'he is'],
  ["she's", 'she is'],
  ["it's", 'it is'],
  ["we're", 'we are'],
  ["they're", 'they are'],
  ["don't", 'do not'],
  ["doesn't", 'does not'],
  ["won't", 'will not'],
  ["can't", 'cannot'],
  ["isn't", 'is not'],
  ["aren't", 'are not'],
  ["wasn't", 'was not'],
  ["weren't", 'were not'],
].map(([from, to]) => ({ from, to }));

/**
 * Every case the SDK scores differently, by dimension, with the change that
 * moves it:
 * - `whitespace` — inner whitespace is collapsed; the reference charged an edit per extra space.
 * - `punctuation` — every punctuation mark is ignored; the reference ignored six, so `¿`, `«`,
 *   quotes, dashes and brackets cost edits, and `&` (punctuation to Unicode) was kept.
 * - `apostrophe` — typographic apostrophes are folded to `'`.
 * - `equivalence-boundary` — rules rewrite whole words; the reference rewrote inside words
 *   (`Roche's` became `roche is`), awarding 100 to a wrong answer.
 * - `nfc` — text is NFC-normalised; the reference compared code points as typed.
 * - `code-points` — an astral character is one character, not two UTF-16 units.
 * - `transcript-cap` — a transcript is at most 2000 code points; the reference had no cap.
 * - `compatibility` — a compatibility character is compared as what it stands for, so the
 *   `ﬁ` ligature a PDF carries is the two letters it draws.
 */
const EXPECTED_DIVERGENCES = {
  'inner-double-space': { score: 'whitespace' },
  'inner-tab': { score: 'whitespace' },
  'inner-newline': { score: 'whitespace' },
  'ref-has-double-space': { score: 'whitespace' },
  'double-quotes': { score: 'punctuation', pairings: 'punctuation' },
  'curly-double-quotes': { score: 'punctuation', pairings: 'punctuation' },
  'single-quotes': { score: 'punctuation', pairings: 'punctuation' },
  'ellipsis-u2026': { score: 'punctuation', pairings: 'punctuation' },
  'em-dash': { score: 'punctuation', pairings: 'punctuation' },
  'spanish-inverted-question': { score: 'punctuation', pairings: 'punctuation' },
  'spanish-inverted-exclamation': { score: 'punctuation', pairings: 'punctuation' },
  guillemets: { score: 'punctuation', pairings: 'punctuation' },
  parentheses: { score: 'punctuation', pairings: 'punctuation' },
  'ampersand-symbol': { score: 'punctuation', pairings: 'punctuation', passed: 'punctuation' },
  slash: { pairings: 'punctuation' },
  'es-nfc-exact': { pairings: 'punctuation' },
  'apostrophe-curly-vs-straight': { score: 'apostrophe', pairings: 'apostrophe' },
  'contr-curly-apostrophe-input': { score: 'apostrophe', pairings: 'apostrophe' },
  'contr-curly-apostrophe-ref-vs-expansion': { score: 'apostrophe', pairings: 'apostrophe' },
  'contr-substring-misfire-roches': {
    score: 'equivalence-boundary',
    pairings: 'equivalence-boundary',
  },
  'contr-substring-misfire-bits': {
    score: 'equivalence-boundary',
    pairings: 'equivalence-boundary',
  },
  'es-nfd-input': { score: 'nfc', pairings: 'nfc', passed: 'nfc' },
  'es-nfd-ref-nfc-input': { score: 'nfc', pairings: 'nfc', passed: 'nfc' },
  'es-nfd-sentence': { score: 'nfc', pairings: 'nfc' },
  'es-enye-nfd': { score: 'nfc', pairings: 'nfc', passed: 'nfc' },
  'pt-cedilla-nfd': { score: 'nfc', pairings: 'nfc', passed: 'nfc' },
  'pt-tilde-nfd': { score: 'nfc', pairings: 'nfc', passed: 'nfc' },
  'emoji-missing': { score: 'code-points' },
  'emoji-different': { score: 'code-points', pairings: 'code-points' },
  'rounding-3333-chars-tie-rounds-up-to-70': {
    score: 'transcript-cap',
    pairings: 'transcript-cap',
  },
  'ligature-fi': { score: 'compatibility', pairings: 'compatibility', passed: 'compatibility' },
};
const EXPECTED_COUNTS = { score: 29, pairings: 26, passed: 7 };

const percent = (value) => Number.parseFloat((value * 100).toFixed(2));

/** The SDK's three dimensions for one case. */
function sdkVerdict(entry) {
  const data = {
    schemaVersion: '1.0',
    type: 'dictation',
    id: entry.id,
    title: 'Listen',
    transcript: entry.reference,
    tolerance: { equivalences: EN_CONTRACTIONS },
  };
  const alignment = alignDictation(data, entry.input);
  const outcome = evaluate(data, { type: 'dictation', text: entry.input });
  return {
    score: percent(alignment.similarity),
    pairings: alignment.words
      .map((word) => `${word.reference}|${word.attempt}|${percent(word.similarity)}`)
      .join(' '),
    passed: outcome.status === 'scored' && outcome.passed,
  };
}

function referenceVerdict(entry) {
  return {
    score: entry.expected.similarity,
    pairings: entry.expected.words
      .map(([reference, attempt, score]) => `${reference}|${attempt}|${score}`)
      .join(' '),
    passed: entry.expected.passed,
  };
}

/** The reference's own normalisation, verbatim: the six marks, the table applied inside words, no collapse. */
function referenceNormalize(text) {
  return text
    .toLowerCase()
    .replace(/[.,!?;:]/g, '')
    .replace(/what's/g, 'what is')
    .replace(/you're/g, 'you are')
    .replace(/i'm/g, 'i am')
    .replace(/he's/g, 'he is')
    .replace(/she's/g, 'she is')
    .replace(/it's/g, 'it is')
    .replace(/we're/g, 'we are')
    .replace(/they're/g, 'they are')
    .replace(/don't/g, 'do not')
    .replace(/doesn't/g, 'does not')
    .replace(/won't/g, 'will not')
    .replace(/can't/g, 'cannot')
    .replace(/isn't/g, 'is not')
    .replace(/aren't/g, 'are not')
    .replace(/wasn't/g, 'was not')
    .replace(/weren't/g, 'were not')
    .trim();
}

describe('dictation fidelity to the reference implementation', () => {
  it('has the whole corpus and a listed divergence for nothing that is not in it', () => {
    expect(corpus.cases).toHaveLength(111);
    const ids = new Set(corpus.cases.map((entry) => entry.id));
    expect(Object.keys(EXPECTED_DIVERGENCES).filter((id) => !ids.has(id))).toEqual([]);
  });

  it('matches the reference on every case, in every dimension, except the listed deliberate changes', () => {
    const unexpected = [];
    const missing = [];
    const counts = { score: 0, pairings: 0, passed: 0 };
    for (const entry of corpus.cases) {
      const sdk = sdkVerdict(entry);
      const reference = referenceVerdict(entry);
      const listed = EXPECTED_DIVERGENCES[entry.id] ?? {};
      for (const dimension of ['score', 'pairings', 'passed']) {
        const differs = sdk[dimension] !== reference[dimension];
        if (differs) {
          counts[dimension] += 1;
        }
        if (differs && listed[dimension] === undefined) {
          unexpected.push(
            `${entry.id}.${dimension}: reference ${reference[dimension]} | sdk ${sdk[dimension]}`,
          );
        }
        if (!differs && listed[dimension] !== undefined) {
          missing.push(`${entry.id}.${dimension} no longer differs (${listed[dimension]})`);
        }
      }
    }
    expect(unexpected).toEqual([]);
    expect(missing).toEqual([]);
    expect(counts).toEqual(EXPECTED_COUNTS);
  });

  it('reproduces the reference exactly when configured as the reference, on its own code-unit primitive', () => {
    const wrong = [];
    for (const entry of corpus.cases) {
      const reference = referenceNormalize(entry.reference);
      const attempt = referenceNormalize(entry.input);
      const max = Math.max(reference.length, attempt.length);
      const score =
        max === 0
          ? 0
          : Number.parseFloat(
              (
                (1 - levenshteinDistance(reference, attempt, Number.POSITIVE_INFINITY) / max) *
                100
              ).toFixed(2),
            );
      if (score !== entry.expected.similarity || score >= 70 !== entry.expected.passed) {
        wrong.push(`${entry.id}: ${score} vs ${entry.expected.similarity}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});
