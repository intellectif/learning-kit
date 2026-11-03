/** Shared fixtures for the contract tests: a composite target over a kit of components. */

import { deepFreeze } from '../../determinism/freeze.js';
import { run } from '../../log/__tests__/fixtures.js';
import { review } from '../../planner/__tests__/helpers.js';
import { createPractice } from '../../practice.js';
import type { PracticeState, PracticeTarget, SkillGraph } from '../../types.js';

export const DAY = 86_400_000;
export const T0 = Date.UTC(2026, 0, 5);

/** `k` encompasses `w` and `x`, which both need `v`; `w` has forms and hints. */
export const KIT: SkillGraph = deepFreeze({
  version: 'k1',
  skills: [
    { id: 'k', knowledge: 'procedural', stages: ['complete', 'write'], label: 'Kit' },
    {
      id: 'w',
      knowledge: 'declarative',
      stages: ['recall', 'produce'],
      forms: { recall: ['cloze', 'short'] },
      criteriaHint: 'one check per part',
      label: 'W',
      description: 'The w part',
      tags: ['t1'],
      referenceDifficulty: 0.25,
    },
    { id: 'x', knowledge: 'declarative', stages: ['recall', 'produce'] },
    { id: 'v', knowledge: 'declarative', stages: ['recall', 'produce'] },
  ],
  edges: [
    { kind: 'prerequisite', from: 'w', to: 'k', strength: 'soft' },
    { kind: 'prerequisite', from: 'x', to: 'k', strength: 'soft' },
    { kind: 'encompasses', from: 'k', to: 'w', weight: 0.5 },
    { kind: 'encompasses', from: 'k', to: 'x', weight: 0.5 },
  ],
});

export const practice = createPractice();

/** `k` is overdue at `NOW`; `w` lapsed a day before it, `x` passed. */
export const steps = [
  review('e1', 'k', 'complete', T0),
  review('e2', 'w', 'recall', T0 + 3 * DAY, {
    kind: 'auto',
    score: 0,
    maxScore: 1,
    passed: false,
  }),
  review('e3', 'x', 'recall', T0 + 3 * DAY),
];
export const NOW = T0 + 4 * DAY;

export const state: PracticeState = run(practice, steps, KIT).state;

/** The composite target planned at `NOW`. */
export function compositeTarget(): PracticeTarget {
  const plan = practice.plan(state, KIT, {
    now: NOW,
    seed: 's',
    budget: {},
    dueBy: NOW + 60 * DAY,
    limits: { maxSkillsPerTarget: 3 },
  });
  const target = plan.targets.find((t) => t.skillIds[0] === 'k');
  if (target === undefined) throw new Error(JSON.stringify(plan.targets));
  return target;
}
