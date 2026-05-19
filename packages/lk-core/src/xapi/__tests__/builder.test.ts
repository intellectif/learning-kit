import { describe, expect, it } from 'vitest';
import type { ScoringResult, XAPIActor } from '../../types/index.js';
import { XAPIVerb, xAPIBuilder } from '../index.js';

const actor: XAPIActor = { objectType: 'Agent', mbox: 'mailto:l@example.com' };
const object = { id: 'https://example.com/act/1' };
const sr = (over: Partial<ScoringResult> = {}): ScoringResult => ({
  score: 0.5,
  maxScore: 1,
  passed: false,
  feedback: null,
  details: [],
  ...over,
});

describe('xAPIBuilder', () => {
  it('buildStatement stamps id/version/timestamp and resolves verb', () => {
    const s = xAPIBuilder.buildStatement({ actor, verb: 'EXPERIENCED', object });
    expect(s.version).toBe('1.0.3');
    expect(s.verb.id).toBe(XAPIVerb.EXPERIENCED);
    expect(s.verb.display['en-US']).toBe('experienced');
    expect(Number.isNaN(Date.parse(s.timestamp))).toBe(false);
    expect(s.object.objectType).toBe('Activity');
    expect('definition' in s.object).toBe(false); // omitted when empty
    expect('result' in s).toBe(false);
    expect('context' in s).toBe(false);
  });

  it('buildStatement includes object.definition only for provided fields', () => {
    const s = xAPIBuilder.buildStatement({
      actor,
      verb: 'ANSWERED',
      object: { id: object.id, name: { 'en-US': 'Q' }, type: 'http://x/type' },
      context: { platform: 'web' },
    });
    expect(s.object.definition).toEqual({ name: { 'en-US': 'Q' }, type: 'http://x/type' });
    expect(s.context).toEqual({ platform: 'web' });
  });

  it('buildAnsweredStatement maps ScoringResult → XAPIResult', () => {
    const s = xAPIBuilder.buildAnsweredStatement({
      actor,
      object,
      scoringResult: sr({ score: 0.75, passed: true }),
      timeSpentMs: 5400,
      response: 'a,b',
      resultExtensions: { k: 1 },
    });
    expect(s.verb.id).toBe(XAPIVerb.ANSWERED);
    expect(s.result?.score).toEqual({ scaled: 0.75, raw: 0.75, min: 0, max: 1 });
    expect(s.result?.success).toBe(true);
    expect(s.result?.completion).toBe(true);
    expect(s.result?.duration).toBe('PT5S');
    expect(s.result?.response).toBe('a,b');
    expect(s.result?.extensions).toEqual({ k: 1 });
  });

  it('buildCompletedStatement works with and without a scoring result', () => {
    const withScore = xAPIBuilder.buildCompletedStatement({
      actor,
      object,
      scoringResult: sr({ score: 1, passed: true }),
      timeSpentMs: 0,
    });
    expect(withScore.verb.id).toBe(XAPIVerb.COMPLETED);
    expect(withScore.result?.score?.scaled).toBe(1);
    expect(withScore.result?.duration).toBe('PT0S');

    const noScore = xAPIBuilder.buildCompletedStatement({
      actor,
      object,
      timeSpentMs: 2600,
      resultExtensions: { e: true },
    });
    expect('score' in (noScore.result ?? {})).toBe(false);
    expect(noScore.result?.completion).toBe(true);
    expect(noScore.result?.duration).toBe('PT3S');
    expect(noScore.result?.extensions).toEqual({ e: true });
  });

  it('generates unique ids per call', () => {
    const a = xAPIBuilder.buildStatement({ actor, verb: 'ATTEMPTED', object });
    const b = xAPIBuilder.buildStatement({ actor, verb: 'ATTEMPTED', object });
    expect(a.id).not.toBe(b.id);
  });
});
