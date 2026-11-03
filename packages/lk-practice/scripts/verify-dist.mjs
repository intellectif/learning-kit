/**
 * Checks the BUILD OUTPUT, as a host installs it.
 *
 * The tests read `src/`. This reads `dist/`: the ESM and the CommonJS build
 * of each entry (the root and `./testing`; revised in M8) must each export
 * exactly the names below, and the same ones. The build must be pure (R1.1):
 * its text names no clock, random source, timer, network call or Node
 * built-in, and it loads and runs with the clock, the random source and
 * argument-less `new Date()` replaced by functions that throw, including
 * every vector the root entry can run (revised in M8). It must not name
 * lk-core at all: this package has no dependency on it. Its only dependency,
 * ts-fsrs, is loaded from the entries below and nowhere else, and no
 * declaration file names it, so no library type is part of the API (R4.3).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { NEEDS, replay } from '../vectors/replay.mjs';

const require = createRequire(import.meta.url);
const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(PKG_ROOT, 'dist');
const failures = [];

/** Everything the root entry exports at run time (the types have no runtime value). */
const REQUIRED_EXPORTS = [
  'PracticeConfigError',
  'admitCandidate',
  'admitExtension',
  'candidatesJsonSchema',
  'checkCandidates',
  'checkDecomposition',
  'checkGradeResult',
  'checkPrerequisiteHypothesis',
  'composeGraph',
  'createPractice',
  'decompositionJsonSchema',
  'decompositionRequest',
  'discoveryExtension',
  'eloMasteryModel',
  'evidenceFromGrade',
  'evidenceSchema',
  'fsrsMemoryModel',
  'generationRequest',
  'gradeResultJsonSchema',
  'gradeResultSchema',
  'hypothesesJsonSchema',
  'hypothesesSchema',
  'mapEvidence',
  'migrateState',
  'practiceStateJsonSchema',
  'practiceStateSchema',
  'prerequisiteReport',
  'prerequisiteRequest',
  'prerequisiteVerdict',
  'reviewLogEntryJsonSchema',
  'reviewLogEntrySchema',
  'validateGraph',
  'validateItems',
];

/** Everything `./testing` exports at run time (revised in M8). */
const TESTING_EXPORTS = ['simulateLearner'];

/** Everything `./lk-core` exports at run time (M10); it must not load lk-core. */
const LK_CORE_EXPORTS = ['evidenceFromOutcome', 'skillOutcomesFromCriteria'];

/** The vector files vectors/replay.mjs reads. */
const CORPORA = ['evidence.json', 'stage.json', 'log.json', 'plan.json', 'contracts.json'];

/**
 * The kinds of vector that call functions the root entry does not export
 * (ability, stage policy, retention, mastery and status internals). They
 * replay on src/ under the same trap (`src/__tests__/policy-vectors.test.mjs`),
 * and `record`, `replay` and `plan` run those functions here through the log
 * and plan vectors (revised in M8).
 */
const SRC_ONLY = [
  'ability',
  'context-weight',
  'decide',
  'implication',
  'mastery',
  'outcome-issues',
  'retention',
  'status',
];

/** The ts-fsrs entries the build may load (design §3). */
const ALLOWED_PACKAGES = new Set(['ts-fsrs', 'ts-fsrs/middlewares', 'ts-fsrs/models/fsrs-7']);

/** A small graph, an item and an extension, run through both builds under the trap. */
const SMOKE_GRAPH = {
  version: '1',
  skills: [
    { id: 'a', knowledge: 'declarative' },
    { id: 'b', knowledge: 'procedural' },
  ],
  edges: [{ kind: 'prerequisite', from: 'a', to: 'b', strength: 'hard' }],
};
const SMOKE_ITEMS = [
  {
    id: 'i1',
    skills: [{ skillId: 'b', weight: 1 }],
    stage: 'write',
    origin: 'authored',
    status: 'proven',
  },
];
const SMOKE_EXTENSION = {
  id: 'x1',
  goalId: 'g1',
  idPrefix: 'x',
  skills: [{ id: 'x.c', knowledge: 'procedural' }],
  edges: [{ kind: 'prerequisite', from: 'b', to: 'x.c', strength: 'soft' }],
  status: 'admitted',
};

