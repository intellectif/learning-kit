/**
 * Asserts that the root README's Packages table names exactly the packages
 * this repository has.
 *
 * It exists because the same drift has now happened twice, and neither time
 * did anything here notice. `lk-server` was deleted in the v0.5 line and
 * `lk-ai` in the 0.19.0 line, and each left a row in the table on the npm and
 * GitHub landing page advertising a package nobody could install — the second
 * one found by an external review, one commit before it would have shipped.
 *
 * Every other gate in this repo reads code. This one reads the first thing a
 * consumer does.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

/** The workspace's packages, by their published name. */
const onDisk = new Set();
for (const entry of readdirSync(join(ROOT, 'packages'), { withFileTypes: true })) {
  if (!entry.isDirectory()) {
    continue;
  }
  const manifest = JSON.parse(
    readFileSync(join(ROOT, 'packages', entry.name, 'package.json'), 'utf8'),
  );
  if (manifest.private === true) {
    continue;
  }
  onDisk.add(manifest.name);
}

/**
 * Every `@intellectif/lk-*` the README's Packages table names. The table ends
 * at the next heading; a mention anywhere else in the README is prose, not a
 * promise that a package exists.
 */
const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
const heading = readme.indexOf('\n## Packages');
if (heading === -1) {
  failures.push('README.md has no "## Packages" section');
}
const after = readme.slice(heading + 1);
const table = after.slice(0, after.indexOf('\n## ', 1));
const named = new Set();
for (const row of table.split('\n')) {
  if (!row.startsWith('|')) {
    continue;
  }
  for (const [, name] of row.matchAll(/@intellectif\/(lk-[a-z0-9-]+)/g)) {
    named.add(`@intellectif/${name}`);
  }
}

for (const name of named) {
  if (!onDisk.has(name)) {
    failures.push(
      `README.md's Packages table lists ${name}, which this repository does not publish. ` +
        'Delete the row: it is the first thing a consumer reads.',
    );
  }
}
for (const name of onDisk) {
  if (!named.has(name)) {
    failures.push(`README.md's Packages table does not list ${name}`);
  }
}

if (failures.length > 0) {
  console.error('check-readme-packages FAILED:\n');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(
  `check-readme-packages OK: the Packages table names exactly the ${onDisk.size} packages this repository publishes.`,
);
