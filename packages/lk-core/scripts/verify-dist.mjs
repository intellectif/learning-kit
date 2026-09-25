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
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
  // dictation
  'alignDictation',
  'diffDictationChars',
  'dictationReferenceWords',
  'DICTATION_MAX_TEXT_LENGTH',
  'DICTATION_MAX_TRANSCRIPT_LENGTH',
  'DICTATION_MAX_EQUIVALENCE_LENGTH',
  'DICTATION_MAX_EQUIVALENCES',
  'DICTATION_MAX_ACCEPTED_TRANSCRIPTS',
  // read-aloud + speech
  'validateSpeechAssessment',
  'alignReadAloud',
  'gradeReadAloud',
  'inspectWav',
  'outcomeFromUnscorable',
  'READ_ALOUD_MAX_REFERENCE_LENGTH',
  'READ_ALOUD_MAX_SECONDS',
  'READ_ALOUD_MAX_TAKES',
  'READ_ALOUD_MAX_DIMENSION_WEIGHT',
  'SPEECH_ASSESSMENT_MAX_WORDS',
  // schemas + registry
  'validateActivity',
  'validateItemGroup',
  'validateDraft',
  'createDraft',
  'validateItemGroupDraft',
  'createItemGroupDraft',
  // interactive video (an item group with a timeline)
  'createInteractiveVideoDraft',
  'readMediaProgress',
  'composeTimelineScore',
  'INTERACTIVE_VIDEO_ITEM_TYPES',
  'isInteractiveVideoItemType',
  'TIMELINE_MAX_QUIZZES',
  'TIMELINE_MAX_ITEMS',
  'TIMELINE_MAX_CHAPTERS',
  'TIMELINE_MAX_TITLE_LENGTH',
  'jsonSchemaFor',
  'validateMedia',
  'validateOptionMedia',
  'defineActivityType',
  'registerActivityType',
  'dictationType',
  'gapSelectType',
  'readAloudType',
  'dictationJsonSchema',
  'readAloudJsonSchema',
  // redaction
  'redact',
  'assertRedacted',
  'redactItemGroup',
  'assertRedactedItemGroup',
  // delivery policies
  'resolveDeliveryPolicy',
  'validateDeliveryPolicy',
  'combineDeliveryPolicies',
  'OPEN_DELIVERY_POLICY',
  // feedback on writing
  'aiWritingFeedbackRequest',
  'checkAiWritingFeedback',
  'AI_WRITING_MAX_CORRECTIONS',
  'AI_WRITING_MAX_FIELD_LENGTH',
  // coaching on a read-aloud
  'aiCoachingRequest',
  'checkAiCoaching',
  'AI_COACHING_MAX_WORDS',
  'AI_COACHING_MAX_TIP_LENGTH',
  // item scoring policies: tries and hint costs
  'resolveItemScoringPolicy',
  'validateItemScoringPolicy',
  'scoreTries',
  'evaluateTries',
  'DEFAULT_ITEM_SCORING_POLICY',
  'ITEM_SCORING_MAX_RETRIES',
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

