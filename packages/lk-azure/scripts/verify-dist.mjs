/**
 * Runs the BUILD OUTPUT, as a host installs it, over real captured responses.
 *
 * The tests read `src/`. This reads `dist/`: the ESM and the CommonJS build
 * must each export the converter and give the same assessment, and neither may
 * carry its own copy of lk-core. The assessment a host grades has to be
 * checked by the lk-core the host grades with, and a bundled copy would check
 * it against whatever lk-core this package was built beside.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = join(PKG_ROOT, 'src', '__tests__', 'fixtures');
const failures = [];

const esm = await import(pathToFileURL(join(PKG_ROOT, 'dist', 'index.js')).href);
const cjs = require(join(PKG_ROOT, 'dist', 'index.cjs'));

for (const [format, module] of [
  ['ESM', esm],
  ['CJS', cjs],
]) {
  const exported = Object.keys(module).sort().join(', ');
  if (exported !== 'assessmentFromAzure') {
    failures.push(`${format} exports ${exported || 'nothing'}; expected assessmentFromAzure.`);
  }
}

/** What each capture must read as, from either build. */
const EXPECT = {
  'prod-en-us-clean': { ok: true, status: 'assessed', miscue: 'assessor' },
  'prod-noise': { ok: true, status: 'no_speech', miscue: 'none' },
  'prod-en-us-continuous-segments': { ok: true, status: 'assessed', miscue: 'none' },
  'rest-en-us-omission': { ok: true, status: 'assessed', miscue: 'assessor' },
  'rest-en-us-fivepoint': { ok: false, code: 'five_point_scale' },
};

for (const [name, expected] of Object.entries(EXPECT)) {
  const capture = JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8'));
  const { locale, referenceText, miscue, gradingSystem, phonemeAlphabet } = capture.request;
  const request = {
    locale,
    referenceText,
    recordingKey: 'take-1.wav',
    miscue,
    gradingSystem,
    ...(phonemeAlphabet !== undefined ? { phonemeAlphabet } : {}),
  };
  const fromEsm = esm.assessmentFromAzure(capture.results, request);
  const fromCjs = cjs.assessmentFromAzure(capture.results, request);
  if (JSON.stringify(fromEsm) !== JSON.stringify(fromCjs)) {
    failures.push(`${name}: the ESM and CommonJS builds give different results.`);
  }
  const got = fromEsm.ok
    ? { ok: true, status: fromEsm.assessment.status, miscue: fromEsm.assessment.miscue }
    : { ok: false, code: fromEsm.code };
  if (JSON.stringify(got) !== JSON.stringify(expected)) {
    failures.push(`${name}: read as ${JSON.stringify(got)}; expected ${JSON.stringify(expected)}.`);
  }
}

for (const file of ['index.js', 'index.cjs', 'index.d.ts', 'index.d.cts']) {
  const text = readFileSync(join(PKG_ROOT, 'dist', file), 'utf8');
  if (!text.includes('@intellectif/lk-core')) {
    failures.push(`dist/${file} does not import lk-core: is it bundled?`);
  }
  if (/\bzod\b/.test(text) || /function validateSpeechAssessment/.test(text)) {
    failures.push(`dist/${file} carries lk-core's own code.`);
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
  `verify-dist OK: ESM and CommonJS export assessmentFromAzure, agree on ${Object.keys(EXPECT).length} captures, and import lk-core rather than carry it.`,
);
