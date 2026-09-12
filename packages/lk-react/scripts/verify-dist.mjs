/**
 * Asserts the two properties of this package that only exist in the BUILD
 * OUTPUT, and that every other check in this repo is blind to.
 *
 * Lint, typecheck, the unit tests and `tsc` all read `src/`. They stayed green
 * while the published package was broken in two ways:
 *
 *  1. Every source file declares `'use client'`, but bundling drops
 *     module-level directives ("Module level directives cause errors when
 *     bundled ... was ignored"), so the directive reached 0 of 38 emitted
 *     modules. Importing a component into a React Server Component tree failed
 *     for a package whose README advertises RSC support. `tsup.config.ts`
 *     re-applies it after the build — if that step is removed, replaced with a
 *     banner, or silently stops working, this is what fails.
 *
 *  2. `createTailwindTheme` was implemented, tested and documented in four
 *     places but never re-exported, so it shipped nowhere. A source-level
 *     export test now pins the barrel, but only loading the BUILT module
 *     catches a bundler or exports-map regression.
 *
 * Run after `build` (see the `verify-dist` turbo task).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIRECTIVE = "'use client';";
const PKG_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const DIST = join(PKG_ROOT, 'dist');

/** Files that must carry the directive, and files that must NOT. */
const NEEDS_DIRECTIVE = new Set(['.js', '.cjs', '.mjs']);
const MUST_NOT_HAVE = new Set(['.css', '.map']);

const failures = [];
let checked = 0;

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path);
      continue;
    }
    const rel = relative(PKG_ROOT, path).replace(/\\/g, '/');
    const ext = extname(entry.name);
    // `.d.ts` / `.d.cts` are type declarations, not modules React can gate on.
    const isDeclaration = /\.d\.[cm]?ts$/.test(entry.name);
    const head = readFileSync(path, 'utf8').slice(0, DIRECTIVE.length);

    if (NEEDS_DIRECTIVE.has(ext) && !isDeclaration) {
      checked += 1;
      if (head !== DIRECTIVE) {
        failures.push(`${rel} does not start with ${DIRECTIVE}`);
      }
    } else if (MUST_NOT_HAVE.has(ext) || isDeclaration) {
      if (head === DIRECTIVE) {
        failures.push(`${rel} must NOT start with ${DIRECTIVE}`);
      }
    }
  }
}

walk(DIST);

// An empty or missing dist would make the loop above vacuously pass.
if (checked === 0) {
  failures.push('no emitted JavaScript found in dist/ — did the build run?');
}

// Load the BUILT modules: a source-level export test cannot see a bundler or
// exports-map regression.
const REQUIRED_EXPORTS = {
  'dist/components/ActivityPreview.js': ['ActivityPreview'],
  'dist/theme/ThemeProvider.js': [
    'ThemeProvider',
    'createTailwindTheme',
    'darkTheme',
    'defaultTheme',
    'useTheme',
  ],
  'dist/i18n/LkIntlProvider.js': [
    'DEFAULT_STRINGS',
    'LkIntlProvider',
    'directionForLocale',
    'mergeStrings',
    'useLkDirection',
    'useLkStrings',
  ],
  'dist/index.js': [
    'ActivityPreview',
    'ActivitySequence',
    'DEFAULT_STRINGS',
    'LkIntlProvider',
    'MultipleChoice',
    'createTailwindTheme',
    'useLkStrings',
    'useXAPI',
  ],
};

for (const [rel, expected] of Object.entries(REQUIRED_EXPORTS)) {
  let mod;
  try {
    mod = await import(pathToFileURL(join(PKG_ROOT, rel)).href);
  } catch (error) {
    failures.push(`${rel} could not be imported: ${error.message}`);
    continue;
  }
  for (const name of expected) {
    if (mod[name] === undefined) {
      failures.push(`${rel} does not export ${name}`);
    }
  }
}

/**
 * `docs/i18n.md` documents every translatable string by name and, for the
 * plain ones, by their English default. That table is what a consumer types
 * their translation against, so a key renamed or a default reworded in `src`
 * and not in the doc hands them a key that silently does nothing. Checked
 * against the BUILT dictionary for the same reason as everything else here:
 * what ships is what matters.
 */
const DOC = join(PKG_ROOT, '..', '..', 'docs', 'i18n.md');
let documentedCount = 0;

function leafPaths(source, prefix = '') {
  return Object.entries(source).flatMap(([key, value]) => {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    return typeof value === 'object' && value !== null ? leafPaths(value, path) : [path];
  });
}

try {
  const doc = readFileSync(DOC, 'utf8');
  const section = doc.slice(doc.indexOf('## The full surface'), doc.indexOf('## Exports'));
  if (section === '') {
    throw new Error('could not locate the surface table between its two headings');
  }

  const { DEFAULT_STRINGS } = await import(
    pathToFileURL(join(PKG_ROOT, 'dist/i18n/LkIntlProvider.js')).href
  );
  const actual = leafPaths(DEFAULT_STRINGS);

  // Every row of every table there starts `| \`key\` | …`; a function's key
  // carries its parameter list, which is not part of the path.
  const rows = [...section.matchAll(/^\| `([^`]+)`\s*\|\s*(?:`([^`]*)`)?/gm)];
  const documented = new Map(rows.map(([, key, value]) => [key.replace(/\(.*\)$/, ''), value]));
  documentedCount = documented.size;

  for (const path of actual) {
    if (!documented.has(path)) {
      failures.push(`docs/i18n.md does not document the string ${path}`);
      continue;
    }
    const value = path.split('.').reduce((node, key) => node[key], DEFAULT_STRINGS);
    const shown = documented.get(path);
    // Only the plain strings are pinned. A function's column holds an EXAMPLE
    // of what it returns, which is not a value this can compare against.
    if (typeof value === 'string' && shown !== value) {
      failures.push(
        `docs/i18n.md documents ${path} as ${JSON.stringify(shown)}, not ${JSON.stringify(value)}`,
      );
    }
  }
  for (const path of documented.keys()) {
    if (!actual.includes(path)) {
      failures.push(`docs/i18n.md documents ${path}, which is not in DEFAULT_STRINGS`);
    }
  }
} catch (error) {
  failures.push(`docs/i18n.md could not be checked: ${error.message}`);
}

if (failures.length > 0) {
  console.error('verify-dist FAILED:\n');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(
  `verify-dist OK: ${checked} emitted modules carry ${DIRECTIVE}; built exports resolve; ` +
    `docs/i18n.md matches all ${documentedCount} shipped strings.`,
);
