/**
 * Shape checks for the stored JSON (R11.1): evidence, task snapshots, host
 * actions, log entries and the state, version 1. Total: any value gives a
 * list of `SHAPE_INVALID` issues and never throws. Strict: a key the type
 * does not declare, or an optional key present as `undefined`, is an issue,
 * so whatever passes is canonical JSON of exactly the declared shape.
 *
 * (M7) Also the shapes of a grade result and of host model output (generated
 * candidates, a decomposition proposal), and every shape carries the JSON
 * Schema (draft 2020-12) of what it checks. A schema expresses the field
 * rules; the cross-field rules (`rule`, the entry and state checks) are the
 * check's alone, so a value the schema accepts can still fail the check.
 */

import type { Issue, JsonSchemaObject } from '../types.js';

type Path = readonly (string | number)[];
export type Check = ((value: unknown, path: Path, out: Issue[]) => void) & {
  readonly schema: JsonSchemaObject;
};
type Run = (value: unknown, path: Path, out: Issue[]) => void;

const MAX_SAFE = Number.MAX_SAFE_INTEGER;

/** A check that carries its JSON Schema. */
const make = (run: Run, schema: JsonSchemaObject): Check => Object.assign(run, { schema });

const RATINGS = ['again', 'hard', 'good', 'easy'];
const CONTEXTS = ['practice', 'exam', 'diagnostic', 'pretest'];
const CONFIDENCES = ['sure', 'unsure', 'guess'];
const PROOF_KINDS = ['executable', 'reviewed', 'model-checked'];
const HELD_REASONS = ['low-confidence', 'human-review', 'deferred', 'routed-to-person'];

