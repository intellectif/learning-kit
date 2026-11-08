/**
 * Asserts the two properties of this package that only exist in the BUILD
 * OUTPUT, and that every other check in this repo is blind to: the ESM and
 * CommonJS builds must each export the same public surface.
 *
 * Run after `build` (see the `verify-dist` turbo task).
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

const EXPECTED_EXPORTS = 'PACKAGE_NAME';
const EXPECTED_VALUE = '@intellectif/lk-interactive-activities';

const esm = await import(pathToFileURL(join(PKG_ROOT, 'dist', 'index.js')).href);
const cjs = require(join(PKG_ROOT, 'dist', 'index.cjs'));

for (const [format, module] of [
  ['ESM', esm],
  ['CJS', cjs],
]) {
  const exported = Object.keys(module).sort().join(', ');
  if (exported !== EXPECTED_EXPORTS) {
    failures.push(`${format} exports ${exported || 'nothing'}; expected ${EXPECTED_EXPORTS}.`);
  }
  if (module.PACKAGE_NAME !== EXPECTED_VALUE) {
    failures.push(
      `${format} PACKAGE_NAME is ${JSON.stringify(module.PACKAGE_NAME)}; expected ${JSON.stringify(EXPECTED_VALUE)}.`,
    );
  }
}

for (const file of ['index.js', 'index.cjs', 'index.d.ts', 'index.d.cts']) {
  try {
    readFileSync(join(PKG_ROOT, 'dist', file), 'utf8');
  } catch {
    failures.push(`dist/${file} is missing — did the build run?`);
  }
}

if (failures.length > 0) {
  console.error(`verify-dist FAILED (${failures.length}):`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(`verify-dist OK: ESM and CommonJS export PACKAGE_NAME as ${EXPECTED_VALUE}.`);
