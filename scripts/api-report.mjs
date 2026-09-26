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
  return entries.sort((a, b) => a.subpath.localeCompare(b.subpath, REPORT_COLLATION));
}

/**
 * The collation the report is ordered by, named rather than left to the
 * machine: `localeCompare` without a locale sorts by the process's own, and
 * under a Turkish or Lithuanian one the same symbols come out in a different
 * order, so the report written on one machine fails the check on another.
 */
const REPORT_COLLATION = 'en-US';

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
    const declarations = resolved.declarations ?? [];
    const [declaration] = declarations;
    // The DECLARATION TEXT, not a resolved type. In a `.d.ts` every declaration
    // already IS the public surface, and printing one through the checker went
    // wrong two ways: a class came out as `typeof import("<absolute path>")`,
    // which embeds the machine that ran the build — so the committed report
    // could never match CI's — and it said nothing about the class's shape.
    //
    // Every declaration, in order: an overloaded function has one per
    // signature, and reading only the first let a change to any later one —
    // or a new overload — pass unseen.
    const text =
      declarations.length === 0
        ? declarationText(undefined)
        : declarations.map(declarationText).join(' ');
    lines.push(`${kindOf(resolved, declaration)} ${symbol.getName()}: ${text}`);
  }
  return lines.sort((a, b) => a.localeCompare(b, REPORT_COLLATION));
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
 * A declaration's own text: doc comments stripped, whitespace collapsed, and
 * the members of each union, and of each object type made only of properties,
 * put in one order.
 *
 * None of that is cosmetic. Formatting would make a Biome run look like an API
 * change, and JSDoc would make every wording fix fail the gate — which is how a
 * gate stops being read. What semver describes is the TYPES, so that is what is
 * compared; prose changes belong in the changeset, not here.
 *
 * The order is the declaration build's, not the source's. TypeScript prints a
 * union in the order it created the members' types and a mapped object in the
 * order of its keys, and the build does not create them in the same order
 * every time: under load the same source came out as `z.ZodLiteral<1 | 2 | 3 |
 * 4 | 5>` in one build and `z.ZodLiteral<2 | 1 | 3 | 4 | 5>` in the next, and
 * failed this check with no change at all. Neither order means anything to a
 * type, so both are sorted, by code unit, which every Node version agrees on.
 * What does keep an order is left as it is: tuple elements, parameters,
 * intersections, and the method, call, construct and index signatures an
 * overload list depends on.
 */
function declarationText(declaration) {
  if (declaration === undefined) {
    return '<unresolved>';
  }
  // Whether a declaration file writes `export declare function f` or
  // `declare function f` with an export list is how the bundler laid it out,
  // not the API: the export itself is what the report lists. So the modifier
  // is left out, and changing bundlers is not an API change.
  return collapsed(canonicalText(declaration)).replace(/^export\s+/, '');
}

/**
 * `text` on one line, single-spaced, in one spelling of what declaration
 * bundlers write two ways: no trailing comma before a closing bracket, and an
 * empty body as `{}`. Comments are already out: see {@link sourceSlice}.
 */
function collapsed(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/,\s*([}\])])/g, ' $1')
    .replace(/\{\s+\}/g, '{}')
    .trim();
}

/**
 * A source file's namespace imports, alias to module: `import * as
 * react_jsx_runtime from "react/jsx-runtime"`. One bundler names a type through
 * such an alias, another writes `import("react/jsx-runtime")` in its place; the
 * report writes the second, which names the module whatever the alias is.
 */
const namespacesOf = new WeakMap();
function namespaceImports(source) {
  let aliases = namespacesOf.get(source);
  if (aliases === undefined) {
    aliases = new Map();
    for (const statement of source.statements) {
      const bindings = ts.isImportDeclaration(statement)
        ? statement.importClause?.namedBindings
        : undefined;
      if (bindings !== undefined && ts.isNamespaceImport(bindings)) {
        aliases.set(bindings.name.text, statement.moduleSpecifier.text);
      }
    }
    namespacesOf.set(source, aliases);
  }
  return aliases;
}

/**
 * Where a source file's comments are, as the parser read them: the leading and
 * trailing trivia of every node. A comment is never inside a token, so a string
 * or a template keeps its `//` and its `/*` — a pattern over the text could not
 * tell the two apart, and cut every URL in the report at `"http:`.
 */
