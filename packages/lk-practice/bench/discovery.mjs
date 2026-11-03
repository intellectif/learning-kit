// Prerequisite discovery on simulated learners (R14.11, design 13; revised in
// M12): reported, not asserted. Run `pnpm build`, then `pnpm discovery`.
//
// Two skills from a course map: `call` (an API call) before `params` (the call
// with parameters, reading values out of the response), hard. Scenario
// "missing": the learner has forgotten how to read values from a dict, a
// hidden prerequisite of `params` absent from the map, so `params` fails
// whatever it is practised. Scenario "none": nothing is missing, and `params`
// fails only by chance. A simulated diagnoser answers each diagnosis
// suggestion with the true prerequisite (with probability HIT, when there is
// one) or else a decoy, as likely a skill the learner already has as one it
// lacks but `params` does not need; `checkPrerequisiteHypothesis` rejects a
// proposal already in the map or already refuted, and then nothing opens. A
// probe teaches nothing. Each run is with and without discovery, for the same
// learners and the same draws.
import {
  checkPrerequisiteHypothesis,
  composeGraph,
  createPractice,
  discoveryExtension,
  prerequisiteReport,
  prerequisiteRequest,
} from '../dist/index.js';
import { simulateLearner } from '../dist/testing.js';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 5);
const DAYS = 180;
const LEARNERS = 400;
const HIT = 0.8;

const BASE = {
  version: 'course@1',
  skills: [
    { id: 'call', knowledge: 'procedural', label: 'Call the API and print the answer' },
    { id: 'params', knowledge: 'procedural', label: 'Call with parameters and log the costs' },
  ],
  edges: [{ kind: 'prerequisite', from: 'call', to: 'params', strength: 'hard' }],
};

