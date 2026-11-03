// Compares policies on simulated learners over 90 days (R13.4, design 13;
// revised in M8): the default, target success 0.80, coalescing off, and a
// stage ability offset of 0 and 0.5 (the default is 1), and how often a
// remediation target occurs (design 13). Reported, not
// asserted: the simulated learner is a test tool, not a claim about real
// learners. Run `pnpm build`, then `pnpm simulate`.
import { createPractice } from '../dist/index.js';
import { simulateLearner } from '../dist/testing.js';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 5);
const DAYS = 90;
const LEARNERS = 10;

/**
 * 30 skills in three strands of ten: declarative, procedural, declarative.
 * Each skill needs the one before it (hard every third, soft otherwise), and
 * the last of a strand encompasses the two before it.
 */
function graph() {
  const skills = [];
  const edges = [];
  for (let i = 0; i < 30; i += 1) {
    const strand = Math.floor(i / 10);
    const step = i % 10;
    skills.push({ id: `s${i}`, knowledge: strand === 1 ? 'procedural' : 'declarative' });
    if (step > 0) {
      edges.push({
        kind: 'prerequisite',
        from: `s${i - 1}`,
        to: `s${i}`,
        strength: step % 3 === 0 ? 'hard' : 'soft',
      });
    }
    if (step === 9) {
      for (const component of [`s${i - 1}`, `s${i - 2}`]) {
        edges.push({ kind: 'encompasses', from: `s${i}`, to: component, weight: 0.5 });
      }
    }
  }
  return { version: 'sim', skills, edges };
}

const GRAPH = graph();

/** A learner: abilities from 1.5 down to about -1 along a strand, forgetting in 5 to 40 days. */
function learnerSkills(n) {
  return Object.fromEntries(
    GRAPH.skills.map((skill, i) => [
      skill.id,
      {
        trueAbility: 1.5 - 0.25 * (i % 10) + 0.2 * ((n + i) % 3),
        forgettingDays: 5 + ((i * 7 + n * 3) % 36),
      },
    ]),
  );
}

function simulate(config, n) {
  const practice = createPractice(config);
  const learner = simulateLearner({ seed: `learner${n}`, skills: learnerSkills(n) });
  const skills = learnerSkills(n);
  let state = practice.initState(`l${n}`, GRAPH);
  const last = new Map();
  let attempts = 0;
  let passed = 0;
  let coalesced = 0;
  let remediation = 0;
  for (let day = 0; day < DAYS; day += 1) {
    const now = T0 + day * DAY;
    const plan = practice.plan(state, GRAPH, { now, seed: `d${day}`, budget: { maxTargets: 8 } });
    for (const [i, target] of plan.targets.entries()) {
      const at = now + i * 60_000;
      const { evidence, item } = learner.attempt(target, at);
      const result = practice.record(state, { graph: GRAPH, evidence, item });
      if (result.kind !== 'applied') throw new Error(`day ${day}: ${result.kind}`);
      state = result.state;
      attempts += 1;
      passed += evidence.source.passed ? 1 : 0;
      coalesced += target.skillIds.length - 1;
      remediation += target.kind === 'remediation' ? 1 : 0;
      for (const id of target.skillIds) last.set(id, at);
    }
  }
  const end = T0 + DAYS * DAY;
  const recall = [...last].map(([id, at]) =>
    Math.exp(-(end - at) / (skills[id].forgettingDays * DAY)),
  );
  const summary = practice.status(state, GRAPH, end);
  return {
    attempts,
    success: attempts === 0 ? 0 : passed / attempts,
    coalesced,
    remediation,
    started: Object.values(state.skills).filter((skill) => skill.startedAt !== null).length,
    mastered: summary.counts.mastered,
    recall: recall.length === 0 ? 0 : recall.reduce((a, b) => a + b, 0) / recall.length,
  };
}

const POLICIES = [
  ['default (success 0.85, coalescing on, offset 1)', {}],
  ['target success 0.80', { planner: { targetSuccess: 0.8 } }],
  ['coalescing off', { planner: { coalesce: false } }],
  ['stage offset 0', { ability: { stageOffset: 0 } }],
  ['stage offset 0.5', { ability: { stageOffset: 0.5 } }],
];

