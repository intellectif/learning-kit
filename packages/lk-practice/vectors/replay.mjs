/**
 * Replays the policy vectors (`evidence.json`, `stage.json`) against an
 * implementation of the evidence mapper, the Elo ability, the stage policy and
 * the mastery predicate (design 8.2, 8.3, 8.5).
 *
 * Plain ESM with no imports, so the unit tests, `scripts/mutate.mjs` and
 * another implementation can all run it. `impl` is an object holding the
 * functions named in `ENTRY`; `replay(impl, corpus)` returns one line per
 * mismatch, so an empty array is a pass. A float matches at a relative 1e-9
 * (R12.2); integers, strings, booleans and null (including every `due`,
 * `dueCap` and time) match exactly. A call that throws is recorded as
 * `{ "$throws": "<error.name>" }`.
 */

export const CORPUS_VERSION = 1;

/** The source modules (from `src/`) and the functions `impl` must hold. */
export const ENTRY = {
  'config.ts': ['resolveConfig'],
  'evidence/index.ts': ['contextWeight', 'mapEvidence', 'skillOutcomeIssues'],
  'mastery/index.ts': [
    'abilityAt',
    'desiredRetentionFor',
    'eloMasteryModel',
    'isMastered',
    'masteryFailures',
    'skillStatus',
    'updateAbility',
  ],
  'memory/fsrs.ts': ['createFsrsModel'],
  'stage/index.ts': ['createStagePolicy', 'implication'],
};

const TOLERANCE = 1e-9;

/** Where `actual` differs from `expected`; empty when they match. */
export function differences(actual, expected, path = '$') {
  if (typeof expected === 'number' && typeof actual === 'number') {
    if (Number.isInteger(expected) && Number.isInteger(actual)) {
      return actual === expected ? [] : [`${path}: ${actual} !== ${expected}`];
    }
    const scale = Math.max(Math.abs(actual), Math.abs(expected));
    return Math.abs(actual - expected) <= TOLERANCE * scale
      ? []
      : [`${path}: ${actual} differs from ${expected}`];
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      return [`${path}: ${JSON.stringify(actual)} is not ${JSON.stringify(expected)}`];
    }
    return expected.flatMap((value, i) => differences(actual[i], value, `${path}[${i}]`));
  }
  if (expected !== null && typeof expected === 'object') {
    if (actual === null || typeof actual !== 'object' || Array.isArray(actual)) {
      return [`${path}: ${JSON.stringify(actual)} is not an object`];
    }
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
    return keys.flatMap((key) =>
      key in expected && key in actual
        ? differences(actual[key], expected[key], `${path}.${key}`)
        : [`${path}.${key}: present on one side only`],
    );
  }
  return Object.is(actual, expected)
    ? []
    : [`${path}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`];
}

function attempt(run) {
  try {
    return run();
  } catch (error) {
    return { $throws: error?.name ?? 'unknown' };
  }
}

function configOf(impl, input) {
  const result = impl.resolveConfig(input ?? {});
  if (!result.ok) throw new Error(`invalid configuration: ${JSON.stringify(result.issues)}`);
  return result.value;
}

function abilityContext(impl, vector) {
  return {
    model: impl.eloMasteryModel(vector.elo),
    ladder: vector.ladder,
    demand: new Map(Object.entries(vector.demand)),
    stageOffset: vector.stageOffset,
  };
}

/** What identifies a model or policy instance (D26). */
const refOf = (instance) => ({
  id: instance.id,
  version: instance.version,
  params: instance.params,
});