/** A seeded uniform draw in [0, 1) (mulberry32). */
function random(seed) {
  let a = 0;
  for (const char of seed) a = (Math.imul(a ^ char.charCodeAt(0), 2654435761) >>> 0) + 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const node = (id, label) => ({ id, knowledge: 'procedural', label });
const CANDIDATES = {
  true: node('py.dict-access', 'Read values from a dict or a list'),
  known: node('py.print-format', 'Format a string for printing'),
  lacking: node('py.decorators', 'Write a decorator'),
};

// Every skill consolidates (M11's spacing study uses 3): spaced successes
// lengthen its forgetting time, as the engine's memory model expects.
const MEMORY = { forgettingDays: 30, consolidation: 2 };

function learnerSkills(missing) {
  return {
    call: { trueAbility: 2, ...MEMORY, learning: 0.02 },
    params: {
      trueAbility: 1.2,
      ...MEMORY,
      learning: 0.05,
      ...(missing ? { requires: ['py.dict-access'] } : {}),
    },
    'py.dict-access': { trueAbility: -1.5, ...MEMORY, learning: 0.5 },
    'py.print-format': { trueAbility: 2.5, ...MEMORY },
    'py.decorators': { trueAbility: -1.5, ...MEMORY, learning: 0.3 },
  };
}

function run(n, missing, discovery) {
  const practice = createPractice();
  const learner = simulateLearner({ seed: `discovery${n}`, skills: learnerSkills(missing) });
  const diagnoser = random(`diagnoser${n}`);
  let graph = BASE;
  const extensions = [];
  let state = practice.initState(`l${n}`, graph);
  const log = [];
  let masteredOn = null;
  let suggestions = 0;
  let rejected = 0;
  const admitted = [];
  const commit = (result) => {
    if (result.kind !== 'applied')
      throw new Error(`${result.kind} ${JSON.stringify(result.issues)}`);
    state = result.state;
    log.push(...result.appended);
    return result.events;
  };
  commit(
    practice.act(state, graph, {
      id: 'place',
      at: T0,
      action: { kind: 'place', skillId: 'call', stage: 'transfer', credited: true },
    }),
  );

  for (let day = 0; day < DAYS && masteredOn === null; day += 1) {
    const now = T0 + day * DAY;
    const plan = practice.plan(state, graph, { now, seed: `d${day}`, budget: { maxTargets: 6 } });
    for (const [i, target] of plan.targets.entries()) {
      const at = now + i * 60_000;
      const attempt = learner.attempt(target, at);
      const events = commit(practice.record(state, { graph, ...attempt }));
      if (events.some((e) => e.type === 'skill.mastered' && e.skillId === 'params'))
        masteredOn ??= day;
      const suggested = events.find(
        (e) => e.type === 'skill.diagnosis-suggested' && e.skillId === 'params',
      );
      if (discovery && suggested !== undefined) {
        suggestions += 1;
        const request = prerequisiteRequest(
          { graph, state, evidence: attempt.evidence, item: attempt.item, skillId: 'params' },
          { idPrefix: 'py', seed: `diag${n}-${day}` },
        );
        const pick =
          missing && diagnoser() < HIT ? 'true' : diagnoser() < 0.5 ? 'known' : 'lacking';
        const skill = CANDIDATES[pick];
        const inGraph = graph.skills.some((found) => found.id === skill.id);
        const output = {
          hypotheses: [
            {
              skillId: skill.id,
              ...(inGraph ? {} : { skill }),
              edge: { kind: 'prerequisite', from: skill.id, to: 'params', strength: 'soft' },
            },
          ],
        };
        const checked = checkPrerequisiteHypothesis(request, graph, output);
        const hypothesis = checked.accepted[0];
        if (hypothesis === undefined) rejected += 1;
        else {
          commit(
            practice.act(state, graph, {
              id: `open-${hypothesis.id}`,
              at: at + 1,
              action: { kind: 'open-hypothesis', hypothesis },
            }),
          );
        }
      }
      for (const decided of events.filter(
        (e) => e.type === 'hypothesis.decided' && e.verdict === 'confirmed',
      )) {
        const admission = discoveryExtension(state, decided.hypothesisId);
        extensions.push(admission.extension);
        admitted.push(state.hypotheses[decided.hypothesisId].skillId);
        const composed = composeGraph(BASE, extensions);
        graph = composed.graph;
        const replayed = practice.replay(log, graph, `l${n}`);
        if (!replayed.ok) throw new Error(JSON.stringify(replayed.issues));
        state = replayed.state;
      }
    }
  }
  const report = prerequisiteReport(state, graph);
  const params = state.skills.params;
  const advised = (advice, isTrue) =>
    report.filter((a) => a.advice === advice && (a.skillId === 'py.dict-access') === isTrue).length;
  return {
    masteredOn,
    atTop: params?.stage === 'transfer' && params.suspended === null,
    leech: params?.suspended === 'leech',
    detected: admitted.includes('py.dict-access'),
    falseAdditions: admitted.filter((id) => id !== 'py.dict-access').length,
    suggestions,
    rejected,
    hardenTrue: advised('harden', true),
    hardenFalse: advised('harden', false),
    revokeTrue: advised('revoke', true),
    revokeFalse: advised('revoke', false),
  };
}

function summary(rows) {
  const mastered = rows
    .filter((row) => row.masteredOn !== null)
    .map((row) => row.masteredOn)
    .sort((a, b) => a - b);
  const median = mastered.length === 0 ? '-' : mastered[Math.floor(mastered.length / 2)];
  const sum = (key) =>
    rows.reduce(
      (total, row) => total + (typeof row[key] === 'boolean' ? Number(row[key]) : row[key]),
      0,
    );
  return {
    mastered: mastered.length,
    median,
    atTop: sum('atTop'),
    leech: sum('leech'),
    detected: sum('detected'),
    falseAdditions: sum('falseAdditions'),
    suggestions: sum('suggestions'),
    rejected: sum('rejected'),
    hardenTrue: sum('hardenTrue'),
    hardenFalse: sum('hardenFalse'),
    revokeTrue: sum('revokeTrue'),
    revokeFalse: sum('revokeFalse'),
  };
}

console.log(
  `lk-practice prerequisite discovery: ${LEARNERS} learners, up to ${DAYS} days, diagnoser hit rate ${HIT}`,
);
for (const missing of [true, false]) {
  for (const discovery of [false, true]) {
    const rows = Array.from({ length: LEARNERS }, (_, n) => run(n, missing, discovery));
    const s = summary(rows);
    console.log(
      `  ${(missing ? 'prerequisite missing' : 'nothing missing').padEnd(21)} ${(discovery ? 'with discovery' : 'without').padEnd(15)} params mastered ${String(s.mastered).padStart(3)}/${LEARNERS} (median day ${String(s.median).padStart(3)}), at its top stage ${String(s.atTop).padStart(3)}, a leech ${String(s.leech).padStart(3)}; true prerequisite admitted ${s.detected}/${LEARNERS}; decoys admitted ${s.falseAdditions}; diagnoses ${s.suggestions} (${s.rejected} proposals rejected); harden true ${s.hardenTrue} decoy ${s.hardenFalse}; revoke true ${s.revokeTrue} decoy ${s.revokeFalse}`,
    );
  }
}