/** An answer passed after one hint, half the points: `hard`, correct 0.5 (R7.2). */
const SMOKE_EVIDENCE = {
  id: 'e1',
  itemId: 'i1',
  at: 1_767_225_600_000,
  source: { kind: 'auto', score: 1, maxScore: 2, passed: true },
  hintsUsed: 1,
};
const SMOKE_TASK = {
  itemId: 'i1',
  skills: [{ skillId: 'b', weight: 1 }],
  stage: 'write',
  difficulty: 0,
  origin: 'authored',
};

/** Runs the smoke calls on one build; returns what went wrong. */
function smoke(format, module) {
  const problems = [];
  if (module.validateGraph(SMOKE_GRAPH).ok !== true) {
    problems.push(`${format} validateGraph rejects the smoke graph.`);
  }
  if (module.validateItems(SMOKE_ITEMS, SMOKE_GRAPH).ok !== true) {
    problems.push(`${format} validateItems rejects the smoke items.`);
  }
  if (module.composeGraph(SMOKE_GRAPH, [SMOKE_EXTENSION]).ok !== true) {
    problems.push(`${format} composeGraph rejects the smoke extension.`);
  }
  // The memory model: a new memory rated good on 2026-01-01T00:00Z is due in
  // 4.7777 days, then serialized, read back and reviewed again (vectors/memory.json).
  const model = module.fsrsMemoryModel();
  const context = { desiredRetention: 0.9 };
  const first = model.review(model.init(), 'good', 1_767_225_600_000, context);
  if (first.due !== 1_767_638_395_164) {
    problems.push(`${format} fsrsMemoryModel gives due ${first.due} for the smoke review.`);
  }
  const memory = model.deserialize(JSON.parse(JSON.stringify(model.serialize(first.memory))));
  const r = model.retrievability(memory, first.due);
  if (!(r > 0.89 && r < 0.91)) {
    problems.push(`${format} fsrsMemoryModel gives retrievability ${r} at the due time.`);
  }
  if (!(model.review(memory, 'again', first.due, context).due > first.due)) {
    problems.push(`${format} fsrsMemoryModel does not schedule a lapse after its review.`);
  }
  // The mastery model: one correct answer at p = 0.5 with K = 1 gives theta 0.5.
  const elo = module.eloMasteryModel();
  const ability = elo.update(elo.init(SMOKE_GRAPH.skills[0]), {
    correct: 1,
    weight: 1,
    difficulty: 0,
    stage: 'recognise',
    context: 'practice',
  });
  if (elo.estimate(ability).value !== 0.5) {
    problems.push(`${format} eloMasteryModel gives theta ${elo.estimate(ability).value}.`);
  }
  // The evidence mapper reads only these parts of a resolved configuration.
  const config = {
    evidenceOptions: {
      checksPassFraction: 1,
      aiMediumWeight: 0.5,
      selfWeight: 0.5,
      selfCorrect: { again: 0, hard: 0.6, good: 1, easy: 1 },
    },
    memoryWeightFloor: 0.3,
    contexts: { examsMoveSchedule: false, diagnosticWeight: 1, pretestWeight: 0 },
  };
  const task = { ...SMOKE_TASK };
  const effect = module.mapEvidence(SMOKE_EVIDENCE, task, {}, config).perSkill[0];
  if (effect?.rating !== 'hard' || effect.correct !== 0.5 || effect.memory !== 'review') {
    problems.push(`${format} mapEvidence maps the smoke evidence to ${JSON.stringify(effect)}.`);
  }
  try {
    module.mapEvidence(SMOKE_EVIDENCE, task, {}, { ...config, evidenceOptions: null });
    problems.push(`${format} mapEvidence accepts a configuration with a custom mapper.`);
  } catch (error) {
    if (!(error instanceof module.PracticeConfigError)) {
      problems.push(`${format} mapEvidence throws ${String(error)}, not PracticeConfigError.`);
    }
  }
  // The log: the smoke evidence recorded, replayed to the same state, the
  // stored state read back by migrateState (design 6), and a session planned
  // from it (design 8.6; revised in M6).
  const practice = module.createPractice({});
  const recorded = practice.record(practice.initState('l1', SMOKE_GRAPH), {
    graph: SMOKE_GRAPH,
    evidence: SMOKE_EVIDENCE,
    item: SMOKE_ITEMS[0],
  });
  if (recorded.kind !== 'applied' || recorded.appended.length !== 1) {
    problems.push(
      `${format} createPractice().record gives ${recorded.kind} for the smoke evidence.`,
    );
  } else {
    const replayed = practice.replay(recorded.appended, SMOKE_GRAPH, 'l1');
    if (!replayed.ok || !isDeepStrictEqual(replayed.state, recorded.state)) {
      problems.push(`${format} createPractice().replay does not rebuild the recorded state.`);
    }
    const read = module.migrateState(JSON.parse(JSON.stringify(recorded.state)));
    if (!read.ok || !isDeepStrictEqual(read.state, recorded.state)) {
      problems.push(`${format} migrateState does not read the stored state back.`);
    }
    const request = { now: SMOKE_EVIDENCE.at + 30 * 86_400_000, seed: 's1', budget: {} };
    const planned = practice.plan(recorded.state, SMOKE_GRAPH, request);
    if (
      planned.algorithm.id !== 'planner' ||
      planned.targets.length === 0 ||
      !isDeepStrictEqual(planned, practice.plan(recorded.state, SMOKE_GRAPH, request))
    ) {
      problems.push(`${format} createPractice().plan gives ${JSON.stringify(planned.targets)}.`);
    }
  }
  // The contracts (design 8.8; revised in M7): a grade read through the check
  // and its Standard Schema, mapped to evidence, and a candidate that only an
  // accepted proof admits.
  const grade = { score: 1, maxScore: 2, passed: false, grader: { kind: 'auto' } };
  const checkedGrade = module.checkGradeResult(grade);
  const standard = module.gradeResultSchema['~standard'].validate(grade);
  const fromGrade = module.evidenceFromGrade(grade, SMOKE_ITEMS[0], {
    id: 'e2',
    itemId: 'i1',
    at: 1,
  });
  if (
    !checkedGrade.ok ||
    standard.issues !== undefined ||
    fromGrade.source.kind !== 'auto' ||
    fromGrade.source.score !== 1 ||
    module.gradeResultJsonSchema.type !== 'object'
  ) {
    problems.push(`${format} checkGradeResult or evidenceFromGrade fails the smoke grade.`);
  }
  const candidate = {
    ...SMOKE_ITEMS[0],
    difficulty: 0,
    content: 'smoke',
    origin: 'generated',
    status: 'unproven',
  };
  const proof = { kind: 'executable', at: 1, referencePassed: true, wrongSolutionsFailed: 1 };
  const proven = module.admitCandidate(candidate, proof);
  const refused = module.admitCandidate(candidate, { ...proof, referencePassed: false });
  if (!proven.ok || proven.item.status !== 'proven' || refused.ok) {
    problems.push(`${format} admitCandidate does not gate the smoke candidate on its proof.`);
  }
  return problems;
}

