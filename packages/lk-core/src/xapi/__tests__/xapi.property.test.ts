import fc from 'fast-check';
import { describe, it } from 'vitest';
import type { ScoringResult, XAPIActor } from '../../types/index.js';
import { XAPIVerb, xAPIBuilder } from '../index.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IRI = /^[a-z][a-z0-9+.-]*:/i;

const tokenArb = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), {
    minLength: 1,
    maxLength: 8,
  })
  .map((a) => a.join(''));

const actorArb: fc.Arbitrary<XAPIActor> = fc.oneof(
  tokenArb.map((t) => ({ objectType: 'Agent', mbox: `mailto:${t}@example.com` }) as XAPIActor),
  fc.tuple(tokenArb, tokenArb).map(
    ([h, n]) =>
      ({
        objectType: 'Agent',
        account: { homePage: `https://${h}.example.com`, name: n },
      }) as XAPIActor,
  ),
);

const scoringResultArb: fc.Arbitrary<ScoringResult> = fc
  .record({
    score: fc.double({ min: 0, max: 1, noNaN: true }),
    passed: fc.boolean(),
  })
  .map(({ score, passed }) => ({ score, maxScore: 1, passed, feedback: null, details: [] }));

describe('xAPI builder properties', () => {
  // Feature: learning-kit-sdk, Property 7: xAPI Statement structural validity
  it('Property 7: buildAnsweredStatement produces a structurally valid xAPI 1.0.3 statement', () => {
    fc.assert(
      fc.property(
        actorArb,
        fc.constantFrom(...(Object.keys(XAPIVerb) as (keyof typeof XAPIVerb)[])),
        tokenArb,
        scoringResultArb,
        fc.nat({ max: 600000 }),
        (actor, _verb, objId, scoringResult, timeSpentMs) => {
          // buildStatement dev-validates internally and throws on any
          // structural defect, so a non-throwing call is itself a check.
          const s = xAPIBuilder.buildAnsweredStatement({
            actor,
            object: { id: `https://example.com/activities/${objId}` },
            scoringResult,
            timeSpentMs,
          });
          return (
            UUID_V4.test(s.id) &&
            s.version === '1.0.3' &&
            IRI.test(s.verb.id) &&
            s.result?.score?.scaled !== undefined &&
            s.result.score.scaled >= 0 &&
            s.result.score.scaled <= 1 &&
            !Number.isNaN(Date.parse(s.timestamp)) &&
            s.actor !== undefined &&
            s.verb !== undefined &&
            s.object.objectType === 'Activity'
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
