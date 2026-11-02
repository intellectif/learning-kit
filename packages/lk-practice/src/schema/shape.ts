/**
 * Shape checks for the stored JSON (R11.1): evidence, task snapshots, host
 * actions, log entries and the state, version 1. Total: any value gives a
 * list of `SHAPE_INVALID` issues and never throws. Strict: a key the type
 * does not declare, or an optional key present as `undefined`, is an issue,
 * so whatever passes is canonical JSON of exactly the declared shape.
 */

import type { Issue } from '../types.js';

type Path = readonly (string | number)[];
type Check = (value: unknown, path: Path, out: Issue[]) => void;

const RATINGS = ['again', 'hard', 'good', 'easy'];
const CONTEXTS = ['practice', 'exam', 'diagnostic', 'pretest'];
const CONFIDENCES = ['sure', 'unsure', 'guess'];
const PROOF_KINDS = ['executable', 'reviewed', 'grader-checked'];
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

const leaf =
  (test: (value: unknown) => boolean, what: string): Check =>
  (value, path, out) => {
    if (!test(value)) out.push(issue(path, `${what}.`));
  };

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const id = leaf((value) => typeof value === 'string' && value !== '', 'a non-empty string');
const text = leaf((value) => typeof value === 'string', 'a string');
const bool = leaf((value) => typeof value === 'boolean', 'a boolean');
const finite = leaf(isFiniteNumber, 'a finite number');
const positive = leaf((value) => isFiniteNumber(value) && value > 0, 'a positive number');
const nonNegative = leaf((value) => isFiniteNumber(value) && value >= 0, 'a number of at least 0');
const instant = leaf(Number.isSafeInteger, 'an integer epoch millisecond');
const count = leaf(
  (value) => Number.isSafeInteger(value) && (value as number) >= 0,
  'an integer of at least 0',
);
const instantOrNull = leaf(
  (value) => value === null || Number.isSafeInteger(value),
  'an integer epoch millisecond or null',
);
const oneOf = (values: readonly string[]): Check =>
  leaf((value) => values.includes(value as string), `one of ${values.join(', ')}`);
const literal = (expected: unknown): Check =>
  leaf((value) => value === expected, `${JSON.stringify(expected)}`);

/** Any JSON value: null, a boolean, a finite number, a string, an array or a plain object of them. */
const json: Check = (value, path, out) => {
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
};

const arrayOf =
  (item: Check, nonEmpty = false): Check =>
  (value, path, out) => {
    if (!Array.isArray(value) || (nonEmpty && value.length === 0)) {
      out.push(issue(path, nonEmpty ? 'a non-empty array.' : 'an array.'));
      return;
    }
    value.forEach((entry, index) => {
      item(entry, [...path, index], out);
    });
  };

const recordOf =
  (item: Check): Check =>
  (value, path, out) => {
    if (!isRecord(value)) {
      out.push(issue(path, 'an object.'));
      return;
    }
    for (const [key, entry] of Object.entries(value)) item(entry, [...path, key], out);
  };

interface Fields {
  readonly [key: string]: Check | { readonly optional: Check };
}

const opt = (check: Check) => ({ optional: check });

/** An object with exactly these keys (optional ones may be absent, never `undefined`). */
const object =
  (fields: Fields): Check =>
  (value, path, out) => {
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
  };

/** An object whose `kind` picks its shape. */
const variant =
  (key: string, shapes: Readonly<Record<string, Fields>>): Check =>
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
  };

const all =
  (...checks: Check[]): Check =>
  (value, path, out) => {
    for (const check of checks) {
      const before = out.length;
      check(value, path, out);
      if (out.length > before) return;
    }
  };

const rule =
  (test: (value: Record<string, unknown>) => boolean, key: string, message: string): Check =>
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
});

export const hostInputShape: Check = object({ id, at: instant, action: hostActionShape });

const base = { schemaVersion: literal(1), seq: count, at: instant, configHash: text };

export const entryShape: Check = all(
  variant('kind', {
    evidence: { ...base, evidence: evidenceShape, task: opt(taskShape) },
    host: { ...base, id, action: hostActionShape },
  }),
  (value, path, out) => {
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
  }),
  (value, path, out) => {
    const log = (value as { log: { length: number; lastAt: number | null } }).log;
    if ((log.length === 0) !== (log.lastAt === null)) {
      out.push(issue([...path, 'log', 'lastAt'], 'lastAt is null exactly when the log is empty.'));
    }
  },
);

/** The issues of `value` against `shape`, under `path`. */
export function shapeIssues(shape: Check, value: unknown, path: Path = []): Issue[] {
  const out: Issue[] = [];
  shape(value, path, out);
  return out;
}
