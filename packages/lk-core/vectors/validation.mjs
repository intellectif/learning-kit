/**
 * The validation corpus: what lk-core 1.x promises about validation, frozen as
 * data (see docs/stability.md). For thousands of inputs — every field of a set
 * of seed items removed, `null`, of the wrong type, a string at or past a
 * limit, a list with a hole or too many entries — it records whether each
 * validator accepts, and for a refusal the `path` and `code` of every error.
 * Messages and the order of errors are not promised, so they are not frozen.
 *
 * The inputs are not stored: they are rebuilt from the seeds in
 * `validation.json` by the rules below, so the corpus stays small however long
 * the strings it tries. Changing those rules changes every id they produce, and
 * the replay then reports the old ids as missing — so they do not change.
 *
 * lk-core pins its validation library exactly, and a new version of it ships
 * only once this corpus replays unchanged. If you override that pin — for a
 * security fix, say — replay it against your install; `vectors/README.md`
 * shows how. Run it with `NODE_ENV` other than `production`, where
 * `validateXAPIStatement` only warns.
 */

/** The encoding of `validation.json`. A replay refuses a corpus written in another. */
export const VALIDATION_CORPUS_VERSION = 1;

const EMOJI = String.fromCodePoint(0x1f600);

/**
 * The values each field is set to. Strings sit at and past the limits the
 * schemas draw — 64 UTF-16 units (64 letters, 32 emoji) and past it (70
 * letters, 40 emoji); 8000 (4000 emoji) and past it (4001 emoji, 8001 letters)
 * — and the emoji ones are where counting UTF-16 units and counting code points
 * disagree.
 */
const VALUES = [
  ['null', null],
  ['undefined', undefined],
  ['number', 5],
  ['empty', ''],
  ['array', []],
  ['object', {}],
  ['array-null', [null]],
  ['array-hole', [undefined]],
  ['true', true],
  ['text-64', 'x'.repeat(64)],
  ['text-70', 'x'.repeat(70)],
  ['emoji-32', EMOJI.repeat(32)],
  ['emoji-40', EMOJI.repeat(40)],
  ['emoji-4000', EMOJI.repeat(4000)],
  ['emoji-4001', EMOJI.repeat(4001)],
  ['text-8001', 'y'.repeat(8001)],
];

/** The values an entry of a list, or a field one level down, is set to. */
const INNER = [
  ['null', null],
  ['undefined', undefined],
  ['number', 5],
  ['emoji-40', EMOJI.repeat(40)],
  ['text-300', 'z'.repeat(300)],
];

/** Every variant of `seed`, each with a stable label. */
function variants(seed) {
  const out = [
    ['seed', seed],
    ['extra-key', { ...seed, zzz: 1 }],
  ];
  for (const key of Object.keys(seed)) {
    const without = { ...seed };
    delete without[key];
    out.push([`${key}=deleted`, without]);
    for (const [label, value] of VALUES) {
      out.push([`${key}=${label}`, { ...seed, [key]: value }]);
    }
    const current = seed[key];
    if (Array.isArray(current) && current.length > 0) {
      const [first] = current;
      if (first !== null && typeof first === 'object' && !Array.isArray(first)) {
        for (const inner of Object.keys(first)) {
          for (const [label, value] of INNER) {
            out.push([
              `${key}[0].${inner}=${label}`,
              { ...seed, [key]: [{ ...first, [inner]: value }, ...current.slice(1)] },
            ]);
          }
        }
      }
      out.push([`${key}+null`, { ...seed, [key]: [...current, null] }]);
      out.push([`${key}x30`, { ...seed, [key]: Array.from({ length: 30 }, () => first) }]);
    } else if (current !== null && typeof current === 'object') {
      for (const inner of Object.keys(current)) {
        for (const [label, value] of INNER) {
          out.push([
            `${key}.${inner}=${label}`,
            { ...seed, [key]: { ...current, [inner]: value } },
          ]);
        }
      }
    }
  }
  return out;
}

const errorsOf = (errors) => errors.map((error) => `${error.path.join('.')}|${error.code}`).sort();

const issuesOf = (result) => [
  result.status,
  ...result.issues.map((issue) => `${issue.path.join('.')}|${issue.code}|${issue.severity}`).sort(),
];

const validation = (result) => (result.success ? true : errorsOf(result.errors));

/** What a validator does with one input: its verdict, codes and paths, or what it threw. */
function outcome(run) {
  try {
    return run();
  } catch (error) {
    return Array.isArray(error?.errors)
      ? errorsOf(error.errors)
      : `throws ${error?.constructor?.name ?? typeof error}`;
  }
}

/** The calls the corpus makes: `{ id, run(core) }`, rebuilt from its seeds. */
export function validationCases(seeds) {
  const cases = [];
  const add = (id, run) => cases.push({ id, run });
  for (const [name, item] of Object.entries(seeds.activities)) {
    for (const [label, input] of variants(item)) {
      add(`validateActivity|${name}|${label}`, (core) =>
        validation(core.validateActivity(item.type, input)),
      );
      add(`validateDraft|${name}|${label}`, (core) =>
        issuesOf(core.validateDraft(item.type, input)),
      );
    }
  }
  for (const [label, input] of variants(seeds.itemGroup)) {
    add(`validateItemGroup|${label}`, (core) => validation(core.validateItemGroup(input)));
    add(`validateItemGroupDraft|${label}`, (core) => issuesOf(core.validateItemGroupDraft(input)));
  }
  for (const [name, assessment] of Object.entries(seeds.assessments)) {
    for (const [label, input] of variants(assessment)) {
      add(`validateSpeechAssessment|${name}|${label}`, (core) =>
        validation(core.validateSpeechAssessment(input)),
      );
    }
  }
  for (const [name, media] of Object.entries(seeds.media)) {
    for (const [label, input] of variants(media)) {
      add(`validateMedia|${name}|${label}`, (core) => validation(core.validateMedia(input)));
      add(`validateOptionMedia|${name}|${label}`, (core) =>
        validation(core.validateOptionMedia(input)),
      );
    }
  }
  for (const [label, input] of variants(seeds.xapiStatement)) {
    add(`validateXAPIStatement|${label}`, (core) => {
      core.validateXAPIStatement(input);
      return true;
    });
  }
  return cases.map(({ id, run }) => ({ id, run: (core) => outcome(() => run(core)) }));
}

/**
 * Replays `corpus` against `core` — lk-core's module, or its CommonJS export.
 * One result per frozen expectation and per case with none, `ok` when they
 * agree.
 */
export function replayValidation(core, corpus) {
  if (corpus.corpusVersion !== VALIDATION_CORPUS_VERSION) {
    throw new Error(
      `validation corpus version ${corpus.corpusVersion} is not ${VALIDATION_CORPUS_VERSION}: replay it with the validation.mjs shipped beside it`,
    );
  }
  const results = [];
  const seen = new Set();
  for (const { id, run } of validationCases(corpus.seeds)) {
    seen.add(id);
    const actual = run(core);
    const expected = corpus.expect[id];
    results.push({
      id,
      ok: expected !== undefined && JSON.stringify(actual) === JSON.stringify(expected),
      expected,
      actual,
    });
  }
  for (const id of Object.keys(corpus.expect)) {
    if (!seen.has(id)) {
      results.push({ id, ok: false, expected: corpus.expect[id], actual: undefined });
    }
  }
  return results;
}