const commentsOf = new WeakMap();
function commentRanges(source) {
  let ranges = commentsOf.get(source);
  if (ranges !== undefined) {
    return ranges;
  }
  const byStart = new Map();
  const text = source.text;
  const note = (found) => {
    for (const range of found ?? []) {
      byStart.set(range.pos, range.end);
    }
  };
  const visit = (node) => {
    note(ts.getLeadingCommentRanges(text, node.pos));
    note(ts.getTrailingCommentRanges(text, node.end));
    for (const child of node.getChildren(source)) {
      visit(child);
    }
  };
  visit(source);
  ranges = [...byStart].sort((a, b) => a[0] - b[0]);
  commentsOf.set(source, ranges);
  return ranges;
}

/** `source.text` from `start` to `end`, each comment in it read as a space. */
function sourceSlice(source, start, end) {
  let text = '';
  let at = start;
  for (const [from, to] of commentRanges(source)) {
    if (to <= at || from >= end) {
      continue;
    }
    text += `${source.text.slice(at, Math.max(at, from))} `;
    at = Math.min(to, end);
  }
  return text + source.text.slice(at, end);
}

const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** `node`'s text, with every union and every object type of properties inside it in one order. */
function canonicalText(node) {
  if (ts.isIdentifier(node) && ts.isQualifiedName(node.parent) && node.parent.left === node) {
    const module = namespaceImports(node.getSourceFile()).get(node.text);
    if (module !== undefined) {
      return `import(${JSON.stringify(module)})`;
    }
  }
  if (ts.isUnionTypeNode(node)) {
    return node.types
      .map((member) => collapsed(canonicalText(member)))
      .sort(byCodeUnit)
      .join(' | ');
  }
  if (
    ts.isTypeLiteralNode(node) &&
    node.members.length > 0 &&
    node.members.every((member) => ts.isPropertySignature(member))
  ) {
    // A member's text carries its own `;` or `,`, or none when it is last.
    const members = node.members.map(
      (member) => `${collapsed(canonicalText(member)).replace(/[;,]$/, '')};`,
    );
    return `{ ${members.sort(byCodeUnit).join(' ')} }`;
  }
  const source = node.getSourceFile();
  let text = '';
  let at = node.getStart();
  ts.forEachChild(node, (child) => {
    text += sourceSlice(source, at, child.getStart()) + canonicalText(child);
    at = child.end;
  });
  return text + sourceSlice(source, at, node.end);
}

/**
 * The report reads what it claims to: a declaration with comments beside
 * strings that look like them comes out with the comments gone and every
 * string whole. Run on every report and every check, so the reading cannot
 * quietly regress.
 */
function proveDeclarationText() {
  const source = ts.createSourceFile(
    'probe.d.ts',
    [
      'declare const probe: {',
      '  /** A doc comment. */',
      '  readonly verb: "http://adlnet.gov/expapi/verbs/answered"; // a trailing comment',
      "  readonly glob: 'a/*b*/c';",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: TypeScript source text — a template literal type.
      '  /* a block */ readonly path: `x//${string}`;',
      '};',
    ].join('\n'),
    ts.ScriptTarget.ES2022,
    true,
  );
  const [statement] = source.statements;
  const [declaration] = statement.declarationList.declarations;
  const read = declarationText(declaration);
  const expected =
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the declaration's text, template literal type and all.
    'probe: { readonly glob: \'a/*b*/c\'; readonly path: `x//${string}`; readonly verb: "http://adlnet.gov/expapi/verbs/answered"; }';
  if (read !== expected) {
    throw new Error(
      `api-report: a declaration is misread.\n  read:     ${read}\n  expected: ${expected}`,
    );
  }
}
proveDeclarationText();

/**
 * Two declaration bundlers' spellings of one function read the same: an
 * alias or `import("…")`, `export` or not, a trailing comma or none.
 */
function proveBundlerNeutral() {
  const read = (text) => {
    const source = ts.createSourceFile('probe.d.ts', text, ts.ScriptTarget.ES2022, true);
    const declaration = source.statements.find((statement) => ts.isFunctionDeclaration(statement));
    return declarationText(declaration);
  };
  const aliased = read(
    'import * as react_jsx_runtime from "react/jsx-runtime";\ndeclare function f({ a, b, }: P): react_jsx_runtime.JSX.Element;\ninterface P { }',
  );
  const inline = read(
    'export declare function f({ a, b }: P): import("react/jsx-runtime").JSX.Element;\ninterface P {}',
  );
  if (aliased !== inline) {
    throw new Error(`api-report: one declaration reads two ways.\n  ${aliased}\n  ${inline}`);
  }
}
proveBundlerNeutral();

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