function issue(path: Path, message: string): Issue {
  return { code: 'SHAPE_INVALID', path: [...path], message };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// ---------------------------------------------------------------------------
// Leaf checks
// ---------------------------------------------------------------------------

const leaf = (test: (value: unknown) => boolean, what: string, schema: JsonSchemaObject): Check =>
  make((value, path, out) => {
    if (!test(value)) out.push(issue(path, `${what}.`));
  }, schema);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const safe = { minimum: -MAX_SAFE, maximum: MAX_SAFE };

const id = leaf((value) => typeof value === 'string' && value !== '', 'a non-empty string', {
  type: 'string',
  minLength: 1,
});
const text = leaf((value) => typeof value === 'string', 'a string', { type: 'string' });
const bool = leaf((value) => typeof value === 'boolean', 'a boolean', { type: 'boolean' });
const finite = leaf(isFiniteNumber, 'a finite number', { type: 'number' });
const positive = leaf((value) => isFiniteNumber(value) && value > 0, 'a positive number', {
  type: 'number',
  exclusiveMinimum: 0,
});
const nonNegative = leaf((value) => isFiniteNumber(value) && value >= 0, 'a number of at least 0', {
  type: 'number',
  minimum: 0,
});
const instant = leaf(Number.isSafeInteger, 'an integer epoch millisecond', {
  type: 'integer',
  ...safe,
});
const count = leaf(
  (value) => Number.isSafeInteger(value) && (value as number) >= 0,
  'an integer of at least 0',
  { type: 'integer', minimum: 0, maximum: MAX_SAFE },
);
const instantOrNull = leaf(
  (value) => value === null || Number.isSafeInteger(value),
  'an integer epoch millisecond or null',
  { type: ['integer', 'null'], ...safe },
);
const oneOf = (values: readonly string[]): Check =>
  leaf((value) => values.includes(value as string), `one of ${values.join(', ')}`, {
    enum: [...values],
  });
const literal = (expected: string | number): Check =>
  leaf((value) => value === expected, `${JSON.stringify(expected)}`, { const: expected });

/** Any JSON value: null, a boolean, a finite number, a string, an array or a plain object of them. */
const json: Check = make((value, path, out) => {
  const stack: { value: unknown; path: Path }[] = [{ value, path }];
  const seen = new Set<object>();
  while (stack.length > 0) {
    const next = stack.pop() as { value: unknown; path: Path };
    const v = next.value;
    if (v === null || typeof v === 'boolean' || typeof v === 'string' || isFiniteNumber(v)) {
      continue;
    }
    if (typeof v === 'object' && (Array.isArray(v) || isRecord(v)) && !seen.has(v)) {
      seen.add(v);
      for (const [key, child] of Object.entries(v)) {
        stack.push({ value: child, path: [...next.path, Array.isArray(v) ? Number(key) : key] });
      }
      continue;
    }
    out.push(
      issue(next.path, 'a JSON value (null, boolean, finite number, string, array or object).'),
    );
    return;
  }
}, {});

const arrayOf = (item: Check, nonEmpty = false): Check =>
  make(
    (value, path, out) => {
      if (!Array.isArray(value) || (nonEmpty && value.length === 0)) {
        out.push(issue(path, nonEmpty ? 'a non-empty array.' : 'an array.'));
        return;
      }
      // (revised in M7) Every index, so an array hole is an issue: forEach
      // skipped holes, and a hole has no JSON form.
      for (let index = 0; index < value.length; index += 1) {
        if (index in value) item(value[index], [...path, index], out);
        else out.push(issue([...path, index], 'an array entry, not a hole.'));
      }
    },
    { type: 'array', items: item.schema, ...(nonEmpty ? { minItems: 1 } : {}) },
  );

const recordOf = (item: Check): Check =>
  make(
    (value, path, out) => {
      if (!isRecord(value)) {
        out.push(issue(path, 'an object.'));
        return;
      }
      for (const [key, entry] of Object.entries(value)) item(entry, [...path, key], out);
    },
    { type: 'object', additionalProperties: item.schema },
  );

interface Fields {
  readonly [key: string]: Check | { readonly optional: Check };
}

const opt = (check: Check) => ({ optional: check });

/** The JSON Schema of an object with exactly these keys. */
function objectSchema(fields: Fields): JsonSchemaObject {
  const properties: Record<string, JsonSchemaObject> = {};
  const required: string[] = [];
  for (const [key, field] of Object.entries(fields)) {
    if (typeof field === 'function') {
      properties[key] = field.schema;
      required.push(key);
    } else {
      properties[key] = field.optional.schema;
    }
  }
  return { type: 'object', properties, required, additionalProperties: false };
}

/** An object with exactly these keys (optional ones may be absent, never `undefined`). */
const object = (fields: Fields): Check =>
  make((value, path, out) => {
    if (!isRecord(value)) {
      out.push(issue(path, 'an object.'));
      return;
    }
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(fields, key))
        out.push(issue([...path, key], `${key} is not a known key.`));
    }
    for (const [key, field] of Object.entries(fields)) {
      const optional = typeof field !== 'function';
      const check = typeof field === 'function' ? field : field.optional;
      if (!Object.hasOwn(value, key)) {
        if (!optional) out.push(issue([...path, key], `${key} is required.`));
        continue;
      }
      check(value[key], [...path, key], out);
    }
  }, objectSchema(fields));

/** An object whose `kind` picks its shape. */
const variant = (key: string, shapes: Readonly<Record<string, Fields>>): Check =>
  make(
    (value, path, out) => {
      if (!isRecord(value)) {
        out.push(issue(path, 'an object.'));
        return;
      }
      const tag = value[key];
      if (typeof tag !== 'string' || !Object.hasOwn(shapes, tag)) {
        out.push(issue([...path, key], `${key} is one of ${Object.keys(shapes).join(', ')}.`));
        return;
      }
      object({ [key]: literal(tag), ...shapes[tag] })(value, path, out);
    },
    {
      oneOf: Object.entries(shapes).map(([tag, fields]) =>
        objectSchema({ [key]: literal(tag), ...fields }),
      ),
    },
  );

/** Each check in turn, stopping at the first that fails; the schema is the first check's. */
const all = (first: Check, ...rest: Run[]): Check =>
  make((value, path, out) => {
    for (const check of [first, ...rest]) {
      const before = out.length;
      check(value, path, out);
      if (out.length > before) return;
    }
  }, first.schema);

