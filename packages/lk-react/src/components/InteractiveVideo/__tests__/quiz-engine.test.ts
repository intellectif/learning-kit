import type { MediaTimeline } from '@intellectif/lk-core';
import { describe, expect, it } from 'vitest';
import { clock, nudgeSpeed, SPEEDS } from '../format.js';
import {
  DEFAULT_PREFERENCES,
  readPreferences,
  sanitizePreferences,
  writePreferences,
} from '../prefs.js';
import { crossedQuiz, limitResume, limitSeek, quizzesAtEnd } from '../quiz-engine.js';

const cue = (id: string, at: number, required = false) => ({
  id,
  at,
  itemIds: [`${id}-item`],
  ...(required ? { required: true } : {}),
});

const timeline = (over: Partial<MediaTimeline> = {}): MediaTimeline => ({
  cues: [cue('a', 30), cue('b', 60, true), cue('c', 90)],
  ...over,
});

const none = new Set<string>();
const nothingFinished = () => false;
const allFinished = () => true;

describe('crossedQuiz', () => {
  const cues = timeline().cues;

  it('answers the quiz the playhead has just passed', () => {
    expect(crossedQuiz(cues, 29, 31, none)?.id).toBe('a');
  });

  it('opens a quiz the playhead lands exactly on, and not one it has not reached', () => {
    expect(crossedQuiz(cues, 29, 30, none)?.id).toBe('a');
    expect(crossedQuiz(cues, 29, 29.9, none)).toBeUndefined();
  });

  it('does not open the same quiz again once it is behind the playhead', () => {
    expect(crossedQuiz(cues, 30, 40, none)).toBeUndefined();
  });

  // At 2.5× a stalled frame can carry playback over two quizzes at once.
  it('takes the earliest of several crossed in one frame, so none is skipped by speed', () => {
    expect(crossedQuiz(cues, 10, 95, none)?.id).toBe('a');
    expect(crossedQuiz(cues, 10, 95, new Set(['a']))?.id).toBe('b');
    expect(crossedQuiz(cues, 10, 95, new Set(['a', 'b']))?.id).toBe('c');
    expect(crossedQuiz(cues, 10, 95, new Set(['a', 'b', 'c']))).toBeUndefined();
  });

  it('takes the earliest by TIME, not the first the author happened to list', () => {
    const shuffled = [cue('late', 90), cue('early', 30), cue('middle', 60)];
    expect(crossedQuiz(shuffled, 10, 95, none)?.id).toBe('early');
    expect(crossedQuiz(shuffled, 10, 95, new Set(['early']))?.id).toBe('middle');
  });

  it('opens a quiz at the very start, which nothing crosses', () => {
    const atZero = [cue('start', 0)];
    expect(crossedQuiz(atZero, -1, 0, none)?.id).toBe('start');
    expect(crossedQuiz(atZero, 0, 5, none)).toBeUndefined();
  });

  it('opens nothing when the playhead moves backwards', () => {
    expect(crossedQuiz(cues, 95, 10, none)).toBeUndefined();
  });
});

describe('quizzesAtEnd', () => {
  it('answers the quizzes placed at or past the end, in order', () => {
    const cues = [cue('mid', 10), cue('end', 60), cue('past', 90)];
    expect(quizzesAtEnd(cues, 60, none).map((c) => c.id)).toEqual(['end', 'past']);
  });

  it('leaves out one already handled', () => {
    expect(quizzesAtEnd([cue('end', 60)], 60, new Set(['end']))).toEqual([]);
  });

  it('allows for a duration a hair short of the last cue', () => {
    expect(quizzesAtEnd([cue('end', 60)], 59.98, none).map((c) => c.id)).toEqual(['end']);
  });
});

