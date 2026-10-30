import { createHash } from 'node:crypto';
import { gradeReadAloud, type SpeechAssessment } from '@intellectif/lk-core/scoring';
import { describe, expect, it } from 'vitest';
import { assessmentFromAzure } from '../index.js';
import { pronScore } from '../merge.js';
import { readResult } from '../read.js';
import { type Capture, captures, itemOf, requestOf, TAKE_KEY } from './support.js';

/**
 * Every real response this package was built from, read end to end. The
 * snapshot holds a line per capture and the hash of its whole assessment:
 * a change to it is a change to what a stored response maps to, which
 * changes a grade on a re-map, and is a major.
 */
describe('the captured Azure responses', () => {
  const all = captures();

  it('are the 41 promoted cases', () => {
    expect(all).toHaveLength(41);
  });

  it('each map to the same assessment as when they were frozen', async () => {
    const lines = all.map((one) => {
      const result = assessmentFromAzure(one.results, requestOf(one));
      const hash = createHash('sha256').update(JSON.stringify(result)).digest('hex').slice(0, 16);
      if (!result.ok) {
        return `${one.case} | refused ${result.code} | ${hash}`;
      }
      const { status, miscue, scores, words } = result.assessment;
      return `${one.case} | ${status} | ${miscue} | ${JSON.stringify(scores)} | ${words.length} words | ${hash}`;
    });
    await expect(`${lines.join('\n')}\n`).toMatchFileSnapshot('__snapshots__/captures.txt');
  });

  /**
   * A read-aloud item refuses a script written without spaces (zh-CN, ja-JP):
   * lk-core compares the text word by word. Those captures still show how
   * their sounds are named, but no item grades them, and the aligner reads
   * their text as one word.
   */
  const spaced = (one: Capture) => !['zh-CN', 'ja-JP'].includes(one.request.locale);

  it('grade, or are unscorable for a reason about the take, never for the evidence', () => {
    const gradable = all.filter(
      (capture) => capture.request.gradingSystem === 'HundredMark' && spaced(capture),
    );
    expect(gradable).toHaveLength(38);
    for (const one of gradable) {
      const result = assessmentFromAzure(one.results, requestOf(one));
      expect(result.ok, one.case).toBe(true);
      const assessment = (result as { assessment: SpeechAssessment }).assessment;
      const graded = gradeReadAloud(
        itemOf(one),
        { type: 'read-aloud', recording: { key: TAKE_KEY, mimeType: 'audio/wav' } },
        assessment,
        {
          measured: { durationMs: one.audioMs, voicedMs: one.audioMs },
          plausibility: { maxWordsPerSecond: 6, minVoicedMs: 0 },
        },
      );
      if (assessment.status === 'no_speech') {
        expect(graded, one.case).toMatchObject({ unscorable: true, code: 'no_speech' });
      } else {
        expect('unscorable' in graded ? graded : { graded: true }, one.case).toEqual({
          graded: true,
        });
      }
    }
  });

  /**
   * Azure's prosody score, and whether it recognised any word, as the raw
   * result has them: SDK JSON nests both under `PronunciationAssessment`, and
   * REST does not.
   */
  type RawWord = { PronunciationAssessment?: { ErrorType?: string }; ErrorType?: string };
  function rawProsody(result: Capture['results'][number]): { scored: boolean; heard: boolean } {
    const best = result.NBest[0];
    const words: RawWord[] = best.Words;
    return {
      scored: (best.PronunciationAssessment ?? best).ProsodyScore !== undefined,
      heard: words.some((word) => (word.PronunciationAssessment ?? word).ErrorType !== 'Omission'),
    };
  }

  // A take Azure gives no prosody score is unscorable on an item that weighs
  // prosody. Read as anything but `no_speech`, a take of silence, noise or a
  // hum would ask the learner to wait for a check that never comes. A take
  // in which Azure heard one word of twelve still has its score.
  it('lack a prosody score in en-US only where Azure heard no word, which is no_speech', () => {
    const asked = all.filter(
      (one) => one.request.prosody === true && one.request.locale === 'en-US',
    );
    expect(asked).toHaveLength(24);
    let unheard = 0;
    for (const one of asked) {
      const raw = one.results.map(rawProsody);
      for (const { scored, heard } of raw) {
        expect({ case: one.case, scored }).toEqual({ case: one.case, scored: heard });
      }
      const result = assessmentFromAzure(one.results, requestOf(one));
      const assessment = (result as { assessment: SpeechAssessment }).assessment;
      const item = itemOf(one);
      const graded = gradeReadAloud(
        {
          ...item,
          scoring: { dimensions: [...item.scoring.dimensions, { name: 'prosody', weight: 1 }] },
        },
        { type: 'read-aloud', recording: { key: TAKE_KEY, mimeType: 'audio/wav' } },
        assessment,
        {
          measured: { durationMs: one.audioMs, voicedMs: one.audioMs },
          plausibility: { maxWordsPerSecond: 6, minVoicedMs: 0 },
        },
      );
      if (raw.some(({ heard }) => heard)) {
        expect('unscorable' in graded ? graded : { graded: true }, one.case).toEqual({
          graded: true,
        });
      } else {
        expect(graded, one.case).toMatchObject({ unscorable: true, code: 'no_speech' });
        unheard += 1;
      }
    }
    expect(unheard).toBe(3);
  });

  it('carry no break confidence, although some were above 1', () => {
    const raw = JSON.stringify(all.map((one) => one.results));
    const confidences = [...raw.matchAll(/"UnexpectedBreak":\{"Confidence":([\d.e+-]+)/g)].map(
      (match) => Number(match[1]),
    );
    expect(Math.max(...confidences)).toBeGreaterThan(1);
    for (const one of all) {
      const result = assessmentFromAzure(one.results, requestOf(one));
      if (result.ok) {
        expect(result.assessment.words.some((word) => word.breaks !== undefined)).toBe(false);
      }
    }
  });

  /** The single-shot scripted takes Azure scored with miscue. */
  const singleShot = (one: Capture) =>
    one.results.length === 1 && one.request.miscue && one.request.gradingSystem === 'HundredMark';

  /**
   * The captures whose word scores average exactly half a point, and how far
   * the merge's rounding lands above Azure's. Two words of twelve at 80 and
   * 94 average 14.5, and Azure reported 14; twelve words averaging 99.5 came
   * back 100. Both fit rounding half to even, or an average of word scores
   * Azure rounds only to print. A single result keeps Azure's numbers, so no
   * capture's grade differs; a take of several results can read a point
   * above at such a tie.
   */
  const ROUNDED_ABOVE_AZURE = new Map([['prosody-first-two-words', 1]]);

  it("reproduce Azure's own accuracy and completeness through the merge arithmetic", async () => {
    const { mergedScores } = await import('../merge.js');
    const above = new Map<string, number>();
    let compared = 0;
    for (const one of all.filter((capture) => singleShot(capture) && spaced(capture))) {
      const read = readResult(one.results[0]);
      if (read.kind !== 'utterance' || !read.utterance.words.some((w) => w.error !== 'omission')) {
        continue;
      }
      const result = assessmentFromAzure(one.results, { ...requestOf(one), miscue: true });
      const assessment = (result as { assessment: SpeechAssessment }).assessment;
      const merged = mergedScores([read.utterance], assessment, one.request.referenceText);
      const difference = (merged.accuracy as number) - (read.utterance.scores.accuracy as number);
      if (difference !== 0) {
        above.set(one.case, difference);
      }
      expect({ case: one.case, completeness: merged.completeness }).toEqual({
        case: one.case,
        completeness: read.utterance.scores.completeness,
      });
      compared += 1;
    }
    expect(above).toEqual(ROUNDED_ABOVE_AZURE);
    expect(compared).toBeGreaterThanOrEqual(30);
  });

  it("reproduce Azure's PronScore from its own dimension scores", () => {
    let compared = 0;
    for (const one of all.filter(singleShot)) {
      const read = readResult(one.results[0]);
      if (read.kind !== 'utterance' || read.utterance.scores.accuracy === 0) {
        continue;
      }
      const { accuracy, fluency, completeness, prosody, overall } = read.utterance.scores;
      expect(
        pronScore({
          accuracy: accuracy as number,
          fluency: fluency as number,
          completeness: completeness as number,
          ...(prosody !== undefined ? { prosody } : {}),
        }),
        one.case,
      ).toBeCloseTo(overall as number, 1);
      compared += 1;
    }
    expect(compared).toBeGreaterThanOrEqual(20);
  });
});