const mean = (rows, key) => rows.reduce((sum, row) => sum + row[key], 0) / rows.length;
console.log(
  `lk-practice simulation: ${LEARNERS} learners, ${DAYS} days, 30 skills, up to 8 targets a day (means per learner)`,
);
console.log(
  `  ${'policy'.padEnd(48)} ${'attempts'.padStart(9)} ${'success'.padStart(8)} ${'joined'.padStart(7)} ${'remed.'.padStart(7)} ${'started'.padStart(8)} ${'mastered'.padStart(9)} ${'recall'.padStart(7)}`,
);
for (const [name, config] of POLICIES) {
  const rows = Array.from({ length: LEARNERS }, (_, n) => simulate(config, n));
  console.log(
    `  ${name.padEnd(48)} ${mean(rows, 'attempts').toFixed(1).padStart(9)} ${mean(rows, 'success').toFixed(3).padStart(8)} ${mean(rows, 'coalesced').toFixed(1).padStart(7)} ${mean(rows, 'remediation').toFixed(1).padStart(7)} ${mean(rows, 'started').toFixed(1).padStart(8)} ${mean(rows, 'mastered').toFixed(1).padStart(9)} ${mean(rows, 'recall').toFixed(3).padStart(7)}`,
  );
}
console.log(
  '  attempts: targets practised; success: share passed; joined: components coalesced into targets;',
);
console.log('  remed.: remediation targets;');
console.log(
  '  started and mastered: skills at day 90; recall: the simulated recall of each practised skill at day 90.',
);

// Spacing (revised in M11): a learner whose memory consolidates
// (`consolidation`), practising one skill. The planner's attempts over 30
// days against the same attempts, at the same difficulties, massed in one
// sitting on day 0. Recall at day 60 is the share passing a trivial task
// then, over 200 learners with the same draws in both arms.
const ONE = { version: 'one', skills: [{ id: 'a', knowledge: 'declarative' }], edges: [] };
const SPACING_LEARNERS = 200;
const trivial = (at) => ({
  id: `probe-${at}`,
  kind: 'review',
  skillIds: ['a'],
  stage: 'recognise',
  targetDifficulty: -20,
  difficultyTolerance: 0.5,
  expectedSeconds: 30,
  constraints: {
    needsSkillOutcomes: false,
    avoidItemIds: [],
    avoidContentHashes: [],
    context: 'practice',
  },
  reason: {
    code: 'due',
    due: at,
    retrievability: 1,
    masteryCheck: false,
    expectedSuccess: 1,
    coalesced: [],
    newSkillsDeferred: false,
  },
});
const recallAt = (learner, at) => (learner.attempt(trivial(at), at).evidence.source.passed ? 1 : 0);

let spacedRecall = 0;
let massedRecall = 0;
let spacedAttempts = 0;
for (let n = 0; n < SPACING_LEARNERS; n += 1) {
  const skill = { trueAbility: 1, forgettingDays: 2, consolidation: 3 };
  const options = { seed: `spacing${n}`, skills: { a: skill } };
  const practice = createPractice();
  const spaced = simulateLearner(options);
  let state = practice.initState(`s${n}`, ONE);
  const planned = [];
  for (let day = 0; day < 30; day += 1) {
    const now = T0 + day * DAY;
    const plan = practice.plan(state, ONE, { now, seed: `d${day}`, budget: { maxTargets: 8 } });
    for (const [i, target] of plan.targets.entries()) {
      const result = practice.record(state, {
        graph: ONE,
        ...spaced.attempt(target, now + i * 60_000),
      });
      if (result.kind === 'applied') state = result.state;
      planned.push(target);
    }
  }
  const massed = simulateLearner(options);
  for (const [i, target] of planned.entries()) massed.attempt(target, T0 + i * 60_000);
  spacedAttempts += planned.length;
  spacedRecall += recallAt(spaced, T0 + 60 * DAY);
  massedRecall += recallAt(massed, T0 + 60 * DAY);
}
console.log(
  `spacing: ${(spacedAttempts / SPACING_LEARNERS).toFixed(1)} attempts per learner; recall at day 60, planned over 30 days ${(spacedRecall / SPACING_LEARNERS).toFixed(3)}, massed on day 0 ${(massedRecall / SPACING_LEARNERS).toFixed(3)} (consolidation 3, forgetting 2 days at first, true ability 1)`,
);