/** A simulated learner's attempt at a planned target, recorded by the root build of the same format. */
function smokeTesting(format, root, testing) {
  const options = {
    seed: 's1',
    skills: {
      a: { trueAbility: 0, forgettingDays: 5 },
      b: { trueAbility: 0, forgettingDays: 5 },
    },
  };
  const practice = root.createPractice({});
  const state = practice.initState('l1', SMOKE_GRAPH);
  const now = SMOKE_EVIDENCE.at;
  const [target] = practice.plan(state, SMOKE_GRAPH, { now, seed: 's1', budget: {} }).targets;
  const attempt = testing.simulateLearner(options).attempt(target, now);
  const again = testing.simulateLearner(options).attempt(target, now);
  const recorded = practice.record(state, { graph: SMOKE_GRAPH, ...attempt });
  return recorded.kind === 'applied' && isDeepStrictEqual(attempt, again)
    ? []
    : [`${format} simulateLearner's attempt is not repeatable, or records as ${recorded.kind}.`];
}

/** The root entry's functions as vectors/replay.mjs names them; `resolveConfig` reads `createPractice`. */
function implOf(module) {
  return {
    ...module,
    resolveConfig(input) {
      try {
        return { ok: true, value: module.createPractice(input).config };
      } catch (error) {
        if (error instanceof module.PracticeConfigError) return { ok: false, issues: error.issues };
        throw error;
      }
    },
  };
}

