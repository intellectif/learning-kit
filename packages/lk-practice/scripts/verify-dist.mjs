/**
 * Checks the BUILD OUTPUT, as a host installs it.
 *
 * The tests read `src/`. This reads `dist/`: the ESM and the CommonJS build
 * must each export exactly the names below, and the same ones. The build must
 * be pure (R1.1): its text names no clock, random source, timer, network call
 * or Node built-in, and it loads and runs with the clock, the random source
 * and argument-less `new Date()` replaced by functions that throw. It must
 * not name lk-core at all: this package has no dependency on it. Its only
 * dependency, ts-fsrs, is loaded from the entries below and nowhere else, and
 * no declaration file names it, so no library type is part of the API (R4.3).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(PKG_ROOT, 'dist');
const failures = [];

/** Everything the root entry exports at run time (the types have no runtime value). */
const REQUIRED_EXPORTS = [
  'PracticeConfigError',
  'composeGraph',
  'eloMasteryModel',
  'fsrsMemoryModel',
  'mapEvidence',
  'validateGraph',
  'validateItems',
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
  const context = {
    desiredRetention: 0.9,
    maximumIntervalDays: 36500,
    learningSteps: ['1m', '10m'],
    relearningSteps: ['10m'],
  };
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
  return problems;
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
for (const expected of ['index.js', 'index.cjs', 'index.d.ts', 'index.d.cts']) {
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
globalThis.Date = TrappedDate;
Math.random = trap('Math.random()');
globalThis.crypto.randomUUID = trap('crypto.randomUUID()');
try {
  esm = await import(pathToFileURL(join(DIST, 'index.js')).href);
  cjs = require(join(DIST, 'index.cjs'));
  failures.push(...smoke('ESM', esm), ...smoke('CJS', cjs));
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

if (esm !== undefined && cjs !== undefined) {
  const expected = [...REQUIRED_EXPORTS].sort().join(', ');
  const exported = {};
  for (const [format, module] of [
    ['ESM', esm],
    ['CJS', cjs],
  ]) {
    exported[format] = Object.keys(module).sort().join(', ');
    if (exported[format] !== expected) {
      failures.push(
        `${format} exports ${exported[format] || 'nothing'}; expected ${expected || 'nothing'}.`,
      );
    }
  }
  if (exported.ESM !== exported.CJS) {
    failures.push('the ESM and CommonJS builds export different names.');
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
  `verify-dist OK: ESM and CommonJS export the same ${REQUIRED_EXPORTS.length} names, ${files.length} built files are pure, the build loads and runs under the purity trap, it loads only ts-fsrs, and nothing names lk-core or exposes a ts-fsrs type.`,
);
