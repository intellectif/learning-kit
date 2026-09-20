import type { MediaTimeline, TimelineCue } from '@intellectif/lk-core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { crossedQuiz, limitResume, limitSeek } from '../quiz-engine.js';

/**
 * The rules a learner is held to, over arbitrary play, seek and answer
 * sequences rather than the handful a hand-written test remembers.
 *
 * The properties are the promises the feature makes: no quiz is skipped by
 * speed or by a stalled frame; a required quiz is never passed unanswered, by
 * seeking or by resuming; and `no-skip-ahead` never lets the playhead past the
 * furthest point the learner has actually watched.
 */

const DURATION = 600;

const cue = fc
  .record({
    id: fc.string({ minLength: 1, maxLength: 6 }),
    at: fc.double({ min: 0, max: DURATION, noNaN: true }),
    required: fc.boolean(),
  })
  .map(({ id, at, required }) => ({ id, at, itemIds: [`${id}-q`], required }) as TimelineCue);

/** Cues with distinct ids, as a validated timeline has. */
const cues = fc.uniqueArray(cue, { minLength: 1, maxLength: 8, selector: (c) => c.id });

const timeline = fc
  .record({
    cues,
    navigation: fc.constantFrom('free' as const, 'no-skip-ahead' as const),
  })
  .map(({ cues: list, navigation }) => ({ cues: list, navigation }) as MediaTimeline);

/** The answered set, as a fraction of the quizzes: which ones are finished. */
const answers = fc.array(fc.boolean(), { minLength: 0, maxLength: 8 });
const finishedBy = (timeline: MediaTimeline, flags: boolean[]) => (cueId: string) => {
  const at = timeline.cues.findIndex((candidate) => candidate.id === cueId);
  return flags[at] === true;
};

const time = fc.double({ min: 0, max: DURATION, noNaN: true });

describe('the rules, over arbitrary sequences', () => {
  it('opens every quiz the playhead passes, however far each frame jumps', () => {
    fc.assert(
      fc.property(
        cues,
        fc.array(fc.double({ min: 0.01, max: 120, noNaN: true }), { maxLength: 40 }),
        (list, steps) => {
          const handled = new Set<string>();
          let previous = -1;
          for (const step of steps) {
            const now = Math.min(DURATION, previous + step);
            // One frame may carry the playhead over several quizzes; the player
            // stops at the first and meets the rest as playback continues, so
            // the loop below is what the player itself does.
            let crossed = crossedQuiz(list, previous, now, handled);
            while (crossed !== undefined) {
              handled.add(crossed.id);
              crossed = crossedQuiz(list, previous, now, handled);
            }
            previous = now;
          }
          // Everything the playhead reached was opened, and nothing beyond it.
          for (const candidate of list) {
            expect(handled.has(candidate.id)).toBe(candidate.at <= previous && candidate.at > -1);
          }
        },
      ),
    );
  });

  it('never opens a quiz twice, and never one the playhead has not reached', () => {
    fc.assert(
      fc.property(cues, time, time, (list, from, to) => {
        const crossed = crossedQuiz(list, from, to, new Set());
        if (crossed === undefined) {
          return;
        }
        expect(crossed.at).toBeGreaterThan(from);
        expect(crossed.at).toBeLessThanOrEqual(to);
        // It is the earliest of those crossed: nothing before it is skipped.
        for (const other of list) {
          if (other.at > from && other.at <= to) {
            expect(crossed.at).toBeLessThanOrEqual(other.at);
          }
        }
      }),
    );
  });

  it('never lets a seek past an unanswered required quiz', () => {
    fc.assert(
      fc.property(timeline, time, time, time, answers, (line, from, to, furthest, flags) => {
        const finished = finishedBy(line, flags);
        const landed = limitSeek(line, from, to, furthest, finished);

        const blocking = line.cues
          .filter((c) => c.required === true && !finished(c.id) && c.at > from && c.at <= to)
          .sort((a, b) => a.at - b.at)[0];
        if (blocking !== undefined && to > from) {
          expect(landed.at).toBeLessThanOrEqual(blocking.at);
        }
        // A seek never invents a position outside the two it was given.
        expect(landed.at).toBeLessThanOrEqual(Math.max(from, to));
        expect(landed.at).toBeGreaterThanOrEqual(Math.min(from, to));
      }),
    );
  });

  it('never lets a no-skip-ahead learner past what they have watched', () => {
    fc.assert(
      fc.property(timeline, time, time, time, answers, (line, from, to, furthest, flags) => {
        const strict: MediaTimeline = { ...line, navigation: 'no-skip-ahead' };
        const landed = limitSeek(strict, from, to, furthest, finishedBy(strict, flags));
        // Forward, only as far as the furthest point reached — or where they
        // already are, which is never a step backwards.
        if (to > from) {
          expect(landed.at).toBeLessThanOrEqual(Math.max(from, furthest));
        } else {
          expect(landed.at).toBe(to);
        }
      }),
    );
  });

  it('never resumes past an unanswered required quiz, and never before the start', () => {
    fc.assert(
      fc.property(timeline, time, answers, (line, at, flags) => {
        const finished = finishedBy(line, flags);
        const resumed = limitResume(line, at, finished);
        expect(resumed).toBeGreaterThanOrEqual(0);
        expect(resumed).toBeLessThanOrEqual(at);
        for (const candidate of line.cues) {
          if (candidate.required === true && !finished(candidate.id) && candidate.at < at) {
            // Before it, so pressing play crosses it and it opens — except for
            // a quiz at the very start, which has no "before": the player opens
            // that one on the first press instead (see `togglePlay`).
            expect(resumed).toBeLessThanOrEqual(candidate.at);
            if (resumed === candidate.at) {
              expect(resumed).toBe(0);
            }
          }
        }
      }),
    );
  });

  it('lets a learner who has finished every quiz move anywhere', () => {
    fc.assert(
      fc.property(timeline, time, time, (line, from, to) => {
        const free: MediaTimeline = { ...line, navigation: 'free' };
        expect(limitSeek(free, from, to, 0, () => true)).toEqual({ at: to });
        expect(limitResume(free, to, () => true)).toBe(to);
      }),
    );
  });
});
