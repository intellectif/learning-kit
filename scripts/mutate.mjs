#!/usr/bin/env node

/**
 * Mutation testing for the scoring engine, in the repository at last.
 *
 * `src/scoring/**` carries a 100% coverage threshold, and 100% coverage means
 * every line RAN — not that anything would notice if the line were wrong. The
 * grade-stability corpus was frozen on that assumption and an external audit
 * then named four grade paths it did not actually pin, so coverage was
 * mutation-tested by hand with a harness that lived outside this repository.
 * A gate nobody can re-run is a claim, not a gate: this is that harness,
 * checked in, so the next change to scoring is measured the same way.
 *
 * How it works: change one operator or literal in the source, rebuild lk-core
 * through esbuild, and replay the grade-stability corpus against the result. A
 * mutant the corpus still accepts is a SURVIVOR — a change to grading that
 * every test in the repository would wave through.
 *
 * A survivor is not automatically a bug. Each one is a question, and the honest
 * answers are: it does not affect a grade (feedback prose, an xAPI pattern), it
 * is equivalent (the mutated code computes the same values), it is type-only,
 * or it is a real hole and the corpus needs a vector. What this tool removes is
 * the option of not asking.
 *
 * Mutations are placed with the TypeScript AST, never a regular expression, so
 * a `+` inside a string or a comment is never touched.
 *
 *   pnpm mutate                     # the whole scoring engine
 *   pnpm mutate --filter text-match # one file
 *   pnpm mutate --limit 25          # a quick sample
 */

import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import ts from 'typescript';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CORE = join(ROOT, 'packages/lk-core');
// Per-process, so two runs cannot clobber each other: a second `pnpm mutate`
// (say, --filter on one file while a full sweep runs) used to delete the
// scratch tree the first was still bundling from, and the first run then
// reported nonsense.
const WORK = join(CORE, '.mutants', `run-${process.pid}`);

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const FILTER = flag('--filter');
const LIMIT = Number(flag('--limit') ?? Number.POSITIVE_INFINITY);

/**
 * What to change, and to what.
 *
 * Chosen for code that decides a grade: the boundary operators a threshold
 * turns on, the arithmetic a score is computed with, the connectives a rule is
 * built from, and the 0/1 literals that are a scaled score's own endpoints.
 */
const BINARY = new Map([
  [ts.SyntaxKind.PlusToken, ['-']],
  [ts.SyntaxKind.MinusToken, ['+']],
  [ts.SyntaxKind.AsteriskToken, ['/']],
  [ts.SyntaxKind.SlashToken, ['*']],
  [ts.SyntaxKind.LessThanToken, ['<=', '>=']],
  [ts.SyntaxKind.LessThanEqualsToken, ['<', '>']],
  [ts.SyntaxKind.GreaterThanToken, ['>=', '<=']],
  [ts.SyntaxKind.GreaterThanEqualsToken, ['>', '<']],
  [ts.SyntaxKind.EqualsEqualsEqualsToken, ['!==']],
  [ts.SyntaxKind.ExclamationEqualsEqualsToken, ['===']],
  [ts.SyntaxKind.AmpersandAmpersandToken, ['||']],
  [ts.SyntaxKind.BarBarToken, ['&&']],
]);