const rule =
  (test: (value: Record<string, unknown>) => boolean, key: string, message: string): Run =>
  (value, path, out) => {
    if (!test(value as Record<string, unknown>)) out.push(issue([...path, key], message));
  };

// ---------------------------------------------------------------------------
// Evidence (§5.1)
// ---------------------------------------------------------------------------

const graded = { score: finite, maxScore: nonNegative, passed: bool };

const source = variant('kind', {
  auto: {
    ...graded,
    checks: opt(
      all(
        object({ passed: count, total: count }),
        rule(
          (v) => (v.passed as number) <= (v.total as number),
          'passed',
          'passed is at most total.',
        ),
      ),
    ),
  },
  ai: {
    ...graded,
    confidence: oneOf(['high', 'medium', 'low']),
    requiresHumanReview: opt(bool),
    graderId: opt(text),
  },
  human: { ...graded, graderId: opt(text) },
  self: { rating: oneOf(RATINGS) },
  exposure: {},
  pending: { reason: oneOf(['deferred', 'routed-to-person']) },
});

const skillNodeShape = object({
  id,
  knowledge: oneOf(['declarative', 'procedural', 'mixed']),
  stages: opt(arrayOf(id)),
  interleaveGroup: opt(text),
  tags: opt(arrayOf(text)),
  label: opt(text),
  description: opt(text),
  criteriaHint: opt(text),
  forms: opt(recordOf(arrayOf(text))),
  masteryPrior: opt(finite),
  referenceDifficulty: opt(finite),
  desiredRetention: opt(finite),
});

const edgeShape = variant('kind', {
  prerequisite: { from: id, to: id, strength: oneOf(['hard', 'soft']) },
  encompasses: { from: id, to: id, weight: finite },
});

/**
 * A prerequisite hypothesis as `checkPrerequisiteHypothesis` returns it and
 * `open-hypothesis` records it (R14.4, R14.5; revised in M12).
 */
export const hypothesisShape: Check = object({
  id,
  forSkillId: id,
  skillId: id,
  skill: opt(skillNodeShape),
  rationale: opt(text),
});

const skillOutcome = object({
  skillId: id,
  score: finite,
  maxScore: nonNegative,
  passed: opt(bool),
});

export const evidenceShape: Check = object({
  id,
  itemId: id,
  at: instant,
  source,
  context: opt(oneOf(CONTEXTS)),
  targetId: opt(text),
  durationMs: opt(nonNegative),
  hintsUsed: opt(count),
  attempts: opt(count),
  skillOutcomes: opt(arrayOf(skillOutcome)),
  learnerConfidence: opt(oneOf(CONFIDENCES)),
  confirms: opt(id),
  supplements: opt(id),
  probe: opt(id),
});

// ---------------------------------------------------------------------------
// Task snapshot, host action, log entry (§5.6)
// ---------------------------------------------------------------------------

export const taskShape: Check = object({
  itemId: id,
  skills: arrayOf(object({ skillId: id, weight: finite }), true),
  stage: id,
  difficulty: finite,
  criteria: opt(arrayOf(object({ name: id, skillId: id }))),
  fluentSeconds: opt(positive),
  slowSeconds: opt(positive),
  contentHash: opt(text),
  origin: oneOf(['authored', 'generated']),
  proofKind: opt(oneOf(PROOF_KINDS)),
});

export const hostActionShape: Check = variant('kind', {
  prior: { skillId: id, theta: finite, pseudoCount: nonNegative, stage: opt(id) },
  place: { skillId: id, stage: id, credited: bool },
  suspend: { skillId: id },
  unsuspend: { skillId: id },
  'discard-held': { evidenceId: id },
  'reset-skill': { skillId: id },
  'open-hypothesis': { hypothesis: hypothesisShape },
  'close-hypothesis': { hypothesisId: id },
});

