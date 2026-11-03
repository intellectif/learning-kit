/**
 * Replays the policy vectors (`evidence.json`, `stage.json`) against an
 * implementation of the evidence mapper, the Elo ability, the stage policy and
 * the mastery predicate (design 8.2, 8.3, 8.5), the log vectors
 * (`log.json`) against `createPractice` and `migrateState` (design 6, 8.1,
 * 8.7; revised in M5), and the plan vectors (`plan.json`) against
 * `createPractice` (design 8.6; revised in M6), and the contract vectors
 * (`contracts.json`) against the grader, generator and decomposition
 * contracts and `composeGraph` (design 8.8, 8.9; revised in M7), the
 * `./lk-core` adapter over lk-core outcomes, also in `contracts.json` (R7.7;
 * revised in M10), and prerequisite discovery, there too (R14, D29; revised
 * in M12).
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
  'adapters/lk-core/index.ts': ['evidenceFromOutcome', 'skillOutcomesFromCriteria'],
  'config.ts': ['resolveConfig'],
  'contracts/index.ts': [
    'admitCandidate',
    'admitExtension',
    'checkCandidates',
    'checkDecomposition',
    'checkGradeResult',
    'checkPrerequisiteHypothesis',
    'decompositionRequest',
    'discoveryExtension',
    'evidenceFromGrade',
    'generationRequest',
    'prerequisiteReport',
    'prerequisiteRequest',
    'prerequisiteVerdict',
  ],
  'evidence/index.ts': ['contextWeight', 'mapEvidence', 'skillOutcomeIssues'],
  // `hypothesisId` only for the generators, which open hypotheses by hand (revised in M12).
  'graph/index.ts': ['composeGraph', 'hypothesisId'],
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
  'practice.ts': ['createPractice'],
  'schema/migrate.ts': ['migrateState'],
  'stage/index.ts': ['createStagePolicy', 'implication'],
};

/**
 * The functions of `ENTRY` each kind of vector calls (revised in M8), so a
 * run over the published entry, which exports some of them, knows which
 * vectors it can replay.
 */
