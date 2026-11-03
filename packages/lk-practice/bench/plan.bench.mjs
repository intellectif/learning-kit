// Tracks the R12.4 performance targets over the build (design 8.6; revised
// in M8): `record` on a state with 2,000 skills, `plan` for 2,000 skills and
// a pool of 10,000 items, and `replay` of 100,000 log entries. Outside the CI
// gates, as R12.4 says: the numbers depend on the machine. Run `pnpm build`,
// then `pnpm bench`; `--quick` builds a smaller log for a fast check, and
// `--per-day <n>` sets how many tasks a day the learner does (50 by
// default). Every task uses a new item, and item usage is kept for 30 days,
// so the tasks a day set how many usage records `record` and `replay` carry.
import { createPractice } from '../dist/index.js';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 5);
const SKILLS = 2_000;
const POOL = 10_000;
const LOG = process.argv.includes('--quick') ? 10_000 : 100_000;
const flag = process.argv.indexOf('--per-day');
const PER_DAY = flag === -1 ? 50 : Number(process.argv[flag + 1]);

/**
 * 2,000 skills in 100 strands of 20: within a strand each skill needs the one
 * before it (hard every fifth, soft otherwise), and every tenth encompasses
 * the two before it. Declarative and procedural alternate by strand.
 */
function graph() {
  const skills = [];
  const edges = [];
  for (let i = 0; i < SKILLS; i += 1) {
    const strand = Math.floor(i / 20);
    const step = i % 20;
    skills.push({
      id: `k${String(i).padStart(4, '0')}`,
      knowledge: strand % 2 === 0 ? 'declarative' : 'procedural',
    });
    if (step > 0) {
      edges.push({
        kind: 'prerequisite',
        from: skills[i - 1].id,
        to: skills[i].id,
        strength: step % 5 === 0 ? 'hard' : 'soft',
      });
    }
    if (step >= 2 && step % 10 === 0) {
      for (const component of [skills[i - 1].id, skills[i - 2].id]) {
        edges.push({ kind: 'encompasses', from: skills[i].id, to: component, weight: 0.5 });
      }
    }
  }
  return { version: 'bench1', skills, edges };
}

const GRAPH = graph();
const FIRST = { declarative: 'recognise', procedural: 'example' };

/**
 * A deterministic pass or fail: one task in ten fails, spread over the
 * rounds, so each skill lapses now and then and none becomes a leech.
 */
const source = (n) =>
  (n + Math.floor(n / SKILLS)) % 10 === 9
    ? { kind: 'auto', score: 0, maxScore: 1, passed: false }
    : { kind: 'auto', score: 1, maxScore: 1, passed: true };

/**
 * Records `count` pieces of evidence spread over the skills, in time order, a
 * new item each (so item usage grows and is pruned as a host's would be).
 */
function learn(practice, count) {
  let state = practice.initState('l1', GRAPH);
  const entries = [];
  const span = Math.ceil(count / PER_DAY) * DAY;
  for (let n = 0; n < count; n += 1) {
    const skill = GRAPH.skills[(n * 7) % SKILLS];
    const stage = state.skills[skill.id]?.stage ?? FIRST[skill.knowledge];
    const at = T0 + Math.floor((n * span) / count);
    const result = practice.record(state, {
      graph: GRAPH,
      evidence: { id: `e${n}`, itemId: `i${n}`, at, source: source(n) },
      item: {
        id: `i${n}`,
        skills: [{ skillId: skill.id, weight: 1 }],
        stage,
        origin: 'authored',
        status: 'proven',
      },
    });
    if (result.kind !== 'applied') throw new Error(`step ${n}: ${result.kind}`);
    state = result.state;
    entries.push(...result.appended);
  }
  return { state, entries, end: T0 + span };
}

/** 10,000 proven items, five per skill, at the skill's current stage and spread in difficulty. */
function pool(state) {
  const items = [];
  for (let n = 0; n < POOL; n += 1) {
    const skill = GRAPH.skills[n % SKILLS];
    items.push({
      id: `p${n}`,
      skills: [{ skillId: skill.id, weight: 1 }],
      stage: state.skills[skill.id]?.stage ?? FIRST[skill.knowledge],
      difficulty: ((n % 9) - 4) / 2,
      origin: 'authored',
      status: 'proven',
    });
  }
  return items;
}

/** The median of `runs` timings of `work`, in milliseconds, after one warm-up. */
function median(runs, work) {
  work();
  const times = [];
  for (let i = 0; i < runs; i += 1) {
    const start = process.hrtime.bigint();
    work();
    times.push(Number(process.hrtime.bigint() - start) / 1e6);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}

const practice = createPractice();
const setupStart = process.hrtime.bigint();
const { state, entries, end } = learn(practice, LOG);
const setupMs = Number(process.hrtime.bigint() - setupStart) / 1e6;
const started = Object.keys(state.skills).length;
const items = pool(state);
// Long after the log ends, so nearly every memory is overdue: the planner's
// heaviest path, where retrievability is computed for each.
const now = end + 1000 * DAY;
const request = { now, seed: 'bench', budget: { maxTargets: 20 }, pool: items };

let n = LOG;
const recordMs = median(200, () => {
  const skill = GRAPH.skills[n % SKILLS];
  const result = practice.record(state, {
    graph: GRAPH,
    evidence: { id: `r${n}`, itemId: `ri${n}`, at: end, source: source(n) },
    item: {
      id: `ri${n}`,
      skills: [{ skillId: skill.id, weight: 1 }],
      stage: state.skills[skill.id]?.stage ?? FIRST[skill.knowledge],
      origin: 'authored',
      status: 'proven',
    },
  });
  if (result.kind !== 'applied') throw new Error(`record: ${result.kind}`);
  n += 1;
});
let targets = 0;
const planMs = median(20, () => {
  targets = practice.plan(state, GRAPH, request).targets.length;
});
const replayMs = median(3, () => {
  const result = practice.replay(entries, GRAPH, 'l1');
  if (!result.ok) throw new Error('replay');
});

const rows = [
  ['record (2,000-skill state)', recordMs, 1],
  [`plan (2,000 skills, ${POOL.toLocaleString('en')} items, ${targets} targets)`, planMs, 50],
  [`replay (${LOG.toLocaleString('en')} entries)`, replayMs, LOG === 100_000 ? 2_000 : null],
];
console.log(
  `lk-practice bench on Node ${process.versions.node}: ${started} skills started, ${entries.length.toLocaleString('en')} entries at ${PER_DAY} a day recorded in ${Math.round(setupMs).toLocaleString('en')} ms, ${Object.keys(state.items).length.toLocaleString('en')} item usage records kept`,
);
for (const [name, ms, target] of rows) {
  const verdict =
    target === null ? '' : ms <= target ? `  within ${target} ms` : `  MISSES ${target} ms`;
  console.log(`  ${name.padEnd(48)} ${ms.toFixed(3).padStart(10)} ms${verdict}`);
}