export const hostInputShape: Check = object({ id, at: instant, action: hostActionShape });

const base = { schemaVersion: literal(1), seq: count, at: instant, configHash: text };

export const entryShape: Check = all(
  variant('kind', {
    evidence: { ...base, evidence: evidenceShape, task: opt(taskShape) },
    host: { ...base, id, action: hostActionShape },
  }),
  (value: unknown, path: Path, out: Issue[]) => {
    const entry = value as Record<string, unknown>;
    if (entry.kind !== 'evidence') return;
    const evidence = entry.evidence as Record<string, unknown>;
    if (evidence.at !== entry.at) out.push(issue([...path, 'at'], 'at equals evidence.at.'));
    const confirmation = Object.hasOwn(evidence, 'confirms');
    if (confirmation === Object.hasOwn(entry, 'task')) {
      out.push(
        issue(
          [...path, 'task'],
          confirmation
            ? 'A confirmation has no task; it uses the task of the held entry.'
            : 'task is required unless the evidence confirms held evidence.',
        ),
      );
    } else if (
      !confirmation &&
      (entry.task as Record<string, unknown>).itemId !== evidence.itemId
    ) {
      out.push(issue([...path, 'task', 'itemId'], 'task.itemId equals evidence.itemId.'));
    }
  },
);

// ---------------------------------------------------------------------------
// State, version 1 (§5.6)
// ---------------------------------------------------------------------------

const streak = object({
  successes: count,
  firstSuccessAt: instantOrNull,
  lastSuccessAt: instantOrNull,
  lapses: count,
});

const stageMemory = object({
  model: text,
  memory: json,
  due: instantOrNull,
  modelDue: instantOrNull,
  lastReviewAt: instantOrNull,
  reviews: count,
  lapses: count,
  streak,
  superseded: bool,
});

const skillState = object({
  stage: id,
  startedAt: instantOrNull,
  unlockedAt: instantOrNull,
  credited: bool,
  suspended: leaf(
    (value) => value === null || value === 'leech' || value === 'host',
    'leech, host or null',
    { enum: ['leech', 'host', null] },
  ),
  memories: recordOf(stageMemory),
  ability: recordOf(json),
  mastered: bool,
  evidenceCount: count,
  lastLapseAt: instantOrNull,
  top: object({
    successes: count,
    firstSuccessAt: instantOrNull,
    lastSuccessAt: instantOrNull,
    lastWasLapse: bool,
    failedChecks: opt(count),
  }),
});

const held = all(
  object({
    evidenceId: id,
    itemId: id,
    at: instant,
    seq: count,
    reason: oneOf(HELD_REASONS),
    evidence: evidenceShape,
    task: taskShape,
  }),
  rule(
    (v) =>
      (v.evidence as Record<string, unknown>).id === v.evidenceId &&
      (v.evidence as Record<string, unknown>).itemId === v.itemId &&
      (v.evidence as Record<string, unknown>).at === v.at &&
      (v.task as Record<string, unknown>).itemId === v.itemId,
    'evidence',
    'evidence and task match evidenceId, itemId and at.',
  ),
);

const hypothesisState = object({
  id,
  forSkillId: id,
  skillId: id,
  skill: opt(skillNodeShape),
  openedAt: instant,
  probes: object({ passed: count, failed: count }),
  verdict: oneOf(['open', 'confirmed', 'refuted']),
  decidedAt: instantOrNull,
  practisedAt: instantOrNull,
  reprobeStreak: count,
  readyAt: instantOrNull,
  blockedPassedAt: instantOrNull,
  blockedFailures: count,
  closedAt: instantOrNull,
});

export const stateShape: Check = all(
  object({
    schemaVersion: literal(1),
    learnerId: text,
    graphVersion: text,
    configHash: text,
    log: object({ length: count, lastAt: instantOrNull, hash: text }),
    skills: recordOf(skillState),
    items: recordOf(object({ uses: count, lastUsedAt: instant })),
    held: arrayOf(held),
    recentIds: arrayOf(id),
    hypotheses: opt(recordOf(hypothesisState)),
  }),
  (value: unknown, path: Path, out: Issue[]) => {
    const log = (value as { log: { length: number; lastAt: number | null } }).log;
    if ((log.length === 0) !== (log.lastAt === null)) {
      out.push(issue([...path, 'log', 'lastAt'], 'lastAt is null exactly when the log is empty.'));
    }
  },
);