/** Replays every vector the root and `./lk-core` entries can run; returns what went wrong and how many ran. */
function replayVectors(format, module, lkCore) {
  const impl = { ...implOf(module), ...lkCore };
  const problems = [];
  const skipped = new Set();
  let count = 0;
  for (const file of CORPORA) {
    const corpus = JSON.parse(readFileSync(join(PKG_ROOT, 'vectors', file), 'utf8'));
    const runnable = corpus.vectors.filter((vector) => {
      const runs = (NEEDS[vector.kind] ?? []).every((name) => typeof impl[name] === 'function');
      if (!runs) skipped.add(vector.kind);
      return runs;
    });
    count += runnable.length;
    for (const line of replay(impl, { ...corpus, vectors: runnable })) {
      problems.push(`${format} ${file}: ${line}`);
    }
  }
  const unexpected = [...skipped].filter((kind) => !SRC_ONLY.includes(kind));
  if (unexpected.length > 0) {
    problems.push(`${format} cannot replay ${unexpected.join(', ')} vectors from the build.`);
  }
  const stale = SRC_ONLY.filter((kind) => !skipped.has(kind));
  if (stale.length > 0) {
    problems.push(
      `${format} replays ${stale.join(', ')} from the build; take them out of SRC_ONLY.`,
    );
  }
  return { problems, count };
}

/** What pure code never names. Comments are removed before the scan. */
const IMPURE = [
  [/\bDate\.now\b/, 'Date.now'],
  [/\bnew\s+Date\s*\(\s*\)/, 'new Date()'],
  [/\bDate\s*\(\s*\)/, 'Date()'],
  [/\bMath\.random\b/, 'Math.random'],
  [/\bcrypto\b/, 'crypto'],
  [/\bperformance\b/, 'performance'],
  [/\b(?:setTimeout|setInterval|setImmediate)\b/, 'a timer'],
  [/\b(?:fetch|XMLHttpRequest|WebSocket)\b/, 'a network call'],
  [/\bprocess\b/, 'process'],
];

/** Every module the build may not load: Node's built-ins, with or without `node:`. */
const BUILTINS = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));

// Recursive, so a chunk file a later entry splits out is scanned too.
const files = readdirSync(DIST, { recursive: true })
  .map(String)
  .filter((file) => /\.(?:c?js|d\.c?ts)$/.test(file));
for (const expected of [
  'index.js',
  'index.cjs',
  'index.d.ts',
  'index.d.cts',
  'lk-core.js',
  'lk-core.cjs',
  'lk-core.d.ts',
  'lk-core.d.cts',
  'testing.js',
  'testing.cjs',
  'testing.d.ts',
  'testing.d.cts',
]) {
  if (!files.includes(expected)) {
    failures.push(`dist/${expected} is missing. Run \`pnpm build\` first.`);
  }
}

for (const file of files) {
  const text = readFileSync(join(DIST, file), 'utf8');
  if (text.includes('@intellectif/lk-core')) {
    failures.push(`dist/${file} names @intellectif/lk-core, which this package must not use.`);
  }
  if (file.endsWith('ts')) {
    if (/ts-fsrs|@open-spaced-repetition/.test(text)) {
      failures.push(`dist/${file} names ts-fsrs, whose types must not be part of the API.`);
    }
    continue;
  }
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const [pattern, name] of IMPURE) {
    if (pattern.test(code)) {
      failures.push(`dist/${file} names ${name}, which R1.1 forbids.`);
    }
  }
  const specifiers = code.matchAll(/(?:\bfrom|\bimport|\brequire)\s*\(?\s*['"]([^'"]+)['"]/g);
  for (const [, specifier] of specifiers) {
    if (BUILTINS.has(specifier.split('/')[0]) || BUILTINS.has(specifier)) {
      failures.push(`dist/${file} loads ${specifier}, a Node built-in.`);
    }
  }
  // Module statements and `require` calls only, so a message that contains
  // the word `from` is not read as an import.
  const loads = [
    ...code.matchAll(/^(?:import|export)\b[^;'"`]*?\bfrom\s*["']([^"']+)["']/gm),
    ...code.matchAll(/^import\s*["']([^"']+)["']/gm),
    ...code.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g),
  ];
  for (const [, specifier] of loads) {
    if (!specifier.startsWith('.') && !ALLOWED_PACKAGES.has(specifier)) {
      failures.push(`dist/${file} loads ${specifier}; only ts-fsrs entries are allowed.`);
    }
  }
}

/** The runtime trap: both builds are loaded with the impure globals throwing. */
const RealDate = globalThis.Date;
const realRandom = Math.random;
const realRandomUUID = globalThis.crypto.randomUUID;
const sprung = [];
const trap = (source) => () => {
  sprung.push(source);
  throw new Error(`lk-practice reached ${source}, which it must never call.`);
};
class TrappedDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) {
      trap('new Date()')();
    }
    super(...args);
  }
  static now = trap('Date.now()');
}

