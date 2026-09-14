#!/usr/bin/env node
/**
 * The public API surface, frozen as data — the semver gate this repository did
 * not have.
 *
 * `verify-dist` proves a list of documented exports RESOLVES. It says nothing
 * about their shapes, so a parameter could become required, a return type could
 * narrow, or a field could vanish from an exported interface, and every gate
 * stayed green until a consumer's build broke. That is precisely the class of
 * change semver exists to describe, and nothing here could see it.
 *
 * This reads the BUILT `.d.ts` of each package — what a consumer actually
 * installs, not src — and writes one line per exported symbol with its resolved
 * type. `--check` fails when the committed report and the build disagree.
 *
 * The report is a REVIEW artifact, not a rule: a diff is not an error, it is
 * the question "is this a patch, a minor or a major?" asked at the moment
 * someone can still answer it. Regenerate with `pnpm api-report` and commit the
 * change alongside the changeset that describes it.
 *
 * api-extractor was the obvious alternative and was not used: it wants a
 * per-package config, a rollup .d.ts and a bundled-package convention this
 * monorepo does not follow, to produce the same list. The TypeScript compiler
 * already installed here answers the question directly.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

/** Every entry point a consumer can import, per package, as its exports map lists them. */
function entryPoints(packageDir) {
  const pkg = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
  const entries = [];
  for (const [subpath, target] of Object.entries(pkg.exports ?? {})) {
    if (subpath === './package.json' || typeof target !== 'object' || target === null) {
      continue;
    }
    const types = target.import?.types ?? target.types;
    if (typeof types === 'string' && types.endsWith('.d.ts')) {
      entries.push({ subpath, file: join(packageDir, types) });
    }
  }
  return entries.sort((a, b) => a.subpath.localeCompare(b.subpath));
}

/**
 * One line per exported symbol: its kind, its name, and its declaration.
 *
 * Nothing is elided. A surface report that abbreviated a long signature could
 * not detect a change inside the part it abbreviated, which would make the gate
 * quietly useless exactly where the types are most complex.
 */
function surfaceOf(entryFile) {
  const program = ts.createProgram([entryFile], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
  });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(entryFile);
  if (source === undefined) {
    throw new Error(`api-report: could not load ${entryFile}. Run \`pnpm build\` first.`);
  }
  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (moduleSymbol === undefined) {
    throw new Error(`api-report: ${entryFile} exports nothing.`);
  }

  const lines = [];
  for (const symbol of checker.getExportsOfModule(moduleSymbol)) {
    const resolved =
      symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    const declaration = resolved.declarations?.[0];
    // The DECLARATION TEXT, not a resolved type. In a `.d.ts` every declaration
    // already IS the public surface, and printing one through the checker went
    // wrong two ways: a class came out as `typeof import("<absolute path>")`,
    // which embeds the machine that ran the build — so the committed report
    // could never match CI's — and it said nothing about the class's shape.
    lines.push(
      `${kindOf(resolved, declaration)} ${symbol.getName()}: ${declarationText(declaration)}`,
    );
  }
  return lines.sort((a, b) => a.localeCompare(b));
}

function kindOf(symbol, declaration) {
  if (symbol.flags & ts.SymbolFlags.Interface) return 'interface';
  if (symbol.flags & ts.SymbolFlags.TypeAlias) return 'type';
  if (symbol.flags & ts.SymbolFlags.Enum) return 'enum';
  if (symbol.flags & ts.SymbolFlags.Function) return 'function';
  if (symbol.flags & ts.SymbolFlags.Class) return 'class';
  if (declaration !== undefined && ts.isVariableDeclaration(declaration)) return 'const';
  return 'value';
}

/**
 * A declaration's own text: doc comments stripped, whitespace collapsed.
 *
 * Neither is cosmetic. Formatting would make a Biome run look like an API
 * change, and JSDoc would make every wording fix fail the gate — which is how a
 * gate stops being read. What semver describes is the TYPES, so that is what is
 * compared; prose changes belong in the changeset, not here.
 */
function declarationText(declaration) {
  if (declaration === undefined) {
    return '<unresolved>';
  }
  return declaration
    .getText()
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PACKAGES = ['packages/lk-core', 'packages/lk-react'];
const failures = [];
let checked = 0;

for (const packageDir of PACKAGES) {
  const absolute = join(ROOT, packageDir);
  const name = JSON.parse(readFileSync(join(absolute, 'package.json'), 'utf8')).name;
  const sections = [`# ${name} — public API surface`, ''];
  sections.push(
    'Generated from the BUILT `.d.ts` by `pnpm api-report`. A diff here is a',
    'semver question, not an error: decide patch / minor / major, then commit',
    'this file with the changeset that explains it.',
    '',
  );

  for (const { subpath, file } of entryPoints(absolute)) {
    const lines = surfaceOf(file);
    checked += lines.length;
    sections.push(`## ${subpath === '.' ? name : `${name}/${subpath.slice(2)}`}`, '');
    sections.push('```ts');
    sections.push(...lines);
    sections.push('```', '');
  }

  const report = `${sections.join('\n').trimEnd()}\n`;
  const target = join(absolute, 'api', 'surface.md');
  mkdirSync(dirname(target), { recursive: true });

  if (!CHECK) {
    writeFileSync(target, report, 'utf8');
    console.log(`api-report: wrote ${relative(ROOT, target)}`);
    continue;
  }

  let committed = '';
  try {
    committed = readFileSync(target, 'utf8');
  } catch {
    failures.push(`${relative(ROOT, target)} is missing. Run \`pnpm api-report\` and commit it.`);
    continue;
  }
  if (committed !== report) {
    // Compared in memory and NEVER written. An earlier cut regenerated the file
    // here so it could show a `git diff`, which made the check repair the very
    // thing it was checking: the second run passed, the exit code came back 0,
    // and CI would have waved through exactly the change this gate exists to
    // stop.
    failures.push(
      `${name}'s public API surface changed:\n${diffLines(committed, report)}\n` +
        'If that is intended, run `pnpm api-report` and commit the regenerated ' +
        'report with a changeset saying whether it is a patch, a minor or a major.',
    );
  }
}

/** The added and removed lines between the committed report and this build's. */
function diffLines(before, after) {
  const previous = new Set(before.split('\n'));
  const next = new Set(after.split('\n'));
  const removed = [...previous].filter((line) => line.trim() !== '' && !next.has(line));
  const added = [...next].filter((line) => line.trim() !== '' && !previous.has(line));
  const show = (lines, sign) =>
    lines
      .slice(0, 20)
      .map((line) => `  ${sign} ${line}`)
      .join('\n') + (lines.length > 20 ? `\n  … and ${lines.length - 20} more` : '');
  return [
    removed.length > 0 ? show(removed, '-') : null,
    added.length > 0 ? show(added, '+') : null,
  ]
    .filter((part) => part !== null)
    .join('\n');
}

if (failures.length > 0) {
  console.error(`\napi-report FAILED\n\n${failures.join('\n\n')}`);
  process.exit(1);
}

console.log(
  CHECK
    ? `api-report OK: ${checked} exported symbols match the committed surface.`
    : `api-report: ${checked} exported symbols recorded.`,
);
