/**
 * Checks that every import a document shows from this repository's packages
 * would work: the entry point is one the package exports, and every name
 * imported from it is one that entry point exports.
 *
 * A guide's example is copied before it is read, so an import that does not
 * resolve is the first thing a reader meets — and nothing else caught one: the
 * link check does not read code, and `api-check` does not read the guides. The
 * names are read from the committed API reports (`packages/*\/api/surface.md`),
 * which `api-check` keeps equal to the build, so this needs no build.
 *
 * Covers `import … from '@intellectif/lk-…'` in the fenced code of every
 * Markdown file git tracks or would track, changelogs aside: a changelog
 * records what was true at its release.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = ['packages/lk-core', 'packages/lk-react'];

/** Each entry point a consumer can import, e.g. `@intellectif/lk-core/xapi`, and what it exports. */
const exportsOf = new Map();
for (const dir of PACKAGES) {
  const report = readFileSync(join(ROOT, dir, 'api', 'surface.md'), 'utf8');
  let names;
  for (const line of report.split('\n')) {
    const heading = /^## (@intellectif\/\S+)$/.exec(line);
    if (heading) {
      names = new Set();
      exportsOf.set(heading[1], names);
      continue;
    }
    const symbol = /^(?:class|const|enum|function|interface|type|value) ([A-Za-z_$][\w$]*):/.exec(
      line,
    );
    if (symbol && names !== undefined) {
      names.add(symbol[1]);
    }
  }
}

const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '*.md', '**/*.md'],
  { cwd: ROOT, encoding: 'utf8' },
)
  .split('\n')
  .map((line) => line.trim())
  .filter(
    (line) => line !== '' && !line.includes('CHANGELOG.md') && !line.endsWith('api/surface.md'),
  );

const IMPORT =
  /import\s+(type\s+)?(\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+['"](@intellectif\/lk-[^'"]+)['"]/g;

const failures = [];
let checked = 0;
for (const file of files) {
  const text = readFileSync(join(ROOT, file), 'utf8');
  for (const [block] of text.matchAll(/```[^\n]*\n[\s\S]*?```/g)) {
    for (const match of block.matchAll(IMPORT)) {
      const [, , clause, specifier] = match;
      const line = text.slice(0, text.indexOf(block) + match.index).split('\n').length;
      checked += 1;
      const names = exportsOf.get(specifier);
      if (names === undefined) {
        failures.push(`${file}:${line} imports from '${specifier}', which is not an entry point`);
        continue;
      }
      if (!clause.startsWith('{')) {
        continue;
      }
      // An import's braces hold only names, so a comment in them is plain to cut.
      const list = clause
        .slice(1, -1)
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, ' ');
      for (const part of list.split(',')) {
        const name = part
          .trim()
          .replace(/^type\s+/, '')
          .split(/\s+as\s+/)[0]
          .trim();
        if (name !== '' && !names.has(name)) {
          failures.push(
            `${file}:${line} imports ${name} from '${specifier}', which does not export it`,
          );
        }
      }
    }
  }
}

if (checked === 0) {
  failures.push(
    'no imports from @intellectif packages found in any document: is the pattern stale?',
  );
}
if (failures.length > 0) {
  console.error(`check-doc-imports FAILED:\n\n  - ${failures.join('\n  - ')}`);
  process.exit(1);
}
console.log(
  `check-doc-imports OK: ${checked} imports in the documents name real entry points and real exports.`,
);