describe('limitSeek', () => {
  it('lets a seek backwards go anywhere', () => {
    expect(limitSeek(timeline(), 80, 5, 80, nothingFinished)).toEqual({ at: 5 });
    // Even back over an unanswered required quiz.
    expect(limitSeek(timeline(), 80, 40, 80, nothingFinished)).toEqual({ at: 40 });
  });

  it('stops forward movement ON an unanswered required quiz, so it opens', () => {
    const result = limitSeek(timeline(), 10, 95, 95, nothingFinished);
    expect(result.at).toBe(60);
    expect(result.hold).toEqual({ kind: 'required', cue: expect.objectContaining({ id: 'b' }) });
  });

  it('lets the seek through once that quiz is answered', () => {
    expect(limitSeek(timeline(), 10, 95, 95, allFinished)).toEqual({ at: 95 });
  });

  it('is unmoved by a quiz that is not required', () => {
    const free = timeline({ cues: [cue('a', 30), cue('c', 90)] });
    expect(limitSeek(free, 10, 95, 95, nothingFinished)).toEqual({ at: 95 });
  });

  it('holds a no-skip-ahead learner at the furthest point they reached', () => {
    const strict = timeline({ navigation: 'no-skip-ahead', cues: [cue('a', 30)] });
    expect(limitSeek(strict, 10, 200, 45, nothingFinished)).toEqual({
      at: 45,
      hold: { kind: 'no-skip-ahead', furthest: 45 },
    });
    // Within what they have watched, they move freely.
    expect(limitSeek(strict, 10, 40, 45, nothingFinished)).toEqual({ at: 40 });
  });

  it('reports the required quiz when both limits apply, since that is the one to act on', () => {
    const strict = timeline({ navigation: 'no-skip-ahead' });
    const result = limitSeek(strict, 10, 200, 80, nothingFinished);
    expect(result.at).toBe(60);
    expect(result.hold?.kind).toBe('required');
  });

  it('keeps the no-skip-ahead limit when the required quiz is beyond it', () => {
    const strict = timeline({ navigation: 'no-skip-ahead', cues: [cue('b', 60, true)] });
    expect(limitSeek(strict, 10, 200, 40, nothingFinished)).toEqual({
      at: 40,
      hold: { kind: 'no-skip-ahead', furthest: 40 },
    });
  });

  it('never sends a no-skip-ahead learner backwards from where they are', () => {
    const strict = timeline({ navigation: 'no-skip-ahead', cues: [] });
    expect(limitSeek(strict, 50, 200, 20, nothingFinished).at).toBe(50);
  });
});

describe('limitResume', () => {
  it('restores the stored position when nothing stands in the way', () => {
    expect(limitResume(timeline(), 80, allFinished)).toBe(80);
    expect(limitResume(timeline({ cues: [] }), 80, nothingFinished)).toBe(80);
  });

  it('stops just before an unanswered required quiz, so playing crosses it', () => {
    expect(limitResume(timeline(), 80, nothingFinished)).toBe(59.75);
  });

  it('takes the earliest unanswered required quiz before the stored point', () => {
    const many = timeline({ cues: [cue('x', 20, true), cue('y', 40, true)] });
    expect(limitResume(many, 80, nothingFinished)).toBe(19.75);
  });

  it('never answers a negative time', () => {
    expect(limitResume(timeline({ cues: [cue('x', 0.1, true)] }), 5, nothingFinished)).toBe(0);
  });
});

describe('clock', () => {
  it('writes m:ss, and h:mm:ss past an hour', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(9.9)).toBe('0:09');
    expect(clock(65)).toBe('1:05');
    expect(clock(3600)).toBe('1:00:00');
    expect(clock(3725)).toBe('1:02:05');
  });

  it('shows 0:00 for a time a video does not have', () => {
    expect(clock(Number.NaN)).toBe('0:00');
    expect(clock(Number.POSITIVE_INFINITY)).toBe('0:00');
    expect(clock(-5)).toBe('0:00');
  });
});

describe('nudgeSpeed', () => {
  it('steps through the list and stops at its ends', () => {
    expect(nudgeSpeed(1, 1)).toBe(1.25);
    expect(nudgeSpeed(1, -1)).toBe(0.75);
    expect(nudgeSpeed(SPEEDS[0], -1)).toBe(SPEEDS[0]);
    expect(nudgeSpeed(SPEEDS[SPEEDS.length - 1] as number, 1)).toBe(SPEEDS[SPEEDS.length - 1]);
  });

  it('treats a rate that is not on the list as normal speed', () => {
    expect(nudgeSpeed(1.1, 1)).toBe(1.25);
  });
});

describe('preferences', () => {
  it('holds every stored value inside what the controls can undo', () => {
    expect(
      sanitizePreferences({
        speed: 16,
        volume: 50,
        muted: 'yes',
        captions: false,
        captionLanguage: 'javascript:alert(1)',
        captionSize: 'enormous',
        panel: true,
      }),
    ).toEqual({
      ...DEFAULT_PREFERENCES,
      captions: false,
      panel: true,
    });
  });

  it('keeps values that are in range', () => {
    expect(
      sanitizePreferences({ speed: 1.5, volume: 0.25, captionLanguage: 'pt-BR' }),
    ).toMatchObject({
      speed: 1.5,
      volume: 0.25,
      captionLanguage: 'pt-BR',
    });
  });

  it('answers the defaults for anything that is not an object', () => {
    expect(sanitizePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(sanitizePreferences('speed=2')).toEqual(DEFAULT_PREFERENCES);
    expect(sanitizePreferences([])).toEqual(DEFAULT_PREFERENCES);
  });

  it('round-trips through storage, and survives storage that refuses', () => {
    writePreferences({ ...DEFAULT_PREFERENCES, speed: 1.5, panel: true });
    expect(readPreferences()).toMatchObject({ speed: 1.5, panel: true });

    localStorage.setItem('lk.video.v1', '{not json');
    expect(readPreferences()).toEqual(DEFAULT_PREFERENCES);
    localStorage.clear();
  });
});
