/**
 * Asserts what only exists in the BUILD OUTPUT, and every other check in this
 * repo is blind to:
 *
 * - each entry's ESM and CommonJS builds export the same public surface;
 * - the root entry (contracts) imports no React and carries no `'use client'`,
 *   so a server can validate with it;
 * - every player module starts with `'use client'`, so a React Server
 *   Component tree can render the players.
 *
 * Run after `build` (see the `verify-dist` turbo task).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(PKG_ROOT, 'dist');
const failures = [];

const ENTRIES = {
  index: [
    'PACKAGE_NAME',
    'WHAT_HAPPENS_AI_SPEC',
    'CINE_SCRAMBLE_AI_SPEC',
    'playerEventToXapi',
    'PLAYER_EVENT_XAPI_EXTENSION',
    'resolveAssetUrl',
    'BBB_WEBSITE_SHARE_SANDBOX',
    'BBB_WEBSITE_SHARE_ALLOW',
    'getTemplate',
    'listTemplates',
    'registerInteractiveActivities',
    'registerTemplate',
    'validateInteractiveActivity',
    'validateWhatHappensData',
    'validateCineScrambleData',
    'createWhatHappensDraft',
    'createCineScrambleDraft',
    'checkWhatHappensDraft',
    'checkCineScrambleDraft',
    'answerTextHash',
    'isSafeMediaUrl',
    'matchSupportsInAnswer',
    'WHAT_HAPPENS_CHROME',
    'CINE_SCRAMBLE_CHROME',
    'WHAT_HAPPENS_JSON_SCHEMA',
    'CINE_SCRAMBLE_JSON_SCHEMA',
    'interactiveActivitiesStylesheet',
    'googleFontsCssUrl',
    'parseGoogleFontsCss',
    'localFontFaceCss',
    'listStylePresets',
    'listMotionPresets',
    'listAnimations',
  ],
  player: [
    'InteractiveActivityPlayer',
    'WhatHappensPlayer',
    'CineScramblePlayer',
    'registerTemplatePlayer',
    'postEmbedResize',
    'resolveLayout',
    'MIN_STAGE_SCALE',
  ],
};
const EXPECTED_VALUE = '@intellectif/lk-interactive-activities';
const DIRECTIVE = "'use client';";

for (const [entry, required] of Object.entries(ENTRIES)) {
  for (const file of [`${entry}.js`, `${entry}.cjs`, `${entry}.d.ts`, `${entry}.d.cts`]) {
    try {
      readFileSync(join(DIST, file), 'utf8');
    } catch {
      failures.push(`dist/${file} is missing — did the build run?`);
    }
  }
  const esm = await import(pathToFileURL(join(DIST, `${entry}.js`)).href);
  const cjs = require(join(DIST, `${entry}.cjs`));
  const esmKeys = Object.keys(esm).sort();
  const cjsKeys = Object.keys(cjs).sort();
  if (esmKeys.join() !== cjsKeys.join()) {
    failures.push(`${entry}: ESM and CommonJS export different names.`);
  }
  for (const name of required) {
    if (!esmKeys.includes(name)) failures.push(`${entry} ESM is missing export ${name}.`);
    if (!cjsKeys.includes(name)) failures.push(`${entry} CJS is missing export ${name}.`);
  }
}

const root = await import(pathToFileURL(join(DIST, 'index.js')).href);
if (root.PACKAGE_NAME !== EXPECTED_VALUE) {
  failures.push(
    `PACKAGE_NAME is ${JSON.stringify(root.PACKAGE_NAME)}; expected ${EXPECTED_VALUE}.`,
  );
}

for (const name of readdirSync(DIST)) {
  if (!/\.(js|cjs)$/.test(name)) continue;
  const source = readFileSync(join(DIST, name), 'utf8');
  const isPlayer = name.startsWith('player');
  if (isPlayer && !source.startsWith(DIRECTIVE)) {
    failures.push(`dist/${name} does not start with ${DIRECTIVE}`);
  }
  if (!isPlayer && source.includes(DIRECTIVE)) {
    failures.push(`dist/${name} is a contracts module but carries ${DIRECTIVE}`);
  }
  if (!isPlayer && /from ["']react|require\(["']react|@intellectif\/lk-react/.test(source)) {
    failures.push(`dist/${name} is a contracts module but imports React or lk-react.`);
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
  `verify-dist OK: the contracts (no React) and the 'use client' players each export the same surface from ESM and CommonJS.`,
);