let esm;
let cjs;
let esmTesting;
let cjsTesting;
let esmLkCore;
let cjsLkCore;
const replayed = {};
globalThis.Date = TrappedDate;
Math.random = trap('Math.random()');
globalThis.crypto.randomUUID = trap('crypto.randomUUID()');
try {
  esm = await import(pathToFileURL(join(DIST, 'index.js')).href);
  cjs = require(join(DIST, 'index.cjs'));
  esmTesting = await import(pathToFileURL(join(DIST, 'testing.js')).href);
  cjsTesting = require(join(DIST, 'testing.cjs'));
  esmLkCore = await import(pathToFileURL(join(DIST, 'lk-core.js')).href);
  cjsLkCore = require(join(DIST, 'lk-core.cjs'));
  failures.push(...smoke('ESM', esm), ...smoke('CJS', cjs));
  failures.push(...smokeTesting('ESM', esm, esmTesting), ...smokeTesting('CJS', cjs, cjsTesting));
  for (const [format, module, lkCore] of [
    ['ESM', esm, esmLkCore],
    ['CJS', cjs, cjsLkCore],
  ]) {
    const { problems, count } = replayVectors(format, module, lkCore);
    failures.push(...problems);
    replayed[format] = count;
  }
} catch (error) {
  failures.push(`the build does not load under the purity trap: ${error.message}`);
} finally {
  globalThis.Date = RealDate;
  Math.random = realRandom;
  globalThis.crypto.randomUUID = realRandomUUID;
}
for (const source of new Set(sprung)) {
  failures.push(`loading the build reached ${source}.`);
}

for (const [entry, names, esmModule, cjsModule] of [
  ['index', REQUIRED_EXPORTS, esm, cjs],
  ['testing', TESTING_EXPORTS, esmTesting, cjsTesting],
  ['lk-core', LK_CORE_EXPORTS, esmLkCore, cjsLkCore],
]) {
  if (esmModule === undefined || cjsModule === undefined) continue;
  const expected = [...names].sort().join(', ');
  const exported = {};
  for (const [format, module] of [
    ['ESM', esmModule],
    ['CJS', cjsModule],
  ]) {
    exported[format] = Object.keys(module).sort().join(', ');
    if (exported[format] !== expected) {
      failures.push(
        `${format} ${entry} exports ${exported[format] || 'nothing'}; expected ${expected || 'nothing'}.`,
      );
    }
  }
  if (exported.ESM !== exported.CJS) {
    failures.push(`the ESM and CommonJS builds of ${entry} export different names.`);
  }
}

if (failures.length > 0) {
  console.error(`verify-dist FAILED (${failures.length}):`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}
console.log(
  `verify-dist OK: ESM and CommonJS export the same ${REQUIRED_EXPORTS.length} root, ${TESTING_EXPORTS.length} testing and ${LK_CORE_EXPORTS.length} lk-core names, ${files.length} built files are pure, both builds load and run under the purity trap and replay ${replayed.ESM} vectors there (the ${SRC_ONLY.length} kinds that call unexported functions replay on src/), the build loads only ts-fsrs, and nothing names lk-core or exposes a ts-fsrs type.`,
);
