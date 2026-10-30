/**
 * The scores of a take Azure returned as several results.
 *
 * Continuous recognition splits a long take at its pauses and scores each
 * piece on its own, with no total. Averaging the pieces would not give the
 * number single-shot recognition gives for the same reading: a pause between
 * two pieces would cost no fluency, and each piece's completeness is a share
 * of the whole text. So the take is scored the way Microsoft's own continuous
 * sample scores one (`pronunciation_assessment_continuous_from_file`, in
 * Azure-Samples/cognitive-services-speech-sdk), with lk-core's aligner where
 * the sample uses `difflib`:
 *
 * - accuracy: the mean word accuracy over the reference words, an omitted or
 *   substituted word counting 0;
 * - completeness: the share of reference words read correctly;
 * - fluency: the time spent in words read correctly, over the time from the
 *   first word to the end of the last, each padded by 10 ms;
 * - prosody: the mean of the pieces' prosody scores;
 * - overall: Microsoft's PronScore formula over those.
 *
 * On the captures, the same arithmetic over one result reproduces Azure's own
 * accuracy and completeness on every single-shot scripted take in a script
 * written with spaces, and the formula its PronScore on every single-shot
 * take. Fluency is Azure's model, which the formula matches within a point on
 * most takes and not on all, so a single result keeps Azure's numbers.
 * Accuracy, fluency and completeness are whole numbers, and prosody and
 * overall have one decimal, as Azure reports them.
 */
import { alignReadAloud, type SpeechAssessment } from '@intellectif/lk-core/scoring';
import type { Utterance } from './read.js';

/** The sample adds 100 000 ticks (10 ms) to each word it counts, and to the end. */
const PAD_MS = 10;

const tenth = (value: number): number => Math.round(value * 10) / 10;

/** Accuracy over the reference words; nothing when a word read has no score. */
function accuracyOf(assessment: SpeechAssessment, referenceText: string): number | undefined {
  const reference = alignReadAloud({ referenceText }, assessment).filter(
    (entry) => entry.state !== 'inserted',
  );
  let total = 0;
  for (const entry of reference) {
    const word = entry.wordIndex !== undefined ? assessment.words[entry.wordIndex] : undefined;
    // An omitted word scores 0, as in Azure's own total. A substitution is
    // the sample's `replace`: the reference word omitted, the word heard
    // inserted, so it scores 0 too.
    if (entry.state === 'omitted' || (entry.state === 'mispronounced' && word?.error === 'none')) {
      continue;
    }
    if (entry.accuracy === undefined) {
      return undefined;
    }
    total += entry.accuracy;
  }
  return Math.round(total / reference.length);
}

function completenessOf(assessment: SpeechAssessment, referenceText: string): number {
  const reference = alignReadAloud({ referenceText }, assessment).filter(
    (entry) => entry.state !== 'inserted',
  );
  const correct = reference.filter((entry) => entry.state === 'correct').length;
  return Math.round((correct / reference.length) * 100);
}

/** Fluency over the take; nothing when no word was timed. */
function fluencyOf(assessment: SpeechAssessment): number | undefined {
  const timed = assessment.words.filter(
    (word) => word.startMs !== undefined && word.durationMs !== undefined,
  );
  const first = timed[0];
  const last = timed.at(-1);
  if (first === undefined || last === undefined) {
    return undefined;
  }
  const span =
    (last.startMs as number) + (last.durationMs as number) + PAD_MS - (first.startMs as number);
  const inWords = timed
    .filter((word) => word.vendorError === 'None')
    .reduce((sum, word) => sum + (word.durationMs as number) + PAD_MS, 0);
  return Math.round(Math.min(100, (inWords / span) * 100));
}

/** Microsoft's PronScore: the lowest score weighs most. Exported for its test. */
export function pronScore(scores: {
  accuracy: number;
  fluency: number;
  completeness: number;
  prosody?: number;
}): number {
  const { accuracy, fluency, completeness, prosody } = scores;
  if (prosody === undefined) {
    const [low, mid, high] = [accuracy, fluency, completeness].sort((a, b) => a - b) as [
      number,
      number,
      number,
    ];
    return tenth(low * 0.6 + mid * 0.2 + high * 0.2);
  }
  const [low, second, third, high] = [accuracy, prosody, completeness, fluency].sort(
    (a, b) => a - b,
  ) as [number, number, number, number];
  return tenth(low * 0.4 + second * 0.2 + third * 0.2 + high * 0.2);
}

/**
 * The scores of `assessment`, whose words are every result's in order and
 * which lk-core has already checked, with `miscue: 'none'`: Azure judges no
 * miscues across results, so the aligner finds what was left out.
 */
export function mergedScores(
  utterances: readonly Utterance[],
  assessment: SpeechAssessment,
  referenceText: string,
): SpeechAssessment['scores'] {
  const accuracy = accuracyOf(assessment, referenceText);
  const fluency = fluencyOf(assessment);
  const completeness = completenessOf(assessment, referenceText);
  const prosodies = utterances.flatMap((utterance) =>
    utterance.scores.prosody !== undefined ? [utterance.scores.prosody] : [],
  );
  const prosody =
    prosodies.length > 0
      ? tenth(prosodies.reduce((sum, value) => sum + value, 0) / prosodies.length)
      : undefined;
  const overall =
    accuracy !== undefined && fluency !== undefined
      ? pronScore({
          accuracy,
          fluency,
          completeness,
          ...(prosody !== undefined ? { prosody } : {}),
        })
      : undefined;
  return {
    ...(accuracy !== undefined ? { accuracy } : {}),
    ...(fluency !== undefined ? { fluency } : {}),
    completeness,
    ...(prosody !== undefined ? { prosody } : {}),
    ...(overall !== undefined ? { overall } : {}),
  };
}