/** Each kind of vector, run to the value it records. */
const RUN = {
  // `customMapper` stands for a configuration naming a host mapper, which JSON cannot hold.
  map: (impl, v) => {
    const config = configOf(impl, v.config);
    const effective = v.customMapper ? { ...config, evidenceOptions: null } : config;
    return attempt(() => impl.mapEvidence(v.evidence, v.task, {}, effective));
  },
  'outcome-issues': (impl, v) => impl.skillOutcomeIssues(v.evidence, v.task, v.graph),
  'context-weight': (impl, v) => {
    const config = configOf(impl, v.config);
    return v.rows.map((context) => impl.contextWeight(context ?? undefined, config));
  },
  elo: (impl, v) => {
    const model = impl.eloMasteryModel(v.options);
    let ability = model.init(v.skill);
    if (v.prior !== undefined) {
      const prior = attempt(() => model.prior(ability, ...v.prior));
      if (prior.$throws !== undefined) return prior;
      ability = prior;
    }
    const steps = v.steps.map((observation) => {
      const next = attempt(() => model.update(ability, observation));
      if (next.$throws !== undefined) return next;
      ability = next;
      return {
        ability: model.serialize(ability),
        estimate: model.estimate(ability),
        expectedSuccess: model.expectedSuccess(ability, observation.difficulty),
      };
    });
    return { ref: refOf(model), steps };
  },
  'elo-options': (impl, v) =>
    v.rows.map((options) => attempt(() => impl.eloMasteryModel(options).params)),
  'elo-read': (impl, v) => {
    const model = impl.eloMasteryModel();
    return v.rows.map((raw) => attempt(() => model.serialize(model.deserialize(raw))));
  },
  ability: (impl, v) => {
    const context = abilityContext(impl, v);
    return attempt(() => {
      const at = context.model.serialize(impl.abilityAt(v.stored, v.skill, v.stage, context));
      if (v.observation === undefined) return { at };
      const stored = impl.updateAbility(v.stored, v.skill, v.stage, v.observation, context);
      return { at, stored };
    });
  },
  implication: (impl, v) =>
    v.rows.map(([rating, current, evidence]) => impl.implication(rating, current, evidence)),
  decide: (impl, v) => {
    const policy = impl.createStagePolicy(v.options);
    let current = v.start;
    let streak = v.streak ?? { successes: 0, firstSuccessAt: null, lastSuccessAt: null, lapses: 0 };
    const steps = v.steps.map((step) => {
      const decision = attempt(() =>
        policy.decide({
          ladder: v.ladder,
          current,
          evidenceStage: step.evidenceStage ?? current,
          rating: step.rating,
          at: step.at,
          streak,
        }),
      );
      if (decision.$throws !== undefined) return decision;
      const index = v.ladder.indexOf(current);
      if (decision.move === 'promote') current = v.ladder[index + 1];
      if (decision.move === 'demote') current = v.ladder[index - 1];
      streak = decision.streak;
      return { ...decision, stage: current };
    });
    return { ref: refOf(policy), steps };
  },
  retention: (impl, v) => {
    const config = configOf(impl, v.config);
    return v.rows.map(([skill, stage]) => impl.desiredRetentionFor(skill, stage, config));
  },
  mastery: (impl, v) => {
    const context = {
      ...abilityContext(impl, v),
      memoryModel: impl.createFsrsModel({}),
      config: configOf(impl, v.config),
    };
    return {
      failures: impl.masteryFailures(v.state, v.skill, v.t, context),
      mastered: impl.isMastered(v.state, v.skill, v.t, context),
    };
  },
  status: (impl, v) => impl.skillStatus(v.state ?? undefined, v.input),
};

/** One line per mismatch across the corpus; empty when every vector matches. */
export function replay(impl, corpus) {
  if (corpus?.version !== CORPUS_VERSION) {
    throw new Error(
      `policy vectors version ${String(corpus?.version)}; this replay reads ${CORPUS_VERSION}.`,
    );
  }
  return corpus.vectors.flatMap((vector) => {
    const run = RUN[vector.kind];
    if (run === undefined) return [`${vector.name}: unknown kind ${vector.kind}`];
    let actual;
    try {
      actual = JSON.parse(JSON.stringify(run(impl, vector)));
    } catch (error) {
      return [`${vector.name}: threw ${String(error)}`];
    }
    return differences(actual, vector.expected).map((line) => `${vector.name}: ${line}`);
  });
}

/** Runs the vectors and records what they return, for the generator. */
export function record(impl, vectors) {
  return vectors.map((vector) => ({
    ...vector,
    expected: JSON.parse(JSON.stringify(RUN[vector.kind](impl, vector))),
  }));
}
