import { describe, expect, it } from 'vitest';
import type { PracticeEvent, ReviewHistoryResult } from '../../types.js';
import {
  DAY,
  evidence,
  fail,
  GRAPH,
  item,
  lowAi,
  masterA,
  practice,
  run,
  type Step,
  T0,
} from './fixtures.js';

const p = practice();

const history = (result: ReviewHistoryResult) => {
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.history;
};

/** `c` first, then `a` twice (a lapse), held evidence on `b`'s item, then `b`. */
const steps: Step[] = [
  { evidence: evidence('c1', 'ic1', T0), item: item('ic1', 'c') },
  { evidence: evidence('a1', 'ia1', T0 + DAY), item: item('ia1') },
  { evidence: evidence('a2', 'ia2', T0 + 2 * DAY, fail), item: item('ia2') },
  { evidence: evidence('h1', 'ih1', T0 + 3 * DAY, lowAi), item: item('ih1') },
];

describe('exportReviewHistory', () => {
  it('groups the reviews by skill in graph order, each in replay order', () => {
    const recorded = run(p, steps);
    const exported = history(p.exportReviewHistory(recorded.entries, GRAPH, 'l1'));
    expect(exported).toEqual({
      learnerId: 'l1',
      configHash: p.configHash,
      skills: [
        {
          skillId: 'a',
          stage: 'recall',
          reviews: [
            { at: T0 + DAY, rating: 'good', evidenceId: 'a1' },
            { at: T0 + 2 * DAY, rating: 'again', evidenceId: 'a2' },
          ],
        },
        {
          skillId: 'c',
          stage: 'recognise',
          reviews: [{ at: T0, rating: 'good', evidenceId: 'c1' }],
        },
      ],
    });
    expect(Object.isFrozen(exported)).toBe(true);
    expect(Object.isFrozen(exported.skills[0]?.reviews[0])).toBe(true);
  });

  it('reads the same reviews as the replay events, whatever the array order', () => {
    const recorded = run(p, steps);
    const replayed = p.replay(recorded.entries, GRAPH, 'l1');
    if (!replayed.ok) throw new Error('replay');
    const reviews = replayed.events.filter(
      (event): event is Extract<PracticeEvent, { type: 'review.recorded' }> =>
        event.type === 'review.recorded',
    );
    const exported = history(p.exportReviewHistory([...recorded.entries].reverse(), GRAPH, 'l1'));
    expect(exported.skills.flatMap((skill) => skill.reviews).map((r) => r.evidenceId)).toEqual([
      'a1',
      'a2',
      'c1',
    ]);
    expect(reviews.map((event) => event.evidenceId).sort()).toEqual(['a1', 'a2', 'c1']);
  });

  it('puts the stages of a skill in ladder order', () => {
    const mastered = masterA(p);
    const exported = history(p.exportReviewHistory(mastered.entries, GRAPH, 'l1'));
    expect(exported.skills.map(({ skillId, stage }) => [skillId, stage])).toEqual([
      ['a', 'recall'],
      ['a', 'produce'],
    ]);
    const all = exported.skills.flatMap((skill) => skill.reviews);
    expect(all).toHaveLength(mastered.entries.length);
    for (const skill of exported.skills) {
      const times = skill.reviews.map((review) => review.at);
      expect(times).toEqual([...times].sort((x, y) => x - y));
    }
  });

  it('gives no skills for an empty log, and the replay issues for a log that does not replay', () => {
    expect(history(p.exportReviewHistory([], GRAPH, 'l1')).skills).toEqual([]);
    const refused = p.exportReviewHistory([], GRAPH, '');
    expect(refused.ok).toBe(false);
    expect(refused.ok ? [] : refused.issues.map((issue) => issue.code)).toEqual(['SHAPE_INVALID']);
  });

  it('names the configuration that rated the reviews', () => {
    const other = practice({ planner: { targetSuccess: 0.8 } });
    const recorded = run(other, steps);
    const exported = history(other.exportReviewHistory(recorded.entries, GRAPH, 'l1'));
    expect(exported.configHash).toBe(other.configHash);
    expect(exported.configHash).not.toBe(p.configHash);
  });
});