// No validation library is part of the public API (1.0): no entry point hands
// out one of its schema objects, and no published type names one. Checked on
// the build, because a re-export or an inferred type is exactly what slips
// through a source review — the zod objects were public until 1.0 for that
// reason. A registered type's schema is a Standard Schema; see
// `src/standard-schema.ts`.
const ENTRIES = ['index', 'schemas', 'scoring', 'xapi', 'ai-check'];
for (const entry of ENTRIES) {
  const module = await import(pathToFileURL(join(PKG_ROOT, 'dist', `${entry}.js`)).href);
  for (const [name, value] of Object.entries(module)) {
    if (value !== null && typeof value === 'object' && '_zod' in value) {
      failures.push(`dist/${entry}.js exports ${name}, a zod schema`);
    }
  }
}
for (const file of readdirSync(join(PKG_ROOT, 'dist'))) {
  if (!/\.d\.c?ts$/.test(file)) {
    continue;
  }
  // An import of zod, or a type from it. A comment that mentions zod is not a
  // dependency.
  const declarations = readFileSync(join(PKG_ROOT, 'dist', file), 'utf8');
  if (
    /(?:from|import)\s*['"]zod(?:\/[^'"]*)?['"]|\bz\.(?:Zod|core|infer|input|output)\b/.test(
      declarations,
    )
  ) {
    failures.push(`dist/${file} names zod: a published type depends on the validation library`);
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

// The draft contract, proven against the built artifact. A new draft must come
// back `incomplete`: never `complete`, which would let an unwritten question
// pass for a finished one, and never `invalid`, which is the failure the
// contract exists to remove. And the result must carry no `success` field,
// whose truthiness an editor could test instead of `status`.
if (typeof core.createDraft === 'function' && typeof core.validateDraft === 'function') {
  let issued = 0;
  const newId = () => {
    issued += 1;
    return `probe-${issued}`;
  };
  for (const type of [
    'multiple-choice',
    'fill-in-the-blanks',
    'written-response',
    'gap-select',
    'dictation',
    'read-aloud',
  ]) {
    const draft = core.createDraft(type, { newId });
    const { status } = core.validateDraft(type, draft);
    if (status !== 'incomplete') {
      failures.push(`validateDraft(createDraft('${type}')) is "${status}", not "incomplete"`);
    }
    if (core.validateActivity(type, draft).success) {
      failures.push(`validateActivity accepted an unwritten ${type} draft`);
    }
  }
  if ('success' in core.validateDraft('multiple-choice', activity)) {
    failures.push('validateDraft results carry a `success` field');
  }
}

// The delivery policy's reading, proven against the built artifact for the
// reason redaction is: its one job is to keep something from a learner, and it
// does that only if a setting nobody can read restricts rather than allows. A
// plan made without a policy must also stay the plan it was, fingerprint and
// all, or every stored attempt would stop matching its own answers.
if (typeof core.resolveDeliveryPolicy === 'function' && typeof core.planAttempt === 'function') {
  const unreadable = core.resolveDeliveryPolicy({ hints: 'false', ai: { explanations: 0 } });
  if (unreadable.hints !== false || unreadable.ai.explanations !== false) {
    failures.push(
      'resolveDeliveryPolicy() read an unreadable restriction as permission (fail-open)',
    );
  }
  const empty = core.resolveDeliveryPolicy({});
  if (
    ![empty.feedback, empty.solutions, empty.hints, empty.ai.hints, empty.ai.explanations].every(
      Boolean,
    )
  ) {
    failures.push(
      'resolveDeliveryPolicy({}) restricted something: an empty policy must be no policy',
    );
  }
  const without = core.planAttempt([activity]);
  if (Object.hasOwn(without, 'delivery')) {
    failures.push('planAttempt() recorded a delivery policy nobody gave it');
  }
  const sat = core.planAttempt([activity], { delivery: { hints: false } });
  if (sat.delivery?.hints !== false || sat.planHash === without.planHash) {
    failures.push(
      'planAttempt() did not record the delivery policy in the plan and its fingerprint',
    );
  }
}

// A scoring policy moves grades, so the build must refuse one it cannot read
// rather than guess — there is no safe way round, unlike a delivery policy —
// and must change nothing at all without one: not a score, not a plan.
if (typeof core.resolveItemScoringPolicy === 'function' && typeof core.evaluate === 'function') {
  let refused = false;
  try {
    core.resolveItemScoringPolicy({ hintPenalty: '0.1' });
  } catch (error) {
    refused = error instanceof RangeError;
  }
  if (!refused) {
    failures.push('resolveItemScoringPolicy() read an unreadable cost instead of refusing it');
  }
  const answer = { type: 'multiple-choice', selectedOptionIds: ['a'], hintsRevealed: 2 };
  const before = JSON.stringify(core.evaluate(activity, answer));
  if (JSON.stringify(core.evaluate(activity, answer, { scoring: {} })) !== before) {
    failures.push('evaluate() with an empty scoring policy changed the outcome');
  }
  if (core.evaluate(activity, answer, { scoring: { hintPenalty: 0.1 } }).score !== 0.8) {
    failures.push('evaluate() did not charge two hints at a tenth each');
  }
  const unplanned = core.planAttempt([activity]);
  if (Object.hasOwn(unplanned, 'scoring')) {
    failures.push('planAttempt() recorded a scoring policy nobody gave it');
  }
  // Two policies, two fingerprints: the policy is hashed, not only its presence.
  const priced = core.planAttempt([activity], { scoring: { hintPenalty: 0.1 } }).planHash;
  if (
    priced === unplanned.planHash ||
    priced === core.planAttempt([activity], { scoring: { hintPenalty: 0.2 } }).planHash
  ) {
    failures.push('planAttempt() left a scoring policy out of the plan fingerprint');
  }
}

// The scoring subpath is built from its own entry, so the barrel check above
// cannot see it drop the functions a server that scores practice imports.
const scoringEntry = await import(pathToFileURL(join(PKG_ROOT, 'dist', 'scoring.js')).href);
for (const name of ['evaluate', 'evaluateTries', 'scoreTries', 'resolveItemScoringPolicy']) {
  if (typeof scoringEntry[name] !== 'function') {
    failures.push(`@intellectif/lk-core/scoring does not export ${name}`);
  }
}

// Writing feedback is the one AI check no other library can run: a correction
// must quote words the learner wrote. From the build, a quote the draft holds
// is anchored where it sits, and one it does not refuses the whole reply.
if (typeof core.aiWritingFeedbackRequest === 'function') {
  const essay = {
    schemaVersion: '1.0',
    type: 'written-response',
    id: 'probe-essay',
    title: 'Probe',
    prompt: 'Write.',
    minWords: 1,
    maxWords: 50,
  };
  const request = core.aiWritingFeedbackRequest({
    data: essay,
    response: { type: 'written-response', text: 'Yesterday I goed home.', wordCount: 4 },
  });
  const anchored = core.checkAiWritingFeedback(
    { text: 'Past tense.', corrections: [{ original: 'goed', corrected: 'went' }] },
    request,
  );
  if (!anchored.ok || anchored.feedback.corrections[0]?.range?.start !== 12) {
    failures.push('checkAiWritingFeedback() did not anchor a correction the draft holds');
  }
  const invented = core.checkAiWritingFeedback(
    { text: 'Past tense.', corrections: [{ original: 'buyed', corrected: 'bought' }] },
    request,
  );
  if (invented.ok || invented.refusal !== 'misquotes-answer') {
    failures.push('checkAiWritingFeedback() showed a correction of words nobody wrote');
  }
}

// Coaching runs the matching check on the engine's marks: a word coached must
// be one the engine marked, and a sound named one it reported. From the build,
// coaching on the mispronounced word and its reported sound is shown, and
// coaching on a word read correctly, or on a sound nobody reported, refuses the
// whole reply.
if (typeof core.aiCoachingRequest === 'function') {
  const item = {
    schemaVersion: '1.0',
    type: 'read-aloud',
    id: 'probe-reading',
    title: 'Probe',
    referenceText: 'the cat',
    locale: 'en-US',
    recording: { maxSeconds: 10 },
    scoring: { dimensions: [{ name: 'accuracy', weight: 1 }] },
  };
  const request = core.aiCoachingRequest({
    data: item,
    assessment: {
      assessmentVersion: '1.0',
      status: 'assessed',
      task: 'scripted',
      locale: 'en-US',
      referenceText: 'the cat',
      recordingKey: 'probe-take',
      assessor: { kind: 'auto' },
      scale: 100,
      scores: { accuracy: 60 },
      miscue: 'assessor',
      phonemeAlphabet: 'ipa',
      words: [
        { text: 'the', error: 'none', accuracy: 95 },
        {
          text: 'cat',
          error: 'mispronunciation',
          accuracy: 30,
          phonemes: [{ symbol: 'æ', accuracy: 20, heardAs: [{ symbol: 'ɛ', score: 70 }] }],
        },
      ],
    },
  });
  const coached =
    request &&
    core.checkAiCoaching(
      {
        text: 'The vowel.',
        words: [{ itemId: 'w2', tip: 'Open wider.', sound: { expected: 'æ', heard: 'ɛ' } }],
      },
      request,
    );
  if (!coached?.ok || coached.coaching.words[0]?.word !== 'cat') {
    failures.push('checkAiCoaching() did not show coaching on a word the engine marked');
  }
  for (const words of [
    [{ itemId: 'w1', tip: 'Say it clearly.' }],
    [{ itemId: 'w2', tip: 'The consonant.', sound: { expected: 'ʃ' } }],
  ]) {
    const refused = request && core.checkAiCoaching({ text: 'Tips.', words }, request);
    if (refused?.ok !== false || refused.refusal !== 'contradicts-marks') {
      failures.push('checkAiCoaching() showed coaching on marks the engine did not make');
    }
  }
}

// The AI test kit is a subpath of its own, and a subpath is exactly what the
// barrel check above cannot see: it is built from its own entry, so a rename
// or a dropped re-export reaches a consumer's CI rather than ours. It also has
// to WORK from the build — a kit that cannot run its own cases is worth
// nothing — so it is exercised here against a port that answers well and a
// port that gives the answer away.
const aiCheck = await import(pathToFileURL(join(PKG_ROOT, 'dist', 'ai-check.js')).href);
for (const name of ['aiCheckCases', 'runAiCheck', 'formatAiCheckReport']) {
  if (typeof aiCheck[name] !== 'function') {
    failures.push(`dist/ai-check.js does not export ${name}()`);
  }
}
if (typeof aiCheck.runAiCheck === 'function') {
  const cases = aiCheck.aiCheckCases();
  if (cases.length === 0) {
    failures.push('dist/ai-check.js ships no cases, so a prompt run would pass vacuously');
  }
  const good = await aiCheck.runAiCheck({
    explain: (request) => ({
      verdict: request.grade.category,
      text: 'A sentence with no answer in it.',
    }),
    hint: () => ({ text: 'Think about the verb again.' }),
    // Quotes the draft's own first word, as a careful prompt does.
    writingFeedback: (request) => {
      const first = request.facts.text.split(' ')[0];
      return { text: 'A clear start.', corrections: [{ original: first, corrected: `${first}!` }] };
    },
    // Coaches only the words the engine marked, as a careful prompt does.
    pronunciationCoaching: (request) => ({
      text: 'A steady reading.',
      words: request.facts.words
        .filter((word) => word.state === 'mispronounced' || word.state === 'omitted')
        .map((word) => ({ itemId: word.itemId, tip: `Practise "${word.word}".` })),
    }),
  });
  if (good.shown !== cases.length || good.refused !== 0 || good.errors !== 0) {
    failures.push(
      `dist/ai-check.js refused a well-behaved port: ${good.shown}/${good.total} shown, ` +
        `${good.refused} refused, ${good.errors} failed`,
    );
  }
  // Against the cases whose answer this hint actually gives away — the ones
  // about the city — every call must be refused.
  const cityHints = cases.filter((one) => one.id.startsWith('mc-hint'));
  const leaking = await aiCheck.runAiCheck(
    { hint: () => ({ text: 'The answer is Madrid.' }) },
    { cases: cityHints },
  );
  const caught = leaking.byRefusal['reveals-answer'];
  if (cityHints.length === 0 || caught !== leaking.total || leaking.shown !== 0) {
    failures.push(
      'dist/ai-check.js did not refuse a hint that gives the answer away: ' +
        `${leaking.shown} shown, ${caught} of ${leaking.total} caught`,
    );
  }
}

// The grade-stability corpus, replayed against BOTH builds a consumer can
// install. The standing rule is that nothing which can change a historical
// grade ships outside a major. The unit suite asserts scoring numbers too,
// but against source, and those assertions are edited alongside the code
// they test; nothing froze them independently, and nothing checked them
// against the BUILT package. CJS and ESM are both replayed because a
// divergence between them would grade one way under `require` and another
// under `import`.

const corpus = JSON.parse(readFileSync(join(PKG_ROOT, 'vectors', 'scoring.json'), 'utf8'));
const { replay } = await import(pathToFileURL(join(PKG_ROOT, 'vectors', 'replay.mjs')).href);
const esm = await import(pathToFileURL(join(PKG_ROOT, 'dist', 'index.js')).href);
if (!Array.isArray(corpus.vectors) || corpus.vectors.length === 0) {
  failures.push('vectors/scoring.json holds no vectors, so the grade gate would pass vacuously');
}
for (const [label, build] of [
  ['dist/index.cjs', core],
  ['dist/index.js', esm],
]) {
  for (const result of replay(build, corpus)) {
    if (!result.ok) {
      failures.push(
        `${label}: grade vector ${result.id} changed${result.note ? ` (${result.note})` : ''}` +
          ` | expected ${result.expected} | actual ${result.actual}`,
      );
    }
  }
}

// The validation corpus, against the built package for the same reason: what
// each validator accepts and refuses, and the path and code of each error, is
// what 1.x promises not to change outside a major. The validation library is
// pinned, so the build this replays is the one a consumer installs.
const validationCorpus = JSON.parse(
  readFileSync(join(PKG_ROOT, 'vectors', 'validation.json'), 'utf8'),
);
const { replayValidation } = await import(
  pathToFileURL(join(PKG_ROOT, 'vectors', 'validation.mjs')).href
);
const validationCount = Object.keys(validationCorpus.expect ?? {}).length;
if (validationCount === 0) {
  failures.push('vectors/validation.json holds no expectations, so the gate would pass vacuously');
}
for (const [label, build] of [
  ['dist/index.cjs', core],
  ['dist/index.js', esm],
]) {
  const changed = replayValidation(build, validationCorpus).filter((result) => !result.ok);
  for (const result of changed.slice(0, 20)) {
    failures.push(
      `${label}: validation ${result.id} changed | expected ${JSON.stringify(result.expected)} | actual ${JSON.stringify(result.actual)}`,
    );
  }
  if (changed.length > 20) {
    failures.push(`${label}: …and ${changed.length - 20} more validation changes`);
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
  `verify-dist OK: ${REQUIRED_EXPORTS.length} documented exports resolve from dist; redaction is fail-closed; ` +
    'new drafts are incomplete; an unreadable delivery setting restricts; an unreadable scoring setting is refused; a writing correction must quote the draft; coaching keeps to the marks the engine made; ' +
    'the AI check kit runs from its own subpath; ' +
    'no entry point exports a zod schema and no published type names zod; ' +
    `${corpus.vectors.length} grade vectors and ${validationCount} validation expectations replay identically against CJS and ESM.`,
);