export const NEEDS = {
  map: ['resolveConfig', 'mapEvidence'],
  'outcome-issues': ['skillOutcomeIssues'],
  'context-weight': ['resolveConfig', 'contextWeight'],
  elo: ['eloMasteryModel'],
  'elo-options': ['eloMasteryModel'],
  'elo-read': ['eloMasteryModel'],
  ability: ['eloMasteryModel', 'abilityAt', 'updateAbility'],
  implication: ['implication'],
  decide: ['createStagePolicy'],
  retention: ['resolveConfig', 'desiredRetentionFor'],
  mastery: ['eloMasteryModel', 'createFsrsModel', 'resolveConfig', 'masteryFailures', 'isMastered'],
  status: ['skillStatus'],
  log: ['createPractice'],
  plan: ['createPractice'],
  replay: ['createPractice'],
  grade: ['checkGradeResult', 'evidenceFromGrade'],
  generate: [
    'createPractice',
    'resolveConfig',
    'generationRequest',
    'checkCandidates',
    'admitCandidate',
  ],
  decompose: [
    'resolveConfig',
    'decompositionRequest',
    'checkDecomposition',
    'admitExtension',
    'composeGraph',
    'createPractice',
  ],
  migrate: ['migrateState'],
  outcome: ['evidenceFromOutcome', 'skillOutcomesFromCriteria'],
  diagnose: [
    'resolveConfig',
    'createPractice',
    'prerequisiteRequest',
    'checkPrerequisiteHypothesis',
    'prerequisiteVerdict',
    'discoveryExtension',
    'composeGraph',
    'prerequisiteReport',
  ],
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

/** A record or act result without its state, and issues as code and path. */
function outcome(result) {
  switch (result.kind) {
    case 'applied':
    case 'duplicate':
      return { kind: result.kind, events: result.events };
    case 'replay-required':
      return { kind: result.kind, replayFrom: result.replayFrom };
    default:
      return { kind: result.kind, issues: issuesOf(result.issues) };
  }
}

const issuesOf = (issues) => issues.map(({ code, path }) => ({ code, path }));

/** A replay result: the state when it succeeds, the issues when it does not. */
const replayed = (result) =>
  result.ok ? { ok: true, state: result.state } : { ok: false, issues: issuesOf(result.issues) };

/**
 * Applies a learner's steps with `practice`: each step records evidence
 * (`evidence`, `item`) or acts (`act`), against `graphs.main` unless it names
 * another graph, and through `alternate` when `with` says so. A
 * replay-required step appends and then replays the whole log, as a host
 * does. Returns each step's outcome, the log and the final state (shared by
 * the `log` and `plan` kinds; revised in M6).
 */
function learn(practice, alternate, v) {
  const main = v.graphs.main;
  let state = practice.initState(v.learnerId, main);
  const entries = [];
  const steps = v.steps.map((step) => {
    const graph = v.graphs[step.graph ?? 'main'];
    const by = step.with === 'alternate' ? alternate : practice;
    const result =
      step.act !== undefined
        ? by.act(state, graph, step.act)
        : by.record(state, {
            graph,
            evidence: step.evidence,
            ...(step.item === undefined ? {} : { item: step.item }),
          });
    if (result.kind === 'applied') {
      state = result.state;
      entries.push(...result.appended);
    } else if (result.kind === 'replay-required') {
      entries.push(...result.appended);
      const again = practice.replay(entries, main, v.learnerId);
      if (!again.ok) return { ...outcome(result), replay: replayed(again) };
      state = again.state;
      return { ...outcome(result), replayEvents: again.events };
    }
    return outcome(result);
  });
  return { state, entries, steps };
}

/**
 * Runs a learner's steps (see `learn`) through `createPractice(config)`, and
 * `alternate` where a step says so. The result is each step's outcome, the
 * log, the final state, its replay, a replay from each `checkpoints` cut (the
 * replay of the first entries, then the rest), the replay under `recompute`,
 * `status` at each `now`, `status` against each named graph at each
 * `statusOn` instant, `reconcile` against each graph named in `reconcile`,
 * and `exportReviewHistory` of the log for each learner id in `history`
 * (revised in M8).
 */
function runLog(impl, v) {
  const practice = attempt(() => impl.createPractice(v.config ?? {}));
  if (practice.$throws !== undefined) return practice;
  const alternate = v.alternate === undefined ? practice : impl.createPractice(v.alternate);
  const main = v.graphs.main;
  const { state, entries, steps } = learn(practice, alternate, v);
  const full = practice.replay(entries, main, v.learnerId);
  return {
    configHash: practice.configHash,
    steps,
    entries,
    state,
    replay: full.ok
      ? { ok: true, events: full.events }
      : { ok: false, issues: issuesOf(full.issues) },
    checkpoints: (v.checkpoints ?? []).map((cut) => {
      const start = practice.replay(entries.slice(0, cut), main, v.learnerId);
      if (!start.ok) return { cut, start: replayed(start) };
      return { cut, ...replayed(practice.replayFrom(start.state, entries.slice(cut), main)) };
    }),
    ...(v.recompute === undefined
      ? {}
      : {
          recompute: replayed(impl.createPractice(v.recompute).replay(entries, main, v.learnerId)),
        }),
    status: (v.now ?? []).map((now) => attempt(() => practice.status(state, main, now))),
    ...(v.statusOn === undefined
      ? {}
      : {
          statusOn: v.statusOn.map(({ graph, now }) =>
            attempt(() => practice.status(state, v.graphs[graph], now)),
          ),
        }),
    reconcile: (v.reconcile ?? []).map((name) => practice.reconcile(state, v.graphs[name])),
    ...(v.history === undefined
      ? {}
      : {
          history: v.history.map((learnerId) => {
            const result = practice.exportReviewHistory(entries, main, learnerId);
            return result.ok
              ? { ok: true, history: result.history }
              : { ok: false, issues: issuesOf(result.issues) };
          }),
        }),
  };
}

/** A check result: the value when it passes, the issues as code and path when it does not. */
const checked = (result) =>
  result.ok ? { ok: true, value: result.value } : { ok: false, issues: issuesOf(result.issues) };

/** An admission: the admitted item or extension when it passes, the issues when it does not. */
const admitted = (result, key) =>
  result.ok ? { ok: true, [key]: result[key] } : { ok: false, issues: issuesOf(result.issues) };

/**
 * Generation (design 8.8, R9; revised in M7): the learner's steps (see
 * `learn`), `plan` for `request`, `generationRequest` for the planned target
 * whose first skill is `targetSkill` (with the fields of `target` over it, as
 * a host that passes a wrong target would) under `requestConfig` when given,
 * else `config`, `checkCandidates` over `candidates`,
 * `admitCandidate` for each `proofs` entry (an index into the accepted
 * candidates), then `record` of each admitted item and of each accepted
 * candidate stored without a proof, as a host might (`unproven`), and the
 * item each target of `request` gets from a pool of both (`pooled`).
 */
function runGenerate(impl, v) {
  const practice = impl.createPractice(v.config ?? {});
  const config = configOf(impl, v.config);
  const { state, steps } = learn(practice, practice, v);
  const graph = v.graphs.main;
  const plan = practice.plan(state, graph, v.request);
  const planned = plan.targets.find((entry) => entry.skillIds[0] === v.targetSkill);
  if (planned === undefined) throw new Error(`no planned target for ${v.targetSkill}`);
  const target = { ...planned, ...v.target };
  const request = attempt(() =>
    impl.generationRequest(
      target,
      { graph, state, now: v.request.now },
      v.options,
      v.requestConfig ?? v.config,
    ),
  );
  if (request.$throws !== undefined) return { steps, request };
  const candidates = impl.checkCandidates(request, v.candidates);
  const evidence = (itemId) => ({ ...v.evidence, id: `${v.evidence.id}-${itemId}`, itemId });
  const pool = [];
  const proofs = (v.proofs ?? []).map(({ index, proof }) => {
    const result = impl.admitCandidate(candidates.accepted[index], proof, config);
    if (!result.ok) return admitted(result, 'item');
    pool.push(result.item);
    const recorded = practice.record(state, {
      graph,
      evidence: evidence(result.item.id),
      item: result.item,
    });
    return { ...admitted(result, 'item'), record: outcome(recorded) };
  });
  const unproven = candidates.accepted.map(({ content: _content, ...item }) => {
    pool.push(item);
    return outcome(practice.record(state, { graph, evidence: evidence(item.id), item }));
  });
  const pooled = practice
    .plan(state, graph, { ...v.request, pool })
    .targets.map((entry) => ({ id: entry.id, item: entry.item ?? null }));
  return {
    steps,
    request,
    candidates: {
      accepted: candidates.accepted,
      rejected: candidates.rejected.map(({ index, issues }) => ({
        index,
        issues: issuesOf(issues),
      })),
    },
    proofs,
    unproven,
    pooled,
  };
}

/**
 * Decomposition (design 8.8, 8.9, R9.5; revised in M7): `decompositionRequest`
 * for `goal` over `graphs.main`, `checkDecomposition` of `proposal`, and when
 * it passes `admitExtension` with `approval` and `composeGraph`. When the
 * learner has `steps` on the base graph, one more `record` against the
 * composed graph is refused for the graph change, and the log is replayed
 * against the composed graph, as a host does after an admission.
 */
function runDecompose(impl, v) {
  const base = v.graphs.main;
  const config = configOf(impl, v.config);
  const request = attempt(() => impl.decompositionRequest(v.goal, base, v.options, config));
  if (request.$throws !== undefined) return { request };
  const check = impl.checkDecomposition(request, base, v.proposal, config);
  if (!check.ok) return { request, check: { ok: false, issues: issuesOf(check.issues) } };
  const admission = impl.admitExtension(check.extension, v.approval, v.admit);
  const result = {
    request,
    check: admitted(check, 'extension'),
    admission: admitted(admission, 'extension'),
  };
  if (!admission.ok) return result;
  const composed = impl.composeGraph(base, [admission.extension], config);
  if (!composed.ok)
    return { ...result, composed: { ok: false, issues: issuesOf(composed.issues) } };
  const composition = {
    ...result,
    composed: { ok: true, graph: composed.graph, warnings: composed.warnings },
  };
  if (v.steps === undefined) return composition;
  const practice = impl.createPractice(v.config ?? {});
  const { state, entries, steps } = learn(practice, practice, v);
  const stale = practice.record(state, { graph: composed.graph, ...v.after });
  return {
    ...composition,
    steps,
    after: outcome(stale),
    replay: replayed(practice.replay(entries, composed.graph, v.learnerId)),
  };
}

/** A checked proposal: the accepted hypotheses, and each rejection's issues as code and path. */
const hypothesesOf = (check) => ({
  accepted: check.accepted,
  rejected: check.rejected.map(({ index, issues }) => ({ index, issues: issuesOf(issues) })),
});

/** What a vector pins of a planned target. */
const targetOf = (target) => ({
  kind: target.kind,
  skillIds: target.skillIds,
  stage: target.stage,
  targetDifficulty: target.targetDifficulty,
  context: target.constraints.context,
  reason: target.reason.code,
});

/**
 * Prerequisite discovery (R14, D29; revised in M12): the learner's `steps` on
 * `graphs.main` (see `learn`), `prerequisiteRequest` for `diagnosis` (the
 * failed evidence, its item and facts) with `options`, and
 * `checkPrerequisiteHypothesis` of `proposal`. With `open`, the accepted
 * hypothesis at `open.index` is opened, and each of `rounds` first applies
 * its `steps` (records and acts, as in `learn`, against the current graph),
 * then plans `request` and answers, in plan order, each target whose first
 * skill `answers` names (true passes), with the target's stage, difficulty
 * and context; an answer to a probe carries its hypothesis. A confirmation is admitted as a host does:
 * `discoveryExtension`, `composeGraph` over the base graph with every
 * admission so far, and a replay of the log against the composed graph.
 * After each round, the verdict and the report; then `close` (an instant)
 * closes the hypothesis, `again` is checked as a second proposal against the
 * final state, and the final log is replayed to the final state.
 */
function runDiagnose(impl, v) {
  const base = v.graphs.main;
  const config = configOf(impl, v.config);
  const practice = impl.createPractice(v.config ?? {});
  const learned = learn(practice, practice, v);
  const { steps } = learned;
  const entries = [...learned.entries];
  let { state } = learned;
  let graph = base;
  const request = attempt(() =>
    impl.prerequisiteRequest({ graph, state, ...v.diagnosis }, v.options, config),
  );
  if (request.$throws !== undefined) return { steps, request };
  const check = impl.checkPrerequisiteHypothesis(request, graph, v.proposal, config);
  if (v.open === undefined) return { steps, request, check: hypothesesOf(check) };
  const apply = (result) => {
    if (result.kind === 'applied') {
      state = result.state;
      entries.push(...result.appended);
    }
    return outcome(result);
  };
  const hypothesis = check.accepted[v.open.index];
  const opened = apply(
    practice.act(state, graph, {
      id: `open-${hypothesis.id}`,
      at: v.open.at,
      action: { kind: 'open-hypothesis', hypothesis },
    }),
  );
  const extensions = [];
  const admit = (hypothesisId) => {
    const admission = impl.discoveryExtension(state, hypothesisId);
    if (!admission.ok) return admitted(admission, 'extension');
    extensions.push(admission.extension);
    const composed = impl.composeGraph(base, extensions, config);
    if (!composed.ok) return { ok: false, issues: issuesOf(composed.issues) };
    graph = composed.graph;
    const again = practice.replay(entries, graph, v.learnerId);
    if (again.ok) state = again.state;
    return { ok: true, extension: admission.extension, replay: again.ok };
  };
  const rounds = v.rounds.map((round, r) => {
    const stepped = (round.steps ?? []).map((step) =>
      apply(
        step.act !== undefined
          ? practice.act(state, graph, step.act)
          : practice.record(state, {
              graph,
              evidence: step.evidence,
              ...(step.item === undefined ? {} : { item: step.item }),
            }),
      ),
    );
    const plan = practice.plan(state, graph, round.request);
    const chosen = plan.targets.filter((target) =>
      Object.hasOwn(round.answers, target.skillIds[0]),
    );
    const answers = chosen.map((target, i) => {
      const passed = round.answers[target.skillIds[0]];
      if (round.request.now + i * 60_000 < (state.log.lastAt ?? 0)) {
        throw new Error(`round ${r} answers before its steps`);
      }
      const itemId = `item-${r}-${i}`;
      const recorded = practice.record(state, {
        graph,
        evidence: {
          id: `answer-${r}-${i}`,
          itemId,
          at: round.request.now + i * 60_000,
          source: { kind: 'auto', score: passed ? 1 : 0, maxScore: 1, passed },
          context: target.constraints.context,
          ...(target.reason.code === 'probe' ? { probe: target.reason.hypothesisId } : {}),
        },
        item: {
          id: itemId,
          skills: target.skillIds.map((skillId) => ({
            skillId,
            weight: 1 / target.skillIds.length,
          })),
          stage: target.stage,
          difficulty: target.targetDifficulty,
          origin: 'generated',
          status: 'proven',
        },
      });
      const answer = { target: targetOf(target), ...apply(recorded) };
      const confirmed = (recorded.events ?? []).filter(
        (event) => event.type === 'hypothesis.decided' && event.verdict === 'confirmed',
      );
      return confirmed.length === 0
        ? answer
        : { ...answer, admissions: confirmed.map((event) => admit(event.hypothesisId)) };
    });
    return {
      ...(round.steps === undefined ? {} : { steps: stepped }),
      planned: plan.targets.map(targetOf),
      answers,
      verdict: impl.prerequisiteVerdict(state, hypothesis.id),
      report: impl.prerequisiteReport(state, graph, config),
    };
  });
  const closed =
    v.close === undefined
      ? undefined
      : apply(
          practice.act(state, graph, {
            id: `close-${hypothesis.id}`,
            at: v.close,
            action: { kind: 'close-hypothesis', hypothesisId: hypothesis.id },
          }),
        );
  const again =
    v.again === undefined
      ? undefined
      : hypothesesOf(
          impl.checkPrerequisiteHypothesis(
            impl.prerequisiteRequest({ graph, state, ...v.diagnosis }, v.options, config),
            graph,
            v.again,
            config,
          ),
        );
  const final = practice.replay(entries, graph, v.learnerId);
  return {
    steps,
    request,
    check: hypothesesOf(check),
    opened,
    rounds,
    ...(closed === undefined
      ? {}
      : { closed, report: impl.prerequisiteReport(state, graph, config) }),
    ...(again === undefined ? {} : { again }),
    hypotheses: state.hypotheses,
    graph: graph.version,
    replayEqualsRecord: final.ok && JSON.stringify(final.state) === JSON.stringify(state),
  };
}

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
  log: runLog,
  // The learner's steps (see `learn`), then `plan` for each request against
  // `graphs.main` or the graph it names (design 8.6; revised in M6).
  plan: (impl, v) => {
    const practice = impl.createPractice(v.config ?? {});
    const { state, steps } = learn(practice, practice, v);
    return {
      steps,
      plans: v.requests.map(({ graph, request }) =>
        attempt(() => practice.plan(state, v.graphs[graph ?? 'main'], request)),
      ),
    };
  },
  // A stored log replayed as given, from the start or from `checkpoint`, so
  // the rejections of replay itself are pinned (revised in M6).
  replay: (impl, v) => {
    const practice = impl.createPractice(v.config ?? {});
    const result =
      v.checkpoint === undefined
        ? practice.replay(v.entries, v.graph, v.learnerId)
        : practice.replayFrom(v.checkpoint, v.entries, v.graph);
    return result.ok
      ? { ok: true, state: result.state, events: result.events }
      : { ok: false, issues: issuesOf(result.issues) };
  },
  // Grader output (design 8.8, R8.2; revised in M7): `checkGradeResult` for
  // each of `rows`, and `evidenceFromGrade` for each of `evidence`.
  grade: (impl, v) => ({
    checks: (v.rows ?? []).map((raw) => checked(impl.checkGradeResult(raw))),
    evidence: (v.evidence ?? []).map(({ result, task, meta }) =>
      attempt(() => impl.evidenceFromGrade(result, task, meta)),
    ),
  }),
  // lk-core outcomes (R7.7; revised in M10): `evidenceFromOutcome` for each
  // of `evidence`, and `skillOutcomesFromCriteria` for each of `criteria`.
  outcome: (impl, v) => ({
    evidence: (v.evidence ?? []).map(({ outcome, task, meta }) =>
      attempt(() => impl.evidenceFromOutcome(outcome, task, meta)),
    ),
    criteria: (v.criteria ?? []).map(({ criteria, task }) =>
      attempt(() => impl.skillOutcomesFromCriteria(criteria, task)),
    ),
  }),
  generate: runGenerate,
  decompose: runDecompose,
  diagnose: runDiagnose,
  migrate: (impl, v) =>
    v.rows.map((raw) => {
      const result = impl.migrateState(raw);
      return result.ok
        ? { ok: true, migrated: result.migrated, state: result.state }
        : { ok: false, issues: issuesOf(result.issues) };
    }),
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
