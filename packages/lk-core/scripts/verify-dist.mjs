/**
 * Asserts that the BUILD OUTPUT exports what the docs promise, and that the
 * security-critical behaviour survives bundling.
 *
 * Every other check in this package reads `src/`. That is not enough: the
 * barrel re-exports through `schemas/index.ts`, which names its exports
 * explicitly, so three schemas added to `schemas/media.ts` compiled, passed
 * lint, passed 495 tests and reached `dist` as unreachable code — the same
 * shape of defect that shipped `createTailwindTheme` nowhere in lk-react.
 *
 * The redaction check runs here rather than only in unit tests for the same
 * reason: `redact()` is the one function whose entire job is to keep an answer
 * key away from a learner, and it is worth proving against the artifact a
 * consumer actually installs.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const failures = [];

/** Everything the READMEs and guides tell a consumer to import from the barrel. */
const REQUIRED_EXPORTS = [
  // scoring + assessment
  'score',
  'evaluate',
  'composeAssessmentScore',
  'gradeFromRubric',
  'outcomeFromGrade',
  'roundGrade',
  // schemas + registry
  'validateActivity',
  'validateItemGroup',
  'jsonSchemaFor',
  'defineActivityType',
  'registerActivityType',
  'MediaSchema',
  'MediaPlaybackSchema',
  'NativeControlHintSchema',
  'RedactedMediaSchema',
  // redaction
  'redact',
  'assertRedacted',
  'redactItemGroup',
  'assertRedactedItemGroup',
  // attempts
  'planAttempt',
  'verifyAttemptPlan',
  'scoredItemsFromPlan',
  'serializeAttemptState',
  'restoreAttemptState',
  'diffResponses',
  // media budget
  'resolvePlaybackPolicy',
  'planMediaBudgets',
  'serializeMediaPlayLedger',
  'restoreMediaPlayLedger',
  'entryKeyOf',
  'slotMediaKey',
  'stimulusMediaKey',
  // xapi
  'xAPIBuilder',
  'XAPIVerb',
  'validateXAPIStatement',
  'xapiDefinitionFor',
];

let core;
try {
  core = require(join(PKG_ROOT, 'dist/index.cjs'));
} catch (error) {
  console.error(`verify-dist FAILED: dist/index.cjs could not be loaded: ${error.message}`);
  process.exit(1);
}

for (const name of REQUIRED_EXPORTS) {
  if (core[name] === undefined) {
    failures.push(`dist/index.cjs does not export ${name}`);
  }
}

// The fail-closed contract, proven against the built artifact: a key nested
// under `media` that no policy classifies must not reach the learner.
const activity = {
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'probe',
  title: 'Probe',
  question: 'Q?',
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  media: { type: 'audio', url: '/a.mp3', alt: 'clip', secretAnswerHint: 'THE ANSWER IS B' },
  options: [
    { id: 'a', text: 'A', isCorrect: true },
    { id: 'b', text: 'B', isCorrect: false },
  ],
};

if (typeof core.redact === 'function') {
  const projection = core.redact(activity);
  if (projection.media?.secretAnswerHint !== undefined) {
    failures.push('redact() forwarded an unclassified key nested under `media` (fail-open)');
  }
  if (projection.options?.[0]?.isCorrect !== undefined) {
    failures.push('redact() forwarded an answer key');
  }
  if (projection.media === activity.media) {
    failures.push('redact() returned the caller’s media object by reference (aliasing)');
  }
}

if (failures.length > 0) {
  console.error('verify-dist FAILED:\n');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(
  `verify-dist OK: ${REQUIRED_EXPORTS.length} documented exports resolve from dist; redaction is fail-closed.`,
);