/** Every single-token change worth making in one file, with its position. */
function mutationsFor(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const found = [];

  const record = (start, end, replacement, kind) => {
    const { line } = source.getLineAndCharacterOfPosition(start);
    found.push({
      file,
      start,
      end,
      original: text.slice(start, end),
      replacement,
      kind,
      line: line + 1,
    });
  };

  const visit = (node) => {
    if (ts.isBinaryExpression(node)) {
      const token = node.operatorToken;
      for (const replacement of BINARY.get(token.kind) ?? []) {
        record(token.getStart(source), token.getEnd(), replacement, 'operator');
      }
    } else if (node.kind === ts.SyntaxKind.TrueKeyword) {
      record(node.getStart(source), node.getEnd(), 'false', 'boolean');
    } else if (node.kind === ts.SyntaxKind.FalseKeyword) {
      record(node.getStart(source), node.getEnd(), 'true', 'boolean');
    } else if (ts.isNumericLiteral(node)) {
      // A scaled score's own endpoints, and the off-by-one either side of them.
      const swap = { 0: '1', 1: '0' }[node.text];
      if (swap !== undefined) {
        record(node.getStart(source), node.getEnd(), swap, 'literal');
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Every `.ts` under a directory, tests and type-only barrels excluded. */
function sourceFiles(directory) {
  const entries = [];
  const walk = (current) => {
    for (const entry of ts.sys.readDirectory(current, ['.ts'], ['__tests__'], undefined)) {
      entries.push(entry);
    }
  };
  walk(directory);
  return entries.filter((file) => !file.endsWith('.d.ts')).sort();
}

/**
 * How long one mutant gets before it is presumed to be looping forever.
 *
 * Not a nicety. `for (let i = 1; i <= a.length; i += 1)` in the Levenshtein
 * distance becomes `i += 0` under the 1 → 0 operator, and that mutant never
 * returns — it froze the whole sweep at the same mutant twice before this
 * existed. A run that can be stopped by one of its own mutants is not a gate.
 */
const TIMEOUT_MS = 30_000;

/**
 * Bundles the (possibly mutated) source tree and replays the corpus against it,
 * in a CHILD process.
 *
 * In-process was simpler and wrong twice over: a looping mutant hangs the
 * sweep with no way back, and 250 bundles imported into one process are 250
 * module graphs that are never collected. A child gets a hard timeout and takes
 * its memory with it.
 *
 * The bundle is written inside the package so `zod`, left external, resolves
 * from the workspace exactly as it does for the real build.
 */
async function replayAgainst(sourceDir, id) {
  const outfile = join(WORK, `build-${id}.mjs`);
  await build({
    entryPoints: [join(sourceDir, 'index.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    external: ['zod', 'zod/v4'],
    logLevel: 'silent',
  });
  try {
    const output = execFileSync(process.execPath, [RUNNER, outfile], {
      encoding: 'utf8',
      timeout: TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return { failures: Number(output.trim()), timedOut: false };
  } catch (error) {
    // A mutant that loops, crashes or will not load is killed: the corpus
    // would never have accepted it either.
    const timedOut = error.code === 'ETIMEDOUT' || error.signal === 'SIGTERM';
    return { failures: corpus.vectors.length, timedOut };
  } finally {
    rmSync(outfile, { force: true });
  }
}

// ── Set-up ───────────────────────────────────────────────────────────────────

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

// The child that actually loads a mutant and replays the corpus. Written here
// rather than shipped as its own file: it exists only for the length of a run.
const RUNNER = join(WORK, 'runner.mjs');
writeFileSync(
  RUNNER,
  [
    "import { readFileSync } from 'node:fs';",
    "import { pathToFileURL } from 'node:url';",
    `const corpus = JSON.parse(readFileSync(${JSON.stringify(join(CORE, 'vectors/scoring.json'))}, 'utf8'));`,
    `const { replay } = await import(pathToFileURL(${JSON.stringify(join(CORE, 'vectors/replay.mjs'))}).href);`,
    'const core = await import(pathToFileURL(process.argv[2]).href);',
    'process.stdout.write(String(replay(core, corpus).filter((r) => !r.ok).length));',
  ].join('\n'),
  'utf8',
);

const corpus = JSON.parse(readFileSync(join(CORE, 'vectors/scoring.json'), 'utf8'));

// One copy of the tree, mutated one file at a time — far cheaper than copying
// it per mutant, and it keeps the real sources untouched whatever happens here.
//
// Test directories are left out, and not merely as a saving: Vitest globs
// `**/__tests__/**`, so a copied suite is COLLECTED by an ordinary `pnpm test`
// run and fails on its own relative imports. A run interrupted before cleanup
// would have left the repository's test command broken.
const PRISTINE = join(WORK, 'src');
cpSync(join(CORE, 'src'), PRISTINE, {
  recursive: true,
  filter: (source) => !source.includes('__tests__'),
});

const targets = sourceFiles(join(CORE, 'src/scoring')).filter(
  (file) => FILTER === undefined || file.includes(FILTER),
);
if (targets.length === 0) {
  console.error(`mutate: no source files matched ${FILTER ?? '(none)'}`);
  process.exit(1);
}

// ── Baseline ─────────────────────────────────────────────────────────────────

const { failures: baselineFailures } = await replayAgainst(PRISTINE, 'baseline');
if (baselineFailures > 0) {
  console.error(
    `mutate: the corpus does not pass against UNMUTATED source (${baselineFailures} failing vectors).\n` +
      'Fix that first — every mutant would read as killed.',
  );
  process.exit(1);
}
console.log(`mutate: baseline clean (${corpus.vectors.length} vectors)\n`);

// ── Run ──────────────────────────────────────────────────────────────────────

const all = [];
for (const file of targets) {
  const text = readFileSync(file, 'utf8');
  all.push(...mutationsFor(file, text).map((mutation) => ({ ...mutation, text })));
}
const planned = all.slice(0, LIMIT);

console.log(
  `mutate: ${planned.length} mutants across ${targets.length} file(s)` +
    `${planned.length < all.length ? ` (of ${all.length}; --limit)` : ''}\n`,
);

const survivors = [];
let killed = 0;
let timedOut = 0;
let index = 0;

for (const mutation of planned) {
  index += 1;
  const mutated =
    mutation.text.slice(0, mutation.start) +
    mutation.replacement +
    mutation.text.slice(mutation.end);
  const target = join(PRISTINE, relative(join(CORE, 'src'), mutation.file));
  writeFileSync(target, mutated, 'utf8');

  let outcome = { failures: corpus.vectors.length, timedOut: false };
  try {
    outcome = await replayAgainst(PRISTINE, String(index));
  } catch {
    // Would not even bundle: killed.
  }
  writeFileSync(target, mutation.text, 'utf8');

  if (outcome.failures > 0) {
    killed += 1;
    if (outcome.timedOut) {
      timedOut += 1;
    }
    process.stdout.write(outcome.timedOut ? 'T' : '.');
  } else {
    survivors.push(mutation);
    process.stdout.write('S');
  }
  if (index % 60 === 0) {
    process.stdout.write(`  ${index}/${planned.length}\n`);
  }
}

// ── Report ───────────────────────────────────────────────────────────────────

const score = planned.length === 0 ? 1 : killed / planned.length;
// A mutant killed only by the time limit (`T` above) may be a slow survivor on
// a loaded machine: the count says how many there are to look at.
console.log(
  `\n\nkilled ${killed}/${planned.length} (${(score * 100).toFixed(1)}%)` +
    `${timedOut > 0 ? `, ${timedOut} of them by the time limit` : ''}`,
);

if (survivors.length > 0) {
  console.log(
    `\n${survivors.length} survivor(s) — each one is a question, not automatically a bug:`,
  );
  for (const survivor of survivors) {
    const where = `${relative(ROOT, survivor.file).replace(/\\/g, '/')}:${survivor.line}`;
    console.log(`  ${where}  ${survivor.original} → ${survivor.replacement}  (${survivor.kind})`);
  }
  console.log(
    '\nFor each: does it change a grade? If yes, the corpus needs a vector that\n' +
      'tells the two apart. If no — feedback prose, an xAPI pattern, an\n' +
      'equivalent expression, a type-only path — say so in the changeset.',
  );
}

rmSync(WORK, { recursive: true, force: true });
process.exitCode = 0;