// ---------------------------------------------------------------------------
// Grade result (§5.4, R8.2) and host model output (§5.5, R9) (M7)
// ---------------------------------------------------------------------------

/** The field rules of a `GradeResult`; `checkGradeResult` adds the range and uniqueness rules. */
export const gradeResultShape: Check = object({
  score: finite,
  maxScore: nonNegative,
  passed: bool,
  confidence: opt(oneOf(['high', 'medium', 'low'])),
  requiresHumanReview: opt(bool),
  checks: opt(
    all(
      object({ passed: count, total: count }),
      rule(
        (v) => (v.passed as number) <= (v.total as number),
        'passed',
        'passed is at most total.',
      ),
    ),
  ),
  criteria: opt(arrayOf(object({ name: id, score: finite, maxScore: nonNegative }))),
  feedback: opt(text),
  grader: object({
    kind: oneOf(['auto', 'ai', 'human']),
    id: opt(text),
    model: opt(text),
    promptHash: opt(text),
  }),
});

/** The most candidates one generation request asks for (R9.1). */
export const MAX_CANDIDATES = 20;

/**
 * One generated task as a generator returns it: an item with a required
 * `difficulty` and `content`, no `proof`, and `origin` and `status`, when
 * present, `generated` and `unproven`.
 */
export const candidateShape: Check = object({
  id,
  skills: arrayOf(object({ skillId: id, weight: finite }), true),
  stage: id,
  difficulty: finite,
  content: json,
  expectedSeconds: opt(positive),
  fluentSeconds: opt(positive),
  slowSeconds: opt(positive),
  criteria: opt(arrayOf(object({ name: id, skillId: id }))),
  form: opt(text),
  contentHash: opt(id),
  origin: opt(literal('generated')),
  status: opt(literal('unproven')),
});

/** A proof for `admitCandidate` (§5.5, R9.3); `admitCandidate` adds what a proof must hold. */
export const proofShape: Check = variant('kind', {
  executable: {
    at: instant,
    referencePassed: bool,
    wrongSolutionsFailed: count,
    runner: opt(text),
  },
  reviewed: { at: instant, reviewerId: id },
  'model-checked': { at: instant, model: id, agreed: bool },
});

/** An extension approval for `admitExtension` (§5.5, R9.5). */
export const approvalShape: Check = object({
  by: oneOf(['author', 'human', 'learner']),
  at: instant,
  approverId: opt(id),
});

/** A decomposer's proposal: the new skills and edges (R9.5). */
export const proposalShape: Check = object({
  skills: arrayOf(skillNodeShape, true),
  edges: arrayOf(edgeShape),
});

/** A `GraphExtension` as `checkDecomposition` returns it (§5.5). */
export const extensionShape: Check = object({
  kind: opt(literal('goal')),
  id,
  goalId: id,
  idPrefix: id,
  skills: arrayOf(skillNodeShape, true),
  edges: arrayOf(edgeShape),
  status: oneOf(['proposed', 'admitted']),
  approval: opt(approvalShape),
});

/**
 * A diagnoser's output (R14.4; revised in M12): hypotheses, each one edge
 * into the blocked skill from an existing skill or from a new one.
 */
export const hypothesesShape: Check = object({
  hypotheses: arrayOf(
    object({ skillId: id, edge: edgeShape, skill: opt(skillNodeShape), rationale: opt(text) }),
  ),
});

/** The issues of `value` against `shape`, under `path`. */
export function shapeIssues(shape: Check, value: unknown, path: Path = []): Issue[] {
  const out: Issue[] = [];
  shape(value, path, out);
  return out;
}
